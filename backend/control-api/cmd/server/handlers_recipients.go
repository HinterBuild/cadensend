// Package main - recipient (audience) management handlers.
package main

import (
	"html"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	appmail "backend/control-api/internal/mail"
	"backend/control-api/internal/service"
)

type recipientsHandler struct {
	db  *gorm.DB
	svc *service.UserService
}

func newRecipientsHandler(db *gorm.DB, svc *service.UserService) *recipientsHandler {
	return &recipientsHandler{db: db, svc: svc}
}

// list lists workspace recipients.
func (h *recipientsHandler) list(c *gin.Context) {
	out, err := h.svc.ListRecipients(c.GetString("workspace_id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// create adds a recipient and emails a verification link.
func (h *recipientsHandler) create(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "a valid email is required"})
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))

	rcpt, created, err := h.svc.CreateRecipient(c.GetString("workspace_id"), email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if created && !rcpt.Verified {
		if err := h.sendVerification(rcpt); err != nil {
			// The row exists; surface that verification could not be sent.
			c.JSON(http.StatusCreated, gin.H{
				"data":    rcpt,
				"warning": "recipient added but the verification email failed: " + err.Error(),
			})
			return
		}
		service.WriteAudit(h.db, c.Request.Context(), c.GetString("user_id"),
			service.AuditRecipientAdded, "recipient", rcpt.ID,
			map[string]interface{}{"email": email}, c.ClientIP())
	}

	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	c.JSON(status, gin.H{"data": rcpt})
}

// remove deletes a recipient.
func (h *recipientsHandler) remove(c *gin.Context) {
	id := c.Param("id")
	if err := h.svc.DeleteRecipient(c.GetString("workspace_id"), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	service.WriteAudit(h.db, c.Request.Context(), c.GetString("user_id"),
		service.AuditRecipientRemoved, "recipient", id, nil, c.ClientIP())
	c.JSON(http.StatusOK, gin.H{"message": "recipient removed"})
}

// resendVerification re-sends the verification link for one recipient.
func (h *recipientsHandler) resendVerification(c *gin.Context) {
	var src service.Recipient
	if err := h.db.Where("id = ? AND workspace_id = ?", c.Param("id"), c.GetString("workspace_id")).
		First(&src).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "recipient not found"})
		return
	}
	if src.Verified {
		c.JSON(http.StatusBadRequest, gin.H{"error": "recipient is already verified"})
		return
	}
	if err := h.sendVerification(&src); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "verification email sent"})
}

// unsubscribe toggles suppression so the address is never emailed again.
func (h *recipientsHandler) setSuppressed(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Suppressed bool `json:"suppressed"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "suppressed boolean is required"})
		return
	}
	result := h.db.Model(&service.Recipient{}).
		Where("id = ? AND workspace_id = ?", id, c.GetString("workspace_id")).
		Updates(map[string]interface{}{
			"suppressed":         req.Suppressed,
			"suppression_reason": map[bool]string{true: "manual", false: ""}[req.Suppressed],
		})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "recipient not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

// sendVerification emails a signed verify link to the recipient owner.
func (h *recipientsHandler) sendVerification(rcpt *service.Recipient) error {
	token := SignRecipientToken(cfg.JWTSecret, rcpt.WorkspaceID, rcpt.Email, 72*time.Hour)
	verifyURL := cfg.FrontendOrigin + "/verify-recipient?token=" + token + "&email=" + rcpt.Email
	_, html := appmail.RenderNotificationHTML(
		"Confirm your subscription",
		"You have been added as a reader on Cadensend. Confirm this email address to start receiving series issues.",
		"Confirm subscription",
		verifyURL,
	)
	return sendTestEmail(rcpt.Email, "Confirm your subscription", html)
}

// publicVerify marks a recipient verified from an emailed link. Public route.
func (h *recipientsHandler) publicVerify(c *gin.Context) {
	token := strings.TrimSpace(c.Query("token"))
	email := strings.ToLower(strings.TrimSpace(c.Query("email")))
	if token == "" || email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing token or email"})
		return
	}

	var rcpt service.Recipient
	if err := h.db.Where("email = ?", email).First(&rcpt).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no pending subscription for this email"})
		return
	}
	if !VerifyRecipientToken(cfg.JWTSecret, rcpt.WorkspaceID, rcpt.Email, token) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired verification link"})
		return
	}

	now := time.Now().UTC()
	h.db.Model(&service.Recipient{}).Where("id = ?", rcpt.ID).Updates(map[string]interface{}{
		"verified":    true,
		"verified_at": now,
	})
	service.WriteAudit(h.db, c.Request.Context(), rcpt.ID,
		service.AuditRecipientVerified, "recipient", rcpt.ID,
		map[string]interface{}{"email": rcpt.Email}, c.ClientIP())

	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:64px;">
<h2>Subscription confirmed</h2><p style="color:#57534e;">`+html.EscapeString(rcpt.Email)+` will now receive issues. You can close this tab.</p></body></html>`)
}

