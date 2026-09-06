package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"backend/control-api/internal/service"
)

func getContentPreferencesHandler(db *gorm.DB, svc *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetString("user_id")
		prefs, err := svc.GetContentPreferences(userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": prefs})
	}
}

func updateContentPreferencesHandler(db *gorm.DB, svc *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetString("user_id")
		var req service.ContentPreferences
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		prefs, err := svc.UpdateContentPreferences(userID, req)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": prefs, "message": "Content preferences saved"})
	}
}
