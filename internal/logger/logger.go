package logger

import (
    "log"
    "os"

    "github.com/gin-gonic/gin/middleware/logger"
)

// Config holds logger configuration
// This configuration can be extended with log levels, formats, output, etc.
type Config struct {
    Level  string // debug, info, warn, error, fatal
    Output string // stdout, stderr, file path
    UTC    bool   // Use UTC time for logs
    Format string // log format: text, json
}

// DefaultConfig returns the default logger configuration
func DefaultConfig() Config {
    return Config{
        Level:  "info",
        Output: "stdout",
        UTC:    true,
        Format: "text",
    }
}

// NewLogger creates a new logger with the given configuration
func NewLogger(config Config) (*log.Logger, error) {
    // Create output writer
    var output io.Writer

    switch config.Output {
    case "stderr":
        output = os.Stderr
    case "stdout":
        output = os.Stdout
    default:
        // Assume it's a file path
        file, err := os.OpenFile(config.Output, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
        if err != nil {
            return nil, fmt.Errorf("failed to open log file: %w", err)
        }
        output = file
    }

    // Create logger
    logger := log.New(output, "", log.LstdFlags)

    // Set log level based on configuration
    // Note: This is a simple implementation - in a real system,
    // you'd need a more sophisticated logging framework

    return logger, nil
}

// SetLogger returns a Gin logger middleware
// This middleware provides request/response logging
type LoggerConfig struct {
    UTC         bool
    SkipPaths   []string
}

// SetLogger returns a Gin logger middleware
func SetLogger(config *LoggerConfig) gin.HandlerFunc {
    return logger.SetLogger(&logger.Config{
        UTC:        config.UTC,
        SkipPaths:  config.SkipPaths,
    })
}