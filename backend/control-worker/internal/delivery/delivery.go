// Package delivery renders issues and delivers them through the provider.
package delivery

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"backend/control-worker/internal/config"
	"backend/control-worker/internal/database"
	"backend/control-worker/internal/mail"
)

type issueRow struct {
	ID          string     `gorm:"column:id"`
	SeriesID    string     `gorm:"column:series_id"`
	Objective   string     `gorm:"column:objective"`
	Status      string     `gorm:"column:status"`
	ContentJSON *string    `gorm:"column:content_json"`
	CreatedBy   string     `gorm:"column:created_by"`
	DeletedAt   *time.Time `gorm:"column:deleted_at"`
}

func (issueRow) TableName() string { return "issues" }

type seriesRow struct {
	ID          string     `gorm:"column:id"`
	WorkspaceID string     `gorm:"column:workspace_id"`
	Topic       string     `gorm:"column:topic"`
	Goal        string     `gorm:"column:goal"`
	Status      string     `gorm:"column:status"`
	CreatedBy   string     `gorm:"column:created_by"`
	DeletedAt   *time.Time `gorm:"column:deleted_at"`
}

func (seriesRow) TableName() string { return "series" }

type userRow struct {
	ID    string `gorm:"column:id"`
	Email string `gorm:"column:email"`
}

func (userRow) TableName() string { return "users" }

type recipientRow struct {
	ID                string `gorm:"column:id"`
	WorkspaceID       string `gorm:"column:workspace_id"`
	Email             string `gorm:"column:email"`
	Verified          bool   `gorm:"column:verified"`
	Suppressed        bool   `gorm:"column:suppressed"`
	SuppressionReason string `gorm:"column:suppression_reason"`
}

func (recipientRow) TableName() string { return "recipients" }

type scheduleRow struct {
	ID          string     `gorm:"column:id"`
	IssueID     *string    `gorm:"column:issue_id"`
	Status      string     `gorm:"column:status"`
	Attempts    int        `gorm:"column:attempts"`
	MaxAttempts int        `gorm:"column:max_attempts"`
	ErrorMsg    string     `gorm:"column:error_msg"`
	StartedAt   *time.Time `gorm:"column:started_at"`
	CompletedAt *time.Time `gorm:"column:completed_at"`
	UpdatedAt   time.Time  `gorm:"column:updated_at"`
}

func (scheduleRow) TableName() string { return "schedules" }

type deliveryRow struct {
	ID              string     `gorm:"column:id"`
	IssueID         string     `gorm:"column:issue_id"`
	RecipientID     string     `gorm:"column:recipient_id"`
	ProviderID      string     `gorm:"column:provider_id"`
	Status          string     `gorm:"column:status"`
	IdempotencyKey  string     `gorm:"column:idempotency_key"`
	ExternalEventID string     `gorm:"column:external_event_id"`
	CreatedBy       string     `gorm:"column:created_by"`
	CreatedAt       time.Time  `gorm:"column:created_at"`
	UpdatedAt       time.Time  `gorm:"column:updated_at"`
	DeliveredAt     *time.Time `gorm:"column:delivered_at"`
	ErrorMsg        string     `gorm:"column:error_msg"`
}

func (deliveryRow) TableName() string { return "deliveries" }

type sourceRow struct {
	ID   string `gorm:"column:id"`
	URL  string `gorm:"column:url"`
	Type string `gorm:"column:type"`
}

func (sourceRow) TableName() string { return "sources" }

type DeliveryWorker struct {
	db  *gorm.DB
	cfg *config.Config
}

// NewDeliveryWorker wires a delivery worker to the shared database.
func NewDeliveryWorker(cfg *config.Config) *DeliveryWorker {
	return &DeliveryWorker{db: database.Get(), cfg: cfg}
}

// Schedule state machine (owned by the schedules table, not by Asynq):
//
//	pending --scheduler--> claimed --here--> running --> completed
//	                          |                  \--> pending (retry, run_at pushed out)
//	                          |                   \-> failed  (attempts exhausted)
//	                          \--> pending (deferred) | canceled | failed
//
// Every transition below is conditional on the expected current status.
// That makes a stale or duplicate task (an Asynq redelivery, a watchdog
// reclaim racing a slow send, or a user cancel) a no-op instead of a second
// send or an overwritten cancel.

// deliveryAction is what preflight decided to do with a claimed schedule.
type deliveryAction int

const (
	actionSend deliveryAction = iota
	actionDefer
	actionCancel
	actionFail
)

type deliveryDecision struct {
	action deliveryAction
	reason string
	delay  time.Duration
}

// pausedRecheckDelay is how often a paused series' due sends are re-checked.
// Resuming the series sends them within this window.
const pausedRecheckDelay = 15 * time.Minute

// generationRecheckDelay is how often a send waits on in-flight generation.
const generationRecheckDelay = time.Minute

