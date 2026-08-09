// Package database provides database connection management for the control worker
package database

import (
    "log"
    "sync"

    "gorm.io/driver/postgres"
    "gorm.io/gorm"
    gormLogger "gorm.io/gorm/logger"
    "gorm.io/gorm/schema"
    "os"
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
            if url == "" {
                url = "postgres://cadensend:cadensend@localhost:5432/cadensend?sslmode=disable"
            }
        }

        var err error
        dbInstance, err = gorm.Open(postgres.Open(url), &gorm.Config{
            NamingStrategy: schema.NamingStrategy{
                SingularTable: true,
            },
            Logger: gormLogger.Default.LogMode(gormLogger.Info),
        })

        if err != nil {
            log.Fatalf("Failed to connect to database: %v", err)
        }

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
        return err
    }

    err = sqlDB.Close()
    if err != nil {
        return err
    }

    dbInstance = nil
    return nil
}
