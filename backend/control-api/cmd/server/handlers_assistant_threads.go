// Package main — Cadensend AI thread persistence handlers.
package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"backend/control-api/internal/service"
)

const assistantMaxStoredMessages = 40

type assistantMessagePayload struct {
	ID          string                 `json:"id" binding:"required"`
	Role        string                 `json:"role" binding:"required"`
	Content     string                 `json:"content"`
	ToolCalls   []interface{}          `json:"toolCalls"`
	ToolResults []interface{}          `json:"toolResults"`
	Permission  map[string]interface{} `json:"permission"`
	Form        map[string]interface{} `json:"form"`
}

func listAssistantThreadsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var threads []service.AssistantThread
		if err := db.Where("workspace_id = ? AND user_id = ?", c.GetString("workspace_id"), c.GetString("user_id")).
			Order("updated_at DESC").
			Limit(30).
			Find(&threads).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"threads": threads})
	}
}

func createAssistantThreadHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Title string `json:"title"`
			Agent string `json:"agent"`
			Model string `json:"model"`
		}
		_ = c.ShouldBindJSON(&req)
		agent := strings.TrimSpace(req.Agent)
		if agent == "" {
			agent = "operator"
		}
		title := strings.TrimSpace(req.Title)
		if title == "" {
			title = "New conversation"
		}
		now := time.Now().UTC()
		thread := service.AssistantThread{
			ID:          uuid.New().String(),
			WorkspaceID: c.GetString("workspace_id"),
			UserID:      c.GetString("user_id"),
			Title:       title,
			Agent:       agent,
			Model:       strings.TrimSpace(req.Model),
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		if err := db.Create(&thread).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"thread": thread, "messages": []interface{}{}})
	}
}

func getAssistantThreadHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		threadID := c.Param("id")
		var thread service.AssistantThread
		if err := db.Where("id = ? AND workspace_id = ? AND user_id = ?",
			threadID, c.GetString("workspace_id"), c.GetString("user_id")).
			First(&thread).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "thread not found"})
			return
		}
		var messages []service.AssistantMessage
		if err := db.Where("thread_id = ?", threadID).Order("sequence ASC").Find(&messages).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"thread": thread, "messages": decodeAssistantMessages(messages)})
	}
}

func updateAssistantThreadHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		threadID := c.Param("id")
		var thread service.AssistantThread
		if err := db.Where("id = ? AND workspace_id = ? AND user_id = ?",
			threadID, c.GetString("workspace_id"), c.GetString("user_id")).
			First(&thread).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "thread not found"})
			return
		}
		var req struct {
			Title string `json:"title"`
			Agent string `json:"agent"`
			Model string `json:"model"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
		updates := map[string]interface{}{"updated_at": time.Now().UTC()}
		if t := strings.TrimSpace(req.Title); t != "" {
			updates["title"] = t
		}
		if a := strings.TrimSpace(req.Agent); a != "" {
			updates["agent"] = a
		}
		if req.Model != "" {
			updates["model"] = req.Model
		}
		if err := db.Model(&thread).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		_ = db.Where("id = ?", threadID).First(&thread)
		c.JSON(http.StatusOK, gin.H{"thread": thread})
	}
}

func deleteAssistantThreadHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		threadID := c.Param("id")
		res := db.Where("id = ? AND workspace_id = ? AND user_id = ?",
			threadID, c.GetString("workspace_id"), c.GetString("user_id")).
			Delete(&service.AssistantThread{})
		if res.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": res.Error.Error()})
			return
		}
		if res.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "thread not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "deleted"})
	}
}

func syncAssistantMessagesHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		threadID := c.Param("id")
		var thread service.AssistantThread
		if err := db.Where("id = ? AND workspace_id = ? AND user_id = ?",
			threadID, c.GetString("workspace_id"), c.GetString("user_id")).
			First(&thread).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "thread not found"})
			return
		}

		var req struct {
			Messages []assistantMessagePayload `json:"messages"`
			Title    string                  `json:"title"`
			Agent    string                  `json:"agent"`
			Model    string                  `json:"model"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
		if len(req.Messages) > assistantMaxStoredMessages {
			req.Messages = req.Messages[len(req.Messages)-assistantMaxStoredMessages:]
		}

		err := db.Transaction(func(tx *gorm.DB) error {
			// Serialize concurrent syncs for the same thread (frontend fires several at once).
			if err := tx.Exec("SELECT pg_advisory_xact_lock(hashtext(?))", threadID).Error; err != nil {
				return err
			}
			if err := tx.Where("thread_id = ?", threadID).Delete(&service.AssistantMessage{}).Error; err != nil {
				return err
			}
			now := time.Now().UTC()
			for i, msg := range req.Messages {
				meta := map[string]interface{}{}
				if len(msg.ToolCalls) > 0 {
					meta["toolCalls"] = msg.ToolCalls
				}
				if len(msg.ToolResults) > 0 {
					meta["toolResults"] = msg.ToolResults
				}
				if msg.Permission != nil {
					meta["permission"] = msg.Permission
				}
				if msg.Form != nil {
					meta["form"] = msg.Form
				}
				raw, _ := json.Marshal(meta)
				row := service.AssistantMessage{
					ID:        msg.ID,
					ThreadID:  threadID,
					Role:      msg.Role,
					Content:   msg.Content,
					Metadata:  string(raw),
					Sequence:  i,
					CreatedAt: now,
				}
				if err := tx.Create(&row).Error; err != nil {
					return err
				}
			}
			updates := map[string]interface{}{"updated_at": now}
			if t := strings.TrimSpace(req.Title); t != "" {
				updates["title"] = t
			} else if len(req.Messages) > 0 {
				for _, msg := range req.Messages {
					if msg.Role == "user" && strings.TrimSpace(msg.Content) != "" {
						title := strings.TrimSpace(msg.Content)
						if len(title) > 80 {
							title = title[:77] + "..."
						}
						updates["title"] = title
						break
					}
				}
			}
			if a := strings.TrimSpace(req.Agent); a != "" {
				updates["agent"] = a
			}
			if req.Model != "" {
				updates["model"] = req.Model
			}
			return tx.Model(&thread).Updates(updates).Error
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "synced"})
	}
}

func decodeAssistantMessages(rows []service.AssistantMessage) []gin.H {
	out := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		item := gin.H{
			"id":      row.ID,
			"role":    row.Role,
			"content": row.Content,
		}
		if row.Metadata != "" && row.Metadata != "{}" {
			var meta map[string]interface{}
			if json.Unmarshal([]byte(row.Metadata), &meta) == nil {
				for k, v := range meta {
					item[k] = v
				}
			}
		}
		out = append(out, item)
	}
	return out
}
