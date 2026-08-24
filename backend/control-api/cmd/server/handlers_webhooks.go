// Package main - email provider webhook ingestion.
//
// Processes delivery lifecycle events from the transactional email provider,
// updates delivery records, and suppresses recipients on terminal failures.
// Every call must carry the shared webhook secret (header or ?secret=).
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"

	"backend/control-api/internal/service"
)

// providerEventStatus maps provider event names onto delivery statuses.
var providerEventStatus = map[string]string{
	"delivered":    "delivered",
	"opened":       "delivered",
	"click":        "delivered",
	"hard_bounce":  "failed",
	"soft_bounce":  "submitted",
	"blocked":      "failed",
	"invalid":      "failed",
	"spam":         "failed",
	"unsubscribed": "failed",
}

// suppressEvents are terminal events that must stop future sends.
var suppressEvents = map[string]string{
	"hard_bounce":  "bounced",
	"spam":         "spam_complaint",
	"blocked":      "blocked",
	"invalid":      "invalid_address",
	"unsubscribed": "unsubscribed",
}

func emailWebhookHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := authorizeWebhook(c); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		payload, err := c.GetRawData()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
			return
		}

		var body struct {
			Event     string `json:"event"`
			Type      string `json:"type"`
			Email     string `json:"email"`
			MessageID string `json:"message-id"`
			EventID   string `json:"event_id"`
			IssueID   string `json:"issue_id"`
			Timestamp int64  `json:"timestamp"`
		}
		if err := json.Unmarshal(payload, &body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "payload must be JSON"})
			return
		}

		eventType := strings.ToLower(strings.TrimSpace(firstNonEmpty(body.Event, body.Type)))
		email := strings.ToLower(strings.TrimSpace(body.Email))
		if eventType == "" || email == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "event and email are required"})
			return
		}

		externalID := strings.TrimSpace(firstNonEmpty(body.EventID, body.MessageID))
		if externalID == "" {
			sum := sha256.Sum256(payload)
			externalID = hex.EncodeToString(sum[:])
		}

		// Idempotency: unique index on external_event_id drops replays.
		event := providerEvent{
			ID:              uuid.NewString(),
			Provider:        c.Param("provider"),
			ExternalEventID: externalID,
			Type:            eventType,
			PayloadJSON:     json.RawMessage(payload),
			ReceivedAt:      time.Now().UTC(),
		}
		insert := db.Create(&event)
		if insert.Error != nil {
			if isUniqueViolation(insert.Error) {
				c.JSON(http.StatusOK, gin.H{"message": "duplicate event ignored"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": insert.Error.Error()})
			return
		}

		processErr := applyProviderEvent(db, eventType, email, body.IssueID)
		now := time.Now().UTC()
		updates := map[string]interface{}{"processed_at": now}
		if processErr != nil {
			updates["error_code"] = "processing_failed"
			updates["error_msg"] = truncate(processErr.Error(), 500)
		}
		db.Model(&providerEvent{}).Where("id = ?", event.ID).Updates(updates)

		if processErr != nil {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": processErr.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "event processed"})
	}
}

// providerEvent mirrors the provider_events table.
type providerEvent struct {
	ID              string          `gorm:"column:id"`
	Provider        string          `gorm:"column:provider"`
	ExternalEventID string          `gorm:"column:external_event_id"`
	Type            string          `gorm:"column:type"`
	PayloadJSON     json.RawMessage `gorm:"column:payload_json"`
	ReceivedAt      time.Time       `gorm:"column:received_at"`
	ProcessedAt     *time.Time      `gorm:"column:processed_at"`
	ErrorCode       string          `gorm:"column:error_code"`
	ErrorMsg        string          `gorm:"column:error_msg"`
}

func (providerEvent) TableName() string { return "provider_events" }

// applyProviderEvent updates delivery state and suppression for one event.
func applyProviderEvent(db *gorm.DB, eventType, email, issueHint string) error {
	deliveryStatus, known := providerEventStatus[eventType]
	if !known {
		return nil // informational event types are recorded but need no state change
	}

	var rcpt service.Recipient
	if err := db.Where("email = ?", email).First(&rcpt).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil // unknown address: nothing to update
		}
		return err
	}

	query := db.Model(&service.Delivery{}).
		Where("recipient_id = ?", rcpt.ID).
		Where("status IN ?", []string{"submitted", "pending"})
	if issueHint != "" {
		query = query.Where("issue_id = ?", issueHint)
	}

	updates := map[string]interface{}{"updated_at": time.Now().UTC()}
	switch deliveryStatus {
	case "delivered":
		updates["status"] = "delivered"
		updates["delivered_at"] = time.Now().UTC()
	case "failed":
		updates["status"] = "failed"
		updates["error_code"] = eventType
	case "submitted":
		// Soft bounce: leave as-is, provider may retry.
		return nil
	}
	if err := query.Updates(updates).Error; err != nil {
		return err
	}

	if reason, suppress := suppressEvents[eventType]; suppress {
		if err := db.Model(&service.Recipient{}).Where("id = ?", rcpt.ID).
			Updates(map[string]interface{}{
				"suppressed":         true,
				"suppression_reason": reason,
			}).Error; err != nil {
			return err
		}
	}
	return nil
}

// authorizeWebhook enforces the shared secret on every webhook call.
func authorizeWebhook(c *gin.Context) error {
	secret := strings.TrimSpace(cfg.WebhookSecret)
	if secret == "" {
		if cfg.Env == "production" {
			return errWebhookSecretRequired
		}
		// Non-production convenience only.
		return nil
	}
	provided := strings.TrimSpace(c.GetHeader("X-Webhook-Secret"))
	if provided == "" {
		provided = strings.TrimSpace(c.Query("secret"))
	}
	if !constantTimeEqual(provided, secret) {
		return errWebhookUnauthorized
	}
	return nil
}

type webhookError string

func (e webhookError) Error() string { return string(e) }

const (
	errWebhookSecretRequired webhookError = "webhook secret is not configured"
	errWebhookUnauthorized   webhookError = "invalid webhook secret"
)

func constantTimeEqual(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	var v byte
	for i := 0; i < len(a); i++ {
		v |= a[i] ^ b[i]
	}
	return v == 0
}

// isUniqueViolation reports whether err is a Postgres unique-constraint
// failure (SQLSTATE 23505).
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return strings.Contains(err.Error(), "duplicate key value")
}

func truncate(s string, max int) string {
	if len(s) <= max {
 		return s
 	}
 	return s[:max-3] + "..."
}

