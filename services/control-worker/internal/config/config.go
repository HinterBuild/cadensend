// Package config provides configuration for the control worker
package config

import (
    "os"
    "strconv"
    "time"
    "log"
)

// Config holds all configuration values
type Config struct {
    Host          string
    Port          string
    Env           string
    LogLevel      string
    DatabaseURL   string
    RedisURL      string
    JWTSecret     string
    JWTExpiry     time.Duration
    SendGridAPIKey string
    SMTPFrom      string
    OTELEndpoint  string
}

// LoadConfig loads configuration from environment variables
func LoadConfig() *Config {
    cfg := &Config{
        Host:     getEnv("HOST", "0.0.0.0"),
        Port:     getEnv("PORT", "8081"),
        Env:      getEnv("ENV", "development"),
        LogLevel: getEnv("LOG_LEVEL", "info"),
        DatabaseURL: getEnv("DATABASE_URL", "postgres://cadensend:cadensend@localhost:5432/cadensend?sslmode=disable"),
        RedisURL: getEnv("REDIS_URL", "redis://localhost:6379/0"),
        JWTSecret: getEnv("JWT_SECRET", "change-this-in-production"),
        JWTExpiry: time.Hour * 24,
        SendGridAPIKey: getEnv("SENDGRID_API_KEY", ""),
        SMTPFrom: getEnv("SMTP_FROM", "no-reply@cadensend.app"),
        OTELEndpoint: getEnv("OTEL_ENDPOINT", "http://localhost:4318"),
    }

    if expiry := getEnv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"); expiry != "" {
        if minutes, err := strconv.Atoi(expiry); err == nil {
            cfg.JWTExpiry = time.Duration(minutes) * time.Minute
        }
    }

    log.Printf("Config loaded: env=%s, port=%s", cfg.Env, cfg.Port)
    return cfg
}

func getEnv(key, defaultValue string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return defaultValue
}
