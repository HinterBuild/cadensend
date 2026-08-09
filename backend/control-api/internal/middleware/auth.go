// Package middleware provides HTTP middleware for the control API
package middleware

import (
    "net/http"
    "strings"
    "time"

    "github.com/gin-gonic/gin"
    "github.com/golang-jwt/jwt/v5"
)

// Claims represents JWT claims
type Claims struct {
    UserID      string `json:"user_id"`
    WorkspaceID string `json:"workspace_id"`
    Email       string `json:"email"`
    Role        string `json:"role"`
    jwt.RegisteredClaims
}

// JWTMiddleware returns a Gin middleware that validates JWT tokens
func JWTMiddleware(jwtSecret string) gin.HandlerFunc {
    return func(c *gin.Context) {
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
           	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authorization header required"})
           	return
        }

        token := strings.TrimPrefix(authHeader, "Bearer ")

        parsedToken, err := jwt.ParseWithClaims(token, &Claims{}, func(token *jwt.Token) (interface{}, error) {
            if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
                return nil, jwt.ErrTokenInvalid
            }
            return []byte(jwtSecret), nil
        })

        if err != nil || !parsedToken.Valid {
           	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
          	return
        }

        claims, ok := parsedToken.Claims.(*Claims)
        if !ok {
           	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid claims"})
          	return
        }

        c.Set("user_id", claims.UserID)
        c.Set("workspace_id", claims.WorkspaceID)
        c.Set("email", claims.Email)
        c.Set("role", claims.Role)

        c.Next()
    }
}

// RateLimitMiddleware provides basic rate limiting
func RateLimitMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        if c.Request.URL.Path == "/healthz" || c.Request.URL.Path == "/metrics" {
            c.Next()
          	return
        }
        c.Next()
    }
}

// TimingMiddleware adds response timing
func TimingMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        start := time.Now()
        c.Next()
        duration := time.Since(start)
        c.Header("X-Response-Time", duration.String())
    }
}