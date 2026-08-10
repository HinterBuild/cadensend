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
            Logger: gormLogger.Default.LogMode(gormLogger.Info),
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
