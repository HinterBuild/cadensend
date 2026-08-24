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
	TokensIn  int64  `json:"tokens_in,omitempty"`
	TokensOut int64  `json:"tokens_out,omitempty"`
	Model     string `json:"model,omitempty"`
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

	// Latest generation stats per issue, so issue rows can show usage.
	type runStat struct {
		TargetID  string `gorm:"column:target_id"`
		Model     string `gorm:"column:model"`
		TokensIn  int64  `gorm:"column:tokens_in"`
		TokensOut int64  `gorm:"column:tokens_out"`
		Status    string `gorm:"column:status"`
	}
	var stats []runStat
	db.Table("generation_runs").
		Select("DISTINCT ON (target_id) target_id, model, tokens_in, tokens_out, status").
		Where("target_type = 'issue'").
		Order("target_id, updated_at DESC").
		Limit(400).
		Find(&stats)
	statsByTarget := map[string]runStat{}
	for _, s := range stats {
		statsByTarget[s.TargetID] = s
	}

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
		item := runItem{
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
		}
		if s, ok := statsByTarget[row.ID]; ok && s.TokensIn+s.TokensOut > 0 {
			item.TokensIn = s.TokensIn
			item.TokensOut = s.TokensOut
			item.Model = s.Model
		}
		items = append(items, item)
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

	// Dead-lettered generation jobs (gave up after all retries) so failures
	// never disappear into a log line.
	// Dead-lettered generation jobs (gave up after all retries) so failures
	// never disappear into a log line.
	type deadRunRow struct {
		ID         string    `gorm:"column:id"`
		TargetID   string    `gorm:"column:target_id"`
		TargetType string    `gorm:"column:target_type"`
		Model      string    `gorm:"column:model"`
		ErrorMsg   string    `gorm:"column:error_msg"`
		CreatedAt  time.Time `gorm:"column:created_at"`
	}
	var deadRuns []deadRunRow
	db.Table("generation_runs").
		Joins("LEFT JOIN issues i ON i.id = generation_runs.target_id AND generation_runs.target_type = 'issue'").
		Joins("LEFT JOIN series s ON s.id = generation_runs.target_id AND generation_runs.target_type = 'series'").
		Joins("LEFT JOIN series ws ON ws.id = COALESCE(i.series_id, s.id)").
		Where(`generation_runs.status = 'failed'
		       AND generation_runs.error_code = 'job_failed'
		       AND (i.deleted_at IS NULL AND s.deleted_at IS NULL)
		       AND ws.workspace_id = ?`, workspaceID).
		Order("generation_runs.created_at DESC").
		Limit(20).
		Find(&deadRuns)
	for _, row := range deadRuns {
		href := ""
		if row.TargetType == "issue" && row.TargetID != "" {
			href = "/issues/" + row.TargetID
		} else if row.TargetType == "series" && row.TargetID != "" {
			href = "/series/" + row.TargetID
		}
		items = append(items, runItem{
			ID:        "generation:" + row.ID,
			Kind:      "generation",
			Status:    "failed",
			Title:     "Generation gave up after repeated retries",
			Detail:    "model " + firstNonEmpty(row.Model, "unknown"),
			Error:     row.ErrorMsg,
			IssueID:   map[bool]string{row.TargetType == "issue": row.TargetID}[true],
			SeriesID:  map[bool]string{row.TargetType == "series": row.TargetID}[true],
			Href:      href,
			CanRetry:  true,
			Model:     row.Model,
			CreatedAt: row.CreatedAt.UTC().Format(time.RFC3339),
			UpdatedAt: row.CreatedAt.UTC().Format(time.RFC3339),
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
