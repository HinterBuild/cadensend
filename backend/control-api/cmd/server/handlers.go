// Package main - HTTP handlers for the control API
package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"backend/control-api/internal/mail"
	"backend/control-api/internal/service"
)

// Status constants for domain entities.
// These mirror the values defined in packages/contracts and must stay in sync.
const (
	SeriesStatusDraft     = "draft"
	SeriesStatusActive    = "active"
	SeriesStatusPaused    = "paused"
	IssueStatusPending    = "pending"
	IssueStatusGenerating = "generating"
	IssueStatusReady      = "ready"
	IssueStatusFailed     = "failed"
	IssueStatusApproved   = "approved"
	IssueStatusSent       = "sent"
	SourceStatusPending   = "pending"
	SourceStatusIngesting = "ingesting"
	SourceStatusReady     = "ready"
	SourceStatusFailed    = "failed"
)

// createSeriesHandler creates a new series
func createSeriesHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rawBody, err := c.GetRawData()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}

		var req struct {
			Topic          string `json:"topic" binding:"required"`
			Goal           string `json:"goal" binding:"required"`
			Level          string `json:"level"`
			Timezone       string `json:"timezone" binding:"required"`
			Cadence        string `json:"cadence"`
			StartDate      string `json:"start_date"`
			SendTime       string `json:"send_time"`
			SendDays       string `json:"send_days"`
			ManualApproval *bool  `json:"manual_approval"`
			Model          string `json:"model"`
			BriefJSON      string `json:"brief_json"`
		}

		if err := json.Unmarshal(rawBody, &req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if req.Topic == "" || req.Goal == "" || req.Timezone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "topic, goal, and timezone are required"})
			return
		}

		briefJSON := req.BriefJSON
		if briefJSON == "" {
			briefJSON = string(rawBody)
		}

		cadence := strings.TrimSpace(req.Cadence)
		if cadence == "" {
			cadence = "weekly"
		}
		sendTime := strings.TrimSpace(req.SendTime)
		if sendTime == "" {
			sendTime = "09:00"
		}
		manualApproval := false
		if req.ManualApproval != nil {
			manualApproval = *req.ManualApproval
		}

		s := &service.Series{
			ID:             uuid.NewString(),
			WorkspaceID:    c.GetString("workspace_id"),
			Slug:           req.Topic + "-" + time.Now().Format("20060102-150405"),
			Topic:          req.Topic,
			Goal:           req.Goal,
			Level:          req.Level,
			Timezone:       req.Timezone,
			Status:         SeriesStatusActive,
			PlanStatus:     "generating",
			Cadence:        cadence,
			StartDate:      strings.TrimSpace(req.StartDate),
			SendTime:       sendTime,
			SendDays:       strings.TrimSpace(req.SendDays),
			ManualApproval: manualApproval,
			CreatedBy:      c.GetString("user_id"),
			CreatedAt:      time.Now(),
			UpdatedAt:      time.Now(),
		}

		if err := db.Create(s).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		model := req.Model
		if err := queuePlanGeneration(s, model); err != nil {
			_ = db.Model(s).Updates(map[string]interface{}{
				"plan_status": "failed",
				"plan_error":  err.Error(),
				"updated_at":  time.Now(),
			}).Error
			c.JSON(http.StatusCreated, gin.H{
				"data":    s,
				"warning": "series created but plan generation did not start: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"data": s, "brief_json": briefJSON})
	}
}

func getSeriesHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var s service.Series

		if err := db.Where("id = ? AND deleted_at IS NULL", id).First(&s).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "series not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"data": s})
	}
}

func listSeriesHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var series []service.Series

		if err := db.Where("workspace_id = ? AND deleted_at IS NULL", c.GetString("workspace_id")).
			Order("created_at DESC").Find(&series).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"series": series})
	}
}

func updateSeriesHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var req struct {
			Topic    *string `json:"topic"`
			Goal     *string `json:"goal"`
			Level    *string `json:"level"`
			Timezone *string `json:"timezone"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		updates := buildSeriesUpdates(req)
		updates["updated_at"] = time.Now()

		if err := db.Model(&service.Series{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "series updated"})
	}
}

// buildSeriesUpdates constructs a partial-update map from optional pointers.
func buildSeriesUpdates(req struct {
	Topic    *string `json:"topic"`
	Goal     *string `json:"goal"`
	Level    *string `json:"level"`
	Timezone *string `json:"timezone"`
}) map[string]interface{} {
	updates := make(map[string]interface{})
	if req.Topic != nil {
		updates["topic"] = *req.Topic
	}
	if req.Goal != nil {
		updates["goal"] = *req.Goal
	}
	if req.Level != nil {
		updates["level"] = *req.Level
	}
	if req.Timezone != nil {
		updates["timezone"] = *req.Timezone
	}
	return updates
}

func generatePlanHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var req struct {
			Model string `json:"model"`
		}
		_ = c.ShouldBindJSON(&req)

		var series service.Series
		if err := db.Where("id = ? AND deleted_at IS NULL", id).First(&series).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "series not found"})
			return
		}

		model := req.Model
		if err := queuePlanGeneration(&series, model); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to queue plan generation"})
			return
		}

		if err := db.Model(&series).Updates(map[string]interface{}{
			"plan_status": "generating",
			"plan_error":  "",
			"updated_at":  time.Now(),
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusAccepted, gin.H{
			"status":    "generating",
			"series_id": id,
			"model":     seriesModel(&series, model),
			"message":   "plan generation started",
		})
	}
}

func seriesModel(series *service.Series, requested string) string {
	if strings.TrimSpace(requested) != "" {
		return requested
	}
	return cfg.DefaultModel
}

func queuePlanGeneration(series *service.Series, model string) error {
	model = seriesModel(series, model)
	job, err := json.Marshal(map[string]interface{}{
		"task":         "generate_plan",
		"series_id":    series.ID,
		"workspace_id": series.WorkspaceID,
		"model":        model,
		"thread_id":    "plan-" + series.ID,
		"brief": map[string]interface{}{
			"topic":   series.Topic,
			"goal":    series.Goal,
			"level":   series.Level,
			"cadence": series.Cadence,
			"model":   model,
		},
	})
	if err != nil {
		return err
	}
	return enqueueGenerationJob(job)
}

func getPlanHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var series service.Series
		if err := db.Where("id = ? AND deleted_at IS NULL", id).First(&series).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "series not found"})
			return
		}

		var plan any
		if series.PlanJSON != nil && *series.PlanJSON != "" {
			_ = json.Unmarshal([]byte(*series.PlanJSON), &plan)
		}

		c.JSON(http.StatusOK, gin.H{
			"status":    series.PlanStatus,
			"series_id": series.ID,
			"plan":      plan,
			"error":     series.PlanError,
		})
	}
}

func listIssuesHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var issues []service.Issue

		if err := db.Where("series_id = ? AND deleted_at IS NULL", id).
			Order("sequence_no ASC").Find(&issues).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"data": issues})
	}
}

func createIssueHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		seriesID := c.Param("id")
		var req struct {
			Objective   string `json:"objective"`
			ScheduledAt string `json:"scheduled_at"`
			Model       string `json:"model"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var series service.Series
		if err := db.Where("id = ? AND deleted_at IS NULL", seriesID).First(&series).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "series not found"})
			return
		}

		var maxSeq int
		db.Model(&service.Issue{}).
			Where("series_id = ? AND deleted_at IS NULL", seriesID).
			Select("COALESCE(MAX(sequence_no), 0)").
			Scan(&maxSeq)

		objective := strings.TrimSpace(req.Objective)
		if objective == "" {
			objective = fmt.Sprintf("Issue %d", maxSeq+1)
		}

		issue := &service.Issue{
			ID:         uuid.NewString(),
			SeriesID:   seriesID,
			SequenceNo: maxSeq + 1,
			Objective:  objective,
			Status:     IssueStatusGenerating,
			CreatedBy:  c.GetString("user_id"),
			CreatedAt:  time.Now(),
			UpdatedAt:  time.Now(),
		}
		if req.ScheduledAt != "" {
			parsed, err := parseScheduledAt(req.ScheduledAt)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "scheduled_at must be a valid date or datetime"})
				return
			}
			issue.ScheduledAt = &parsed
		}

		if err := db.Create(issue).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if err := queueIssueGeneration(&series, issue, req.Model); err != nil {
			db.Model(issue).Updates(map[string]interface{}{
				"status":         IssueStatusFailed,
				"generate_error": err.Error(),
				"updated_at":     time.Now(),
			})
			issue.Status = IssueStatusFailed
			issue.GenerateError = err.Error()
		}

		c.JSON(http.StatusAccepted, gin.H{"data": issue})
	}
}

func listSeriesSourcesHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		seriesID := c.Param("id")
		var srcs []service.Source
		if err := db.Where("series_id = ? AND deleted_at IS NULL", seriesID).
			Order("created_at DESC").Find(&srcs).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": srcs})
	}
}

func activateSeriesHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		result := db.Model(&service.Series{}).
			Where("id = ?", id).
			Updates(map[string]interface{}{
				"status":     SeriesStatusActive,
				"updated_at": time.Now(),
			})

		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "series not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "series activated"})
	}
}

func pauseSeriesHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		result := db.Model(&service.Series{}).
			Where("id = ?", id).
			Updates(map[string]interface{}{
				"status":     SeriesStatusPaused,
				"updated_at": time.Now(),
			})

		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "series not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "series paused"})
	}
}

func resumeSeriesHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		result := db.Model(&service.Series{}).
			Where("id = ?", id).
			Updates(map[string]interface{}{
				"status":     SeriesStatusActive,
				"updated_at": time.Now(),
			})

		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "series not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "series resumed"})
	}
}

func deleteSeriesHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		now := time.Now()
		result := db.Model(&service.Series{}).
			Where("id = ? AND deleted_at IS NULL", id).
			Updates(map[string]interface{}{
				"deleted_at": now,
				"updated_at": now,
			})
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "series not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "series deleted"})
	}
}

// updateSeriesStatus is a shared helper for status transitions on Series.
func updateSeriesStatus(db *gorm.DB, c *gin.Context, status, message string) {
	id := c.Param("id")
	result := db.Model(&service.Series{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"status":     status,
			"updated_at": time.Now(),
		})

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "series not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": message})
}

// User handlers
func createUserHandler(db *gorm.DB, svc *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Email       string `json:"email" binding:"required,email"`
			Password    string `json:"password" binding:"required,min=8"`
			Name        string `json:"name" binding:"required"`
			Timezone    string `json:"timezone" binding:"required"`
			WorkspaceID string `json:"workspace_id" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		user, err := svc.CreateUser(req.Email, req.Password, req.Name, req.Timezone, req.WorkspaceID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"data": user})
	}
}

func loginHandler(db *gorm.DB, svc *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Email    string `json:"email" binding:"required,email"`
			Password string `json:"password" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		user, token, err := svc.AuthenticateUser(req.Email, req.Password)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"user": user, "token": token})
	}
}

func magicLinkHandler(db *gorm.DB, svc *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Email string `json:"email" binding:"required,email"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		token, err := svc.GenerateMagicLink(req.Email)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"token": token})
	}
}

func verifyMagicLinkHandler(db *gorm.DB, svc *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Token string `json:"token" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		user, jwtToken, err := svc.VerifyMagicLink(req.Token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"user": user, "token": jwtToken})
	}
}

func getUserHandler(db *gorm.DB, svc *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("id")
		user, err := svc.GetUser(userID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": user})
	}
}

