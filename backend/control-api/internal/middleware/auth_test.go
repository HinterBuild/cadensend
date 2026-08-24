package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestRateLimiterAllowsWithinLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RateLimitMiddleware())
	router.POST("/v1/users/login", func(c *gin.Context) { c.Status(http.StatusOK) })

	for i := 0; i < 10; i++ {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/v1/users/login", nil)
		req.RemoteAddr = "203.0.113.10:5555"
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("request %d expected 200, got %d", i+1, rec.Code)
		}
	}

	// 11th attempt from the same IP within the window is throttled.
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/users/login", nil)
	req.RemoteAddr = "203.0.113.10:5556"
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after exhausting the login budget, got %d", rec.Code)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Fatal("expected Retry-After header on throttled responses")
	}
}

func TestRateLimiterIsPerIP(t *testing.T) {
	limiter := newRateLimiter(2, time.Minute)
	if !limiter.allow("198.51.100.1:k") || !limiter.allow("198.51.100.1:k") {
		t.Fatal("first two requests should pass")
	}
	if limiter.allow("198.51.100.1:k") {
		t.Fatal("third request from same key should be blocked")
	}
	if !limiter.allow("198.51.100.2:k") {
		t.Fatal("different key should have its own budget")
	}
}

func TestWebhooksSkipRateLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RateLimitMiddleware())
	router.POST("/v1/webhooks/email/brevo", func(c *gin.Context) { c.Status(http.StatusOK) })

	for i := 0; i < 50; i++ {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/email/brevo", nil)
		req.RemoteAddr = "192.0.2.7:9"
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("webhook request %d should never be throttled, got %d", i+1, rec.Code)
		}
	}
}

func TestSecurityHeadersPresent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(SecurityHeadersMiddleware(false))
	router.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/x", nil))

	if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("missing X-Content-Type-Options")
	}
	if rec.Header().Get("X-Frame-Options") != "DENY" {
		t.Fatal("missing X-Frame-Options")
	}
	if rec.Header().Get("Strict-Transport-Security") == "" {
		t.Fatal("production mode must set HSTS")
	}
	if rec.Header().Get("Content-Security-Policy") == "" {
		t.Fatal("production mode must set CSP")
	}
}

func TestRequestIDMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var seenID string
	router := gin.New()
	router.Use(RequestIDMiddleware())
	router.GET("/x", func(c *gin.Context) {
		seenID = c.GetString("request_id")
		c.Status(http.StatusOK)
	})

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/x", nil))
	if seenID == "" {
		t.Fatal("request id must be generated when absent")
	}
	if rec.Header().Get("X-Request-ID") != seenID {
		t.Fatal("response must echo the request id")
	}
}
