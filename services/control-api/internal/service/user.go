package service

import (
    "errors"
    "time"

    "github.com/gin-gonic/gin"
    "github.com/golang-jwt/jwt/v5"

    "cadensend/services/control-api/internal/auth"
    "cadensend/services/control-api/internal/repo"
)

// UserService provides user business logic
// This layer contains the core application logic and coordinates between repository and external services
type UserService struct {
    userRepo           *repo.UserRepository
    magicLinkRepo     *repo.MagicLinkTokenRepository
    jwtSecret         []byte
    tokenExpiry       time.Duration
    emailService      EmailService
}

// EmailService interface for sending emails
// Cannot use AI for authentication - keeps auth simple and secure
type EmailService interface {
    SendMagicLink(email, token, userID string) error
}

// UserServiceConfig holds configuration for UserService
// Could be extended with environment variables, configs, etc.
type UserServiceConfig struct {
    JWTSecret    string
    TokenExpiry  time.Duration
    EmailService EmailService
}

// NewUserService creates a new user service
func NewUserService(config *UserServiceConfig, userRepo *repo.UserRepository, magicLinkRepo *repo.MagicLinkTokenRepository) *UserService {
    return &UserService{
        userRepo:           userRepo,
        magicLinkRepo:      magicLinkRepo,
        jwtSecret:         []byte(config.JWTSecret),
        tokenExpiry:       config.TokenExpiry,
        emailService:      config.EmailService,
    }
}

// CreateUser creates a new user
func (s *UserService) CreateUser(email, password, name, timezone, workspaceID string) (*auth.User, error) {
    // Check if user already exists
    if _, err := s.userRepo.GetByEmail(email); err == nil {
        return nil, errors.New("user already exists")
    } else if !errors.Is(err, errors.New("user not found")) {
        return nil, err
    }

    // Create user
    user, err := auth.NewAuthService(nil, string(s.jwtSecret), s.tokenExpiry).CreateUser(email, password, name, timezone, workspaceID)
    if err != nil {
        return nil, err
    }

    // Save to database
    if err := s.userRepo.Create(user); err != nil {
        return nil, err
    }

    return user, nil
}

// AuthenticateUser authenticates a user with email and password
func (s *UserService) AuthenticateUser(email, password string) (*auth.User, string, error) {
    // Find user by email
    user, err := s.userRepo.GetByEmail(email)
    if err != nil {
        return nil, "", errors.New("invalid credentials")
    }

    // Verify password using bcrypt
    if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
        return nil, "", errors.New("invalid credentials")
    }

    // Generate JWT token
    token, err := auth.NewAuthService(nil, string(s.jwtSecret), s.tokenExpiry).GenerateJWT(user.ID, user.WorkspaceID, user.Email, "user")
    if err != nil {
        return nil, "", err
    }

    return user, token, nil
}

// GenerateMagicLink generates a magic link for passwordless authentication
func (s *UserService) GenerateMagicLink(email string) (string, error) {
    // Check if user exists
    if _, err := s.userRepo.GetByEmail(email); err != nil {
        return "", errors.New("user not found")
    }

    // Generate magic link token
    token, err := auth.NewAuthService(nil, string(s.jwtSecret), s.tokenExpiry).GenerateMagicLink(email)
    if err != nil {
        return "", err
    }

    // Save to database
    magicLink := &auth.MagicLinkToken{
        Token:     token,
        UserID:    "", // Will be populated when user clicks
        ExpiresAt: time.Now().Add(s.tokenExpiry),
        CreatedAt: time.Now(),
    }
    if err := s.magicLinkRepo.Create(magicLink); err != nil {
        return "", err
    }

    // Send magic link via email service
    if s.emailService != nil {
        if err := s.emailService.SendMagicLink(email, token, ""); err != nil {
            return "", fmt.Errorf("failed to send magic link: %w", err)
        }
    }

    return token, nil
}

// ValidateMagicLink validates a magic link token and returns the associated user ID
func (s *UserService) ValidateMagicLink(token string) (string, error) {
    return s.magicLinkRepo.GetByToken(token)
}

// UpdateUserEmailVerified marks user email as verified
func (s *UserService) UpdateUserEmailVerified(userID string) error {
    user, err := s.userRepo.GetByID(userID)
    if err != nil {
        return err
    }

    user.EmailVerified = true
    return s.userRepo.Update(user)
}

// GetUser retrieves a user by ID
func (s *UserService) GetUser(userID string) (*auth.User, error) {
    return s.userRepo.GetByID(userID)
}

// DeleteUser soft deletes a user
func (s *UserService) DeleteUser(userID string) error {
    return s.userRepo.Delete(userID)
}