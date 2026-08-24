// Package middleware: security headers and request correlation.
package middleware

import (
	"crypto/rand"
	"encoding/hex"

	"github.com/gin-gonic/gin"
)

// SecurityHeadersMiddleware sets baseline hardening headers on every response.
func SecurityHeadersMiddleware(isDev bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()

		// The API serves JSON only; lock down content sniffing and framing.
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

		if isDev {
			// Development runs over plain HTTP behind the Next.js proxy.
			c.Next()
			return
		}

		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		c.Next()
	}
}

// RequestIDMiddleware attaches a correlation ID to every request so logs can
// be traced across services. Honors an incoming X-Request-ID when provided.
func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-ID")
		if id == "" || len(id) > 128 {
			id = newRequestID()
		}
		c.Set("request_id", id)
		c.Writer.Header().Set("X-Request-ID", id)
		c.Next()
	}
}

func newRequestID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "req-unknown"
	}
	return hex.EncodeToString(b)
}
