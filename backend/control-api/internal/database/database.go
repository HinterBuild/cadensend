// Package database provides database connection management for the control API
package database

import (
	"fmt"
	"log"
	"os"
	"sync"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormLogger "gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

var (
	dbInstance *gorm.DB
	once       sync.Once
	mu         sync.RWMutex
)

// Init initializes the database connection pool
func Init(databaseURL string) {
	once.Do(func() {
		url := databaseURL
		if url == "" {
			url = os.Getenv("DATABASE_URL")
		}
		if url == "" {
			log.Fatal("DATABASE_URL environment variable not set")
		}

		var err error
		dbInstance, err = gorm.Open(postgres.Open(url), &gorm.Config{
			NamingStrategy: schema.NamingStrategy{
				SingularTable: false,
			},
			Logger: gormLogger.Default.LogMode(gormLogger.Warn),
		})

		if err != nil {
			log.Fatalf("Failed to connect to database: %v", err)
		}

		sqlDB, err := dbInstance.DB()
		if err != nil {
			log.Fatalf("Failed to get database connection: %v", err)
		}

		sqlDB.SetMaxIdleConns(10)
		sqlDB.SetMaxOpenConns(100)
		sqlDB.SetConnMaxLifetime(0)

		log.Println("Database connection established")
	})
}

// Get returns the database instance
func Get() *gorm.DB {
	if dbInstance == nil {
		Init("")
	}

	mu.RLock()
	defer mu.RUnlock()

	return dbInstance
}

// Close closes the database connection
func Close() error {
	if dbInstance == nil {
		return nil
	}

	sqlDB, err := dbInstance.DB()
	if err != nil {
		return fmt.Errorf("failed to get database connection: %w", err)
	}

	if err := sqlDB.Close(); err != nil {
		return fmt.Errorf("failed to close database: %w", err)
	}

	dbInstance = nil
	return nil
}

// AutoMigrate runs database migrations
func AutoMigrate(models ...interface{}) error {
	if dbInstance == nil {
		Init("")
	}

	return dbInstance.AutoMigrate(models...)
}

// EnsureAppSchema applies additive column changes that initdb scripts miss
// on existing Postgres volumes.
func EnsureAppSchema() error {
	if dbInstance == nil {
		Init("")
	}

	statements := []string{
		`ALTER TABLE sources ADD COLUMN IF NOT EXISTS series_id UUID`,
		`CREATE INDEX IF NOT EXISTS idx_sources_series ON sources(series_id)`,
		`ALTER TABLE sources ADD COLUMN IF NOT EXISTS ingest_error TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE sources ADD COLUMN IF NOT EXISTS duplicate_of UUID`,
		`ALTER TABLE sources ADD COLUMN IF NOT EXISTS chunk_count INTEGER NOT NULL DEFAULT 0`,
		`CREATE INDEX IF NOT EXISTS idx_sources_content_hash ON sources(workspace_id, content_hash)`,
		`ALTER TABLE sources ADD COLUMN IF NOT EXISTS injection_status VARCHAR(20) NOT NULL DEFAULT 'clean'`,
		`ALTER TABLE sources ADD COLUMN IF NOT EXISTS injection_findings JSONB`,
		`CREATE INDEX IF NOT EXISTS idx_sources_injection_status ON sources(workspace_id, injection_status)`,
		`CREATE INDEX IF NOT EXISTS idx_schedules_issue ON schedules(issue_id)`,
		`CREATE INDEX IF NOT EXISTS idx_deliveries_recipient_status ON deliveries(recipient_id, status)`,
		`CREATE INDEX IF NOT EXISTS idx_deliveries_issue_status ON deliveries(issue_id, status)`,
		`ALTER TABLE issues ADD COLUMN IF NOT EXISTS content_json JSONB`,
		`ALTER TABLE issues ADD COLUMN IF NOT EXISTS generate_error TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE series ADD COLUMN IF NOT EXISTS plan_status VARCHAR(50) NOT NULL DEFAULT ''`,
		`ALTER TABLE series ADD COLUMN IF NOT EXISTS plan_json JSONB`,
		`ALTER TABLE series ADD COLUMN IF NOT EXISTS plan_error TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE series ADD COLUMN IF NOT EXISTS cadence VARCHAR(50) NOT NULL DEFAULT 'weekly'`,
		`ALTER TABLE series ADD COLUMN IF NOT EXISTS start_date VARCHAR(20) NOT NULL DEFAULT ''`,
		`ALTER TABLE series ADD COLUMN IF NOT EXISTS send_time VARCHAR(20) NOT NULL DEFAULT '09:00'`,
		`ALTER TABLE series ADD COLUMN IF NOT EXISTS send_days TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE series ADD COLUMN IF NOT EXISTS manual_approval BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_model TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1`,
		`ALTER TABLE recipients ADD COLUMN IF NOT EXISTS suppressed BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE recipients ADD COLUMN IF NOT EXISTS suppression_reason VARCHAR(50) NOT NULL DEFAULT ''`,
		`ALTER TABLE recipients ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE`,
		`ALTER TABLE generation_runs ADD COLUMN IF NOT EXISTS error_msg TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE series ADD COLUMN IF NOT EXISTS skill_id VARCHAR(64) NOT NULL DEFAULT ''`,
		`ALTER TABLE series ADD COLUMN IF NOT EXISTS workflow_mode VARCHAR(64) NOT NULL DEFAULT 'default'`,
		`CREATE TABLE IF NOT EXISTS workspace_email_config (
			workspace_id UUID PRIMARY KEY,
			provider VARCHAR(32) NOT NULL DEFAULT 'brevo',
			from_email VARCHAR(255) NOT NULL DEFAULT '',
			from_name VARCHAR(255) NOT NULL DEFAULT '',
			config JSONB NOT NULL DEFAULT '{}',
			verified BOOLEAN NOT NULL DEFAULT FALSE,
			is_active BOOLEAN NOT NULL DEFAULT TRUE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS workspace_platform_config (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL,
			catalog_id VARCHAR(64) NOT NULL,
			enabled BOOLEAN NOT NULL DEFAULT TRUE,
			config JSONB NOT NULL DEFAULT '{}',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE (workspace_id, catalog_id)
		)`,
		`CREATE TABLE IF NOT EXISTS connector_sync_runs (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL,
			connector_id VARCHAR(64) NOT NULL,
			status VARCHAR(32) NOT NULL DEFAULT 'pending',
			items_fetched INTEGER NOT NULL DEFAULT 0,
			items_ingested INTEGER NOT NULL DEFAULT 0,
			error TEXT NOT NULL DEFAULT '',
			started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			finished_at TIMESTAMPTZ
		)`,
		`CREATE TABLE IF NOT EXISTS editorial_assets (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL,
			asset_type VARCHAR(64) NOT NULL,
			name VARCHAR(256) NOT NULL DEFAULT '',
			data JSONB NOT NULL DEFAULT '{}',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
	}

	for _, stmt := range statements {
		if err := dbInstance.Exec(stmt).Error; err != nil {
			return fmt.Errorf("%s: %w", stmt, err)
		}
	}
	return nil
}
