// Package logger provides structured logging for the control API
// This package configures and initializes the application logger
package logger

import (
	"log/slog"
	"os"
	"time"
)

// Config holds logger configuration
type Config struct {
	Level     string
	Format    string
	UTC       bool
	SkipPaths []string
}

// SetLogger initializes and returns a configured logger
func SetLogger(config *Config) *slog.Logger {
	level := slog.LevelInfo
	if config != nil && config.Level != "" {
		switch config.Level {
		case "debug", "DEBUG":
			level = slog.LevelDebug
		case "warn", "WARN":
			level = slog.LevelWarn
		case "error", "ERROR":
			level = slog.LevelError
		}
	}

	opts := &slog.HandlerOptions{
		Level: level,
	}

	if config != nil && config.UTC {
		opts.ReplaceAttr = func(groups []string, a slog.Attr) slog.Attr {
			if a.Key == slog.TimeKey {
				if t, ok := a.Value.Any().(time.Time); ok {
					return slog.String(slog.TimeKey, t.UTC().Format("2006-01-02T15:04:05.000Z"))
				}
			}
			return a
		}
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, opts))
	slog.SetDefault(logger)

	return logger
}

// GetLogger returns the default logger
func GetLogger() *slog.Logger {
	return slog.Default()
}
