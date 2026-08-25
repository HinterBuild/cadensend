// Package main - issue versioning, rescheduling, and send cancellation.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	appmail "backend/control-api/internal/mail"
	"backend/control-api/internal/service"
)

// issueVersionRow mirrors the issue_versions table.
type issueVersionRow struct {
	ID        string          `gorm:"column:id"`
	IssueID   string          `gorm:"column:issue_id"`
	Version   int             `gorm:"column:version"`
	Subject   string          `gorm:"column:subject"`
	Preheader string          `gorm:"column:preheader"`
	Content   json.RawMessage `gorm:"column:content_json"`
	Checksum  string          `gorm:"column:checksum"`
	CreatedBy string          `gorm:"column:created_by"`
	CreatedAt time.Time       `gorm:"column:created_at"`
}

func (issueVersionRow) TableName() string { return "issue_versions" }

const checksumPrefix = "sha256:"

// shortChecksum returns the first 16 hex chars of the SHA-256.
func shortChecksum(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])[:16]
}

// minAutosaveSnapshotGap bounds how often background autosaves may add
// history rows; deliberate saves/generations always snapshot immediately.
const minAutosaveSnapshotGap = 10 * time.Minute

// shouldSnapshot decides whether the current content deserves a new version
// row: identical content never snapshots twice, and background autosaves are
// additionally rate-limited so active typing does not flood history.
func shouldSnapshot(db *gorm.DB, issueID string, encoded []byte, autosave bool) bool {
	checksum := checksumPrefix + shortChecksum(encoded)

	var latest issueVersionRow
	err := db.Where("issue_id = ?", issueID).Order("version DESC").First(&latest).Error
	if err != nil {
		return true // first version
	}
	if latest.Checksum == checksum {
		return false // nothing changed since the last snapshot
	}
	if autosave && time.Since(latest.CreatedAt) < minAutosaveSnapshotGap {
		return false // mid-edit churn; the next deliberate save captures it
	}
	return true
}

// snapshotIssueVersion persists the current issue content as a numbered
// version row so editors can diff and restore earlier drafts. Identical
// content never snapshots twice; autosave=true additionally rate-limits
// snapshots so background saves don't flood history.
func snapshotIssueVersion(db *gorm.DB, issue *service.Issue, createdBy string, autosave bool) error {
	content := parseJSONMap(issue.ContentJSON)
	if len(content) == 0 {
		return nil
	}

	encoded, err := json.Marshal(content)
	if err != nil {
		return err
	}
	if !shouldSnapshot(db, issue.ID, encoded, autosave) {
		return nil
	}

	subject, _ := content["subject"].(string)
	preheader, _ := content["preheader"].(string)

	var maxVersion int
	db.Model(&issueVersionRow{}).Where("issue_id = ?", issue.ID).
		Select("COALESCE(MAX(version), 0)").Scan(&maxVersion)

	row := issueVersionRow{
		ID:        uuid.NewString(),
		IssueID:   issue.ID,
		Version:   maxVersion + 1,
		Subject:   subject,
		Preheader: preheader,
		Content:   json.RawMessage(encoded),
		Checksum:  checksumPrefix + shortChecksum(encoded),
		CreatedBy: createdBy,
		CreatedAt: time.Now().UTC(),
	}
	return db.Create(&row).Error
}

// listIssueVersionsHandler returns the saved versions of an issue, newest first.
func listIssueVersionsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		if _, _, ok := loadWorkspaceIssue(db, c, id); !ok {
			return
		}
		var rows []issueVersionRow
		if err := db.Where("issue_id = ?", id).
			Order("version DESC").Limit(50).Find(&rows).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		type versionItem struct {
			Version   int    `json:"version"`
			Subject   string `json:"subject"`
			Preheader string `json:"preheader"`
			Checksum  string `json:"checksum,omitempty"`
			CreatedBy string `json:"created_by"`
			CreatedAt string `json:"created_at"`
		}
		out := make([]versionItem, 0, len(rows))
		for _, r := range rows {
			out = append(out, versionItem{
				Version:   r.Version,
				Subject:   r.Subject,
				Preheader: r.Preheader,
				Checksum:  r.Checksum,
				CreatedBy: r.CreatedBy,
				CreatedAt: r.CreatedAt.UTC().Format(time.RFC3339),
			})
		}
		c.JSON(http.StatusOK, gin.H{"data": out})
	}
}

// getIssueVersionHandler returns one full version payload.
func restoreIssueVersionHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		version, err := strconv.Atoi(c.Param("version"))
		if err != nil || version < 1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid version"})
			return
		}

		loaded, _, ok := loadWorkspaceIssue(db, c, id)
		if !ok {
			return
		}
		if loaded.Locked || loaded.Status == "sent" {
			c.JSON(http.StatusConflict, gin.H{"error": "issue is locked or already sent"})
			return
		}

		var row issueVersionRow
		if err := db.Where("issue_id = ? AND version = ?", id, version).
			First(&row).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "version not found"})
			return
		}

		// Preserve whatever is live right now before overwriting it.
		if err := snapshotIssueVersion(db, loaded, c.GetString("user_id"), false); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		now := time.Now().UTC()
		if err := db.Model(loaded).Updates(map[string]interface{}{
			"content_json": row.Content,
			"updated_at":   now,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		var fresh service.Issue
		if err := db.Where("id = ?", id).First(&fresh).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": fresh, "message": fmt.Sprintf("restored version %d", version)})
	}
}

