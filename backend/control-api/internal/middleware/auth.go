// Package middleware provides HTTP middleware for the control API
package middleware

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "net"
    "net/http"
    "strings"
    "sync"
    "time"

    "github.com/gin-gonic/gin"
    "github.com/golang-jwt/jwt/v5"
    "gorm.io/gorm"
)

// Claims represents JWT claims
type Claims struct {
    UserID       string `json:"user_id"`
    WorkspaceID  string `json:"workspace_id"`
    Email        string `json:"email"`
    Role         string `json:"role"`
    TokenVersion int    `json:"tok_ver,omitempty"`
    jwt.RegisteredClaims
}

// versionCache is a tiny TTL cache so the revocation check does not hit
// Postgres on every request. A logout-everywhere takes effect within the TTL.
type versionCache struct {
    mu   sync.RWMutex
    vals map[string]versionEntry
    ttl  time.Duration
}

type versionEntry struct {
    version int
    at      time.Time
}

func newVersionCache(ttl time.Duration) *versionCache {
    return &versionCache{vals: map[string]versionEntry{}, ttl: ttl}
}

func (c *versionCache) get(userID string) (int, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()
    e, ok := c.vals[userID]
    if !ok || time.Since(e.at) > c.ttl {
        return 0, false
    }
    return e.version, true
}

func (c *versionCache) set(userID string, v int) {
    c.mu.Lock()
    defer c.mu.Unlock()
    if len(c.vals) > 10000 {
        c.vals = map[string]versionEntry{}
    }
    c.vals[userID] = versionEntry{version: v, at: time.Now()}
}

// JWTMiddleware validates JWT tokens and enforces session revocation by
// comparing the claim's token version against the value stored on the user.
func JWTMiddleware(jwtSecret string, db *gorm.DB) gin.HandlerFunc {
    cache := newVersionCache(15 * time.Second)
    return func(c *gin.Context) {
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authorization header required"})
            return
        }

        token := strings.TrimPrefix(authHeader, "Bearer ")

        parsedToken, err := jwt.ParseWithClaims(token, &Claims{}, func(token *jwt.Token) (interface{}, error) {
            if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
                return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
            }
            return []byte(jwtSecret), nil
        })

        if err != nil || !parsedToken.Valid {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
            return
        }

        claims, ok := parsedToken.Claims.(*Claims)
        if !ok || claims.UserID == "" {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid claims"})
            return
        }

        // Session revocation: reject tokens minted before a version bump.
        current := -1
        if cached, ok := cache.get(claims.UserID); ok {
            current = cached
        } else if db != nil {
            var v int
            if err := db.WithContext(c.Request.Context()).
                Table("users").Select("COALESCE(token_version, 1)").
                Where("id = ? AND deleted_at IS NULL", claims.UserID).
                Scan(&v).Error; err == nil && v > 0 {
                current = v
                cache.set(claims.UserID, v)
            }
        }
        if current >= 0 && claims.TokenVersion != current {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "session revoked"})
            return
        }

        c.Set("user_id", claims.UserID)
        c.Set("workspace_id", claims.WorkspaceID)
        c.Set("email", claims.Email)
        c.Set("role", claims.Role)

        c.Next()
    }
}

// rateLimiter is a fixed-window counter per key. Deliberately dependency-free
// so it works in every deployment without external services.
type rateLimiter struct {
    mu      sync.Mutex
    buckets map[string]*rateBucket
    limit   int
    window  time.Duration
}

type rateBucket struct {
    count     int
    windowEnd time.Time
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
    rl := &rateLimiter{buckets: map[string]*rateBucket{}, limit: limit, window: window}
    go func() {
        for range time.Tick(window * 10) {
            rl.mu.Lock()
            now := time.Now()
            for k, b := range rl.buckets {
                if now.After(b.windowEnd.Add(window)) {
                    delete(rl.buckets, k)
                }
            }
            rl.mu.Unlock()
        }
    }()
    return rl
}

