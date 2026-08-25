package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"backend/control-api/internal/auth"
)

// User model for database
type User struct {
	ID             string     `json:"id" gorm:"primarykey"`
	Email          string     `json:"email" gorm:"uniqueIndex;not null"`
	PasswordHash   string     `json:"-" gorm:"column:password_hash;not null"`
	Name           string     `json:"name"`
	Timezone       string     `json:"timezone" gorm:"not null"`
	Status         string     `json:"status" gorm:"not null"`
	WorkspaceID    string     `json:"workspace_id" gorm:"not null"`
	CreatedAt      time.Time  `json:"created_at" gorm:"not null"`
	UpdatedAt      time.Time  `json:"updated_at" gorm:"not null"`
	DeletedAt      *time.Time `json:"deleted_at,omitempty" gorm:"index"`
	EmailVerified  bool       `json:"email_verified" gorm:"not null"`
	PreferredModel string     `json:"preferred_model" gorm:"column:preferred_model"`
	TokenVersion   int        `json:"-" gorm:"not null;default:1"`
}

// MagicLinkToken model
type MagicLinkToken struct {
	Token     string    `gorm:"primarykey"`
	UserID    string    `json:"user_id"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
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
	ID             string     `json:"id" gorm:"primarykey"`
	WorkspaceID    string     `json:"workspace_id" gorm:"not null"`
	Slug           string     `json:"slug" gorm:"uniqueIndex;not null"`
	Topic          string     `json:"topic" gorm:"not null"`
	Goal           string     `json:"goal" gorm:"not null"`
	Level          string     `json:"level"`
	Timezone       string     `json:"timezone" gorm:"not null"`
	Status         string     `json:"status" gorm:"not null"`
	PlanStatus     string     `json:"plan_status"`
	PlanJSON       *string    `json:"plan_json,omitempty" gorm:"type:jsonb"`
	PlanError      string     `json:"plan_error"`
	Cadence        string     `json:"cadence"`
	StartDate      string     `json:"start_date"`
	SendTime       string     `json:"send_time"`
	SendDays       string     `json:"send_days"`
	ManualApproval bool       `json:"manual_approval" gorm:"not null;default:false"`
	CreatedBy      string     `json:"created_by" gorm:"not null"`
	CreatedAt      time.Time  `json:"created_at" gorm:"not null"`
	UpdatedAt      time.Time  `json:"updated_at" gorm:"not null"`
	DeletedAt      *time.Time `json:"deleted_at,omitempty" gorm:"index"`
}

// Issue model for database
type Issue struct {
	ID            string     `json:"id" gorm:"primarykey"`
	SeriesID      string     `json:"series_id" gorm:"not null"`
	SequenceNo    int        `json:"sequence_no" gorm:"not null"`
	Objective     string     `json:"objective"`
	ScheduledAt   *time.Time `json:"scheduled_at"`
	Status        string     `json:"status" gorm:"not null"`
	ContentJSON   *string    `json:"content_json,omitempty" gorm:"type:jsonb"`
	GenerateError string     `json:"generate_error"`
	Locked        bool       `json:"locked" gorm:"not null;default:false"`
	CreatedBy     string     `json:"created_by" gorm:"not null"`
	CreatedAt     time.Time  `json:"created_at" gorm:"not null"`
	UpdatedAt     time.Time  `json:"updated_at" gorm:"not null"`
	DeletedAt     *time.Time `json:"deleted_at,omitempty" gorm:"index"`
}

// Source model for database
type Source struct {
	ID                string          `json:"id" gorm:"primarykey"`
	WorkspaceID       string          `json:"workspace_id" gorm:"not null"`
	Scope             string          `json:"scope" gorm:"not null"`
	Type              string          `json:"type" gorm:"not null"`
	URL               string          `json:"url"`
	SeriesID          string          `json:"series_id"`
	Status            string          `json:"status" gorm:"not null"`
	IngestError       string          `json:"ingest_error"`
	CurrentVersionID  string          `json:"current_version_id"`
	ContentHash       string          `json:"content_hash"`
	DuplicateOf       string          `json:"duplicate_of,omitempty"`
	ChunkCount        int             `json:"chunk_count" gorm:"not null;default:0"`
	InjectionStatus   string          `json:"injection_status" gorm:"not null;default:'clean'"`
	InjectionFindings json.RawMessage `json:"injection_findings,omitempty" gorm:"column:injection_findings;type:jsonb"`
	CreatedBy         string          `json:"created_by" gorm:"not null"`
	CreatedAt         time.Time       `json:"created_at" gorm:"not null"`
	UpdatedAt         time.Time       `json:"updated_at" gorm:"not null"`
	DeletedAt         *time.Time      `json:"deleted_at,omitempty" gorm:"index"`
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
	ID                string     `json:"id" gorm:"primarykey"`
	WorkspaceID       string     `json:"workspace_id" gorm:"not null"`
	Email             string     `json:"email" gorm:"not null"`
	Verified          bool       `json:"verified" gorm:"not null;default:false"`
	Suppressed        bool       `json:"suppressed" gorm:"not null;default:false"`
	SuppressionReason string     `json:"suppression_reason" gorm:"not null;default:''"`
	VerifiedAt        *time.Time `json:"verified_at,omitempty"`
	CreatedAt         time.Time  `json:"created_at" gorm:"not null"`
	UpdatedAt         time.Time  `json:"updated_at" gorm:"not null"`
}

// PasswordResetToken is a single-use token emailed for password resets.
type PasswordResetToken struct {
	Token     string     `gorm:"primarykey"`
	UserID    string     `gorm:"not null"`
	ExpiresAt time.Time  `gorm:"not null"`
	UsedAt    *time.Time
	CreatedAt time.Time  `gorm:"not null"`
}

// AuditLog records destructive or security-relevant actions.
type AuditLog struct {
	ID           string    `gorm:"primarykey"`
	ActorID      string    `gorm:"not null"`
	Action       string    `gorm:"not null"`
	TargetType   string    `gorm:"not null"`
	TargetID     string    `gorm:"not null"`
	MetadataJSON string    `gorm:"column:metadata_json;type:jsonb;not null"`
	Timestamp    time.Time `gorm:"not null"`
	SessionID    string
	IPAddress    string
}

func (AuditLog) TableName() string { return "audit_logs" }

// GenerationRun tracks one LLM execution with its token usage and cost.
type GenerationRun struct {
	ID           string     `gorm:"primarykey"`
	TargetID     string     `gorm:"not null"`
	TargetType   string     `gorm:"not null"`
	Status       string     `gorm:"not null"`
	Model        string     `gorm:"not null"`
	TokensIn     int64      `gorm:"not null;default:0"`
	TokensOut    int64      `gorm:"not null;default:0"`
	CostUSD      float64    `gorm:"column:cost_usd;not null;default:0"`
	PromptVersion string
	ErrorCode    string
	ErrorMsg     string
	CreatedBy    string     `gorm:"not null"`
	CreatedAt    time.Time  `gorm:"not null"`
	UpdatedAt    time.Time  `gorm:"not null"`
	CompletedAt  *time.Time
}

func (GenerationRun) TableName() string { return "generation_runs" }

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
		return nil, "", errors.New("user not found")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, "", errors.New("incorrect password")
	}

	token, err := auth.GenerateJWT(&auth.User{
		ID:          user.ID,
		Email:       user.Email,
		Name:        user.Name,
		Timezone:    user.Timezone,
		Status:      user.Status,
		WorkspaceID: user.WorkspaceID,
	}, s.jwtSecret, s.jwtExpiry, user.TokenVersion)

	if err != nil {
		return nil, "", err
	}

	return &user, token, nil
}

// AuthenticateUserByID retrieves a user by ID and generates a JWT
func (s *UserService) AuthenticateUserByID(userID string) (*User, string, error) {
	var user User
	if err := s.db.Where("id = ? AND deleted_at IS NULL", userID).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, "", errors.New("user not found")
		}
		return nil, "", err
	}

	token, err := auth.GenerateJWT(&auth.User{
		ID:          user.ID,
		Email:       user.Email,
		Name:        user.Name,
		Timezone:    user.Timezone,
		Status:      user.Status,
		WorkspaceID: user.WorkspaceID,
	}, s.jwtSecret, s.jwtExpiry, user.TokenVersion)
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate token: %w", err)
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

// ValidateMagicLink validates a magic link token and returns the user ID
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

// UpdateUser updates user profile information
func (s *UserService) UpdateUser(userID string, name, timezone string, preferredModel *string) (*User, error) {
	var user User
	if err := s.db.Where("id = ? AND deleted_at IS NULL", userID).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("user not found")
		}
		return nil, err
	}

	updates := map[string]interface{}{}
	if name != "" {
		updates["name"] = name
	}
	if timezone != "" {
		updates["timezone"] = timezone
	}
	if preferredModel != nil {
		updates["preferred_model"] = *preferredModel
	}
	updates["updated_at"] = time.Now()

	if err := s.db.Model(&user).Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("failed to update user: %w", err)
	}

	if err := s.db.Where("id = ?", userID).First(&user).Error; err != nil {
		return nil, err
	}

	return &user, nil
}

// ChangePassword changes a user's password
func (s *UserService) ChangePassword(userID, currentPassword, newPassword string) error {
	var user User
	if err := s.db.Where("id = ? AND deleted_at IS NULL", userID).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("user not found")
		}
		return err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(currentPassword)); err != nil {
		return errors.New("current password is incorrect")
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	return s.db.Model(&user).Update("password_hash", string(passwordHash)).Error
}

// DeleteUser soft deletes a user
func (s *UserService) DeleteUser(userID string) error {
	return s.db.Model(&User{}).Where("id = ?", userID).Update("deleted_at", time.Now()).Error
}

// BumpTokenVersion invalidates every previously issued JWT for the user.
func (s *UserService) BumpTokenVersion(userID string) error {
	return s.db.Model(&User{}).Where("id = ?", userID).
		Update("token_version", gorm.Expr("token_version + 1")).Error
}

// TokenVersion returns the current JWT generation for a user (0 if unknown).
func (s *UserService) TokenVersion(userID string) int {
	var v int
	if err := s.db.Model(&User{}).Select("token_version").
		Where("id = ? AND deleted_at IS NULL", userID).Scan(&v).Error; err != nil {
		return 0
	}
	return v
}

// VerifyMagicLink validates a magic link token and returns the user with a JWT.
// The token is consumed on first use and the user's email is marked verified.
func (s *UserService) VerifyMagicLink(token string) (*User, string, error) {
	userID, err := s.ValidateMagicLink(token)
	if err != nil {
		return nil, "", err
	}

	// Consume: single use.
	if err := s.db.Where("token = ?", token).Delete(&MagicLinkToken{}).Error; err != nil {
		return nil, "", fmt.Errorf("failed to consume magic link: %w", err)
	}

	if err := s.UpdateUserEmailVerified(userID); err != nil {
		return nil, "", err
	}

	return s.AuthenticateUserByID(userID)
}

// CleanupExpiredTokens removes stale magic-link and password-reset tokens.
func (s *UserService) CleanupExpiredTokens() {
	now := time.Now()
	s.db.Where("expires_at < ?", now.Add(-24*time.Hour)).Delete(&MagicLinkToken{})
	s.db.Where("expires_at < ?", now.Add(-7*24*time.Hour)).Delete(&PasswordResetToken{})
}

// RequestPasswordReset creates a single-use reset token for the email.
// Returns an empty token when the account does not exist so callers can
// respond identically without leaking account existence.
func (s *UserService) RequestPasswordReset(email string) (string, *User, error) {
	var user User
	if err := s.db.Where("email = ? AND deleted_at IS NULL", strings.ToLower(strings.TrimSpace(email))).First(&user).Error; err != nil {
		return "", nil, nil
	}

	token, err := auth.GenerateMagicLink()
	if err != nil {
		return "", nil, err
	}

	reset := &PasswordResetToken{
		Token:     token,
		UserID:    user.ID,
		ExpiresAt: time.Now().Add(time.Hour),
		CreatedAt: time.Now(),
	}
	if err := s.db.Create(reset).Error; err != nil {
		return "", nil, fmt.Errorf("failed to store reset token: %w", err)
	}
	return token, &user, nil
}

// ResetPassword consumes a reset token and sets a new password.
func (s *UserService) ResetPassword(token, newPassword string) error {
	var reset PasswordResetToken
	now := time.Now()
	if err := s.db.Where("token = ? AND expires_at > ? AND used_at IS NULL", token, now).
		First(&reset).Error; err != nil {
		return errors.New("invalid or expired reset token")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&User{}).Where("id = ?", reset.UserID).
			Updates(map[string]interface{}{
				"password_hash": string(hash),
				"updated_at":    now,
			}).Error; err != nil {
			return err
		}
		if err := tx.Model(&PasswordResetToken{}).Where("token = ?", token).
			Update("used_at", now).Error; err != nil {
			return err
		}
		// Invalidate existing sessions after a credential change.
		return tx.Model(&User{}).Where("id = ?", reset.UserID).
			Update("token_version", gorm.Expr("token_version + 1")).Error
	})
}

// CreateRecipient adds a recipient to the workspace unless it already exists.
func (s *UserService) CreateRecipient(workspaceID, email string) (*Recipient, bool, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	var existing Recipient
	if err := s.db.Where("workspace_id = ? AND email = ?", workspaceID, email).First(&existing).Error; err == nil {
		return &existing, false, nil
	}
	rcpt := &Recipient{
		ID:          uuid.NewString(),
		WorkspaceID: workspaceID,
		Email:       email,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	if err := s.db.Create(rcpt).Error; err != nil {
		return nil, false, err
	}
	return rcpt, true, nil
}

// ListRecipients returns every recipient in the workspace.
func (s *UserService) ListRecipients(workspaceID string) ([]Recipient, error) {
	var out []Recipient
	err := s.db.Where("workspace_id = ?", workspaceID).Order("created_at ASC").Find(&out).Error
	return out, err
}

// DeleteRecipient removes a workspace recipient.
func (s *UserService) DeleteRecipient(workspaceID, recipientID string) error {
	return s.db.Where("id = ? AND workspace_id = ?", recipientID, workspaceID).
		Delete(&Recipient{}).Error
}