// rescheduleIssueHandler moves a pending delivery to a new time.
func rescheduleIssueHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var req struct {
			ScheduledAt string `json:"scheduled_at" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "scheduled_at is required"})
			return
		}

		loaded, series, ok := loadWorkspaceIssue(db, c, id)
		if !ok {
			return
		}
		if loaded.Status == "sent" {
			c.JSON(http.StatusConflict, gin.H{"error": "issue was already sent"})
			return
		}

		parsed, err := parseScheduledAt(req.ScheduledAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "scheduled_at must be a valid date or datetime"})
			return
		}
		if parsed.Before(time.Now().UTC()) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "send time must be in the future"})
			return
		}

		now := time.Now().UTC()
		if err := db.Model(loaded).Updates(map[string]interface{}{
			"scheduled_at": parsed,
			"updated_at":   now,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Keep the pending schedule (if any) aligned; approve flow recreates
		// one when missing.
		if err := upsertDeliverySchedule(db, loaded, c.GetString("user_id")); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		service.WriteAudit(db, c.Request.Context(), c.GetString("user_id"),
			service.AuditIssueRescheduled, "issue", id,
			map[string]interface{}{"series_id": series.ID, "run_at": parsed.Format(time.RFC3339)}, c.ClientIP())

		c.JSON(http.StatusOK, gin.H{"message": "issue rescheduled", "scheduled_at": parsed.Format(time.RFC3339)})
	}
}

// cancelIssueSendHandler stops a scheduled send and returns the issue to
// its pre-approval state.
func cancelIssueSendHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		loaded, series, ok := loadWorkspaceIssue(db, c, id)
		if !ok {
			return
		}
		if loaded.Status == "sent" {
			c.JSON(http.StatusConflict, gin.H{"error": "issue was already sent"})
			return
		}

		result := db.Model(&service.Schedule{}).
			Where("issue_id = ? AND job_type = ? AND status IN ?", id, "delivery", []string{"pending", "claimed"}).
			Update("status", "canceled")
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}

		now := time.Now().UTC()
		newStatus := "ready"
		if len(parseJSONMap(loaded.ContentJSON)) == 0 {
			newStatus = "failed"
		}
		if err := db.Model(loaded).Updates(map[string]interface{}{
			"status":     newStatus,
			"updated_at": now,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		service.WriteAudit(db, c.Request.Context(), c.GetString("user_id"),
			service.AuditIssueCanceled, "issue", id,
			map[string]interface{}{"series_id": series.ID}, c.ClientIP())

		c.JSON(http.StatusOK, gin.H{"message": "scheduled send canceled"})
	}
}

// cancelIssueGenerationHandler stops an in-flight AI generation and restores
// the issue to its pre-generation state. Jobs still queued (not yet picked up
// by the worker) are skipped by its pre-flight status check; running tasks
// are aborted via a Redis cancel signal.
func cancelIssueGenerationHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		loaded, _, ok := loadWorkspaceIssue(db, c, id)
		if !ok {
			return
		}
		if loaded.Status != IssueStatusGenerating {
			c.JSON(http.StatusConflict, gin.H{"error": "issue is not currently generating"})
			return
		}

		// Regeneration leaves the previous draft intact until the worker
		// persists, so restore to ready when content exists.
		restoreStatus := IssueStatusPending
		if len(parseJSONMap(loaded.ContentJSON)) > 0 {
			restoreStatus = IssueStatusReady
		}

		now := time.Now().UTC()
		if err := db.Model(loaded).Updates(map[string]interface{}{
			"status":         restoreStatus,
			"generate_error": "",
			"updated_at":     now,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if payload, err := json.Marshal(map[string]string{
			"target_type": "issue",
			"target_id":   id,
		}); err == nil {
			if err := generationQueue().Publish(context.Background(), "generation_queue:cancel", payload).Err(); err != nil {
				// Non-fatal: jobs already popped but not yet started are
				// still caught by the worker's pre-flight check.
				log.Printf("cancel publish warning for issue %s: %v", id, err)
			}
		}

		service.WriteAudit(db, c.Request.Context(), c.GetString("user_id"),
			service.AuditGenerationCanceled, "issue", id, nil, c.ClientIP())

		var fresh service.Issue
		if err := db.Where("id = ?", id).First(&fresh).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": fresh, "message": "generation canceled"})
	}
}

// previewEmailHTML renders the exact HTML that would be emailed for an issue
// without sending anything. Powers the in-app email preview.
func previewEmailHTMLHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		loaded, series, ok := loadWorkspaceIssue(db, c, id)
		if !ok {
			return
		}
		content := parseJSONMap(loaded.ContentJSON)
		if len(content) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "issue has no generated content yet"})
			return
		}
		_, htmlBody := appmail.RenderIssueHTML(series.Topic, series.Goal, content, true,
			sourceRefsForContent(db, series.WorkspaceID, content))
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(http.StatusOK, htmlBody)
	}
}