func (rl *rateLimiter) allow(key string) bool {
    rl.mu.Lock()
    defer rl.mu.Unlock()
    now := time.Now()
    b, ok := rl.buckets[key]
    if !ok || now.After(b.windowEnd) {
        rl.buckets[key] = &rateBucket{count: 1, windowEnd: now.Add(rl.window)}
        return true
    }
    if b.count >= rl.limit {
        return false
    }
    b.count++
    return true
}

// RateLimitMiddleware applies a fixed-window limit per client IP. Sensitive
// endpoints (auth) get a much tighter budget than general API traffic and are
// additionally keyed by the submitted account so that many users behind one
// proxy address cannot lock each other out.
func RateLimitMiddleware() gin.HandlerFunc {
	authLimits := map[string]int{
		"POST:/v1/users/login":             10,
		"POST:/v1/users":                   5,
		"POST:/v1/users/magic-link":        5,
		"POST:/v1/users/magic-link/verify": 20,
		"POST:/v1/users/forgot-password":   5,
		"POST:/v1/users/reset-password":    10,
	}
	sensitive := map[string]*rateLimiter{}
	for key, limit := range authLimits {
		sensitive[key] = newRateLimiter(limit, time.Minute)
	}
	general := newRateLimiter(600, time.Minute)

	return func(c *gin.Context) {
		path := c.Request.URL.Path
		if path == "/healthz" || path == "/metrics" || path == "/version" {
			c.Next()
			return
		}

		ip := clientIP(c.Request.RemoteAddr, c.GetHeader("X-Forwarded-For"))

		// Webhooks come from the email provider; do not throttle them.
		if strings.HasPrefix(path, "/v1/webhooks/") {
			c.Next()
			return
		}

		key := ip
		if limiter, ok := sensitive[c.Request.Method+":"+path]; ok {
			if account := peekAccountIdentifier(c); account != "" {
				key = ip + "|" + account
			}
			if !limiter.allow(key) {
				c.Header("Retry-After", "60")
				c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many requests, slow down"})
				return
			}
			c.Next()
			return
		}

		if !general.allow(ip) {
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded"})
			return
		}
		c.Next()
	}
}

// peekAccountIdentifier extracts a bounded identifier (email/token) from a
// JSON body without consuming it downstream.
func peekAccountIdentifier(c *gin.Context) string {
	if c.Request.Body == nil || c.Request.ContentLength > 64<<10 {
		return ""
	}
	raw, err := io.ReadAll(io.LimitReader(c.Request.Body, 8<<10))
	if err != nil {
		return ""
	}
	// Restore the body for the handler.
	c.Request.Body = io.NopCloser(bytes.NewBuffer(raw))

	var probe struct {
		Email string `json:"email"`
		Token string `json:"token"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return ""
	}
	id := strings.ToLower(strings.TrimSpace(probe.Email))
	if id == "" {
		id = probe.Token
	}
	if len(id) > 254 {
		id = id[:254]
	}
	return id
}

// clientIP resolves the originating address. X-Forwarded-For is honored
// only when the immediate peer is a trusted (private/loopback) hop such as
// the Next.js proxy or a reverse proxy; otherwise a caller could spoof the
// header to escape per-IP limits.
func clientIP(remoteAddr, xff string) string {
	host := remoteAddr
	if idx := strings.LastIndex(host, ":"); idx > 0 {
		if trimmed := strings.Trim(host[:idx], "[]"); isTrustedProxyIP(trimmed) && xff != "" {
			parts := strings.Split(xff, ",")
			if candidate := strings.TrimSpace(parts[0]); candidate != "" {
				return candidate
			}
		}
		host = host[:idx]
	}
	return strings.Trim(host, "[]")
}

// isTrustedProxyIP reports whether addr is loopback or RFC1918/link-local.
func isTrustedProxyIP(addr string) bool {
	ip := net.ParseIP(addr)
	if ip == nil {
		return false
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast()
}
