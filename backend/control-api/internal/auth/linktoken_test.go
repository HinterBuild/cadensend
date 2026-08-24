package auth

import (
	"strings"
	"testing"
	"time"
)

func TestRecipientTokenRoundTrip(t *testing.T) {
	secret := "test-secret"
	workspace := "11111111-1111-1111-1111-111111111111"
	email := "reader@example.com"

	token := SignRecipientToken(secret, workspace, email, time.Hour)
	if token == "" || !strings.Contains(token, ".") {
		t.Fatalf("token should be expires.signature, got %q", token)
	}
	if !VerifyRecipientToken(secret, workspace, email, token) {
		t.Fatal("freshly signed token must verify")
	}

	if VerifyRecipientToken("wrong-secret", workspace, email, token) {
		t.Fatal("wrong secret must fail")
	}
	if VerifyRecipientToken(secret, workspace, "someone-else@example.com", token) {
		t.Fatal("token bound to another address must fail")
	}
	if !VerifyRecipientToken(secret, workspace, strings.ToUpper(email), token) {
		t.Fatal("email comparison must be case-insensitive (addresses are normalized)")
	}
}

func TestRecipientTokenExpiry(t *testing.T) {
	secret := "s"
	w := "22222222-2222-2222-2222-222222222222"
	e := "expired@example.com"

	token := SignRecipientToken(secret, w, e, -time.Minute)
	if VerifyRecipientToken(secret, w, e, token) {
		t.Fatal("expired token must not verify")
	}
}

func TestUnsubscribeTokenSeparateFromVerify(t *testing.T) {
	secret := "s"
	w := "33333333-3333-3333-3333-333333333333"
	e := "a@b.co"

	unsub := SignUnsubscribeToken(secret, w, e, time.Hour)
	if VerifyRecipientToken(secret, w, e, unsub) {
		t.Fatal("unsubscribe token must not satisfy verification")
	}
	if !VerifyUnsubscribeToken(secret, w, e, unsub) {
		t.Fatal("unsubscribe token must verify for its own purpose")
	}
}

func TestConstantTimeEqual(t *testing.T) {
	if ConstantTimeEqual("abc", "abd") {
		t.Fatal("different secrets must not match")
	}
	if !ConstantTimeEqual("same", "same") {
		t.Fatal("equal secrets must match")
	}
	if ConstantTimeEqual("short", "longer-string") {
		t.Fatal("different lengths must never match")
	}
}
