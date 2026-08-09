// Contract definitions for Cadensend
// Generated from protobuf definitions for consistency across all services

package contracts

import "time"

// === Core business entities ===

// User represents a system user with authentication
// Primary identifier: users.id
// Tenant context: users.workspace_id
// Business rules: email-verified, active, deleted-at
// Indexes: workspace_id, email, status

type User struct {
    ID              string    `json:"id" db:"id,pk"`
    Email           string    `json:"email" db:"email,unique,notnull"`
    Name            string    `json:"name" db:"name"`
    Timezone        string    `json:"timezone" db:"timezone,notnull"`
    Status          string    `json:"status" db:"status,notnull"`
    WorkspaceID     string    `json:"workspace_id" db:"workspace_id,notnull"`
    CreatedAt       time.Time `json:"created_at" db:"created_at,notnull"`
    UpdatedAt       time.Time `json:"updated_at" db:"updated_at,notnull"`
    DeletedAt       *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
    EmailVerified   bool      `json:"email_verified" db:"email_verified,notnull"`
}

// Workspace represents a tenant or organization
// Primary identifier: workspaces.id
// Business rules: name unique per workspace, status active/deleted
// Indexes: plan, status, created_by

type Workspace struct {
    ID          string    `json:"id" db:"id,pk"`
    Name        string    `json:"name" db:"name,unique,notnull"`
    Plan        string    `json:"plan" db:"plan,notnull"`
    Status      string    `json:"status" db:"status,notnull"`
    CreatedBy   string    `json:"created_by" db:"created_by,notnull"`
    CreatedAt   time.Time `json:"created_at" db:"created_at,notnull"`
    UpdatedAt   time.Time `json:"updated_at" db:"updated_at,notnull"`
    DeletedAt   *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

// WorkspaceMember links users to workspaces with roles
// Primary identifier: workspace_members.id
// Business rules: unique (workspace_id, user_id), valid roles
// Indexes: workspace_id, user_id

type WorkspaceMember struct {
    ID          string    `json:"id" db:"id,pk"`
    WorkspaceID string    `json:"workspace_id" db:"workspace_id,unique,notnull"`
    UserID     string    `json:"user_id" db:"user_id,unique,notnull"`
    Role        string    `json:"role" db:"role,notnull"`
    CreatedAt  time.Time `json:"created_at" db:"created_at,notnull"`
    UpdatedAt  time.Time `json:"updated_at" db:"updated_at,notnull"`
}

// Series represents a learning email series
// Primary identifier: series.id
// Business rules: owned by workspace, unique (workspace_id, slug), status
// Indexes: workspace_id, slug, status, created_by

type Series struct {
    ID          string    `json:"id" db:"id,pk"`
    WorkspaceID string    `json:"workspace_id" db:"workspace_id,notnull"`
    Slug        string    `json:"slug" db:"slug,unique,notnull"`
    Topic       string    `json:"topic" db:"topic,notnull"`
    Goal        string    `json:"goal" db:"goal,notnull"`
    Level       string    `json:"level" db:"level,notnull"`
    Timezone    string    `json:"timezone" db:"timezone,notnull"`
    Status      string    `json:"status" db:"status,notnull"`
    CreatedBy   string    `json:"created_by" db:"created_by,notnull"`
    CreatedAt   time.Time `json:"created_at" db:"created_at,notnull"`
    UpdatedAt   time.Time `json:"updated_at" db:"updated_at,notnull"`
    DeletedAt   *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

// SeriesVersion represents a versioned series brief
// Primary identifier: series_versions.id
// Business rules: immutable version history, JSON brief
// Indexes: series_id, version

type SeriesVersion struct {
    ID         string    `json:"id" db:"id,pk"`
    SeriesID  string    `json:"series_id" db:"series_id,notnull"`
    Version   int       `json:"version" db:"version,notnull"`
    BriefJSON string    `json:"brief_json" db:"brief_json,notnull"`
    PromptVersion string `json:"prompt_version" db:"prompt_version,notnull"`
    CreatedBy string    `json:"created_by" db:"created_by,notnull"`
    CreatedAt time.Time `json:"created_at" db:"created_at,notnull"`
    UpdatedAt time.Time `json:"updated_at" db:"updated_at,notnull"`
}

// Issue represents an email to be sent
// Primary identifier: issues.id
// Business rules: belongs to series, unique (series_id, sequence_no)
// Indexes: series_id, sequence_no, status, scheduled_at

type Issue struct {
    ID          string    `json:"id" db:"id,pk"`
    SeriesID   string    `json:"series_id" db:"series_id,notnull"`
    SequenceNo int       `json:"sequence_no" db:"sequence_no,notnull"`
    Objective  string    `json:"objective" db:"objective,notnull"`
    ScheduledAt time.Time `json:"scheduled_at" db:"scheduled_at,notnull"`
    Status     string    `json:"status" db:"status,notnull"`
    Locked     bool      `json:"locked" db:"locked,notnull"`
    CreatedBy  string    `json:"created_by" db:"created_by,notnull"`
    CreatedAt  time.Time `json:"created_at" db:"created_at,notnull"`
    UpdatedAt  time.Time `json:"updated_at" db:"updated_at,notnull"`
    DeletedAt  *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

// IssueVersion represents a generated issue version
// Primary identifier: issue_versions.id
// Business rules: immutable content, version history, checksums
// Indexes: issue_id, version

type IssueVersion struct {
    ID         string    `json:"id" db:"id,pk"`
    IssueID   string    `json:"issue_id" db:"issue_id,notnull"`
    Version   int       `json:"version" db:"version,notnull"`
    ContentJSON string   `json:"content_json" db:"content_json,notnull"`
    Subject   string    `json:"subject" db:"subject,notnull"`
    Preheader string    `json:"preheader" db:"preheader,notnull"`
    Checksum  string    `json:"checksum" db:"checksum,notnull"`
    CreatedBy string    `json:"created_by" db:"created_by,notnull"`
    CreatedAt time.Time `json:"created_at" db:"created_at,notnull"`
    UpdatedAt time.Time `json:"updated_at" db:"updated_at,notnull"`
}

// Source represents an external content source (URL/file)
// Primary identifier: sources.id
// Business rules: workspace-scoped, version tracking, idempotent ingestion
// Indexes: workspace_id, scope, type, status

type Source struct {
    ID              string    `json:"id" db:"id,pk"`
    WorkspaceID     string    `json:"workspace_id" db:"workspace_id,notnull"`
    Scope           string    `json:"scope" db:"scope,notnull"`
    Type            string    `json:"type" db:"type,notnull"`
    URL             string    `json:"url" db:"url"`
    Status          string    `json:"status" db:"status,notnull"`
    CurrentVersionID string   `json:"current_version_id" db:"current_version_id"`
    CreatedBy       string    `json:"created_by" db:"created_by,notnull"`
    CreatedAt       time.Time `json:"created_at" db:"created_at,notnull"`
    UpdatedAt       time.Time `json:"updated_at" db:"updated_at,notnull"`
    DeletedAt       *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

// SourceVersion represents a specific version of a source
// Primary identifier: source_versions.id
// Business rules: immutable, content hash-based idempotency
// Indexes: source_id, pipeline_version, status

type SourceVersion struct {
    ID               string    `json:"id" db:"id,pk"`
    SourceID        string    `json:"source_id" db:"source_id,notnull"`
    ContentHash     string    `json:"content_hash" db:"content_hash,notnull"`
    ObjectKey       string    `json:"object_key" db:"object_key,notnull"`
    ParserVersion   string    `json:"parser_version" db:"parser_version,notnull"`
    Status          string    `json:"status" db:"status,notnull"`
    ErrorCode       string    `json:"error_code" db:"error_code"`
    IngestionRunID  string    `json:"ingestion_run_id" db:"ingestion_run_id"`
    CreatedBy       string    `json:"created_by" db:"created_by,notnull"`
    CreatedAt       time.Time `json:"created_at" db:"created_at,notnull"`
    UpdatedAt       time.Time `json:"updated_at" db:"updated_at,notnull"`
}

// SourceChunk represents a processed text chunk from a source
// Primary identifier: source_chunks.id
// Business rules: tied to source version, indexed, versioned
// Indexes: source_version_id, chunker_version, index

type SourceChunk struct {
    ID               string    `json:"id" db:"id,pk"`
    SourceVersionID string    `json:"source_version_id" db:"source_version_id,notnull"`
    Index           int       `json:"index" db:"index,notnull"`
    Text            string    `json:"text" db:"text,notnull"`
    TokenCount      int       `json:"token_count" db:"token_count,notnull"`
    HeadingPath     []string  `json:"heading_path" db:"heading_path,notnull"`
    Checksum        string    `json:"checksum" db:"checksum,notnull"`
    CreatedBy       string    `json:"created_by" db:"created_by,notnull"`
    CreatedAt       time.Time `json:"created_at" db:"created_at,notnull"`
    UpdatedAt       time.Time `json:"updated_at" db:"updated_at,notnull"`
    DeletedAt       *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

// GenerationRun tracks AI content generation jobs
// Primary identifier: generation_runs.id
// Business rules: tracks model usage, costs, tokens, failures
// Indexes: target, status, created_at

type GenerationRun struct {
    ID             string    `json:"id" db:"id,pk"`
    TargetID       string    `json:"target_id" db:"target_id,notnull"`
    TargetType     string    `json:"target_type" db:"target_type,notnull"`
    Status         string    `json:"status" db:"status,notnull"`
    Model          string    `json:"model" db:"model,notnull"`
    TokensIn       int       `json:"tokens_in" db:"tokens_in,notnull"`
    TokensOut      int       `json:"tokens_out" db:"tokens_out,notnull"`
    CostUSD        float64   `json:"cost_usd" db:"cost_usd,notnull"`
    ErrorCode      string    `json:"error_code" db:"error_code"`
    PromptVersion  string    `json:"prompt_version" db:"prompt_version,notnull"`
    CreatedBy      string    `json:"created_by" db:"created_by,notnull"`
    CreatedAt      time.Time `json:"created_at" db:"created_at,notnull"`
    UpdatedAt      time.Time `json:"updated_at" db:"updated_at,notnull"`
    CompletedAt    *time.Time `json:"completed_at,omitempty" db:"completed_at"`
}

// Schedule represents a job scheduled for execution
// Primary identifier: schedules.id
// Business rules: deterministic scheduling, idempotency, recovery
// Indexes: job_type, run_at, status, attempts

type Schedule struct {
    ID          string    `json:"id" db:"id,pk"`
    IssueID     string    `json:"issue_id" db:"issue_id"`
    JobType     string    `json:"job_type" db:"job_type,notnull"`
    RunAt       time.Time `json:"run_at" db:"run_at,notnull"`
    Status      string    `json:"status" db:"status,notnull"`
    Attempts    int       `json:"attempts" db:"attempts,notnull"`
    MaxAttempts int       `json:"max_attempts" db:"max_attempts,notnull"`
    ClaimedAt   *time.Time `json:"claimed_at,omitempty" db:"claimed_at"`
    StartedAt   *time.Time `json:"started_at,omitempty" db:"started_at"`
    CompletedAt *time.Time `json:"completed_at,omitempty" db:"completed_at"`
    ErrorCode   string    `json:"error_code" db:"error_code"`
    ErrorMsg    string    `json:"error_msg" db:"error_msg"`
    CreatedBy   string    `json:"created_by" db:"created_by,notnull"`
    CreatedAt   time.Time `json:"created_at" db:"created_at,notnull"`
    UpdatedAt   time.Time `json:"updated_at" db:"updated_at,notnull"`
}

// Delivery tracks email delivery to recipients
// Primary identifier: deliveries.id
// Business rules: idempotent, webhook-driven, state machine
// Indexes: issue_id, recipient_id, status

type Delivery struct {
    ID               string    `json:"id" db:"id,pk"`
    IssueID          string    `json:"issue_id" db:"issue_id,notnull"`
    RecipientID      string    `json:"recipient_id" db:"recipient_id,notnull"`
    ProviderID       string    `json:"provider_id" db:"provider_id,notnull"`
    Status           string    `json:"status" db:"status,notnull"`
    IdempotencyKey   string    `json:"idempotency_key" db:"idempotency_key,unique,notnull"`
    ExternalEventID  string    `json:"external_event_id" db:"external_event_id"`
    CreatedBy        string    `json:"created_by" db:"created_by,notnull"`
    CreatedAt        time.Time `json:"created_at" db:"created_at,notnull"`
    UpdatedAt        time.Time `json:"updated_at" db:"updated_at,notnull"`
    DeliveredAt      *time.Time `json:"delivered_at,omitempty" db:"delivered_at"`
    ErrorCode        string    `json:"error_code" db:"error_code"`
    ErrorMsg         string    `json:"error_msg" db:"error_msg"`
}

// ProviderEvent tracks webhook events from email providers
// Primary identifier: provider_events.id
// Business rules: idempotent, signed, replay-protected
// Indexes: provider, external_event_id, type

type ProviderEvent struct {
    ID               string    `json:"id" db:"id,pk"`
    Provider         string    `json:"provider" db:"provider,notnull"`
    ExternalEventID string    `json:"external_event_id" db:"external_event_id,unique,notnull"`
    Type             string    `json:"type" db:"type,notnull"`
    PayloadJSON     string    `json:"payload_json" db:"payload_json,notnull"`
    ReceivedAt       time.Time `json:"received_at" db:"received_at,notnull"`
    ProcessedAt      *time.Time `json:"processed_at,omitempty" db:"processed_at"`
    ErrorCode        string    `json:"error_code" db:"error_code"`
    ErrorMsg         string    `json:"error_msg" db:"error_msg"`
}

// OutboxEvent represents a domain event to be processed asynchronously
// Primary identifier: outbox_events.id
// Business rules: processed once, available_at for scheduling
// Indexes: event_type, available_at, published_at

type OutboxEvent struct {
    ID           string    `json:"id" db:"id,pk"`
    EventType    string    `json:"event_type" db:"event_type,notnull"`
    Aggregate    string    `json:"aggregate" db:"aggregate,notnull"`
    PayloadJSON  string    `json:"payload_json" db:"payload_json,notnull"`
    AvailableAt  time.Time `json:"available_at" db:"available_at,notnull"`
    PublishedAt  *time.Time `json:"published_at,omitempty" db:"published_at"`
    CreatedBy    string    `json:"created_by" db:"created_by,notnull"`
    CreatedAt    time.Time `json:"created_at" db:"created_at,notnull"`
    UpdatedAt    time.Time `json:"updated_at" db:"updated_at,notnull"`
}

// AuditLog tracks all state changes for compliance and debugging
// Primary identifier: audit_logs.id
// Business rules: immutable, structured context, redacted sensitive data
// Indexes: actor_id, action, target

type AuditLog struct {
    ID          string    `json:"id" db:"id,pk"`
    ActorID     string    `json:"actor_id" db:"actor_id,notnull"`
    Action      string    `json:"action" db:"action,notnull"`
    TargetType  string    `json:"target_type" db:"target_type,notnull"`
    TargetID    string    `json:"target_id" db:"target_id,notnull"`
    MetadataJSON string   `json:"metadata_json" db:"metadata_json,notnull"`
    Timestamp   time.Time `json:"timestamp" db:"timestamp,notnull"`
    SessionID   string    `json:"session_id" db:"session_id"`
    IPAddress   string    `json:"ip_address" db:"ip_address"`
}

// Embedded types for complex fields

// SeriesBrief represents the structured input for creating a learning series
// Used in SeriesVersion.brief_json and API request/response schemas
type SeriesBrief struct {
    Topic           string   `json:"topic" db:"topic,notnull"`
    Goal            string   `json:"goal" db:"goal,notnull"`
    Level           string   `json:"level" db:"level,notnull"`
    Timezone        string   `json:"timezone" db:"timezone,notnull"`
    StartDate       string   `json:"start_date" db:"start_date,notnull"`
    Duration        string   `json:"duration" db:"duration,notnull"`
    Cadence         string   `json:"cadence" db:"cadence,notnull"`
    SendDays        string   `json:"send_days" db:"send_days,notnull"`
    SendTime        string   `json:"send_time" db:"send_time,notnull"`
    Language        string   `json:"language" db:"language,notnull"`
    CitationReq     string   `json:"citation_req" db:"citation_req,notnull"`
    Visuals         VisualPrefs `json:"visuals" db:"visuals,notnull"`
    DeliveryPrefs   DeliveryPrefs `json:"delivery_prefs" db:"delivery_prefs,notnull"`
    SourcePrefs     SourcePrefs `json:"source_prefs" db:"source_prefs,notnull"`
}

// VisualPrefs defines diagram and visual requirements
type VisualPrefs struct {
    Diagram         string   `json:"diagram" db:"diagram,notnull"`
    Chart           string   `json:"chart" db:"chart"`
    Infographic      string   `json:"infographic" db:"infographic"`
    AltText         string   `json:"alt_text" db:"alt_text,notnull"`
    BrandColors     []string `json:"brand_colors" db:"brand_colors"`
}

// DeliveryPrefs defines scheduling and delivery settings
type DeliveryPrefs struct {
    VerifyRecipient bool     `json:"verify_recipient" db:"verify_recipient,notnull"`
    ManualApproval  bool     `json:"manual_approval" db:"manual_approval,notnull"`
}

// SourcePrefs defines source collection preferences
type SourcePrefs struct {
    URL             string   `json:"url" db:"url"`
    Files           []string `json:"files" db:"files"`
    Freshness       string   `json:"freshness" db:"freshness"`
}

// IssueContent represents generated email content with structured blocks
// Used in IssueVersion.content_json
type IssueContent struct {
    Subject         string     `json:"subject" db:"subject,notnull"`
    Preheader       string     `json:"preheader" db:"preheader,notnull"`
    ContentBlocks   []ContentBlock `json:"content_blocks" db:"content_blocks,notnull"`
    VisualSpecs     []VisualSpec `json:"visual_specs" db:"visual_specs,notnull"`
    Citations       []Citation   `json:"citations" db:"citations,notnull"`
}

// ContentBlock represents a single piece of content with citations
// Used in IssueContent.content_blocks
type ContentBlock struct {
    ID            string    `json:"id" db:"id,pk"`
    Type          string    `json:"type" db:"type,notnull"`
    Title         string    `json:"title" db:"title"`
    Text          string    `json:"text" db:"text,notnull"`
    Citations     []Citation `json:"citations" db:"citations,notnull"`
}

// Citation links content to retrieved evidence
// Used in ContentBlock.citations and IssueContent.citations
type Citation struct {
    BlockID     string   `json:"block_id" db:"block_id,notnull"`
    SourceID    string   `json:"source_id" db:"source_id,notnull"`
    ChunkID     string   `json:"chunk_id" db:"chunk_id,notnull"`
    Locator     string   `json:"locator" db:"locator,notnull"`
}

// VisualSpec defines a diagram to be generated
// Used in IssueContent.visual_specs
type VisualSpec struct {
    ID            string    `json:"id" db:"id,pk"`
    Type          string    `json:"type" db:"type,notnull"` // mermaid, d2, etc.
    Content       string    `json:"content" db:"content,notnull"`
    AltText       string    `json:"alt_text" db:"alt_text,notnull"`
    Width         int       `json:"width" db:"width"`
    Height        int       `json:"height" db:"height"`
    Format        string    `json:"format" db:"format,notnull"` // svg, png
    GeneratedAt   time.Time `json:"generated_at" db:"generated_at,notnull"`
    StorageKey    string    `json:"storage_key" db:"storage_key,notnull"`
}

// === Error codes ===

const (
    // Common error codes
    ErrCodeNotFound           = "NOT_FOUND"
    ErrCodeValidationFailed   = "VALIDATION_FAILED"
    ErrCodeUnauthorized       = "UNAUTHORIZED"
    ErrCodeForbidden          = "FORBIDDEN"
    ErrCodeConflict           = "CONFLICT"
    ErrCodeRateLimit          = "RATE_LIMIT"
    ErrCodeExternalService    = "EXTERNAL_SERVICE"
    ErrCodeValidationError    = "VALIDATION_ERROR"
    ErrCodeBusinessRule       = "BUSINESS_RULE"
    ErrCodeSystemError        = "SYSTEM_ERROR"
    ErrCodeUnavailable        = "UNAVAILABLE"
)

// === State machine constants ===

// Series states
const (
    SeriesStatusDraft      = "draft"
    SeriesStatusPlanning   = "planning"
    SeriesStatusPlanned    = "planned"
    SeriesStatusActive     = "active"
    SeriesStatusPaused     = "paused"
    SeriesStatusCompleted  = "completed"
    SeriesStatusFailed     = "failed"
)

// Issue states
const (
    IssueStatusPlanned    = "planned"
    IssueStatusGenerating = "generating"
    IssueStatusReview     = "review"
    IssueStatusScheduled  = "scheduled"
    IssueStatusSending    = "sending"
    IssueStatusSent       = "sent"
    IssueStatusFailed     = "failed"
)

// Delivery states
const (
    DeliveryStatusPending    = "pending"
    DeliveryStatusSubmitted  = "submitted"
    DeliveryStatusDelivered  = "delivered"
    DeliveryStatusDeferred   = "deferred"
    DeliveryStatusBounced    = "bounced"
    DeliveryStatusComplained = "complained"
    DeliveryStatusFailed     = "failed"
)

// Source states
const (
    SourceStatusPending    = "pending"
    SourceStatusFetching   = "fetching"
    SourceStatusParsing    = "parsing"
    SourceStatusChunking   = "chunking"
    SourceStatusEmbedding  = "embedding"
    SourceStatusIndexing   = "indexing"
    SourceStatusReady      = "ready"
    SourceStatusFailed     = "failed"
)

// Generation run statuses
const (
    GenerationStatusPending   = "pending"
    GenerationStatusRunning   = "running"
    GenerationStatusCompleted = "completed"
    GenerationStatusFailed    = "failed"
)

// Schedule statuses
const (
    ScheduleStatusPending   = "pending"
    ScheduleStatusClaimed   = "claimed"
    ScheduleStatusRunning   = "running"
    ScheduleStatusCompleted = "completed"
    ScheduleStatusFailed    = "failed"
)
