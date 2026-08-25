// Package main - HTTP handlers for the control API
package main

import (
	"bytes"
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
	"backend/control-api/internal/urlcheck"
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

		if err := db.Where("id = ? AND workspace_id = ? AND deleted_at IS NULL", id, c.GetString("workspace_id")).First(&s).Error; err != nil {
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
			Topic          *string `json:"topic"`
			Goal           *string `json:"goal"`
			Level          *string `json:"level"`
			Timezone       *string `json:"timezone"`
			Cadence        *string `json:"cadence"`
			StartDate      *string `json:"start_date"`
			SendTime       *string `json:"send_time"`
			SendDays       []string `json:"send_days"`
			ManualApproval *bool   `json:"manual_approval"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		series, ok := loadWorkspaceSeries(db, c, id)
		if !ok {
			return
		}

		updates := buildSeriesUpdates(req)
		if len(updates) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "no supported fields to update"})
			return
		}
		updates["updated_at"] = time.Now()

		if err := db.Model(series).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		var fresh service.Series
		db.Where("id = ?", id).First(&fresh)
		c.JSON(http.StatusOK, gin.H{"data": fresh})
	}
}

// buildSeriesUpdates constructs a partial-update map from optional pointers.
func buildSeriesUpdates(req struct {
	Topic          *string  `json:"topic"`
	Goal           *string  `json:"goal"`
	Level          *string  `json:"level"`
	Timezone       *string  `json:"timezone"`
	Cadence        *string  `json:"cadence"`
	StartDate      *string  `json:"start_date"`
	SendTime       *string  `json:"send_time"`
	SendDays       []string `json:"send_days"`
	ManualApproval *bool    `json:"manual_approval"`
}) map[string]interface{} {
	updates := make(map[string]interface{})
	if req.Topic != nil && strings.TrimSpace(*req.Topic) != "" {
		updates["topic"] = strings.TrimSpace(*req.Topic)
	}
	if req.Goal != nil && strings.TrimSpace(*req.Goal) != "" {
		updates["goal"] = strings.TrimSpace(*req.Goal)
	}
	if req.Level != nil {
		updates["level"] = strings.TrimSpace(*req.Level)
	}
	if req.Timezone != nil && strings.TrimSpace(*req.Timezone) != "" {
		updates["timezone"] = strings.TrimSpace(*req.Timezone)
	}
	if req.Cadence != nil && strings.TrimSpace(*req.Cadence) != "" {
		updates["cadence"] = strings.TrimSpace(*req.Cadence)
	}
	if req.StartDate != nil {
		updates["start_date"] = strings.TrimSpace(*req.StartDate)
	}
	if req.SendTime != nil && strings.TrimSpace(*req.SendTime) != "" {
		updates["send_time"] = strings.TrimSpace(*req.SendTime)
	}
	if req.SendDays != nil {
		days := make([]string, 0, len(req.SendDays))
		for _, d := range req.SendDays {
			if trimmed := strings.TrimSpace(d); trimmed != "" {
				days = append(days, trimmed)
			}
		}
		updates["send_days"] = strings.Join(days, ",")
	}
	if req.ManualApproval != nil {
		updates["manual_approval"] = *req.ManualApproval
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

		series, ok := loadWorkspaceSeries(db, c, id)
		if !ok {
			return
		}

		model := req.Model
		if err := queuePlanGeneration(series, model); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to queue plan generation"})
			return
		}

		if err := db.Model(series).Updates(map[string]interface{}{
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
			"model":     seriesModel(series, model),
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

func extractSeriesBriefHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			RawText          string `json:"raw_text" binding:"required"`
			SourceType       string `json:"source_type"`
			PreferredLevel   string `json:"preferred_level"`
			PreferredTone    string `json:"preferred_tone"`
			PreferredLength  string `json:"preferred_length"`
			PreferredCadence string `json:"preferred_cadence"`
			Model            string `json:"model"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "raw_text is required"})
			return
		}
		if len(strings.TrimSpace(req.RawText)) < 20 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "raw_text must be at least 20 characters"})
			return
		}

		payload := map[string]interface{}{
			"raw_text":           req.RawText,
			"source_type":        firstNonEmpty(strings.TrimSpace(req.SourceType), "notes"),
			"preferred_level":    strings.TrimSpace(req.PreferredLevel),
			"preferred_tone":     strings.TrimSpace(req.PreferredTone),
			"preferred_length":   strings.TrimSpace(req.PreferredLength),
			"preferred_cadence":  strings.TrimSpace(req.PreferredCadence),
			"model":              strings.TrimSpace(req.Model),
		}
		status, body, err := aiEngineRequest(http.MethodPost, "/v1/brief/extract", payload)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "ai engine unreachable: " + err.Error()})
			return
		}
		c.Data(status, "application/json", body)
	}
}

func getPlanHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		series, ok := loadWorkspaceSeries(db, c, id)
		if !ok {
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
		if _, ok := loadWorkspaceSeries(db, c, id); !ok {
			return
		}
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
		if loaded, ok := loadWorkspaceSeries(db, c, seriesID); !ok {
			return
		} else {
			series = *loaded
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
		if _, ok := loadWorkspaceSeries(db, c, seriesID); !ok {
			return
		}
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
			Where("id = ? AND workspace_id = ?", id, c.GetString("workspace_id")).
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
			Where("id = ? AND workspace_id = ?", id, c.GetString("workspace_id")).
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
			Where("id = ? AND workspace_id = ?", id, c.GetString("workspace_id")).
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
			Where("id = ? AND workspace_id = ? AND deleted_at IS NULL", id, c.GetString("workspace_id")).
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

		service.WriteAudit(db, c.Request.Context(), c.GetString("user_id"),
			service.AuditSeriesDeleted, "series", id, nil, c.ClientIP())

		c.JSON(http.StatusOK, gin.H{"message": "series deleted"})
	}
}

// updateSeriesStatus is a shared helper for status transitions on Series.
func updateSeriesStatus(db *gorm.DB, c *gin.Context, status, message string) {
	id := c.Param("id")
	result := db.Model(&service.Series{}).
		Where("id = ? AND workspace_id = ?", id, c.GetString("workspace_id")).
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
		req.Email = strings.ToLower(strings.TrimSpace(req.Email))

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

		user, token, err := svc.AuthenticateUser(strings.ToLower(strings.TrimSpace(req.Email)), req.Password)
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

		token, err := svc.GenerateMagicLink(strings.ToLower(strings.TrimSpace(req.Email)))
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
		if !requireOwnUser(c, userID) {
			return
		}
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
		if !requireOwnUser(c, userID) {
			return
		}
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
		if !requireOwnUser(c, userID) {
			return
		}
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

		// A credential change revokes every existing session; re-mint so the
		// current device stays signed in.
		_ = svc.BumpTokenVersion(userID)
		service.WriteAudit(db, c.Request.Context(), userID, service.AuditPasswordChanged, "user", userID, nil, c.ClientIP())
		_, freshToken, tokenErr := svc.AuthenticateUserByID(userID)

		resp := gin.H{"message": "password updated"}
		if tokenErr == nil {
			resp["token"] = freshToken
		}
		c.JSON(http.StatusOK, resp)
	}
}