func updateUserHandler(db *gorm.DB, svc *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("id")
		var req struct {
			Name           string  `json:"name"`
			Timezone       string  `json:"timezone"`
			PreferredModel *string `json:"preferred_model"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		user, err := svc.UpdateUser(userID, req.Name, req.Timezone, req.PreferredModel)
		if err != nil {
			if err.Error() == "user not found" {
				c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			} else {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			}
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": user})
	}
}

func changePasswordHandler(db *gorm.DB, svc *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("id")
		var req struct {
			CurrentPassword string `json:"current_password" binding:"required"`
			NewPassword     string `json:"new_password" binding:"required,min=8"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		err := svc.ChangePassword(userID, req.CurrentPassword, req.NewPassword)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "password updated"})
	}
}

// Issue handlers
func getIssueHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var issue service.Issue

		if err := db.Where("id = ? AND deleted_at IS NULL", id).First(&issue).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "issue not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"data": issue})
	}
}

func updateIssueHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var req struct {
			Subject       string          `json:"subject"`
			Preheader     string          `json:"preheader"`
			ContentBlocks json.RawMessage `json:"content_blocks"`
			ScheduledAt   string          `json:"scheduled_at"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}

		var issue service.Issue
		if err := db.Where("id = ? AND deleted_at IS NULL", id).First(&issue).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "issue not found"})
			return
		}
		if issue.Locked {
			c.JSON(http.StatusBadRequest, gin.H{"error": "issue is locked"})
			return
		}

		content := parseJSONMap(issue.ContentJSON)
		content["subject"] = req.Subject
		content["preheader"] = req.Preheader
		if len(req.ContentBlocks) > 0 && string(req.ContentBlocks) != "null" {
			var blocks any
			if err := json.Unmarshal(req.ContentBlocks, &blocks); err == nil {
				content["content_blocks"] = blocks
			}
		}
		encoded, err := json.Marshal(content)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		encodedStr := string(encoded)
		updates := map[string]interface{}{
			"content_json": encodedStr,
			"updated_at":   time.Now().UTC(),
		}
		if req.ScheduledAt != "" {
			parsed, err := parseScheduledAt(req.ScheduledAt)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "scheduled_at must be a valid date or datetime"})
				return
			}
			updates["scheduled_at"] = parsed
		}
		if err := db.Model(&issue).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if err := db.Where("id = ?", id).First(&issue).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": issue})
	}
}

func generateIssueHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var req struct {
			Model string `json:"model"`
		}
		_ = c.ShouldBindJSON(&req)

		var issue service.Issue
		if err := db.Where("id = ? AND deleted_at IS NULL", id).First(&issue).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "issue not found"})
			return
		}
		if issue.Status == IssueStatusGenerating {
			c.JSON(http.StatusOK, gin.H{
				"status":   "generating",
				"issue_id": id,
				"message":  "issue generation already in progress",
			})
			return
		}

		var series service.Series
		if err := db.Where("id = ? AND deleted_at IS NULL", issue.SeriesID).First(&series).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "series not found"})
			return
		}

		db.Model(&issue).Updates(map[string]interface{}{
			"status":         IssueStatusGenerating,
			"generate_error": "",
			"updated_at":     time.Now(),
		})

		if err := queueIssueGeneration(&series, &issue, req.Model); err != nil {
			db.Model(&issue).Updates(map[string]interface{}{
				"status":         IssueStatusFailed,
				"generate_error": err.Error(),
				"updated_at":     time.Now(),
			})
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusAccepted, gin.H{
			"status":   "generating",
			"issue_id": id,
			"message":  "issue generation started",
		})
	}
}

func queueIssueGeneration(series *service.Series, issue *service.Issue, model string) error {
	if model == "" {
		model = cfg.DefaultModel
	}
	job, err := json.Marshal(map[string]interface{}{
		"task":         "generate_issue",
		"issue_id":     issue.ID,
		"series_id":    series.ID,
		"workspace_id": series.WorkspaceID,
		"issue_number": issue.SequenceNo,
		"model":        model,
		"brief": map[string]interface{}{
			"topic":     series.Topic,
			"goal":      series.Goal,
			"level":     series.Level,
			"objective": issue.Objective,
			"model":     model,
		},
		"thread_id": "issue-" + issue.ID,
		"plan_item": planItemForIssue(series, issue),
	})
	if err != nil {
		return err
	}
	return enqueueGenerationJob(job)
}

func approveIssueHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var req struct {
			ScheduledAt string `json:"scheduled_at"`
		}
		_ = c.ShouldBindJSON(&req)

		var issue service.Issue
		if err := db.Where("id = ? AND deleted_at IS NULL", id).First(&issue).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "issue not found"})
			return
		}
		if issue.Locked {
			c.JSON(http.StatusBadRequest, gin.H{"error": "issue is locked"})
			return
		}

		if req.ScheduledAt != "" {
			parsed, err := parseScheduledAt(req.ScheduledAt)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "scheduled_at must be a valid date or datetime"})
				return
			}
			issue.ScheduledAt = &parsed
		}
		if issue.ScheduledAt == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "set a send time before approving"})
			return
		}

		now := time.Now().UTC()
		updates := map[string]interface{}{
			"status":       IssueStatusApproved,
			"scheduled_at": *issue.ScheduledAt,
			"updated_at":   now,
		}
		if err := db.Model(&issue).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if err := upsertDeliverySchedule(db, &issue, c.GetString("user_id")); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message":      "issue approved and scheduled",
			"scheduled_at": issue.ScheduledAt,
		})
	}
}

func upsertDeliverySchedule(db *gorm.DB, issue *service.Issue, createdBy string) error {
	var existing service.Schedule
	err := db.Where("issue_id = ? AND job_type = ? AND status IN ?", issue.ID, "delivery", []string{"pending", "claimed"}).
		First(&existing).Error
	if err == nil {
		return db.Model(&existing).Updates(map[string]interface{}{
			"run_at":     *issue.ScheduledAt,
			"status":     "pending",
			"error_msg":  "",
			"updated_at": time.Now().UTC(),
		}).Error
	}
	if err != gorm.ErrRecordNotFound {
		return err
	}
	schedule := &service.Schedule{
		ID:          uuid.NewString(),
		IssueID:     &issue.ID,
		JobType:     "delivery",
		RunAt:       issue.ScheduledAt.UTC(),
		Status:      "pending",
		MaxAttempts: 5,
		CreatedBy:   createdBy,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}
	return db.Create(schedule).Error
}

func parseScheduledAt(raw string) (time.Time, error) {
	value := strings.TrimSpace(raw)
	layouts := []string{
		time.RFC3339,
		"2006-01-02T15:04:05Z07:00",
		"2006-01-02T15:04:05",
		"2006-01-02T15:04",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if parsed, err := time.ParseInLocation(layout, value, time.Local); err == nil {
			return parsed.UTC(), nil
		}
	}
	return time.Time{}, fmt.Errorf("invalid datetime")
}

func testSendIssueHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var req struct {
			Email string `json:"email"`
		}
		_ = c.ShouldBindJSON(&req)

		var issue service.Issue
		if err := db.Where("id = ? AND deleted_at IS NULL", id).First(&issue).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "issue not found"})
			return
		}
		var series service.Series
		if err := db.Where("id = ? AND deleted_at IS NULL", issue.SeriesID).First(&series).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "series not found"})
			return
		}

		content := parseJSONMap(issue.ContentJSON)
		if len(content) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "issue has no generated content yet"})
			return
		}

		to, err := recipientEmail(c, db, req.Email)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		subject, htmlBody := mail.RenderIssueHTML(series.Topic, series.Goal, content, true)
		if err := sendTestEmail(to, "[TEST] "+subject, htmlBody); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"message":  "test email sent",
			"email":    to,
			"issue_id": id,
			"subject":  "[TEST] " + subject,
		})
	}
}

func testSendSeriesHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var req struct {
			Email       string `json:"email"`
			ModuleIndex *int   `json:"module_index"`
		}
		_ = c.ShouldBindJSON(&req)

		var series service.Series
		if err := db.Where("id = ? AND deleted_at IS NULL", id).First(&series).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "series not found"})
			return
		}

		to, err := recipientEmail(c, db, req.Email)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		moduleIndex := 0
		if req.ModuleIndex != nil {
			moduleIndex = *req.ModuleIndex
		}

		var issue service.Issue
		issueErr := db.Where("series_id = ? AND sequence_no = ? AND deleted_at IS NULL", series.ID, moduleIndex+1).
			First(&issue).Error
		if issueErr == nil && issue.ContentJSON != nil && strings.TrimSpace(*issue.ContentJSON) != "" && *issue.ContentJSON != "null" {
			content := parseJSONMap(issue.ContentJSON)
			subject, htmlBody := mail.RenderIssueHTML(series.Topic, series.Goal, content, true)
			if err := sendTestEmail(to, "[TEST] "+subject, htmlBody); err != nil {
				c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"message":  "test email sent",
				"email":    to,
				"source":   "issue",
				"issue_id": issue.ID,
				"subject":  "[TEST] " + subject,
			})
			return
		}

		plan := parseJSONMap(series.PlanJSON)
		modules, _ := plan["modules"].([]any)
		if moduleIndex < 0 || moduleIndex >= len(modules) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "generate a plan first, or pick a module that exists"})
			return
		}
		module, _ := modules[moduleIndex].(map[string]any)
		if module == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "plan module is invalid"})
			return
		}
		subject, htmlBody := mail.RenderPlanModuleHTML(series.Topic, series.Goal, series.Level, moduleIndex, module)
		if err := sendTestEmail(to, "[TEST] "+subject, htmlBody); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"message":      "test email sent",
			"email":        to,
			"source":       "plan",
			"module_index": moduleIndex,
			"subject":      "[TEST] " + subject,
		})
	}
}

func recipientEmail(c *gin.Context, db *gorm.DB, requested string) (string, error) {
	if email := strings.TrimSpace(requested); email != "" {
		return email, nil
	}
	if email := strings.TrimSpace(c.GetString("email")); email != "" {
		return email, nil
	}
	userID := c.GetString("user_id")
	var user service.User
	if err := db.Where("id = ? AND deleted_at IS NULL", userID).First(&user).Error; err != nil {
		return "", fmt.Errorf("could not resolve a recipient email")
	}
	if strings.TrimSpace(user.Email) == "" {
		return "", fmt.Errorf("could not resolve a recipient email")
	}
	return user.Email, nil
}

func sendTestEmail(to, subject, htmlBody string) error {
	return mail.Send(mail.Config{
		APIURL:   cfg.BrevoAPIURL,
		APIKey:   cfg.BrevoAPIKey,
		From:     cfg.SMTPFrom,
		FromName: cfg.SMTPFromName,
	}, mail.Message{
		To:      to,
		Subject: subject,
		HTML:    htmlBody,
	})
}

func planItemForIssue(series *service.Series, issue *service.Issue) map[string]interface{} {
	item := map[string]interface{}{
		"title":               issue.Objective,
		"learning_objectives": []string{issue.Objective},
	}
	plan := parseJSONMap(series.PlanJSON)
	modules, _ := plan["modules"].([]interface{})
	chosen := matchPlanModule(modules, issue)
	if chosen == nil {
		return item
	}
	if title, _ := chosen["title"].(string); strings.TrimSpace(title) != "" {
		item["title"] = title
	}
	if summary, _ := chosen["summary"].(string); summary != "" {
		item["summary"] = summary
	}
	if objs, ok := chosen["learning_objectives"].([]interface{}); ok {
		goals := make([]string, 0, len(objs))
		for _, obj := range objs {
			if s, ok := obj.(string); ok && strings.TrimSpace(s) != "" {
				goals = append(goals, s)
			}
		}
		if len(goals) > 0 {
			item["learning_objectives"] = goals
		}
	}
	return item
}

func matchPlanModule(modules []interface{}, issue *service.Issue) map[string]interface{} {
	objective := strings.TrimSpace(issue.Objective)
	if objective != "" {
		for _, raw := range modules {
			mod, ok := raw.(map[string]interface{})
			if !ok {
				continue
			}
			title, _ := mod["title"].(string)
			if strings.EqualFold(strings.TrimSpace(title), objective) {
				return mod
			}
		}
	}
	idx := issue.SequenceNo - 1
	if idx < 0 || idx >= len(modules) {
		return nil
	}
	mod, ok := modules[idx].(map[string]interface{})
	if !ok {
		return nil
	}
	return mod
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

// Source handlers
func uploadSourceHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		file, err := c.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
			return
		}

		workspaceID := c.GetString("workspace_id")
		seriesID := c.PostForm("series_id")
		scope := c.PostForm("scope")
		if seriesID != "" {
			var series service.Series
			if err := db.Where("id = ? AND deleted_at IS NULL", seriesID).First(&series).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "series not found"})
				return
			}
			workspaceID = series.WorkspaceID
			if scope == "" {
				scope = "series"
			}
		}
		if scope == "" {
			scope = "workspace"
		}

		src := &service.Source{
			ID:          uuid.NewString(),
			WorkspaceID: workspaceID,
			Scope:       scope,
			Type:        "file",
			URL:         file.Filename,
			SeriesID:    seriesID,
			Status:      SourceStatusIngesting,
			CreatedBy:   c.GetString("user_id"),
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}

		if err := db.Create(src).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		opened, err := file.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read upload"})
			return
		}
		defer opened.Close()
		content, err := io.ReadAll(opened)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read upload"})
			return
		}

		job, _ := json.Marshal(map[string]interface{}{
			"task":         "ingest_source",
			"source_type":  "file",
			"filename":     file.Filename,
			"content_b64":  base64.StdEncoding.EncodeToString(content),
			"workspace_id": src.WorkspaceID,
			"series_id":    src.SeriesID,
			"source_id":    src.ID,
		})
		if err := enqueueGenerationJob(job); err != nil {
			db.Model(src).Updates(map[string]interface{}{
				"status":       SourceStatusFailed,
				"ingest_error": err.Error(),
				"updated_at":   time.Now(),
			})
			src.Status = SourceStatusFailed
			src.IngestError = err.Error()
		}

		c.JSON(http.StatusAccepted, gin.H{"data": src})
	}
}

func submitURLHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			URL      string `json:"url" binding:"required,url"`
			Type     string `json:"type"`
			Scope    string `json:"scope"`
			SeriesID string `json:"series_id"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if req.Type == "" {
			req.Type = "url"
		}
		if req.Scope == "" {
			if req.SeriesID != "" {
				req.Scope = "series"
			} else {
				req.Scope = "workspace"
			}
		}

		workspaceID := c.GetString("workspace_id")
		if req.SeriesID != "" {
			var series service.Series
			if err := db.Where("id = ? AND deleted_at IS NULL", req.SeriesID).First(&series).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "series not found"})
				return
			}
			workspaceID = series.WorkspaceID
		}

		src := &service.Source{
			ID:          uuid.NewString(),
			WorkspaceID: workspaceID,
			Scope:       req.Scope,
			Type:        req.Type,
			URL:         req.URL,
			SeriesID:    req.SeriesID,
			Status:      SourceStatusIngesting,
			CreatedBy:   c.GetString("user_id"),
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}

		if err := db.Create(src).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		job, _ := json.Marshal(map[string]interface{}{
			"task":         "ingest_source",
			"source_type":  "url",
			"url":          src.URL,
			"workspace_id": src.WorkspaceID,
			"series_id":    src.SeriesID,
			"source_id":    src.ID,
		})
		if err := enqueueGenerationJob(job); err != nil {
			db.Model(src).Updates(map[string]interface{}{
				"status":       SourceStatusFailed,
				"ingest_error": err.Error(),
				"updated_at":   time.Now(),
			})
			src.Status = SourceStatusFailed
			src.IngestError = err.Error()
		}

		c.JSON(http.StatusAccepted, gin.H{"data": src})
	}
}