// decideDelivery is the pure part of preflight: given the issue and series
// rows, should this schedule send now, wait, or stop?
func decideDelivery(issue *issueRow, series *seriesRow) deliveryDecision {
	if issue == nil || issue.DeletedAt != nil {
		return deliveryDecision{action: actionCancel, reason: "issue was deleted"}
	}
	if series == nil || series.DeletedAt != nil {
		return deliveryDecision{action: actionCancel, reason: "series was deleted"}
	}
	if series.Status == "paused" {
		return deliveryDecision{action: actionDefer, reason: "series is paused", delay: pausedRecheckDelay}
	}
	if len(parseJSONMap(issue.ContentJSON)) > 0 {
		return deliveryDecision{action: actionSend}
	}
	switch issue.Status {
	case "generating":
		return deliveryDecision{action: actionDefer, reason: "waiting for issue generation", delay: generationRecheckDelay}
	case "failed":
		return deliveryDecision{action: actionFail, reason: "issue generation failed; regenerate content before sending"}
	default:
		return deliveryDecision{action: actionFail, reason: "issue has no generated content"}
	}
}

// retryDelay is exponential backoff for failed sends: 1m, 2m, 4m, ... capped
// at 1h, so a short provider outage doesn't burn every attempt in seconds.
func retryDelay(attempts int) time.Duration {
	if attempts < 1 {
		attempts = 1
	}
	if attempts > 7 {
		return time.Hour
	}
	return time.Duration(1<<(attempts-1)) * time.Minute
}

// transition moves a schedule from `from` to the given updates and reports
// whether this caller won the transition.
func (dw *DeliveryWorker) transition(ctx context.Context, scheduleID, from string, updates map[string]any) bool {
	updates["updated_at"] = time.Now().UTC()
	res := dw.db.WithContext(ctx).Model(&scheduleRow{}).
		Where("id = ? AND status = ?", scheduleID, from).
		Updates(updates)
	if res.Error != nil {
		log.Printf("schedule %s transition from %s failed: %v", scheduleID, from, res.Error)
		return false
	}
	return res.RowsAffected == 1
}

// DeliverScheduled runs one claimed delivery schedule. It never returns an
// error for conditions the schedule row already records: retries are driven
// by the schedules table (run_at + attempts), not by Asynq, so a returned
// error would only cause a duplicate run.
func (dw *DeliveryWorker) DeliverScheduled(ctx context.Context, issueID, scheduleID string) error {
	var issue issueRow
	var series seriesRow
	issuePtr, seriesPtr := &issue, &series
	if err := dw.db.WithContext(ctx).Where("id = ?", issueID).First(&issue).Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			// Transient DB error: leave the schedule claimed; the watchdog
			// returns it to pending, so this is retried rather than canceled.
			log.Printf("schedule %s: loading issue failed: %v", scheduleID, err)
			return nil
		}
		issuePtr = nil
	} else if err := dw.db.WithContext(ctx).Where("id = ?", issue.SeriesID).First(&series).Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			log.Printf("schedule %s: loading series failed: %v", scheduleID, err)
			return nil
		}
		seriesPtr = nil
	}

	decision := decideDelivery(issuePtr, seriesPtr)
	now := time.Now().UTC()
	switch decision.action {
	case actionDefer:
		dw.transition(ctx, scheduleID, "claimed", map[string]any{
			"status":     "pending",
			"claimed_at": nil,
			"run_at":     now.Add(decision.delay),
			"error_msg":  decision.reason,
		})
		return nil
	case actionCancel:
		dw.transition(ctx, scheduleID, "claimed", map[string]any{
			"status":    "canceled",
			"error_msg": decision.reason,
		})
		return nil
	case actionFail:
		if dw.transition(ctx, scheduleID, "claimed", map[string]any{
			"status":    "failed",
			"error_msg": truncate(decision.reason, 500),
		}) {
			dw.alertOwnerOfFailure(ctx, issueID, &scheduleRow{Attempts: 1, MaxAttempts: 1}, fmt.Errorf("%s", decision.reason))
		}
		return nil
	}

	if !dw.transition(ctx, scheduleID, "claimed", map[string]any{
		"status":     "running",
		"started_at": now,
		"attempts":   gorm.Expr("attempts + 1"),
	}) {
		return nil
	}

	sendErr := dw.deliverIssue(ctx, &issue, &series)

	var schedule scheduleRow
	if err := dw.db.WithContext(ctx).Where("id = ?", scheduleID).First(&schedule).Error; err != nil {
		log.Printf("schedule %s could not be reloaded after send: %v", scheduleID, err)
		return nil
	}
	switch {
	case sendErr == nil:
		dw.transition(ctx, scheduleID, "running", map[string]any{
			"status":       "completed",
			"completed_at": time.Now().UTC(),
			"error_msg":    "",
		})
	case schedule.Attempts >= schedule.MaxAttempts:
		if dw.transition(ctx, scheduleID, "running", map[string]any{
			"status":    "failed",
			"error_msg": truncate(sendErr.Error(), 500),
		}) {
			dw.alertOwnerOfFailure(ctx, issueID, &schedule, sendErr)
		}
	default:
		dw.transition(ctx, scheduleID, "running", map[string]any{
			"status":     "pending",
			"claimed_at": nil,
			"run_at":     time.Now().UTC().Add(retryDelay(schedule.Attempts)),
			"error_msg":  truncate(sendErr.Error(), 500),
		})
	}
	return nil
}