// publicUnsubscribeForm renders the unsubscribe confirmation page. Email
// scanners prefetch links with GET, so the state change deliberately happens
// only on the POST from this page.
func (h *recipientsHandler) publicUnsubscribeForm(c *gin.Context) {
	token := strings.TrimSpace(c.Query("token"))
	email := strings.ToLower(strings.TrimSpace(c.Query("email")))
	if token == "" || email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing token or email"})
		return
	}
	var rcpt service.Recipient
	if err := h.db.Where("email = ?", email).First(&rcpt).Error; err != nil {
		renderSimplePage(c, http.StatusNotFound, "Unknown address", "This address is not subscribed.")
		return
	}
	if !VerifyUnsubscribeToken(cfg.JWTSecret, rcpt.WorkspaceID, rcpt.Email, token) {
		renderSimplePage(c, http.StatusBadRequest, "Link expired", "This unsubscribe link is invalid or has expired.")
		return
	}
	if rcpt.Suppressed {
		renderSimplePage(c, http.StatusOK, "Already unsubscribed", html.EscapeString(rcpt.Email)+" is not receiving issues.")
		return
	}

	page := `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:64px;">
<h2>Unsubscribe</h2>
<p style="color:#57534e;">Stop sending issues to <strong>` + html.EscapeString(rcpt.Email) + `</strong>?</p>
<form method="post" action="/api/v1/webhooks/unsubscribe" style="margin-top:24px;">
<input type="hidden" name="token" value="` + html.EscapeString(token) + `">
<input type="hidden" name="email" value="` + html.EscapeString(email) + `">
<button type="submit" style="background:#1c1917;color:#fff;border:none;border-radius:8px;padding:11px 22px;font-size:14px;cursor:pointer;">Confirm unsubscribe</button>
</form></body></html>`
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, page)
}

// publicUnsubscribeConfirm performs the suppression behind the confirmation.
func (h *recipientsHandler) publicUnsubscribeConfirm(c *gin.Context) {
	token := strings.TrimSpace(c.PostForm("token"))
	email := strings.ToLower(strings.TrimSpace(c.PostForm("email")))
	if token == "" || email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing token or email"})
		return
	}
	var rcpt service.Recipient
	if err := h.db.Where("email = ?", email).First(&rcpt).Error; err != nil {
		renderSimplePage(c, http.StatusNotFound, "Unknown address", "This address is not subscribed.")
		return
	}
	if !VerifyUnsubscribeToken(cfg.JWTSecret, rcpt.WorkspaceID, rcpt.Email, token) {
		renderSimplePage(c, http.StatusBadRequest, "Link expired", "This unsubscribe link is invalid or has expired.")
		return
	}
	h.db.Model(&service.Recipient{}).Where("id = ?", rcpt.ID).Updates(map[string]interface{}{
		"suppressed":         true,
		"suppression_reason": "unsubscribed",
	})
	service.WriteAudit(h.db, c.Request.Context(), rcpt.ID,
		"recipient.unsubscribed", "recipient", rcpt.ID,
		map[string]interface{}{"email": rcpt.Email}, c.ClientIP())

	renderSimplePage(c, http.StatusOK, "You are unsubscribed", html.EscapeString(rcpt.Email)+" will not receive further issues.")
}

func renderSimplePage(c *gin.Context, status int, title, message string) {
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(status, `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:64px;">
<h2>`+html.EscapeString(title)+`</h2><p style="color:#57534e;">`+message+`</p></body></html>`)
}
