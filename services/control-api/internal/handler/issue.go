// Issue handler for API endpoints
// Handles HTTP requests for issue management

package handler

import (
    "net/http"
    "strings"
    "time"

    "github.com/gin-gonic/gin"
    "gorm.io/gorm"

    "cadensend/services/control-api/internal/service"
)

// IssueHandler handles HTTP requests for issue management
type IssueHandler struct {
    db *gorm.DB
}

// NewIssueHandler creates a new issue handler
func NewIssueHandler(db *gorm.DB) *IssueHandler {
    return &IssueHandler{db: db}
}

// RegisterRoutes registers issue routes
func (h *IssueHandler) RegisterRoutes(router gin.IRouter, authMiddleware gin.HandlerFunc) {
    issues := router.Group("/issues")
    issues.Use(authMiddleware)
    {
        issues.GET("/:id", h.GetIssue)
        issues.PATCH("/:id", h.UpdateIssue)
        issues.POST("/:id/generate", h.GenerateIssue)
        issues.POST("/:id/approve", h.ApproveIssue)
        issues.POST("/:id/test-send", h.TestSendIssue)
    }
}

// GetIssue retrieves an issue by ID
func (h *IssueHandler) GetIssue(c *gin.Context) {
    id := c.Param("id")
    var issue service.Issue

    if err := h.db.Where("id = ? AND deleted_at IS NULL", id).First(&issue).Error; err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "issue not found"})
       	return
    }

    c.JSON(http.StatusOK, gin.H{"data": issue})
}

// UpdateIssue updates issue fields
func (h *IssueHandler) UpdateIssue(c *gin.Context) {
    id := c.Param("id")
    var req struct {
        Objective   *string    `json:"objective"`
        ScheduledAt *time.Time `json:"scheduled_at"`
        Status      *string    `json:"status"`
    }

    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
       	return
    }

    updates := make(map[string]interface{})
    if req.Objective != nil {
        updates["objective"] = *req.Objective
    }
    if req.ScheduledAt != nil {
        updates["scheduled_at"] = *req.ScheduledAt
    }
    if req.Status != nil {
        updates["status"] = *req.Status
    }
    updates["updated_at"] = time.Now()

    result := h.db.Model(&service.Issue{}).Where("id = ?", id).Updates(updates)
    if result.Error != nil {
       	c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
      	return
    }

    c.JSON(http.StatusOK, gin.H{"message": "issue updated"})
}

// GenerateIssue triggers issue generation for an issue
func (h *IssueHandler) GenerateIssue(c *gin.Context) {
    id := c.Param("id")

    // In a real implementation, this would trigger an async task
    // For now, we return a placeholder
    issueContent := map[string]interface{}{
        "subject":  "Generated Issue",
        "preheader": "Your latest newsletter issue",
        "content_blocks": []map[string]interface{}{
            {
                "type":  "markdown",
                "title": "Welcome",
                "text": "This is auto-generated content...",
                "citations": []map[string]string{
                    {"source_id": "src-1", "chunk_id": "chunk-1", "locator": "Line 1-10"},
                },
            },
        },
        "visual_specs": []map[string]interface{}{
            {
                "type": "mermaid",
                "content": "graph TD\n    A[Start] --> B[End]",
                "alt_text": "Simple flowchart",
            },
        },
    }

    c.JSON(http.StatusOK, gin.H{"data": issueContent})
}

// ApproveIssue marks an issue as approved
func (h *IssueHandler) ApproveIssue(c *gin.Context) {
    id := c.Param("id")

    result := h.db.Model(&service.Issue{}).
        Where("id = ? AND locked = false", id).
        Updates(map[string]interface{}{
            "status":      "approved",
            "updated_at": time.Now(),
        })

    if result.Error != nil {
       	c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
      	return
    }

    if result.RowsAffected == 0 {
       	c.JSON(http.StatusBadRequest, gin.H{"error": "issue not found or already locked"})
      	return
    }

    c.JSON(http.StatusOK, gin.H{"message": "issue approved"})
}

// TestSendIssue sends a test email for an issue
func (h *IssueHandler) TestSendIssue(c *gin.Context) {
    id := c.Param("id")

    var req struct {
        Email string `json:"email" binding:"required,email"`
    }

    if err := c.ShouldBindJSON(&req); err != nil {
       	c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
      	return
    }

    // In a real implementation, this would trigger a test send via the worker
    c.JSON(http.StatusOK, gin.H{
        "message": "test email sent",
        "email":   req.Email,
        "issue_id": id,
    })
}

// helper function to check if string contains substring
func contains(s, substr string) bool {
    return len(s) > len(substr) && (s[0:len(substr)] == substr || contains(s[1:], substr))
}

// simple substring check
func hasPrefix(s, prefix string) bool {
    return strings.HasPrefix(s, prefix)
}