// Issue handlers
func getIssueHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		issue, _, ok := loadWorkspaceIssue(db, c, id)
		if !ok {
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
			Autosave      bool            `json:"autosave"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}

		loaded, _, ok := loadWorkspaceIssue(db, c, id)
		if !ok {
			return
		}
		issue := *loaded
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

		// Snapshot the live content before overwriting it so the editor can
		// offer version history and restore. Background autosaves are
		// throttled; explicit saves always capture.
		if err := snapshotIssueVersion(db, &issue, c.GetString("user_id"), req.Autosave); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to snapshot issue version: " + err.Error()})
			return
		}

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

		issue, series, ok := loadWorkspaceIssue(db, c, id)
		if !ok {
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

		// Keep the current draft as a version so a regenerate is reversible.
		if err := snapshotIssueVersion(db, issue, c.GetString("user_id"), false); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to snapshot issue version: " + err.Error()})
			return
		}

		db.Model(issue).Updates(map[string]interface{}{
			"status":         IssueStatusGenerating,
			"generate_error": "",
			"updated_at":     time.Now(),
		})

		if err := queueIssueGeneration(series, issue, req.Model); err != nil {
			db.Model(issue).Updates(map[string]interface{}{
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

		issue, _, ok := loadWorkspaceIssue(db, c, id)
		if !ok {
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
		if err := db.Model(issue).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if err := upsertDeliverySchedule(db, issue, c.GetString("user_id")); err != nil {
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

		issue, series, ok := loadWorkspaceIssue(db, c, id)
		if !ok {
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

		subject, htmlBody := mail.RenderIssueHTML(series.Topic, series.Goal, content, true, sourceRefsForContent(db, series.WorkspaceID, content))
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

		series, ok := loadWorkspaceSeries(db, c, id)
		if !ok {
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
			subject, htmlBody := mail.RenderIssueHTML(series.Topic, series.Goal, content, true, sourceRefsForContent(db, series.WorkspaceID, content))
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

// sourceRefsForContent resolves source_ids referenced by issue citations
// into display labels and links for the email renderer.
func sourceRefsForContent(db *gorm.DB, workspaceID string, content map[string]any) map[string]mail.SourceRef {
	ids := map[string]bool{}
	for _, rawBlock := range content["content_blocks"].([]any) {
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
		var src service.Source
		if err := db.Where("id = ? AND workspace_id = ? AND deleted_at IS NULL", id, workspaceID).
			First(&src).Error; err != nil {
			continue
		}
		label := src.URL
		if strings.HasPrefix(src.Type, "file") || label == "" {
			label = "Uploaded " + src.Type + " source"
		}
		refs[id] = mail.SourceRef{Label: label, URL: src.URL}
	}
	return refs
}

// Source handlers

// maxSourceUploadBytes caps in-memory uploads before they are queued for
// ingestion (they are base64-encoded into the Redis job payload).
const maxSourceUploadBytes = 20 << 20 // 20 MiB

var allowedSourceMimeTypes = map[string]bool{
	"application/pdf":       true,
	"application/msword":    true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document":   true,
	"application/vnd.ms-powerpoint": true,
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": true,
	"application/vnd.ms-excel": true,
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":         true,
	"text/html":                true,
	"text/plain":               true,
	"text/markdown":            true,
	"application/json":         true,
	"text/csv":                 true,
	"application/xml":          true,
	"text/xml":                 true,
	"application/rss+xml":      true,
	"application/atom+xml":     true,
}

func allowedSourceExtension(name string) bool {
	lower := strings.ToLower(name)
	for _, ext := range []string{
		".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
		".html", ".htm", ".txt", ".md", ".markdown", ".json", ".csv",
		".xml", ".rss",
	} {
		if strings.HasSuffix(lower, ext) {
			return true
		}
	}
	return false
}

func uploadSourceHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		file, err := c.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
			return
		}
		if file.Size <= 0 || file.Size > maxSourceUploadBytes {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{
				"error": fmt.Sprintf("file must be between 1 byte and %d MiB", maxSourceUploadBytes>>20),
			})
			return
		}
		if !allowedSourceExtension(file.Filename) {
			c.JSON(http.StatusUnsupportedMediaType, gin.H{
				"error": "unsupported file type; allowed: pdf, doc(x), ppt(x), xls(x), html, txt, md, json, csv, xml, rss",
			})
			return
		}

		workspaceID := c.GetString("workspace_id")
		seriesID := c.PostForm("series_id")
		scope := c.PostForm("scope")
		if seriesID != "" {
			if _, ok := loadWorkspaceSeries(db, c, seriesID); !ok {
				return
			}
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
		content, err := io.ReadAll(io.LimitReader(opened, maxSourceUploadBytes+1))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read upload"})
			return
		}
		if int64(len(content)) > maxSourceUploadBytes {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{
				"error": fmt.Sprintf("file exceeds the %d MiB limit", maxSourceUploadBytes>>20),
			})
			return
		}
		contentType := file.Header.Get("Content-Type")
		if contentType != "" && !allowedSourceMimeTypes[strings.TrimSpace(strings.Split(contentType, ";")[0])] {
			c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": "unsupported content type: " + contentType})
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
		if err := urlcheck.ValidatePublicHTTPURL(req.URL); err != nil {
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
			series, ok := loadWorkspaceSeries(db, c, req.SeriesID)
			if !ok {
				return
			}
			workspaceID = series.WorkspaceID
		}

		// Duplicate detection: same workspace + same normalized URL.
		var existing service.Source
		if err := db.Where("workspace_id = ? AND url = ? AND deleted_at IS NULL", workspaceID, req.URL).
			First(&existing).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{
				"error":      "this source was already added",
				"existing":   map[string]interface{}{"id": existing.ID, "status": existing.Status, "series_id": existing.SeriesID},
			})
			return
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

		jobType := req.Type
		if jobType == "rss" {
			jobType = "url"
		}
		job, _ := json.Marshal(map[string]interface{}{
			"task":         "ingest_source",
			"source_type":  jobType,
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
		var src service.Source
		if err := db.Where("id = ? AND workspace_id = ? AND deleted_at IS NULL", id, c.GetString("workspace_id")).
			First(&src).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "source not found"})
			return
		}
		if src.Status != SourceStatusReady && src.CurrentVersionID == "" {
			c.JSON(http.StatusConflict, gin.H{"error": "source has not finished ingesting yet"})
			return
		}

		payload := map[string]interface{}{
			"workspace_id": src.WorkspaceID,
			"source_id":    src.ID,
			"top_k":        8,
		}
		status, body, err := aiEngineRequest(http.MethodPost, "/v1/sources/"+src.ID+"/preview", payload)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "ai engine unreachable: " + err.Error()})
			return
		}
		c.Data(status, "application/json", body)
	}
}

func reindexSourceHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var src service.Source
		if err := db.Where("id = ? AND workspace_id = ?", id, c.GetString("workspace_id")).
			First(&src).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "source not found"})
			return
		}

		now := time.Now()
		if strings.HasPrefix(src.Type, "file") {
			// Uploaded file bytes are not retained after ingestion; a file
			// source must be re-uploaded to refresh its index.
			c.JSON(http.StatusConflict, gin.H{
				"error": "file sources cannot be re-ingested automatically; upload the file again",
			})
			return
		}
		if err := db.Model(&src).Updates(map[string]interface{}{
			"status":       SourceStatusPending,
			"ingest_error": "",
			"updated_at":   now,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Re-queue the ingestion job for the stored content.
		jobType := src.Type
		payload := map[string]interface{}{
			"task":         "ingest_source",
			"source_type":  jobType,
			"url":          src.URL,
			"workspace_id": src.WorkspaceID,
			"series_id":    src.SeriesID,
			"source_id":    src.ID,
			"reindex":      true,
		}
		job, _ := json.Marshal(payload)
		if err := enqueueGenerationJob(job); err != nil {
			db.Model(&src).Updates(map[string]interface{}{
				"status":       SourceStatusFailed,
				"ingest_error": err.Error(),
				"updated_at":   time.Now(),
			})
			c.JSON(http.StatusBadGateway, gin.H{"error": "could not queue re-ingestion: " + err.Error()})
			return
		}

		src.Status = SourceStatusPending
		c.JSON(http.StatusOK, gin.H{"message": "reindex started", "data": src})
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

		service.WriteAudit(db, c.Request.Context(), c.GetString("user_id"),
			service.AuditSourceDeleted, "source", id, nil, c.ClientIP())

		c.JSON(http.StatusOK, gin.H{"message": "source deleted"})
	}
}

// aiEngineRequest performs an authenticated service-to-service call against
// the AI engine and returns its status code and body.
func aiEngineRequest(method, path string, payload map[string]interface{}) (int, []byte, error) {
	var body io.Reader
	if payload != nil {
		raw, err := json.Marshal(payload)
		if err != nil {
			return 0, nil, err
		}
		body = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, cfg.AIAPIURL+path, body)
	if err != nil {
		return 0, nil, err
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token := strings.TrimSpace(cfg.JWTSecret); token != "" {
		req.Header.Set("X-Internal-Token", token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return resp.StatusCode, nil, err
	}
	return resp.StatusCode, data, nil
}

// Retrieval handler
// retrievalPreviewHandler shows the exact chunks a generation would retrieve
// for a query, by delegating to the AI engine's retrieval pipeline.
func retrievalPreviewHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		seriesID := c.Param("series_id")
		var req struct {
			Query string `json:"query" binding:"required"`
			TopK  int    `json:"top_k"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "query is required"})
			return
		}

		series, ok := loadWorkspaceSeries(db, c, seriesID)
		if !ok {
			return
		}

		topK := req.TopK
		if topK <= 0 || topK > 25 {
			topK = 8
		}
		payload := map[string]interface{}{
			"query":        req.Query,
			"workspace_id": series.WorkspaceID,
			"series_id":    series.ID,
			"top_k":        topK,
		}
		status, body, err := aiEngineRequest(http.MethodPost, "/v1/retrieval/preview/"+series.ID, payload)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "ai engine unreachable: " + err.Error()})
			return
		}
		c.Data(status, "application/json", body)
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

// Webhook handler: implemented in handlers_webhooks.go

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