// deliverIssue sends a content-ready issue to every deliverable recipient.
// Recipients that already have a submitted/delivered row are skipped, which
// is what makes a retry after a partial failure safe.
func (dw *DeliveryWorker) deliverIssue(ctx context.Context, issue *issueRow, series *seriesRow) error {
	content := parseJSONMap(issue.ContentJSON)
	recipients, err := dw.recipientEmails(ctx, *series)
	if err != nil {
		return err
	}
	if len(recipients) == 0 {
		return fmt.Errorf("no verified recipients to send to; add readers on the Recipients page")
	}

	sourceRefs := dw.sourceRefsForContent(ctx, series.WorkspaceID, content)

	mailCfg := mail.Config{
		APIURL:   dw.cfg.BrevoAPIURL,
		APIKey:   dw.cfg.BrevoAPIKey,
		From:     dw.cfg.SMTPFrom,
		FromName: dw.cfg.SMTPFromName,
	}

	subject, _ := mail.RenderIssueHTML(series.Topic, series.Goal, content, false, sourceRefs)

	// One failing address must not block the rest of the audience.
	var firstErr error
	for _, rcpt := range recipients {
		var existing deliveryRow
		already := dw.db.WithContext(ctx).
			Where("issue_id = ? AND recipient_id = ? AND status IN ?", issue.ID, rcpt.id, []string{"submitted", "delivered"}).
			First(&existing).Error == nil
		if already {
			continue
		}
		// Render per recipient so the unsubscribe footer is personal.
		_, htmlBody := mail.RenderIssueHTML(
			series.Topic, series.Goal, content, false,
			sourceRefs,
			unsubscribeURLFor(dw.cfg, series.WorkspaceID, rcpt.email),
		)
		sendErr := mail.Send(mailCfg, mail.Message{
			To:      rcpt.email,
			Subject: subject,
			HTML:    htmlBody,
		})
		dw.recordDelivery(ctx, issue, rcpt, sendErr)
		if sendErr != nil {
			log.Printf("delivery to %s failed: %v", rcpt.email, sendErr)
			if firstErr == nil {
				firstErr = fmt.Errorf("send to %s: %w", rcpt.email, sendErr)
			}
		}
	}

	if firstErr != nil {
		return firstErr
	}

	return dw.db.WithContext(ctx).Model(&issueRow{}).Where("id = ?", issue.ID).Updates(map[string]any{
		"status":     "sent",
		"updated_at": time.Now().UTC(),
	}).Error
}

// recordDelivery upserts the (issue, recipient) delivery row. It must be an
// upsert: a recipient that failed on one attempt and succeeds on a retry
// would otherwise hit the unique (issue_id, recipient_id) index, leave the
// row "failed", and get emailed again on every later retry.
func (dw *DeliveryWorker) recordDelivery(ctx context.Context, issue *issueRow, rcpt recipientAddr, sendErr error) {
	now := time.Now().UTC()
	row := deliveryRow{
		ID:             uuid.NewString(),
		IssueID:        issue.ID,
		RecipientID:    rcpt.id,
		ProviderID:     dw.cfg.EmailProvider,
		Status:         "submitted",
		IdempotencyKey: fmt.Sprintf("%s:%s", issue.ID, rcpt.id),
		CreatedBy:      issue.CreatedBy,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if sendErr != nil {
		row.Status = "failed"
		row.ErrorMsg = truncate(sendErr.Error(), 500)
	}
	err := dw.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "issue_id"}, {Name: "recipient_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"status", "error_msg", "provider_id", "updated_at"}),
	}).Create(&row).Error
	if err != nil {
		log.Printf("delivery record warning: %v", err)
	}
}

type recipientAddr struct {
	id    string
	email string
}

