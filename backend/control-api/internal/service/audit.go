// Package service: audit logging for destructive and security-relevant actions.
package service

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AuditAction names the recorded operation types.
const (
	AuditSeriesDeleted     = "series.deleted"
	AuditSourceDeleted     = "source.deleted"
	AuditIssueCanceled     = "issue.send_canceled"
	AuditIssueRescheduled  = "issue.rescheduled"
	AuditPasswordChanged   = "user.password_changed"
	AuditPasswordReset     = "user.password_reset"
	AuditAccountDeleted    = "user.deleted"
	AuditSessionsRevoked   = "user.sessions_revoked"
	AuditRecipientAdded    = "recipient.added"
	AuditRecipientRemoved  = "recipient.removed"
	AuditRecipientVerified = "recipient.verified"
)

// WriteAudit persists an audit entry; failures are logged but never block
// the primary operation.
func WriteAudit(db *gorm.DB, ctx context.Context, actorID, action, targetType, targetID string, metadata map[string]interface{}, ip string) {
	payload := "{}"
	if len(metadata) > 0 {
		if raw, err := json.Marshal(metadata); err == nil {
			payload = string(raw)
		}
	}
	entry := &AuditLog{
		ID:           uuid.NewString(),
		ActorID:      actorID,
		Action:       action,
		TargetType:   targetType,
		TargetID:     targetID,
		MetadataJSON: payload,
		Timestamp:    time.Now().UTC(),
		IPAddress:    ip,
	}
	if err := db.WithContext(ctx).Create(entry).Error; err != nil {
		log.Printf("audit log write failed action=%s target=%s/%s: %v", action, targetType, targetID, err)
	}
}
