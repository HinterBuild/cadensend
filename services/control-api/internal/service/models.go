package service

import (
    "time"

    "gorm.io/gorm"
    
    "cadensend/services/control-api/internal/auth"
)

// User model for database
type User struct {
    ID            string     `json:"id" db:"id,pk"`
    Email         string     `json:"email" db:"email,unique,notnull"`
    PasswordHash  string     `json:"-" db:"password_hash,notnull"`
    Name          string     `json:"name" db:"name"`
    Timezone      string     `json:"timezone" db:"timezone,notnull"`
    Status        string     `json:"status" db:"status,notnull"`
    WorkspaceID   string     `json:"workspace_id" db:"workspace_id,notnull"`
    CreatedAt     time.Time  `json:"created_at" db:"created_at,notnull"`
    UpdatedAt     time.Time  `json:"updated_at" db:"updated_at,notnull"`
    DeletedAt     *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
    EmailVerified bool       `json:"email_verified" db:"email_verified,notnull"`
}

// Workspace model for database
type Workspace struct {
    ID        string     `json:"id" db:"id,pk"`
    Name      string     `json:"name" db:"name,unique,notnull"`
    Plan      string     `json:"plan" db:"plan,notnull"`
    Status    string     `json:"status" db:"status,notnull"`
    CreatedBy string     `json:"created_by" db:"created_by,notnull"`
    CreatedAt time.Time  `json:"created_at" db:"created_at,notnull"`
    UpdatedAt time.Time  `json:"updated_at" db:"updated_at,notnull"`
    DeletedAt *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

// Series model for database
type Series struct {
    ID          string     `json:"id" db:"id,pk"`
    WorkspaceID string     `json:"workspace_id" db:"workspace_id,notnull"`
    Slug        string     `json:"slug" db:"slug,unique,notnull"`
    Topic       string     `json:"topic" db:"topic,notnull"`
    Goal        string     `json:"goal" db:"goal,notnull"`
    Level       string     `json:"level" db:"level"`
    Timezone    string     `json:"timezone" db:"timezone,notnull"`
    Status      string     `json:"status" db:"status,notnull"`
    CreatedBy   string     `json:"created_by" db:"created_by,notnull"`
    CreatedAt   time.Time  `json:"created_at" db:"created_at,notnull"`
    UpdatedAt   time.Time  `json:"updated_at" db:"updated_at,notnull"`
    DeletedAt   *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

// Issue model for database
type Issue struct {
    ID          string     `json:"id" db:"id,pk"`
    SeriesID    string     `json:"series_id" db:"series_id,notnull"`
    SequenceNo  int        `json:"sequence_no" db:"sequence_no,notnull"`
    Objective   string     `json:"objective" db:"objective"`
    ScheduledAt *time.Time `json:"scheduled_at" db:"scheduled_at"`
    Status      string     `json:"status" db:"status,notnull"`
    Locked      bool       `json:"locked" db:"locked,notnull"`
    CreatedBy   string     `json:"created_by" db:"created_by,notnull"`
    CreatedAt   time.Time  `json:"created_at" db:"created_at,notnull"`
    UpdatedAt   time.Time  `json:"updated_at" db:"updated_at,notnull"`
    DeletedAt   *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

// Source model for database
type Source struct {
    ID              string     `json:"id" db:"id,pk"`
    WorkspaceID     string     `json:"workspace_id" db:"workspace_id,notnull"`
    Scope           string     `json:"scope" db:"scope,notnull"`
    Type            string     `json:"type" db:"type,notnull"`
    URL             string     `json:"url" db:"url"`
    Status          string     `json:"status" db:"status,notnull"`
    CurrentVersionID string    `json:"current_version_id" db:"current_version_id"`
    ContentHash     string     `json:"content_hash" db:"content_hash"`
    CreatedBy       string     `json:"created_by" db:"created_by,notnull"`
    CreatedAt       time.Time  `json:"created_at" db:"created_at,notnull"`
    UpdatedAt       time.Time  `json:"updated_at" db:"updated_at,notnull"`
    DeletedAt       *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

// Schedule model for database
type Schedule struct {
    ID          string     `json:"id" db:"id,pk"`
    IssueID     *string    `json:"issue_id" db:"issue_id"`
    JobType     string     `json:"job_type" db:"job_type,notnull"`
    RunAt       time.Time  `json:"run_at" db:"run_at,notnull"`
    Status      string     `json:"status" db:"status,notnull"`
    Attempts    int        `json:"attempts" db:"attempts,notnull"`
    MaxAttempts int        `json:"max_attempts" db:"max_attempts,notnull"`
    ClaimedAt   *time.Time `json:"claimed_at" db:"claimed_at"`
    StartedAt   *time.Time `json:"started_at" db:"started_at"`
    CompletedAt *time.Time `json:"completed_at" db:"completed_at"`
    ErrorCode   string     `json:"error_code" db:"error_code"`
    ErrorMsg    string     `json:"error_msg" db:"error_msg"`
    CreatedBy   string     `json:"created_by" db:"created_by,notnull"`
    CreatedAt   time.Time  `json:"created_at" db:"created_at,notnull"`
    UpdatedAt   time.Time  `json:"updated_at" db:"updated_at,notnull"`
}

// Delivery model for database
type Delivery struct {
    ID              string     `json:"id" db:"id,pk"`
    IssueID         string     `json:"issue_id" db:"issue_id,notnull"`
    RecipientID     string     `json:"recipient_id" db:"recipient_id,notnull"`
    ProviderID      string     `json:"provider_id" db:"provider_id"`
    Status          string     `json:"status" db:"status,notnull"`
    IdempotencyKey  string     `json:"idempotency_key" db:"idempotency_key,unique,notnull"`
    ExternalEventID string     `json:"external_event_id" db:"external_event_id"`
    CreatedBy       string     `json:"created_by" db:"created_by,notnull"`
    CreatedAt       time.Time  `json:"created_at" db:"created_at,notnull"`
    UpdatedAt       time.Time  `json:"updated_at" db:"updated_at,notnull"`
    DeliveredAt     *time.Time `json:"delivered_at" db:"delivered_at"`
    ErrorCode       string     `json:"error_code" db:"error_code"`
    ErrorMsg        string     `json:"error_msg" db:"error_msg"`
}

// Recipient model for database
type Recipient struct {
    ID          string     `json:"id" db:"id,pk"`
    WorkspaceID string     `json:"workspace_id" db:"workspace_id,notnull"`
    Email       string     `json:"email" db:"email,notnull"`
    Verified    bool       `json:"verified" db:"verified,notnull"`
    CreatedAt   time.Time  `json:"created_at" db:"created_at,notnull"`
    UpdatedAt   time.Time  `json:"updated_at" db:"updated_at,notnull"`
}

// GenerationRun model for database
type GenerationRun struct {
    ID          string     `json:"id" db:"id,pk"`
    TargetID    string     `json:"target_id" db:"target_id,notnull"`
    TargetType  string     `json:"target_type" db:"target_type,notnull"`
    Status      string     `json:"status" db:"status,notnull"`
    Model       string     `json:"model" db:"model,notnull"`
    TokensIn    int        `json:"tokens_in" db:"tokens_in,notnull"`
    TokensOut   int        `json:"tokens_out" db:"tokens_out,notnull"`
    CostUSD     float64    `json:"cost_usd" db:"cost_usd,notnull"`
    PromptVersion string   `json:"prompt_version" db:"prompt_version"`
    ErrorCode   string     `json:"error_code" db:"error_code"`
    CreatedBy   string     `json:"created_by" db:"created_by,notnull"`
    CreatedAt   time.Time  `json:"created_at" db:"created_at,notnull"`
    UpdatedAt   time.Time  `json:"updated_at" db:"updated_at,notnull"`
    CompletedAt *time.Time `json:"completed_at" db:"completed_at"`
}

// Convert auth types to service types
func FromAuthUser(authUser *auth.User) *User {
    return &User{
        ID:            authUser.ID,
        Email:         authUser.Email,
        PasswordHash:  authUser.PasswordHash,
        Name:          authUser.Name,
        Timezone:      authUser.Timezone,
        Status:        authUser.Status,
        WorkspaceID:   authUser.WorkspaceID,
        CreatedAt:     authUser.CreatedAt,
        UpdatedAt:     authUser.UpdatedAt,
        DeletedAt:     authUser.DeletedAt,
        EmailVerified: authUser.EmailVerified,
    }
}

func ToAuthUser(user *User) *auth.User {
    return &auth.User{
        ID:            user.ID,
        Email:         user.Email,
        PasswordHash:  user.PasswordHash,
        Name:          user.Name,
        Timezone:      user.Timezone,
        Status:        user.Status,
        WorkspaceID:   user.WorkspaceID,
        CreatedAt:     user.CreatedAt,
        UpdatedAt:     user.UpdatedAt,
        DeletedAt:     user.DeletedAt,
        EmailVerified: user.EmailVerified,
    }
}
