// Package auth: HMAC-signed, expiring tokens for emailed recipient links.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"time"
)

const (
	PurposeRecipientVerify = "recipient-verify"
	PurposeUnsubscribe     = "recipient-unsubscribe"
)

var ErrInvalidLinkToken = errors.New("invalid or expired link token")

func signPurposeToken(purpose, secret, workspaceID, email string, expiresAt time.Time) string {
	expires := strconv.FormatInt(expiresAt.Unix(), 10)
	payload := purpose + ":" + workspaceID + ":" + strings.ToLower(email) + ":" + expires
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	return expires + "." + hex.EncodeToString(mac.Sum(nil))
}

func verifyPurposeToken(purpose, secret, workspaceID, email, token string, now time.Time) bool {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return false
	}
	expires, sigHex := parts[0], parts[1]
	ts, err := strconv.ParseInt(expires, 10, 64)
	if err != nil || now.Unix() > ts {
		return false
	}
	payload := purpose + ":" + workspaceID + ":" + strings.ToLower(email) + ":" + expires
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	expected := mac.Sum(nil)
	provided, err := hex.DecodeString(sigHex)
	if err != nil || !hmac.Equal(expected, provided) {
		return false
	}
	return true
}

// SignRecipientToken produces an HMAC-signed, expiring token binding a
// recipient email to its workspace for verification links.
func SignRecipientToken(secret, workspaceID, email string, ttl time.Duration) string {
	return signPurposeToken(PurposeRecipientVerify, secret, workspaceID, email, time.Now().Add(ttl))
}

// VerifyRecipientToken validates a signed verification token.
func VerifyRecipientToken(secret, workspaceID, email, token string) bool {
	return verifyPurposeToken(PurposeRecipientVerify, secret, workspaceID, email, token, time.Now())
}

// SignUnsubscribeToken produces the long-lived one-click unsubscribe token.
func SignUnsubscribeToken(secret, workspaceID, email string, ttl time.Duration) string {
	return signPurposeToken(PurposeUnsubscribe, secret, workspaceID, email, time.Now().Add(ttl))
}

// VerifyUnsubscribeToken validates an unsubscribe link token.
func VerifyUnsubscribeToken(secret, workspaceID, email, token string) bool {
	return verifyPurposeToken(PurposeUnsubscribe, secret, workspaceID, email, token, time.Now())
}

// ConstantTimeEqual compares two secrets without leaking length-timing.
func ConstantTimeEqual(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	var v byte
	for i := 0; i < len(a); i++ {
		v |= a[i] ^ b[i]
	}
	return v == 0
}
