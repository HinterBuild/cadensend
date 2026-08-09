// package middleware provides HTTP middleware for the control API
// This middleware handles cross-cutting concerns like authentication, logging, tracing, etc.
package middleware

import (
    "github.com/gin-gonic/gin"
    "github.com/gin-gonic/gin/middleware/logger"
    "github.com/gin-gonic/gin/middleware/recovery"
    "github.com/gin-gonic/gin/middleware/cors"
    "github.com/open-telemetry/opentelemetry-go/api/trace"

    "cadensend/internal/telemetry"
)

// Config holds middleware configuration
// This configuration can be extended with environment variables, configs, etc.
type Config struct {
    CORSAllowedOrigins []string
    EnableTracing     bool
    TracingEndpoint   string
}

// DefaultConfig returns the default middleware configuration
func DefaultConfig() Config {
    return Config{
        CORSAllowedOrigins: []string{"*"},
        EnableTracing:      false,
        TracingEndpoint:    "http://localhost:14268",
    }
}

// NewMiddleware creates a new middleware chain
func NewMiddleware(config Config) gin.HandlerFunc {
    // Create a new router
    r := gin.New()

    // Add recovery middleware first to catch any panics
    r.Use(recovery.Recovery())

    // Add CORS middleware
    if len(config.CORSAllowedOrigins) > 0 {
        corsConfig := cors.Config{
            AllowMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
            AllowHeaders:   []string{"Origin", "Content-Type", "Accept", "Authorization"},
            AllowAllOrigins: len(config.CORSAllowedOrigins) == 1 && config.CORSAllowedOrigins[0] == "*",
        }
        if !corsConfig.AllowAllOrigins && len(config.CORSAllowedOrigins) > 0 {
            corsConfig.AllowOrigins = config.CORSAllowedOrigins
        }
        r.Use(cors.New(corsConfig))
    }

    // Add logger middleware
    r.Use(logger.SetLogger(&logger.Config{
        UTC:            true,
        SkipPaths:      []string{},
    }))

    // Add OpenTelemetry tracing middleware if enabled
    if config.EnableTracing {
        tracer := trace.DefaultTracer()
        r.Use(telemetry.Middleware("cadensend-control-api"))
    }

    return r.Handler()
}

// AuthMiddleware provides JWT authentication
// This middleware validates JWT tokens and adds the claims to the request context
type AuthMiddleware struct {
    jwtSecret []byte
}

// NewAuthMiddleware creates a new auth middleware
func NewAuthMiddleware(jwtSecret string) *AuthMiddleware {
    return &AuthMiddleware{jwtSecret: []byte(jwtSecret)}
}

// Handler returns the auth middleware handler
func (m *AuthMiddleware) Handler() gin.HandlerFunc {
    return func(c *gin.Context) {
        // Check for Authorization header
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authorization header required"})
            return
        }

        // Validate JWT token
        claims, err := m.validateJWT(authHeader)
        if err != nil {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
            return
        }

        // Add claims to request context
        c.Set("user_id", claims.UserID)
        c.Set("workspace_id", claims.WorkspaceID)
        c.Set("email", claims.Email)
        c.Set("role", claims.Role)

        c.Next()
    }
}

// validateJWT validates a JWT token and returns the claims
func (m *AuthMiddleware) validateJWT(authHeader string) (*Claims, error) {
    // Remove "Bearer " prefix if present
    token := strings.TrimPrefix(authHeader, "Bearer ")

    // Parse token
    parsedToken, err := jwt.ParseWithClaims(token, &Claims{}, func(token *jwt.Token) (interface{}, error) {
        if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
        }
        return m.jwtSecret, nil
    })

    if err != nil {
        return nil, fmt.Errorf("failed to parse token: %w", err)
    }

    if claims, ok := parsedToken.Claims.(*Claims); ok && parsedToken.Valid {
        return claims, nil
    }

    return nil, fmt.Errorf("invalid token")
}

// RateLimitMiddleware provides rate limiting
// This middleware limits the number of requests a client can make
type RateLimitMiddleware struct {
    // Could be extended with Redis, in-memory store, etc.
}

// NewRateLimitMiddleware creates a new rate limit middleware
func NewRateLimitMiddleware() *RateLimitMiddleware {
    return &RateLimitMiddleware{}
}

// Handler returns the rate limit middleware handler
func (m *RateLimitMiddleware) Handler() gin.HandlerFunc {
    // For now, this is a placeholder - could be extended with actual rate limiting logic
    return func(c *gin.Context) {
        // Skip rate limiting for health checks
        if c.Request.URL.Path == "/healthz" {
            c.Next()
            return
        }

        // TODO: Implement rate limiting logic here

        c.Next()
    }
}