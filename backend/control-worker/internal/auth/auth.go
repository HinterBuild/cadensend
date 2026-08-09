// Package auth provides authentication utilities for the control worker
package auth

import (
    "crypto/sha256"
    "encoding/hex"
    "github.com/golang-jwt/jwt/v5"
    "errors"
    "time"
)

// Claims represents JWT claims
type Claims struct {
    UserID      string `json:"user_id"`
    WorkspaceID string `json:"workspace_id"`
    Email       string `json:"email"`
    Role        string `json:"role"`
    jwt.RegisteredClaims
}

// ValidateJWT validates a JWT token
func ValidateJWT(tokenString, secret string) (*Claims, error) {
    token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
        return []byte(secret), nil
    })

    if err != nil {
        return nil, err
    }

    if claims, ok := token.Claims.(*Claims); ok && token.Valid {
        return claims, nil
    }

    return nil, errors.New("invalid token")
}

// GenerateWorkerToken generates a JWT token for worker-to-worker communication
func GenerateWorkerToken(secret, workerID string, expiry time.Duration) (string, error) {
    claims := &Claims{
        UserID:      workerID,
        WorkspaceID: "system",
        Email:       "worker@cadensend.app",
        Role:        "worker",
        RegisteredClaims: jwt.RegisteredClaims{
            IssuedAt:  jwt.NewNumericDate(time.Now()),
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiry)),
            Issuer:    "cadensend-control-worker",
        },
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString([]byte(secret))
}

// HashToken generates a hash of a token for idempotency
func HashToken(token string) string {
    hash := sha256.Sum256([]byte(token))
    return hex.EncodeToString(hash[:])
}
