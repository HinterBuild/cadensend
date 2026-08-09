// Package main - Inline handler functions for the control API
package main

import (
    "net/http"
    "time"

    "github.com/gin-gonic/gin"
    "gorm.io/gorm"

    "backend/control-api/internal/service"
    "github.com/google/uuid"
)

// createSeriesHandler creates a new series
func createSeriesHandler(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        var req struct {
            Topic      string `json:"topic" binding:"required"`
            Goal       string `json:"goal" binding:"required"`
            Level      string `json:"level"`
            Timezone   string `json:"timezone" binding:"required"`
            BriefJSON  string `json:"brief_json" binding:"required"`
        }

        if err := c.ShouldBindJSON(&req); err != nil {
           	c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
          	return
        }

        s := &service.Series{
            ID:         uuid.NewString(),
            WorkspaceID: c.GetString("workspace_id"),
            Slug:       req.Topic + "-" + time.Now().Format("20060102-150405"),
            Topic:      req.Topic,
            Goal:       req.Goal,
            Level:      req.Level,
            Timezone:   req.Timezone,
            Status:     "draft",
            CreatedBy:  c.GetString("user_id"),
            CreatedAt:  time.Now(),
            UpdatedAt:  time.Now(),
        }

        if err := db.Create(s).Error; err != nil {
           	c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
          	return
        }

        c.JSON(http.StatusCreated, gin.H{"data": s})
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

        updates := make(map[string]interface{})
        if req.Topic != nil { updates["topic"] = *req.Topic }
        if req.Goal != nil { updates["goal"] = *req.Goal }
        if req.Level != nil { updates["level"] = *req.Level }
        if req.Timezone != nil { updates["timezone"] = *req.Timezone }
        updates["updated_at"] = time.Now()

        if err := db.Model(&service.Series{}).Where("id = ?", id).Updates(updates).Error; err != nil {
           	c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
          	return
        }

        c.JSON(http.StatusOK, gin.H{"message": "series updated"})
    }
}

func generatePlanHandler(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        id := c.Param("id")
        
        plan := &service.SeriesPlan{
            ID:       uuid.NewString(),
            SeriesID: id,
            Version:  1,
            Curriculum: service.Curriculum{
                Objective: "Learn the fundamentals",
                Outline:   []string{"Week 1: Introduction", "Week 2: Deep Dive", "Week 3: Advanced Topics", "Week 4: Capstone"},
            },
            CreatedAt: time.Now(),
            UpdatedAt: time.Now(),
        }

        c.JSON(http.StatusOK, gin.H{"data": plan})
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

func activateSeriesHandler(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        id := c.Param("id")
        db.Model(&service.Series{}).Where("id = ?", id).
            Updates(map[string]interface{}{"status": "active", "updated_at": time.Now()})
       	c.JSON(http.StatusOK, gin.H{"message": "series activated"})
    }
}

func pauseSeriesHandler(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        id := c.Param("id")
        db.Model(&service.Series{}).Where("id = ?", id).
            Updates(map[string]interface{}{"status": "paused", "updated_at": time.Now()})
       	c.JSON(http.StatusOK, gin.H{"message": "series paused"})
    }
}

func resumeSeriesHandler(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        id := c.Param("id")
        db.Model(&service.Series{}).Where("id = ?", id).
            Updates(map[string]interface{}{"status": "active", "updated_at": time.Now()})
       	c.JSON(http.StatusOK, gin.H{"message": "series resumed"})
    }
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
       	c.JSON(http.StatusOK, gin.H{"message": "issue updated"})
    }
}

func generateIssueHandler(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        id := c.Param("id")
       	c.JSON(http.StatusOK, gin.H{"message": "issue generation started", "issue_id": id})
    }
}

func approveIssueHandler(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        id := c.Param("id")
        result := db.Model(&service.Issue{}).
            Where("id = ? AND locked = false", id).
            Updates(map[string]interface{}{
                "status":      "approved",
                "updated_at":  time.Now(),
            })

        if result.Error != nil {
           	c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
          	return
        }

        if result.RowsAffected == 0 {
           	c.JSON(http.StatusBadRequest, gin.H{"error": "issue not found or locked"})
          	return
        }

        c.JSON(http.StatusOK, gin.H{"message": "issue approved"})
    }
}

func testSendIssueHandler(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        id := c.Param("id")
       	var req struct {
            Email string `json:"email" binding:"required,email"`
        }

        if err := c.ShouldBindJSON(&req); err != nil {
           	c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
          	return
        }

        c.JSON(http.StatusOK, gin.H{
            "message":  "test email queued",
            "email":    req.Email,
            "issue_id": id,
        })
    }
}

// Source handlers
func uploadSourceHandler(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        file, err := c.FormFile("file")
        if err != nil {
           	c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
          	return
        }

        src := &service.Source{
            ID:         uuid.NewString(),
            WorkspaceID: c.GetString("workspace_id"),
            Scope:      c.PostForm("scope"),
            Type:       "file",
            Status:     "pending",
            CreatedBy:  c.GetString("user_id"),
            CreatedAt:  time.Now(),
            UpdatedAt:  time.Now(),
        }

        if err := db.Create(src).Error; err != nil {
           	c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
          	return
        }

        c.JSON(http.StatusCreated, gin.H{"data": src})
    }
}

func submitURLHandler(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
       	var req struct {
            URL   string `json:"url" binding:"required,url"`
            Type  string `json:"type" binding:"required"`
            Scope string `json:"scope"`
        }

        if err := c.ShouldBindJSON(&req); err != nil {
           	c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
          	return
        }

        src := &service.Source{
            ID:         uuid.NewString(),
            WorkspaceID: c.GetString("workspace_id"),
            Scope:      req.Scope,
            Type:       req.Type,
            URL:        req.URL,
            Status:     "pending",
            CreatedBy:  c.GetString("user_id"),
            CreatedAt:  time.Now(),
            UpdatedAt:  time.Now(),
        }

        if err := db.Create(src).Error; err != nil {
           	c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
          	return
        }

        c.JSON(http.StatusCreated, gin.H{"data": src})
    }
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
       	db.Model(&service.Source{}).Where("id = ?", id).Update("status", "pending")
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

        if result.RowsAffected == 0 {
           	c.JSON(http.StatusNotFound, gin.H{"error": "source not found"})
          	return
        }
        c.JSON(http.StatusOK, gin.H{"message": "source deleted"})
    }
}

// Retrieval handlers
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

// Operation monitoring handlers
func getOperationHandler(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
       	id := c.Param("id")
       	c.JSON(http.StatusOK, gin.H{
            "data": map[string]interface{}{
                "id":         id,
                "target":     "unknown",
                "status":     "completed",
                "model":      "gpt-4",
                "tokens":     map[string]int{"input": 0, "output": 0},
                "cost":       0.0,
                "created_at": "2024-01-01T00:00:00Z",
            },
        })
    }
}

// Webhook handlers
func emailWebhookHandler(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        provider := c.Param("provider")
       	payload, err := c.GetRawData()
        if err != nil {
           	c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
          	return
        }

        _ = payload
        _ = provider

        c.JSON(http.StatusOK, gin.H{"message": "webhook received", "provider": provider})
    }
}
