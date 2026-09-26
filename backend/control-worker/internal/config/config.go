// Package config provides configuration for the control worker
package config

import (
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all configuration values
type Config struct {
	Port        string
	Env         string
	LogLevel    string
	DatabaseURL string
	RedisURL    string
	// JWTSecret signs unsubscribe links; control-api verifies them with the
	// same secret, so both services must share it.
	JWTSecret     string
	EmailProvider string
	BrevoAPIKey   string
	BrevoAPIURL   string
	SMTPFrom      string
	SMTPFromName  string

	// Frontend base URL used in alert links.
	FrontendOrigin string

	// Database pool (per replica)
	DBMaxIdleConns    int
	DBMaxOpenConns    int
	DBConnMaxLifetime time.Duration

	// Worker concurrency
	AsynqConcurrency int
}

// LoadConfig loads configuration from environment variables
func LoadConfig() *Config {
	cfg := &Config{
		Port: getEnv("PORT", "8081"),
		// ENVIRONMENT is the documented name (.env.example, ai-engine); ENV
		// is still honored for existing deployments.
		Env:           getEnv("ENVIRONMENT", getEnv("ENV", "development")),
		LogLevel:      getEnv("LOG_LEVEL", "info"),
		DatabaseURL:   getEnv("DATABASE_URL", ""),
		RedisURL:      getEnv("REDIS_URL", "redis://localhost:6379/0"),
		JWTSecret:     getEnv("JWT_SECRET", "change-this-in-production"),
		EmailProvider: getEnv("EMAIL_PROVIDER", ""),
		BrevoAPIKey:   getEnv("BREVO_API_KEY", ""),
		BrevoAPIURL:   getEnv("BREVO_API_URL", ""),
		SMTPFrom:      getEnv("SMTP_FROM", ""),
		SMTPFromName:  getEnv("SMTP_FROM_NAME", ""),

		FrontendOrigin: strings.TrimRight(getEnv("FRONTEND_ORIGIN", "http://localhost:3000"), "/"),

		DBMaxIdleConns:    getEnvInt("DB_MAX_IDLE_CONNS", 5),
		DBMaxOpenConns:    getEnvInt("DB_MAX_OPEN_CONNS", 20),
		DBConnMaxLifetime: time.Duration(getEnvInt("DB_CONN_MAX_LIFETIME_MINUTES", 30)) * time.Minute,
		AsynqConcurrency:  getEnvInt("ASYNQ_CONCURRENCY", 10),
	}

	log.Printf("Config loaded: env=%s, port=%s", cfg.Env, cfg.Port)
	if cfg.Env == "production" {
		switch cfg.JWTSecret {
		case "", "change-this-in-production", "dev-secret-change-in-production", "secret-key":
			log.Fatal("JWT_SECRET must be set to a strong value in production")
		}
	}
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
