package main

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"backend/control-api/internal/service"
)

type runItem struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Status    string `json:"status"`
	Title     string `json:"title"`
	Detail    string `json:"detail"`
	Error     string `json:"error,omitempty"`
	SeriesID  string `json:"series_id,omitempty"`
	IssueID   string `json:"issue_id,omitempty"`
	SourceID  string `json:"source_id,omitempty"`
	Href      string `json:"href,omitempty"`
	CanRetry  bool   `json:"can_retry"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type runSummary struct {
	Queued    int `json:"queued"`
	Running   int `json:"running"`
	Failed    int `json:"failed"`
	Completed int `json:"completed"`
}

func listRunsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaceID := c.GetString("workspace_id")
		if workspaceID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		kindFilter := strings.TrimSpace(c.Query("kind"))
		statusFilter := strings.TrimSpace(c.Query("status"))
		items := collectRuns(db, workspaceID)

		filtered := make([]runItem, 0, len(items))
		for _, item := range items {
			if kindFilter != "" && item.Kind != kindFilter {
				continue
			}
			if statusFilter != "" && item.Status != statusFilter {
				continue
			}
			filtered = append(filtered, item)
		}

		summary := runSummary{}
		for _, item := range items {
			switch item.Status {
			case "pending", "queued":
				summary.Queued++
			case "generating", "ingesting", "running":
				summary.Running++
			case "failed":
				summary.Failed++
			case "ready", "sent", "completed", "approved":
				summary.Completed++
			}
		}

		c.JSON(http.StatusOK, gin.H{"data": filtered, "summary": summary})
	}
}

func collectRuns(db *gorm.DB, workspaceID string) []runItem {
	items := make([]runItem, 0, 64)

	type issueRow struct {
		service.Issue
		Topic string `gorm:"column:topic"`
	}
	var issues []issueRow
	db.Table("issues").
		Select("issues.*, series.topic as topic").
		Joins("JOIN series ON series.id = issues.series_id").
		Where("series.workspace_id = ? AND series.deleted_at IS NULL AND issues.deleted_at IS NULL", workspaceID).
		Order("issues.updated_at DESC").
		Limit(80).
		Find(&issues)
	for _, row := range issues {
		status := row.Status
		if status == "" {
			status = "unknown"
		}
		items = append(items, runItem{
			ID:        "issue:" + row.ID,
			Kind:      "issue",
			Status:    status,
			Title:     firstNonEmpty(row.Objective, row.Topic),
			Detail:    row.Topic,
			Error:     row.GenerateError,
			SeriesID:  row.SeriesID,
			IssueID:   row.ID,
			Href:      "/issues/" + row.ID,
			CanRetry:  status == "failed" || status == "pending",
			CreatedAt: row.CreatedAt.UTC().Format(time.RFC3339),
			UpdatedAt: row.UpdatedAt.UTC().Format(time.RFC3339),
		})
	}

	var sources []service.Source
	db.Where("workspace_id = ? AND deleted_at IS NULL", workspaceID).
		Order("updated_at DESC").
		Limit(40).
		Find(&sources)
	for _, src := range sources {
		status := src.Status
		items = append(items, runItem{
			ID:        "source:" + src.ID,
			Kind:      "ingest",
			Status:    status,
			Title:     firstNonEmpty(src.URL, src.Type+" source"),
			Detail:    src.Type,
			Error:     src.IngestError,
			SeriesID:  src.SeriesID,
			SourceID:  src.ID,
			Href:      "/sources",
			CanRetry:  status == "failed" || status == "pending",
			CreatedAt: src.CreatedAt.UTC().Format(time.RFC3339),
			UpdatedAt: src.UpdatedAt.UTC().Format(time.RFC3339),
		})
	}

	type seriesRow struct {
		ID         string    `gorm:"column:id"`
		Topic      string    `gorm:"column:topic"`
		PlanStatus string    `gorm:"column:plan_status"`
		PlanError  string    `gorm:"column:plan_error"`
		CreatedAt  time.Time `gorm:"column:created_at"`
		UpdatedAt  time.Time `gorm:"column:updated_at"`
	}
	var plans []seriesRow
	db.Table("series").
		Where("workspace_id = ? AND deleted_at IS NULL AND plan_status <> ''", workspaceID).
		Order("updated_at DESC").
		Limit(40).
		Find(&plans)
	for _, row := range plans {
		items = append(items, runItem{
			ID:        "plan:" + row.ID,
			Kind:      "plan",
			Status:    row.PlanStatus,
			Title:     "Plan · " + row.Topic,
			Detail:    row.Topic,
			Error:     row.PlanError,
			SeriesID:  row.ID,
			Href:      "/series/" + row.ID,
			CanRetry:  row.PlanStatus == "failed",
			CreatedAt: row.CreatedAt.UTC().Format(time.RFC3339),
			UpdatedAt: row.UpdatedAt.UTC().Format(time.RFC3339),
		})
	}

	return items
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