var (
	generationRedisOnce sync.Once
	generationRedis     *redis.Client
)

func generationQueue() *redis.Client {
	generationRedisOnce.Do(func() {
		addr, dbNum, password := parseRedisURL(cfg.RedisURL)
		generationRedis = redis.NewClient(&redis.Options{Addr: addr, Password: password, DB: dbNum})
	})
	return generationRedis
}

func enqueueGenerationJob(job []byte) error {
	return generationQueue().RPush(context.Background(), "generation_queue", job).Err()
}

func listSourcesHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var srcs []service.Source

		if err := db.Where("workspace_id = ? AND deleted_at IS NULL", c.GetString("workspace_id")).
			Find(&srcs).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"data": srcs})
	}
}

func getSourceHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var src service.Source

		if err := db.Where("id = ? AND workspace_id = ? AND deleted_at IS NULL", id, c.GetString("workspace_id")).
			First(&src).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "source not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"data": src})
	}
}

func previewSourceHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		c.JSON(http.StatusOK, gin.H{
			"message":   "preview not implemented in MVP",
			"source_id": id,
		})
	}
}

func reindexSourceHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		result := db.Model(&service.Source{}).
			Where("id = ?", id).
			Update("status", SourceStatusPending)

		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "source not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "reindex started"})
	}
}

func deleteSourceHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		now := time.Now()
		result := db.Model(&service.Source{}).
			Where("id = ? AND workspace_id = ?", id, c.GetString("workspace_id")).
			Update("deleted_at", now)

		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "source not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "source deleted"})
	}
}

// Retrieval handler
func retrievalPreviewHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		seriesID := c.Param("series_id")
		var req struct {
			Query string `json:"query" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"results":   []interface{}{},
			"query":     req.Query,
			"series_id": seriesID,
		})
	}
}

// Operation monitoring handler
func getOperationHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		c.JSON(http.StatusOK, gin.H{
			"data": map[string]interface{}{
				"id":         id,
				"target":     "unknown",
				"status":     "completed",
				"model":      cfg.DefaultModel,
				"tokens":     map[string]int{"input": 0, "output": 0},
				"cost":       0.0,
				"created_at": "2024-01-01T00:00:00Z",
			},
		})
	}
}

// Webhook handler
func emailWebhookHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		provider := c.Param("provider")
		payload, err := c.GetRawData()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
			return
		}

		_ = payload // TODO: implement webhook signature verification and processing
		_ = provider

		c.JSON(http.StatusOK, gin.H{"message": "webhook received", "provider": provider})
	}
}

func listModelsHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		defaultModel := cfg.DefaultModel
		models := []gin.H{
			{
				"id":         defaultModel,
				"name":       "Default (" + defaultModel + ")",
				"is_default": true,
			},
		}
		seen := map[string]bool{defaultModel: true}

		req, err := http.NewRequest(http.MethodGet, "https://openrouter.ai/api/v1/models", nil)
		if err == nil {
			req.Header.Set("HTTP-Referer", "https://cadensend.app")
			req.Header.Set("X-Title", "Cadensend")
			resp, err := http.DefaultClient.Do(req)
			if err == nil {
				defer resp.Body.Close()
				var payload struct {
					Data []struct {
						ID   string `json:"id"`
						Name string `json:"name"`
					} `json:"data"`
				}
				if json.NewDecoder(resp.Body).Decode(&payload) == nil {
					var extras []gin.H
					for _, m := range payload.Data {
						if m.ID == "" || seen[m.ID] || strings.Contains(strings.ToLower(m.ID), "embed") {
							continue
						}
						name := m.Name
						if name == "" {
							name = m.ID
						}
						extras = append(extras, gin.H{"id": m.ID, "name": name, "is_default": false})
						seen[m.ID] = true
					}
					sort.Slice(extras, func(i, j int) bool {
						iID := extras[i]["id"].(string)
						jID := extras[j]["id"].(string)
						iFree := strings.HasSuffix(iID, ":free")
						jFree := strings.HasSuffix(jID, ":free")
						if iFree != jFree {
							return iFree
						}
						return iID < jID
					})
					models = append(models, extras...)
				}
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"default_model": defaultModel,
			"models":        models,
		})
	}
}
