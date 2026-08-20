package main

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"backend/control-api/internal/analytics"
	"backend/control-api/internal/service"
)

func analyticsOverviewHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaceID := c.GetString("workspace_id")
		if workspaceID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		var series []service.Series
		if err := db.Where("workspace_id = ? AND deleted_at IS NULL", workspaceID).Find(&series).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		seriesIDs := make([]string, 0, len(series))
		for _, s := range series {
			seriesIDs = append(seriesIDs, s.ID)
		}

		var issues []service.Issue
		if len(seriesIDs) > 0 {
			if err := db.Where("series_id IN ? AND deleted_at IS NULL", seriesIDs).Find(&issues).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		}

		var sources []service.Source
		if err := db.Where("workspace_id = ? AND deleted_at IS NULL", workspaceID).Find(&sources).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"data": analytics.BuildOverview(time.Now().UTC(), series, issues, sources),
		})
	}
}
