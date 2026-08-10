package service

import (
    "errors"
    "fmt"
    "time"

    "gorm.io/gorm"
    "golang.org/x/crypto/bcrypt"
    "github.com/google/uuid"

    "backend/control-api/internal/auth"
)

// User model for database
type User struct {
    ID            string     `json:"id" gorm:"primarykey"`
    Email         string     `json:"email" gorm:"uniqueIndex;not null"`
    PasswordHash  string     `json:"-" gorm:"column:password_hash;not null"`
    Name          string     `json:"name"`
    Timezone      string     `json:"timezone" gorm:"not null"`
    Status        string     `json:"status" gorm:"not null"`
    WorkspaceID   string     `json:"workspace_id" gorm:"not null"`
    CreatedAt     time.Time  `json:"created_at" gorm:"not null"`
    UpdatedAt     time.Time  `json:"updated_at" gorm:"not null"`
    DeletedAt     *time.Time `json:"deleted_at,omitempty" gorm:"index"`
    EmailVerified bool       `json:"email_verified" gorm:"not null"`
}

// MagicLinkToken model
type MagicLinkToken struct {
    Token       string    `gorm:"primarykey"`
    UserID      string    `json:"user_id"`
    ExpiresAt   time.Time `json:"expires_at"`
    CreatedAt   time.Time `json:"created_at"`
}
// EmailService interface for sending emails
type EmailService interface {
    SendMagicLink(email, token string) error
}

// Workspace model for database
type Workspace struct {
    ID        string     `json:"id" gorm:"primarykey"`
    Name      string     `json:"name" gorm:"uniqueIndex;not null"`
    Plan      string     `json:"plan" gorm:"not null"`
    Status    string     `json:"status" gorm:"not null"`
    CreatedBy string     `json:"created_by" gorm:"not null"`
    CreatedAt time.Time  `json:"created_at" gorm:"not null"`
    UpdatedAt time.Time  `json:"updated_at" gorm:"not null"`
    DeletedAt *time.Time `json:"deleted_at,omitempty" gorm:"index"`
}

// Series model for database
type Series struct {
    ID          string     `json:"id" gorm:"primarykey"`
    WorkspaceID string     `json:"workspace_id" gorm:"not null"`
    Slug        string     `json:"slug" gorm:"uniqueIndex;not null"`
    Topic       string     `json:"topic" gorm:"not null"`
    Goal        string     `json:"goal" gorm:"not null"`
    Level       string     `json:"level"`
    Timezone    string     `json:"timezone" gorm:"not null"`
    Status      string     `json:"status" gorm:"not null"`
    CreatedBy   string     `json:"created_by" gorm:"not null"`
    CreatedAt   time.Time  `json:"created_at" gorm:"not null"`
    UpdatedAt   time.Time  `json:"updated_at" gorm:"not null"`
    DeletedAt   *time.Time `json:"deleted_at,omitempty" gorm:"index"`
}

// Issue model for database
type Issue struct {
    ID          string     `json:"id" gorm:"primarykey"`
    SeriesID    string     `json:"series_id" gorm:"not null"`
    SequenceNo  int        `json:"sequence_no" gorm:"not null"`
    Objective   string     `json:"objective"`
    ScheduledAt *time.Time `json:"scheduled_at"`
    Status      string     `json:"status" gorm:"not null"`
    Locked      bool       `json:"locked" gorm:"not null;default:false"`
    CreatedBy   string     `json:"created_by" gorm:"not null"`
    CreatedAt   time.Time  `json:"created_at" gorm:"not null"`
    UpdatedAt   time.Time  `json:"updated_at" gorm:"not null"`
    DeletedAt   *time.Time `json:"deleted_at,omitempty" gorm:"index"`
}

// Source model for database
type Source struct {
    ID               string     `json:"id" gorm:"primarykey"`
    WorkspaceID      string     `json:"workspace_id" gorm:"not null"`
    Scope            string     `json:"scope" gorm:"not null"`
    Type             string     `json:"type" gorm:"not null"`
    URL              string     `json:"url"`
    Status           string     `json:"status" gorm:"not null"`
    CurrentVersionID string     `json:"current_version_id"`
    ContentHash      string     `json:"content_hash"`
    CreatedBy        string     `json:"created_by" gorm:"not null"`
    CreatedAt        time.Time  `json:"created_at" gorm:"not null"`
    UpdatedAt        time.Time  `json:"updated_at" gorm:"not null"`
    DeletedAt        *time.Time `json:"deleted_at,omitempty" gorm:"index"`
}

// Schedule model for database
type Schedule struct {
    ID          string     `json:"id" gorm:"primarykey"`
    IssueID     *string    `json:"issue_id"`
    JobType     string     `json:"job_type" gorm:"not null"`
    RunAt       time.Time  `json:"run_at" gorm:"not null"`
    Status      string     `json:"status" gorm:"not null"`
    Attempts    int        `json:"attempts" gorm:"not null;default:0"`
    MaxAttempts int        `json:"max_attempts" gorm:"not null;default:5"`
    ClaimedAt   *time.Time `json:"claimed_at"`
    StartedAt   *time.Time `json:"started_at"`
    CompletedAt *time.Time `json:"completed_at"`
    ErrorCode   string     `json:"error_code"`
    ErrorMsg    string     `json:"error_msg"`
    CreatedBy   string     `json:"created_by" gorm:"not null"`
    CreatedAt   time.Time  `json:"created_at" gorm:"not null"`
    UpdatedAt   time.Time  `json:"updated_at" gorm:"not null"`
}

// Delivery model for database
type Delivery struct {
    ID              string     `json:"id" gorm:"primarykey"`
    IssueID         string     `json:"issue_id" gorm:"not null"`
    RecipientID     string     `json:"recipient_id" gorm:"not null"`
    ProviderID      string     `json:"provider_id"`
    Status          string     `json:"status" gorm:"not null"`
    IdempotencyKey  string     `json:"idempotency_key" gorm:"uniqueIndex;not null"`
    ExternalEventID string     `json:"external_event_id"`
    CreatedBy       string     `json:"created_by" gorm:"not null"`
    CreatedAt       time.Time  `json:"created_at" gorm:"not null"`
    UpdatedAt       time.Time  `json:"updated_at" gorm:"not null"`
    DeliveredAt     *time.Time `json:"delivered_at"`
    ErrorCode       string     `json:"error_code"`
    ErrorMsg        string     `json:"error_msg"`
}

// Recipient model for database
type Recipient struct {
    ID          string     `json:"id" gorm:"primarykey"`
    WorkspaceID string     `json:"workspace_id" gorm:"not null"`
    Email       string     `json:"email" gorm:"not null"`
    Verified    bool       `json:"verified" gorm:"not null;default:false"`
    CreatedAt   time.Time  `json:"created_at" gorm:"not null"`
    UpdatedAt   time.Time  `json:"updated_at" gorm:"not null"`
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
