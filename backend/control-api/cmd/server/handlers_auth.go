// Package main - authentication and account lifecycle handlers.
package main

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"backend/control-api/internal/auth"
	appmail "backend/control-api/internal/mail"
	"backend/control-api/internal/service"
)

// meHandler returns the authenticated user's own profile.
func meHandler(db *gorm.DB, svc *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetString("user_id")
		user, err := svc.GetUser(userID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": user})
	}
}

// refreshSessionHandler mints a fresh JWT for the caller. The Next.js proxy
// uses it for sliding sessions so active users are never logged out mid-work.
func refreshSessionHandler(db *gorm.DB, svc *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetString("user_id")
		_, token, err := svc.AuthenticateUserByID(userID)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "cannot refresh session"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"token": token})
	}
}

func forgotPasswordHandler(db *gorm.DB, svc *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Email string `json:"email" binding:"required,email"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "a valid email is required"})
			return
		}

		token, user, err := svc.RequestPasswordReset(req.Email)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not start password reset"})
			return
		}

		// Always answer the same way whether or not the account exists,
		// so the endpoint cannot be used to enumerate accounts.
		if user != nil && token != "" {
			resetURL := cfg.FrontendOrigin + "/reset-password?token=" + token
			_, html := appmail.RenderNotificationHTML(
				"Reset your Cadensend password",
				"We received a request to reset the password for your account. This link expires in one hour and can be used once. If you did not request it, you can safely ignore this email.",
				"Choose a new password",
				resetURL,
			)
			if sendErr := sendTestEmail(user.Email, "Reset your Cadensend password", html); sendErr != nil {
				c.JSON(http.StatusBadGateway, gin.H{"error": "could not send the reset email: " + sendErr.Error()})
				return
			}
			service.WriteAudit(db, c.Request.Context(), user.ID, service.AuditPasswordReset, "user", user.ID,
				map[string]interface{}{"flow": "requested"}, c.ClientIP())
		}

		c.JSON(http.StatusOK, gin.H{"message": "if an account exists for that email, a reset link is on its way"})
	}
}

func resetPasswordHandler(db *gorm.DB, svc *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Token       string `json:"token" binding:"required"`
			NewPassword string `json:"new_password" binding:"required,min=8"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "token and an 8+ character new password are required"})
			return
		}
		if err := svc.ResetPassword(req.Token, req.NewPassword); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "password updated; sign in with your new password"})
	}
}

// revokeSessionsHandler invalidates every issued token for the current user
// ("log out everywhere") and returns a fresh token for this device.
func revokeSessionsHandler(db *gorm.DB, svc *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetString("user_id")
		if err := svc.BumpTokenVersion(userID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		service.WriteAudit(db, c.Request.Context(), userID, service.AuditSessionsRevoked, "user", userID, nil, c.ClientIP())

		// Re-mint so this device stays signed in with the new version.
		_, freshToken, err := svc.AuthenticateUserByID(userID)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"message": "all sessions revoked"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "all other sessions revoked", "token": freshToken})
	}
}

// deleteAccountHandler soft-deletes the caller's account and revokes sessions.
func deleteAccountHandler(db *gorm.DB, svc *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("id")
		if !requireOwnUser(c, userID) {
			return
		}
		if err := svc.DeleteUser(userID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		_ = svc.BumpTokenVersion(userID)
		service.WriteAudit(db, c.Request.Context(), userID, service.AuditAccountDeleted, "user", userID, nil, c.ClientIP())
		c.JSON(http.StatusOK, gin.H{"message": "account deleted"})
	}
}

// --- recipient verification links -------------------------------------

const recipientVerifyPurpose = auth.PurposeRecipientVerify
const recipientUnsubPurpose = auth.PurposeUnsubscribe

// SignRecipientToken produces an HMAC-signed, expiring token binding a
// recipient email to its workspace. Used for verified-subscriber links.
func SignRecipientToken(secret, workspaceID, email string, ttl time.Duration) string {
	return auth.SignRecipientToken(secret, workspaceID, email, ttl)
}

// VerifyRecipientToken validates a signed recipient token.
func VerifyRecipientToken(secret, workspaceID, email, token string) bool {
	return auth.VerifyRecipientToken(secret, workspaceID, email, token)
}

// UnsubscribeURL builds the one-click unsubscribe link rendered in sends.
func UnsubscribeURL(workspaceID, email string) string {
	token := auth.SignUnsubscribeToken(cfg.JWTSecret, workspaceID, email, 365*24*time.Hour)
	return cfg.FrontendOrigin + "/api/v1/webhooks/unsubscribe?email=" + email + "&token=" + token
}

// VerifyUnsubscribeToken validates an unsubscribe link token.
func VerifyUnsubscribeToken(secret, workspaceID, email, token string) bool {
	return auth.VerifyUnsubscribeToken(secret, workspaceID, email, token)
}
