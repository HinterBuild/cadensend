// Package main — Cadensend AI chat handlers (streaming proxy to AI engine).
package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const assistantMaxMessages = 40

// assistantChatHandler streams Cadensend AI SSE from the AI engine.
// The user's JWT is forwarded server-side only; it never appears in the response stream.
func assistantChatHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := strings.TrimSpace(c.GetHeader("Authorization"))
		if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authorization required"})
			return
		}
		jwt := strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
		if jwt == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authorization required"})
			return
		}

		var req struct {
			Messages       []map[string]interface{} `json:"messages"`
			Model          string                   `json:"model"`
			Agent          string                   `json:"agent"`
			UserTimezone   string                   `json:"user_timezone"`
			ThreadID       string                   `json:"thread_id"`
			TaggedIssueIDs []string                 `json:"tagged_issue_ids"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}
		if len(req.Messages) > assistantMaxMessages {
			c.JSON(http.StatusBadRequest, gin.H{"error": "too many messages"})
			return
		}
		if req.Agent == "" {
			req.Agent = "operator"
		}

		payload := map[string]interface{}{
			"messages":      req.Messages,
			"model":         req.Model,
			"agent":         req.Agent,
			"workspace_id":  c.GetString("workspace_id"),
			"user_id":       c.GetString("user_id"),
			"user_jwt":      jwt,
			"user_timezone": req.UserTimezone,
			"thread_id":         req.ThreadID,
			"tagged_issue_ids":  req.TaggedIssueIDs,
		}
		raw, err := json.Marshal(payload)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encode request"})
			return
		}

		upstream, err := http.NewRequest(http.MethodPost, cfg.AIAPIURL+"/v1/assistant/chat", bytes.NewReader(raw))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		upstream.Header.Set("Content-Type", "application/json")
		if token := strings.TrimSpace(cfg.InternalAPIToken); token != "" {
			upstream.Header.Set("X-Internal-Token", token)
		}

		client := &http.Client{}
		resp, err := client.Do(upstream)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "ai engine unreachable"})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 400 {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
			c.Data(resp.StatusCode, "application/json", body)
			return
		}

		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")
		c.Header("X-Accel-Buffering", "no")
		c.Status(http.StatusOK)
		_, _ = io.Copy(c.Writer, resp.Body)
		if flusher, ok := c.Writer.(http.Flusher); ok {
			flusher.Flush()
		}
	}
}

// assistantAgentsHandler lists available Cadensend AI agent profiles.
func assistantAgentsHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		status, body, err := aiEngineRequest(http.MethodGet, "/v1/assistant/agents", nil)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "ai engine unreachable"})
			return
		}
		c.Data(status, "application/json", body)
	}
}
