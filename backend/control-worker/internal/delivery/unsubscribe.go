// Package delivery: one-click unsubscribe link builder.
package delivery

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/url"
	"strconv"
	"strings"
	"time"

	"backend/control-worker/internal/config"
)

const unsubPurpose = "recipient-unsubscribe"

// unsubscribeURLFor builds the per-recipient one-click unsubscribe link
// embedded in subscriber sends. Signed with the shared JWT secret so the
// public endpoint can validate it without extra lookups.
func unsubscribeURLFor(cfg *config.Config, workspaceID, email string) string {
	token := signUnsubToken(cfg.JWTSecret, workspaceID, email, 365*24*time.Hour)
	return strings.TrimRight(cfg.FrontendOrigin, "/") +
		"/api/v1/webhooks/unsubscribe?email=" + url.QueryEscape(email) + "&token=" + token
}

func signUnsubToken(secret, workspaceID, email string, ttl time.Duration) string {
	expires := strconv.FormatInt(time.Now().Add(ttl).Unix(), 10)
	payload := unsubPurpose + ":" + workspaceID + ":" + strings.ToLower(email) + ":" + expires
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	return expires + "." + hex.EncodeToString(mac.Sum(nil))
}
