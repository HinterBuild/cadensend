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
