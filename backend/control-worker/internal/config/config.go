// Package config provides configuration for the control worker
package config

import (
	"log"
	"os"
	"strconv"
	"time"
)

// Config holds all configuration values
type Config struct {
	Host           string
	Port           string
	Env            string
	LogLevel       string
	DatabaseURL    string
	RedisURL       string
	MaxAttempts    int
	JWTSecret      string
	JWTExpiry      time.Duration
	SendGridAPIKey string
	SMTPFrom       string
	OTELEndpoint   string
}

// LoadConfig loads configuration from environment variables
func LoadConfig() *Config {
	cfg := &Config{
		Host:           getEnv("HOST", "0.0.0.0"),
		Port:           getEnv("PORT", "8081"),
		Env:            getEnv("ENV", "development"),
		LogLevel:       getEnv("LOG_LEVEL", "info"),
		DatabaseURL:    getEnv("DATABASE_URL", ""),
		RedisURL:       getEnv("REDIS_URL", "localhost:6379"),
		MaxAttempts:    getEnvInt("MAX_ATTEMPTS", 5),
		JWTSecret:      getEnv("JWT_SECRET", "change-this-in-production"),
		JWTExpiry:      time.Hour * 24,
		SendGridAPIKey: getEnv("SENDGRID_API_KEY", ""),
		SMTPFrom:       getEnv("SMTP_FROM", "noreply@cadensend.app"),
		OTELEndpoint:   getEnv("OTEL_ENDPOINT", "http://localhost:4318"),
	}

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

// getEnvInt retrieves an environment variable as an integer or returns a default value
func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}
