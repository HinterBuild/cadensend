// Package delivery renders issues and delivers them through the provider.
package delivery

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"backend/control-worker/internal/config"
	"backend/control-worker/internal/database"
	"backend/control-worker/internal/mail"
)

type issueRow struct {
	ID          string  `gorm:"column:id"`
	SeriesID    string  `gorm:"column:series_id"`
	Objective   string  `gorm:"column:objective"`
	Status      string  `gorm:"column:status"`
	ContentJSON *string `gorm:"column:content_json"`
	CreatedBy   string  `gorm:"column:created_by"`
}

func (issueRow) TableName() string { return "issues" }

type seriesRow struct {
	ID          string `gorm:"column:id"`
	WorkspaceID string `gorm:"column:workspace_id"`
	Topic       string `gorm:"column:topic"`
	Goal        string `gorm:"column:goal"`
	CreatedBy   string `gorm:"column:created_by"`
}

func (seriesRow) TableName() string { return "series" }

type userRow struct {
	ID    string `gorm:"column:id"`
	Email string `gorm:"column:email"`
}

func (userRow) TableName() string { return "users" }

type recipientRow struct {
	ID                string     `gorm:"column:id"`
	WorkspaceID       string     `gorm:"column:workspace_id"`
	Email             string     `gorm:"column:email"`
	Verified          bool       `gorm:"column:verified"`
	Suppressed        bool       `gorm:"column:suppressed"`
	SuppressionReason string     `gorm:"column:suppression_reason"`
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
	ID  string `gorm:"column:id"`
	URL string `gorm:"column:url"`
	Type string `gorm:"column:type"`
}

func (sourceRow) TableName() string { return "sources" }

type DeliveryWorker struct {
	db  *gorm.DB
	cfg *config.Config
}

func StartDeliveryWorker(cfg *config.Config) *DeliveryWorker {
	dw := &DeliveryWorker{db: database.Get(), cfg: cfg}
	log.Println("Delivery worker started")
	return dw
}

func (dw *DeliveryWorker) DeliverScheduled(ctx context.Context, issueID, scheduleID string) error {
	now := time.Now().UTC()
	if scheduleID != "" {
		dw.db.WithContext(ctx).Model(&scheduleRow{}).Where("id = ?", scheduleID).Updates(map[string]any{
			"status":     "running",
			"started_at": now,
			"attempts":   gorm.Expr("attempts + 1"),
			"updated_at": now,
		})
	}

	err := dw.deliverIssue(ctx, issueID)

	if scheduleID != "" {
		var schedule scheduleRow
		if loadErr := dw.db.WithContext(ctx).Where("id = ?", scheduleID).First(&schedule).Error; loadErr == nil {
			attemptsExhausted := err != nil && schedule.Attempts >= schedule.MaxAttempts
			updates := map[string]any{"updated_at": time.Now().UTC()}
			switch {
			case err == nil:
				updates["status"] = "completed"
				updates["completed_at"] = time.Now().UTC()
				updates["error_msg"] = ""
			case attemptsExhausted:
				updates["status"] = "failed"
				updates["error_msg"] = truncate(err.Error(), 500)
				dw.alertOwnerOfFailure(ctx, issueID, &schedule, err)
			default:
				updates["status"] = "pending"
				updates["error_msg"] = truncate(err.Error(), 500)
			}
			dw.db.WithContext(ctx).Model(&scheduleRow{}).Where("id = ?", scheduleID).Updates(updates)
		}
	}
	return err
}

func (dw *DeliveryWorker) deliverIssue(ctx context.Context, issueID string) error {
	var issue issueRow
	if err := dw.db.WithContext(ctx).Where("id = ?", issueID).First(&issue).Error; err != nil {
		return fmt.Errorf("issue not found: %w", err)
	}
	content := parseJSONMap(issue.ContentJSON)
	if len(content) == 0 {
		return fmt.Errorf("issue has no generated content")
	}

	var series seriesRow
	if err := dw.db.WithContext(ctx).Where("id = ?", issue.SeriesID).First(&series).Error; err != nil {
		return fmt.Errorf("series not found: %w", err)
	}

	recipients, err := dw.recipientEmails(ctx, series)
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
		if err := mail.Send(mailCfg, mail.Message{
			To:      rcpt.email,
			Subject: subject,
			HTML:    htmlBody,
		}); err != nil {
			log.Printf("delivery to %s failed: %v", rcpt.email, err)
			now := time.Now().UTC()
			row := deliveryRow{
				ID:             uuid.NewString(),
				IssueID:        issue.ID,
				RecipientID:    rcpt.id,
				ProviderID:     dw.cfg.EmailProvider,
				Status:         "failed",
				IdempotencyKey: fmt.Sprintf("%s:%s", issue.ID, rcpt.id),
				CreatedBy:      issue.CreatedBy,
				CreatedAt:      now,
				UpdatedAt:      now,
				ErrorMsg:       truncate(err.Error(), 500),
			}
			if dbErr := dw.db.WithContext(ctx).Create(&row).Error; dbErr != nil {
				log.Printf("delivery record warning: %v", dbErr)
			}
			if firstErr == nil {
				firstErr = fmt.Errorf("send to %s: %w", rcpt.email, err)
			}
			continue
		}
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
		if err := dw.db.WithContext(ctx).Create(&row).Error; err != nil {
			log.Printf("delivery record warning: %v", err)
		}
	}

	if firstErr != nil && len(recipients) > 0 {
		return firstErr
	}

	return dw.db.WithContext(ctx).Model(&issueRow{}).Where("id = ?", issue.ID).Updates(map[string]any{
		"status":     "sent",
		"updated_at": time.Now().UTC(),
	}).Error
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
		"Issue #%s of “%s” could not be delivered after %d attempts. Last error: %s. The send is marked failed — open the series to reschedule it.",
		firstNonEmpty(issue.Objective, "n/a"), series.Topic, schedule.Attempts, truncate(cause.Error(), 300),
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
