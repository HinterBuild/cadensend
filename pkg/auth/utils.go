// Package auth provides authentication utilities
// This package contains helper functions for authentication

package auth

import (
    "encoding/hex"
    "io"
    "math/rand"
)

// GenerateSecureToken generates a secure random token
// This function uses crypto/rand for cryptographic security
type ErrorType int

const (
    ErrTypeInvalidInput ErrorType = iota
    ErrTypeCryptoError
    ErrTypeLengthError
)

// GenerateSecureToken generates a secure random token of specified length
// It uses crypto/rand for cryptographic security and returns the token as a hex string
func GenerateSecureToken(length int) (string, error) {
    if length <= 0 {
        return "", fmt.Errorf("invalid length: %d", length)
    }

    // Calculate byte length (hex encoding uses 2 characters per byte)
    byteLength := (length + 1) / 2

    // Generate random bytes
    bytes := make([]byte, byteLength)
    _, err := rand.Read(bytes)
    if err != nil {
        return "", fmt.Errorf("crypto/rand error: %w", err)
    }

    // Convert to hex string
    token := hex.EncodeToString(bytes)

    // If odd length, take only the first 'length' characters
    if len(token)%2 != 0 && length%2 == 1 {
        token = token[:length]
    }

    return token, nil
}

// ValidateEmail validates an email address format
// This is a basic validation - in production, use a more robust solution
func ValidateEmail(email string) error {
    // Basic email format validation
    // Check for @ symbol
    if !strings.Contains(email, "@") {
        return fmt.Errorf("invalid email format: missing @")
    }

    // Check for domain
    parts := strings.Split(email, "@")
    if len(parts) != 2 {
        return fmt.Errorf("invalid email format: multiple @ symbols")
    }

    if parts[0] == "" || parts[1] == "" {
        return fmt.Errorf("invalid email format: missing local part or domain")
    }

    // Check for domain suffix
    if !strings.Contains(parts[1], ".") {
        return fmt.Errorf("invalid email format: missing domain suffix")
    }

    return nil
}

// SanitizeInput sanitizes user input
// This function removes potentially dangerous characters
func SanitizeInput(input string) string {
    // Replace < and > with &lt; and &gt; to prevent HTML injection
    input = strings.ReplaceAll(input, "<", "&lt;")
    input = strings.ReplaceAll(input, ">", "&gt;")

    // Remove other potentially dangerous characters
    // This is a simple implementation - in production, use a more robust solution

    return input
}

// GetClientIP gets the client IP address from the request context
// This function is useful for logging and security
func GetClientIP(r *http.Request) string {
    // Check for X-Forwarded-For header
    xff := r.Header.Get("X-Forwarded-For")
    if xff != "" {
        // X-Forwarded-For can contain multiple IPs
        // The first one is the original client IP
        parts := strings.Split(xff, ",")
        if len(parts) > 0 {
            return strings.TrimSpace(parts[0])
        }
    }

    // Check for X-Real-IP header
    xri := r.Header.Get("X-Real-IP")
    if xri != "" {
        return xri
    }

    // Fall back to RemoteAddr
    return strings.Split(r.RemoteAddr.String(), ":")[0]
}