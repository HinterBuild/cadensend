// Package auth provides authentication utilities for the control API
package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
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

// User represents an authenticated user
type User struct {
	ID            string     `json:"id"`
	Email         string     `json:"email"`
	PasswordHash  string     `json:"-"`
	Name          string     `json:"name"`
	Timezone      string     `json:"timezone"`
	Status        string     `json:"status"`
	WorkspaceID   string     `json:"workspace_id"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	DeletedAt     *time.Time `json:"deleted_at,omitempty"`
	EmailVerified bool       `json:"email_verified"`
}

// GenerateJWT creates a JWT token. tokenVersion enables session revocation:
// bumping the stored version invalidates every token issued before it.
func GenerateJWT(user *User, secret string, expiry time.Duration, tokenVersion int) (string, error) {
	claims := &Claims{
		UserID:       user.ID,
		WorkspaceID:  user.WorkspaceID,
		Email:        user.Email,
		Role:         "user",
		TokenVersion: tokenVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiry)),
			Issuer:    "cadensend",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// ValidateJWT parses and verifies an HS256 token signed by GenerateJWT. It
// rejects any other signing method, so a token with alg=none (or an RSA key
// substituted as an HMAC secret) can't pass.
func ValidateJWT(tokenString, secret string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
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

// GenerateMagicLink generates a cryptographically secure token
func GenerateMagicLink() (string, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", fmt.Errorf("failed to generate token: %w", err)
	}
	return hex.EncodeToString(tokenBytes), nil
}
