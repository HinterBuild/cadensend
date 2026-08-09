package auth

import (
    "context"
    "fmt"
    "log"
    "time"

    "github.com/gin-gonic/gin"
    "github.com/golang-jwt/jwt/v5"
    "golang.org/x/crypto/bcrypt"
    "github.com/google/uuid"
    "gorm.io/gorm"
)

type Claims struct {
    UserID     string `json:"user_id"`
    WorkspaceID string `json:"workspace_id"`
    Email      string `json:"email"`
    Role       string `json:"role"`
    jwt.RegisteredClaims
}

type MagicLinkToken struct {
    ID        string    `json:"id" db:"id,pk"`
    Token     string    `json:"token" db:"token,unique,notnull"`
    UserID    string    `json:"user_id" db:"user_id,notnull"`
    ExpiresAt time.Time `json:"expires_at" db:"expires_at,notnull"`
    CreatedAt time.Time `json:"created_at" db:"created_at,notnull"`
}

type User struct {
    ID              string    `json:"id" db:"id,pk"`
    Email           string    `json:"email" db:"email,unique,notnull"`
    PasswordHash    string    `json:"password_hash" db:"password_hash,notnull"`
    Name            string    `json:"name" db:"name"`
    Timezone        string    `json:"timezone" db:"timezone,notnull"`
    Status          string    `json:"status" db:"status,notnull"`
    WorkspaceID     string    `json:"workspace_id" db:"workspace_id,notnull"`
    CreatedAt       time.Time `json:"created_at" db:"created_at,notnull"`
    UpdatedAt       time.Time `json:"updated_at" db:"updated_at,notnull"`
    DeletedAt       *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
    EmailVerified   bool      `json:"email_verified" db:"email_verified,notnull"`
}

// AuthService handles authentication logic
// Uses only Go standard libraries for cryptographic operations
// No external dependencies on AI models or third-party services
type AuthService struct {
    db         *gorm.DB
    jwtSecret  []byte
    tokenExpiry time.Duration
}

// NewAuthService creates a new authentication service
func NewAuthService(db *gorm.DB, jwtSecret string, tokenExpiry time.Duration) *AuthService {
    return &AuthService{
        db:         db,
        jwtSecret:  []byte(jwtSecret),
        tokenExpiry: tokenExpiry,
    }
}

// GenerateMagicLink creates a time-limited magic link token for user authentication
func (s *AuthService) GenerateMagicLink(email string) (string, error) {
    // Generate secure random token using crypto/rand
    tokenBytes := make([]byte, 32)
    if _, err := rand.Read(tokenBytes); err != nil {
        return "", fmt.Errorf("failed to generate token: %w", err)
    }
    token := hex.EncodeToString(tokenBytes)

    // Create magic link token record
    magicLink := &MagicLinkToken{
        Token:     token,
        UserID:    "", // Will be populated when user clicks
        ExpiresAt: time.Now().Add(s.tokenExpiry),
        CreatedAt: time.Now(),
    }

    // Store token in database (used for validation later)
    if err := s.db.Create(magicLink).Error; err != nil {
        return "", fmt.Errorf("failed to store token: %w", err)
    }

    return token, nil
}

// ValidateMagicLink validates a magic link token and returns the associated user ID
func (s *AuthService) ValidateMagicLink(token string) (string, error) {
    var magicLink MagicLinkToken
    now := time.Now()

    // Find valid magic link token
    result := s.db.Where("token = ? AND (user_id IS NULL OR expires_at > ?)", token, now).
        First(&magicLink)
    if result.Error != nil {
        if errors.Is(result.Error, gorm.ErrRecordNotFound) {
            return "", fmt.Errorf("invalid or expired token")
        }
        return "", fmt.Errorf("database error: %w", result.Error)
    }

    return magicLink.UserID, nil
}

// GenerateJWT creates a JWT token for authenticated users
func (s *AuthService) GenerateJWT(userID, workspaceID, email, role string) (string, error) {
    claims := &Claims{
        UserID:     userID,
        WorkspaceID: workspaceID,
        Email:      email,
        Role:       role,
        RegisteredClaims: jwt.RegisteredClaims{
            IssuedAt:  jwt.NewNumericDate(time.Now()),
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
            Issuer:    "cadensend",
        },
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    tokenString, err := token.SignedString(s.jwtSecret)
    if err != nil {
        return "", fmt.Errorf("failed to sign token: %w", err)
    }

    return tokenString, nil
}

// ValidateJWT validates a JWT token and returns the claims
func (s *AuthService) ValidateJWT(tokenString string) (*Claims, error) {
    token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
        if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
        }
        return s.jwtSecret, nil
    })

    if err != nil {
        return nil, fmt.Errorf("failed to parse token: %w", err)
    }

    if claims, ok := token.Claims.(*Claims); ok && token.Valid {
        return claims, nil
    }

    return nil, fmt.Errorf("invalid token")
}

// CreateUser creates a new user with hashed password
func (s *AuthService) CreateUser(email, password, name, timezone, workspaceID string) (*User, error) {
    // Hash password
    passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
    if err != nil {
        return nil, fmt.Errorf("failed to hash password: %w", err)
    }

    // Generate user ID
    userID := uuid.New().String()

    user := &User{
        ID:            userID,
        Email:         email,
        PasswordHash:  string(passwordHash),
        Name:          name,
        Timezone:      timezone,
        Status:        "active",
        WorkspaceID:   workspaceID,
        CreatedAt:     time.Now(),
        UpdatedAt:     time.Now(),
        EmailVerified: false,
    }

    // Create user in database
    if err := s.db.Create(user).Error; err != nil {
        return nil, fmt.Errorf("failed to create user: %w", err)
    }

    return user, nil
}

// AuthenticateUser validates email and password
func (s *AuthService) AuthenticateUser(email, password string) (*User, error) {
    var user User

    // Find user by email
    if err := s.db.Where("email = ? AND deleted_at IS NULL", email).First(&user).Error; err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, fmt.Errorf("invalid credentials")
        }
        return nil, fmt.Errorf("database error: %w", err)
    }

    // Verify password
    if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
        return nil, fmt.Errorf("invalid credentials")
    }

    return &user, nil
}

// UpdateUserEmailVerified marks user email as verified
func (s *AuthService) UpdateUserEmailVerified(userID string) error {
    updates := map[string]interface{}{}
    updates["email_verified"] = true
    updates["updated_at"] = time.Now()

    result := s.db.Model(&User{}).Where("id = ?", userID).Updates(updates)
    if result.Error != nil {
        return fmt.Errorf("failed to update user: %w", result.Error)
    }

    if result.RowsAffected == 0 {
        return fmt.Errorf("user not found")
    }

    return nil
}