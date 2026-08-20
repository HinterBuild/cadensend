package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"backend/control-api/internal/service"
)

func loadWorkspaceSeries(db *gorm.DB, c *gin.Context, seriesID string) (*service.Series, bool) {
	var series service.Series
	err := db.Where("id = ? AND workspace_id = ? AND deleted_at IS NULL", seriesID, c.GetString("workspace_id")).
		First(&series).Error
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "series not found"})
		return nil, false
	}
	return &series, true
}

func loadWorkspaceIssue(db *gorm.DB, c *gin.Context, issueID string) (*service.Issue, *service.Series, bool) {
	var issue service.Issue
	if err := db.Where("id = ? AND deleted_at IS NULL", issueID).First(&issue).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "issue not found"})
		return nil, nil, false
	}
	series, ok := loadWorkspaceSeries(db, c, issue.SeriesID)
	if !ok {
		return nil, nil, false
	}
	return &issue, series, true
}

func requireOwnUser(c *gin.Context, userID string) bool {
	if c.GetString("user_id") != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return false
	}
	return true
}
