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
	ID          string `gorm:"column:id"`
	WorkspaceID string `gorm:"column:workspace_id"`
	Email       string `gorm:"column:email"`
}

func (recipientRow) TableName() string { return "recipients" }

type scheduleRow struct {
	ID          string     `gorm:"column:id"`
	IssueID     *string    `gorm:"column:issue_id"`
	Status      string     `gorm:"column:status"`
	Attempts    int        `gorm:"column:attempts"`
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
		updates := map[string]any{"updated_at": time.Now().UTC()}
		if err != nil {
			updates["status"] = "pending"
			updates["error_msg"] = err.Error()
		} else {
			updates["status"] = "completed"
			updates["completed_at"] = time.Now().UTC()
			updates["error_msg"] = ""
		}
		dw.db.WithContext(ctx).Model(&scheduleRow{}).Where("id = ?", scheduleID).Updates(updates)
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
		return fmt.Errorf("no recipients to send to")
	}

	subject, htmlBody := mail.RenderIssueHTML(series.Topic, series.Goal, content, false)
	mailCfg := mail.Config{
		APIURL:   dw.cfg.BrevoAPIURL,
		APIKey:   dw.cfg.BrevoAPIKey,
		From:     dw.cfg.SMTPFrom,
		FromName: dw.cfg.SMTPFromName,
	}

	for _, rcpt := range recipients {
		var existing deliveryRow
		already := dw.db.WithContext(ctx).
			Where("issue_id = ? AND recipient_id = ? AND status IN ?", issue.ID, rcpt.id, []string{"submitted", "delivered"}).
			First(&existing).Error == nil
		if already {
			continue
		}
		if err := mail.Send(mailCfg, mail.Message{
			To:      rcpt.email,
			Subject: subject,
			HTML:    htmlBody,
		}); err != nil {
			return fmt.Errorf("send to %s: %w", rcpt.email, err)
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
			DeliveredAt:    &now,
		}
		if err := dw.db.WithContext(ctx).Create(&row).Error; err != nil {
			log.Printf("delivery record warning: %v", err)
		}
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

func (dw *DeliveryWorker) recipientEmails(ctx context.Context, series seriesRow) ([]recipientAddr, error) {
	var listed []recipientRow
	if err := dw.db.WithContext(ctx).Where("workspace_id = ?", series.WorkspaceID).Find(&listed).Error; err != nil {
		return nil, err
	}
	out := make([]recipientAddr, 0, len(listed)+1)
	seen := map[string]bool{}
	for _, row := range listed {
		email := strings.TrimSpace(row.Email)
		if email == "" || seen[email] {
			continue
		}
		seen[email] = true
		out = append(out, recipientAddr{id: row.ID, email: email})
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
