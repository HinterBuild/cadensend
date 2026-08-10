// Package delivery provides email delivery functionality
package delivery

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"backend/control-worker/internal/config"
	"backend/control-worker/internal/database"
)

// EmailRequest represents an email to be sent
type EmailRequest struct {
	To          string
	From        string
	Subject     string
	HTMLContent string
	TextColor   string
}

// EmailResponse represents the result of an email send
type EmailResponse struct {
	MessageID string
	Status    string
}

// EmailProvider interface for sending emails
type EmailProvider interface {
	SendEmail(ctx context.Context, req EmailRequest) (*EmailResponse, error)
}

// SendGridProvider implements EmailProvider for SendGrid
type SendGridProvider struct {
	apiKey string
	from   string
}

// NewSendGridProvider creates a new SendGrid provider
func NewSendGridProvider(apiKey, from string) *SendGridProvider {
	return &SendGridProvider{apiKey: apiKey, from: from}
}

func (p *SendGridProvider) SendEmail(ctx context.Context, req EmailRequest) (*EmailResponse, error) {
	// In production, this would use the actual SendGrid library
	return &EmailResponse{
		MessageID: uuid.New().String(),
		Status:    "202",
	}, nil
}

// StartDeliveryWorker starts the delivery worker
func StartDeliveryWorker(cfg *config.Config) *DeliveryWorker {
	db := database.Get()
	provider := NewSendGridProvider(cfg.SendGridAPIKey, cfg.SMTPFrom)

	dw := &DeliveryWorker{
		db:       db,
		provider: provider,
	}

	log.Println("Delivery worker started")
	return dw
}

// DeliveryWorker handles email delivery
type DeliveryWorker struct {
	db       *gorm.DB
	provider EmailProvider
}

// DeliverIssue handles issue delivery
func (dw *DeliveryWorker) DeliverIssue(ctx context.Context, issueID string) error {
	log.Printf("Delivering issue: %s", issueID)

	var delivery Delivery
	if err := dw.db.WithContext(ctx).
		Where("issue_id = ? AND status = ?", issueID, "pending").
		First(&delivery).Error; err != nil {
		return fmt.Errorf("failed to find pending delivery for issue %s: %w", issueID, err)
	}

	resp, err := dw.provider.SendEmail(ctx, EmailRequest{
		To:      delivery.RecipientID,
		From:    "",
		Subject: "Your learning issue is ready",
		HTMLContent: fmt.Sprintf("Issue %s is ready for delivery", issueID),
	})
	if err != nil {
		return fmt.Errorf("failed to send email for issue %s: %w", issueID, err)
	}

	delivery.Status = "submitted"
	delivery.ExternalEventID = resp.MessageID
	delivery.UpdatedAt = time.Now()
	if err := dw.db.WithContext(ctx).Save(&delivery).Error; err != nil {
		return fmt.Errorf("failed to update delivery status for issue %s: %w", issueID, err)
	}

	return nil
}

// Delivery represents an email delivery record
type Delivery struct {
	IssueID          string `gorm:"column:issue_id"`
	RecipientID      string `gorm:"column:recipient_id"`
	Status           string `gorm:"column:status"`
	ExternalEventID  string `gorm:"column:external_event_id"`
	UpdatedAt        time.Time `gorm:"column:updated_at"`
}
