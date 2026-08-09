// Package database provides database connection management for the control API
// This package handles database connection pooling, migrations, and session management
package database

import (
    "fmt"
    "log"
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
func Init() {
    once.Do(func() {
        databaseURL := getDatabaseURL()
        
        var err error
        dbInstance, err = gorm.Open(postgres.Open(databaseURL), &gorm.Config{
            NamingStrategy: schema.NamingStrategy{
                SingularTable: true,
            },
            Logger: gormLogger.Default.LogMode(gormLogger.Info),
        })
        
        if err != nil {
            log.Fatalf("Failed to connect to database: %v", err)
        }

        // Configure connection pool
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
        Init()
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
        Init()
    }
    
    return dbInstance.AutoMigrate(models...)
}

func getDatabaseURL() string {
    // In production, use the DATABASE_URL environment variable
    // For development, default to local PostgreSQL
    databaseURL := getenv("DATABASE_URL", "")
    if databaseURL == "" {
        host := getenv("DB_HOST", "localhost")
        port := getenv("DB_PORT", "5432")
        user := getenv("DB_USER", "cadensend")
        password := getenv("DB_PASSWORD", "cadensend")
        dbname := getenv("DB_NAME", "cadensend")
        databaseURL = fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", user, password, host, port, dbname)
    }
    return databaseURL
}

func getenv(key, defaultValue string) string {
    if value := getenv(key); value != "" {
        return value
    }
    return defaultValue
}

func getenv(key string) string {
    return getenv(key)
}
