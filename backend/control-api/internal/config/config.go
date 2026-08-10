// Package config provides configuration management for the control API
// This package handles environment variable parsing and application configuration
package config

import (
	"log"
	"os"
	"strconv"
	"time"
)

// Config holds all configuration values
type Config struct {
	// Server settings
	Host     string
	Port     string
	Env      string
	LogLevel string

	// Database settings
	DatabaseURL string

	// Redis settings
	RedisURL string

	// Qdrant settings
	QdrantURL string

	// Object storage settings
	ObjectStorageURL string
	MinIOAccessKey  string
	MinIOSecretKey  string
	MinIOBucketName string

	// Email settings
	EmailProvider  string
	SMTPFrom        string
	SendGridAPIKey  string

	// JWT settings
	JWTSecret     string
	JWTAlgorithm  string
	JWTExpiry     time.Duration

	// Tracing settings
	OTELCollectorURL string

	// Feature flags
	EnableSignup      bool
	EnableMagicLink   bool
	RequireEmailVerify bool
}

// LoadConfig loads configuration from environment variables
func LoadConfig() *Config {
	cfg := &Config{
		Host:              getEnv("HOST", "0.0.0.0"),
		Port:              getEnv("PORT", "8080"),
		Env:               getEnv("ENV", "development"),
		LogLevel:          getEnv("LOG_LEVEL", "info"),
		DatabaseURL:       getEnv("DATABASE_URL", "postgres://cadensend:***@localhost:5432/cadensend?sslmode=disable"),
		RedisURL:          getEnv("REDIS_URL", "redis://localhost:***@cadensend.app"),
		QdrantURL:         getEnv("QDRANT_URL", "http://localhost:6333"),
		ObjectStorageURL:  getEnv("OBJECT_STORAGE_URL", "http://localhost:9000"),
		MinIOAccessKey:    getEnv("MINIO_ACCESS_KEY", "cadensend"),
		MinIOSecretKey:    getEnv("MINIO_SECRET_KEY", "cadensend-secret"),
		MinIOBucketName:   getEnv("MINIO_BUCKET_NAME", "cadensend"),
		EmailProvider:     getEnv("EMAIL_PROVIDER", "sendgrid"),
		SMTPFrom:          getEnv("SMTP_FROM", "noreply@cadensend.app"),
		SendGridAPIKey:    getEnv("SENDGRID_API_KEY", ""),
		JWTSecret:         getEnv("JWT_SECRET", "change-this-in-production"),
		JWTAlgorithm:      getEnv("JWT_ALGORITHM", "HS256"),
		JWTExpiry:         time.Hour * 24,
		OTELCollectorURL:  getEnv("OTEL_COLLECTOR_URL", "http://localhost:4318"),
		EnableSignup:      getEnvBool("ENABLE_SIGNUP", true),
		EnableMagicLink:   getEnvBool("ENABLE_MAGIC_LINK", true),
		RequireEmailVerify: getEnvBool("REQUIRE_EMAIL_VERIFY", false),
	}

	// Parse JWT expiry override
	if expiry := getEnv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"); expiry != "" {
		if minutes, err := strconv.Atoi(expiry); err == nil {
			cfg.JWTExpiry = time.Duration(minutes) * time.Minute
		}
	}

	log.Printf("Config loaded: env=%s, port=%s", cfg.Env, cfg.Port)
	return cfg
}

// getEnv retrieves an environment variable or returns a default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getEnvBool retrieves an environment variable as a boolean or returns a default value
func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolVal, err := strconv.ParseBool(value); err == nil {
			return boolVal
		}
	}
	return defaultValue
}
