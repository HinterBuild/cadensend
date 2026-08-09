// Package database provides database utilities
// This package handles database connections and initialization
type DatabaseConfig struct {
    URL                string `env:"DATABASE_URL" required:"true"`
    MaxIdleConns       int    `env:"DB_MAX_IDLE_CONNS" default:"10"`
    MaxOpenConns       int    `env:"DB_MAX_OPEN_CONNS" default:"100"`
    ConnMaxLifetime    int    `env:"DB_CONN_MAX_LIFETIME" default:"3600"`
}

// DB represents the database connection
// This is a wrapper around *gorm.DB with additional methods
var DB *gorm.DB

// Init initializes the database connection
// This function sets up the database connection pool with the given configuration
func Init(config *DatabaseConfig) error {
    if config.URL == "" {
        return errors.New("DATABASE_URL is required")
    }

    // Open database connection
    var err error
    DB, err = gorm.Open(postgres.New(postgres.Config{
        DSN: config.URL,
        // Set connection pool settings
        // Note: These settings are specific to the PostgreSQL driver
    }), &gorm.Config{
        // Set GORM configuration
        // This is a basic configuration - customize as needed
        PrepareStmt: true,
        Logger:      logger.Default.LogMode(logger.Info),
    })
    if err != nil {
        return fmt.Errorf("failed to open database connection: %w", err)
    }

    // Configure connection pool
    sqlDB, err := DB.DB()
    if err != nil {
        return fmt.Errorf("failed to get underlying sql.DB: %w", err)
    }

    // Set maximum idle connections
    sqlDB.SetMaxIdleConns(config.MaxIdleConns)

    // Set maximum open connections
    sqlDB.SetMaxOpenConns(config.MaxOpenConns)

    // Set connection lifetime
    sqlDB.SetConnMaxLifetime(time.Duration(config.ConnMaxLifetime) * time.Second)

    // Test connection
    if err := sqlDB.Ping(); err != nil {
        return fmt.Errorf("failed to ping database: %w", err)
    }

    log.Printf("Connected to database: %s", config.URL)
    return nil
}

// Get returns the database connection
// This function returns the underlying GORM DB instance
func Get() *gorm.DB {
    return DB
}

// Close closes the database connection
// This function should be called when the application is shutting down
func Close() error {
    if DB == nil {
        return nil
    }

    sqlDB, err := DB.DB()
    if err != nil {
        return fmt.Errorf("failed to get underlying sql.DB: %w", err)
    }

    return sqlDB.Close()
}