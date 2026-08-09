package service

import (
    "errors"
    "fmt"
    "time"

    "gorm.io/gorm"
    "golang.org/x/crypto/bcrypt"
    "github.com/google/uuid"

    "cadensend/services/control-api/internal/auth"
)

// EmailService interface for sending emails
type EmailService interface {
    SendMagicLink(email, token string) error
}

// UserService provides user business logic
type UserService struct {
    db        *gorm.DB
    jwtSecret string
    jwtExpiry time.Duration
    emailSvc  EmailService
}

// NewUserService creates a new user service
func NewUserService(db *gorm.DB, jwtSecret string, jwtExpiry time.Duration, emailSvc EmailService) *UserService {
    return &UserService{
        db:        db,
        jwtSecret: jwtSecret,
        jwtExpiry: jwtExpiry,
        emailSvc:  emailSvc,
    }
}

// CreateUser creates a new user with hashed password
func (s *UserService) CreateUser(email, password, name, timezone, workspaceID string) (*User, error) {
    var existing User
    if err := s.db.Where("email = ? AND deleted_at IS NULL", email).First(&existing).Error; err == nil {
        return nil, errors.New("user already exists")
    }

    passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
    if err != nil {
        return nil, fmt.Errorf("failed to hash password: %w", err)
    }

    user := &User{
        ID:            uuid.NewString(),
        Email:         email,
        PasswordHash:  string(passwordHash),
        Name:          name,
        Timezone:      timezone,
        Status:        "active",
        WorkspaceID:   workspaceID,
        EmailVerified: false,
        CreatedAt:     time.Now(),
        UpdatedAt:     time.Now(),
    }

    if err := s.db.Create(user).Error; err != nil {
        return nil, fmt.Errorf("failed to create user: %w", err)
    }

    return user, nil
}

// AuthenticateUser authenticates a user with email and password
func (s *UserService) AuthenticateUser(email, password string) (*User, string, error) {
    var user User
    if err := s.db.Where("email = ? AND deleted_at IS NULL", email).First(&user).Error; err != nil {
        return nil, "", errors.New("invalid credentials")
    }

    if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
        return nil, "", errors.New("invalid credentials")
    }

    token, err := auth.GenerateJWT(&auth.User{
        ID:          user.ID,
        Email:       user.Email,
        Name:        user.Name,
        Timezone:    user.Timezone,
        Status:      user.Status,
        WorkspaceID: user.WorkspaceID,
    }, s.jwtSecret, s.jwtExpiry)

    if err != nil {
        return nil, "", err
    }

    return &user, token, nil
}

// GenerateMagicLink generates a magic link for passwordless authentication
func (s *UserService) GenerateMagicLink(email string) (string, error) {
    var user User
    if err := s.db.Where("email = ? AND deleted_at IS NULL", email).First(&user).Error; err != nil {
        return "", errors.New("user not found")
    }

    token, err := auth.GenerateMagicLink()
    if err != nil {
        return "", err
    }

    magicLink := &MagicLinkToken{
        Token:     token,
        UserID:    user.ID,
        ExpiresAt: time.Now().Add(s.jwtExpiry),
        CreatedAt: time.Now(),
    }

    if err := s.db.Create(magicLink).Error; err != nil {
        return "", fmt.Errorf("failed to store magic link: %w", err)
    }

    if s.emailSvc != nil {
        _ = s.emailSvc.SendMagicLink(email, token)
    }

    return token, nil
}

// ValidateMagicLink validates a magic link token
func (s *UserService) ValidateMagicLink(token string) (string, error) {
    var magicLink MagicLinkToken
    now := time.Now()

    if err := s.db.Where("token = ? AND expires_at > ?", token, now).First(&magicLink).Error; err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return "", errors.New("invalid or expired token")
        }
        return "", err
    }

    return magicLink.UserID, nil
}

// GetUser retrieves a user by ID
func (s *UserService) GetUser(userID string) (*User, error) {
    var user User
    if err := s.db.Where("id = ? AND deleted_at IS NULL", userID).First(&user).Error; err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, errors.New("user not found")
        }
        return nil, err
    }
    return &user, nil
}

// UpdateUserEmailVerified marks user email as verified
func (s *UserService) UpdateUserEmailVerified(userID string) error {
    return s.db.Model(&User{}).Where("id = ?", userID).Update("email_verified", true).Error
}

// DeleteUser soft deletes a user
func (s *UserService) DeleteUser(userID string) error {
    return s.db.Model(&User{}).Where("id = ?", userID).Update("deleted_at", time.Now()).Error
}

// MagicLinkToken model
type MagicLinkToken struct {
    Token     string    `gorm:"primarykey"`
    UserID    string    `json:"user_id"`
    ExpiresAt time.Time `json:"expires_at"`
    CreatedAt time.Time `json:"created_at"`
}
