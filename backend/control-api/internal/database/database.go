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
		`ALTER TABLE issues ADD COLUMN IF NOT EXISTS content_json JSONB`,
		`ALTER TABLE issues ADD COLUMN IF NOT EXISTS generate_error TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE series ADD COLUMN IF NOT EXISTS plan_status VARCHAR(50) NOT NULL DEFAULT ''`,
		`ALTER TABLE series ADD COLUMN IF NOT EXISTS plan_json JSONB`,
		`ALTER TABLE series ADD COLUMN IF NOT EXISTS plan_error TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_model TEXT NOT NULL DEFAULT ''`,
	}

	for _, stmt := range statements {
		if err := dbInstance.Exec(stmt).Error; err != nil {
			return fmt.Errorf("%s: %w", stmt, err)
		}
	}
	return nil
}
