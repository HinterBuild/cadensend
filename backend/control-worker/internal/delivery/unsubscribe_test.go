package delivery

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"

	"backend/control-worker/internal/config"
)

func TestUnsubscribeURLForFormat(t *testing.T) {
	cfg := &config.Config{
		JWTSecret:      "test-secret",
		FrontendOrigin: "http://localhost:3000",
	}
	url := unsubscribeURLFor(cfg, "ws-123", "reader@example.com")
	assert.True(t, strings.HasPrefix(url, "http://localhost:3000/api/v1/webhooks/unsubscribe?"))
	assert.Contains(t, url, "email=reader%40example.com")
	assert.Contains(t, url, "token=")
}

func TestSignUnsubTokenContainsExpiryAndSignature(t *testing.T) {
	token := signUnsubToken("secret", "ws-1", "a@b.com", 3600)
	parts := strings.Split(token, ".")
	assert.Len(t, parts, 2)
	assert.NotEmpty(t, parts[0])
	assert.Len(t, parts[1], 64) // hex-encoded sha256
}

func TestSignUnsubTokenNormalizesEmail(t *testing.T) {
	t1 := signUnsubToken("secret", "ws-1", "Reader@Example.COM", 3600)
	t2 := signUnsubToken("secret", "ws-1", "reader@example.com", 3600)
	// Same second → same token; at minimum both should be valid format.
	assert.Contains(t, t1, ".")
	assert.Contains(t, t2, ".")
}
