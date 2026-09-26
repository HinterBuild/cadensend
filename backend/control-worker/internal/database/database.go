// Package database provides database connection management for the control worker
package database

import (
	"log"
	"os"
	"sync"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormLogger "gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

var (
	dbInstance *gorm.DB
	once       sync.Once
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
		sqlDB.SetMaxIdleConns(5)
		sqlDB.SetMaxOpenConns(25)
		sqlDB.SetConnMaxLifetime(0)

		log.Println("Database connection established")
	})
}

// ConfigurePool applies connection pool limits (call after Init).
func ConfigurePool(maxIdle, maxOpen int, maxLifetime time.Duration) {
	if dbInstance == nil {
		return
	}
	sqlDB, err := dbInstance.DB()
	if err != nil {
		log.Printf("ConfigurePool: %v", err)
		return
	}
	if maxIdle > 0 {
		sqlDB.SetMaxIdleConns(maxIdle)
	}
	if maxOpen > 0 {
		sqlDB.SetMaxOpenConns(maxOpen)
	}
	if maxLifetime > 0 {
		sqlDB.SetConnMaxLifetime(maxLifetime)
	}
	log.Printf("Database pool: max_idle=%d max_open=%d max_lifetime=%s", maxIdle, maxOpen, maxLifetime)
}

// Get returns the shared database handle, connecting on first use. Init's
// sync.Once makes this safe to call from multiple goroutines.
func Get() *gorm.DB {
	if dbInstance == nil {
		Init("")
	}
	return dbInstance
}
