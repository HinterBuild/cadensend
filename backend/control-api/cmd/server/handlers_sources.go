// Package main - AI-engine backed source content inspection.
package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"backend/control-api/internal/service"
)

// sourceChunksHandler returns indexed chunk previews for a ready source by
// asking the AI engine to scroll Qdrant for this workspace + source pair.
func sourceChunksHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var src service.Source
		if err := db.Where("id = ? AND workspace_id = ? AND deleted_at IS NULL", id, c.GetString("workspace_id")).
			First(&src).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "source not found"})
			return
		}
		if src.CurrentVersionID == "" {
			c.JSON(http.StatusConflict, gin.H{"error": "source has not been ingested yet"})
			return
		}

		payload := map[string]interface{}{
			"workspace_id": src.WorkspaceID,
			"source_id":    src.ID,
		}
		status, body, err := aiEngineRequest(http.MethodPost, "/v1/sources/"+src.ID+"/chunks", payload)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "ai engine unreachable: " + err.Error()})
			return
		}
		c.Data(status, "application/json", body)
	}
}
