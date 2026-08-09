// Webhook handler for API endpoints
// Handles HTTP requests for webhook delivery

package handler

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/json"
    "net/http"

    "github.com/gin-gonic/gin"
    "gorm.io/gorm"
)

// WebhookHandler handles HTTP requests for webhooks
type WebhookHandler struct {
    db          *gorm.DB
    jwtSecret   string
    sendgridKey string
}

// NewWebhookHandler creates a new webhook handler
func NewWebhookHandler(db *gorm.DB, jwtSecret, sendgridKey string) *WebhookHandler {
    return &WebhookHandler{
        db:          db,
        jwtSecret:   jwtSecret,
        sendgridKey: sendgridKey,
    }
}

// RegisterRoutes registers webhook routes
func (h *WebhookHandler) RegisterRoutes(router gin.IRouter) {
    webhooks := router.Group("/webhooks")
    {
        webhooks.POST("/email/:provider", h.HandleEmailWebhook)
    }
}

// HandleEmailWebhook handles email provider webhooks
func (h *WebhookHandler) HandleEmailWebhook(c *gin.Context) {
    provider := c.Param("provider")
    payload, err := c.GetRawData()
    if err != nil {
       	c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
      	return
    }

    // Verify webhook signature
    signature := c.GetHeader("X-Twilio-Email-Webhook-Signature")
    if signature == "" {
        signature = c.GetHeader("X-SendGrid-Signature")
    }

    if provider == "sendgrid" {
        if !h.verifySendGridWebhook(payload, signature) {
           	c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid signature"})
      	return
        }
    }

    // Parse webhook payload
    var event map[string]interface{}
    if err := json.Unmarshal(payload, &event); err != nil {
       	c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
      	return
    }

    // Store webhook event
    eventType := "unknown"
    if t, ok := event["type"].(string); ok {
        eventType = t
    }
    eventID := "webhook-" + eventType

    // In a real implementation, this would store the event and update delivery status
    c.JSON(http.StatusOK, gin.H{"message": "webhook received", "event_id": eventID})
}

func (h *WebhookHandler) verifySendGridWebhook(payload []byte, signature string) bool {
    if h.sendgridKey == "" || signature == "" {
        return false
    }

    // SendGrid uses ECDSA-SHA256 signature verification
    // For MVP, we'll do a simple HMAC verification
    mac := hmac.New(sha256.New, []byte(h.sendgridKey))
    mac.Write(payload)
    expectedSignature := string(mac.Sum(nil))

    return hmac.Equal([]byte(signature), []byte(expectedSignature))
}