// recipientEmails returns deliverable addresses for the workspace: verified,
// unsuppressed recipients. It falls back to the series creator so a fresh
// workspace still receives its own test-driven sends.
func (dw *DeliveryWorker) recipientEmails(ctx context.Context, series seriesRow) ([]recipientAddr, error) {
	var listed []recipientRow
	if err := dw.db.WithContext(ctx).Where("workspace_id = ?", series.WorkspaceID).Find(&listed).Error; err != nil {
		return nil, err
	}
	out := make([]recipientAddr, 0, len(listed)+1)
	seen := map[string]bool{}
	skipped := []string{}
	for _, row := range listed {
		email := strings.TrimSpace(row.Email)
		if email == "" || seen[email] {
			continue
		}
		if row.Suppressed {
			skipped = append(skipped, email+" ("+firstNonEmpty(row.SuppressionReason, "suppressed")+")")
			continue
		}
		if !row.Verified {
			skipped = append(skipped, email+" (unverified)")
			continue
		}
		seen[email] = true
		out = append(out, recipientAddr{id: row.ID, email: email})
	}
	if len(skipped) > 0 {
		log.Printf("skipping %d recipient(s) for workspace %s: %s",
			len(skipped), series.WorkspaceID, strings.Join(skipped, ", "))
	}
	if len(out) > 0 {
		return out, nil
	}

	var creator userRow
	if err := dw.db.WithContext(ctx).Where("id = ?", series.CreatedBy).First(&creator).Error; err != nil {
		return nil, fmt.Errorf("could not resolve series owner email")
	}
	email := strings.TrimSpace(creator.Email)
	if email == "" {
		return nil, fmt.Errorf("series owner has no email")
	}
	return []recipientAddr{{id: creator.ID, email: email}}, nil
}

// alertOwnerOfFailure emails the series owner once retries are exhausted.
func (dw *DeliveryWorker) alertOwnerOfFailure(ctx context.Context, issueID string, schedule *scheduleRow, cause error) {
	var series seriesRow
	var issue issueRow
	if err := dw.db.WithContext(ctx).Where("id = ?", issueID).First(&issue).Error; err != nil {
		return
	}
	if err := dw.db.WithContext(ctx).Where("id = ?", issue.SeriesID).First(&series).Error; err != nil {
		return
	}
	var owner userRow
	if err := dw.db.WithContext(ctx).Where("id = ? AND deleted_at IS NULL", series.CreatedBy).First(&owner).Error; err != nil {
		return
	}

	title := "Delivery failed: " + firstNonEmpty(issue.Objective, series.Topic)
	body := fmt.Sprintf(
		"“%s” in “%s” could not be delivered (attempt %d of %d). Last error: %s. The send is marked failed. Open the series to reschedule it.",
		firstNonEmpty(issue.Objective, "Untitled issue"), series.Topic, schedule.Attempts, schedule.MaxAttempts, truncate(cause.Error(), 300),
	)
	_, html := mail.RenderNotificationHTML(title, body, "Open the series", dw.cfg.FrontendOrigin+"/series/"+series.ID)
	cfg := mail.Config{
		APIURL:   dw.cfg.BrevoAPIURL,
		APIKey:   dw.cfg.BrevoAPIKey,
		From:     dw.cfg.SMTPFrom,
		FromName: dw.cfg.SMTPFromName,
	}
	if err := mail.Send(cfg, mail.Message{To: owner.Email, Subject: "[Cadensend] " + title, HTML: html}); err != nil {
		log.Printf("failure alert to %s could not be sent: %v", owner.Email, err)
	} else {
		log.Printf("failure alert sent to %s for issue %s", owner.Email, issueID)
	}
}

// sourceRefsForContent resolves citation source_ids into labels/links.
func (dw *DeliveryWorker) sourceRefsForContent(ctx context.Context, workspaceID string, content map[string]any) map[string]mail.SourceRef {
	ids := map[string]bool{}
	rawBlocks, _ := content["content_blocks"].([]any)
	for _, rawBlock := range rawBlocks {
		block, ok := rawBlock.(map[string]any)
		if !ok {
			continue
		}
		citations, ok := block["citations"].([]any)
		if !ok {
			continue
		}
		for _, rawCit := range citations {
			cit, ok := rawCit.(map[string]any)
			if !ok {
				continue
			}
			if id, _ := cit["source_id"].(string); id != "" {
				ids[id] = true
			}
		}
	}
	if len(ids) == 0 {
		return nil
	}

	refs := map[string]mail.SourceRef{}
	for id := range ids {
		var src sourceRow
		if err := dw.db.WithContext(ctx).
			Where("id = ? AND workspace_id = ? AND deleted_at IS NULL", id, workspaceID).
			First(&src).Error; err != nil {
			continue
		}
		label := src.URL
		if label == "" || strings.HasPrefix(src.Type, "file") {
			label = "Uploaded " + src.Type + " source"
		}
		refs[id] = mail.SourceRef{Label: label, URL: src.URL}
	}
	return refs
}

func parseJSONMap(raw *string) map[string]any {
	if raw == nil || strings.TrimSpace(*raw) == "" || *raw == "null" {
		return map[string]any{}
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(*raw), &out); err != nil {
		return map[string]any{}
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}
