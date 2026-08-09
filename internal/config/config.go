// Package config provides application configuration
// This package loads configuration from environment variables and provides access to configuration values
type Config struct {
    // Server configuration
    Port           string `env:"PORT" default:"8080"`
    Host           string `env:"HOST" default:"localhost"`
    LogLevel       string `env:"LOG_LEVEL" default:"info"`

    // Database configuration
    DatabaseURL    string `env:"DATABASE_URL" required:"true"`
    DBMaxIdleConns  int    `env:"DB_MAX_IDLE_CONNS" default:"10"`
    DBMaxOpenConns  int    `env:"DB_MAX_OPEN_CONNS" default:"100"`
    DBConnMaxLifetime int   `env:"DB_CONN_MAX_LIFETIME" default:"3600"`

    // Qdrant configuration
    QdrantURL       string `env:"QDRANT_URL" default:"http://localhost:6333"`
    QdrantAPIKey     string `env:"QDRANT_API_KEY"`

    // Object storage configuration
    ObjectStorageURL string `env:"OBJECT_STORAGE_URL" default:"http://localhost:9000"`
    MinIOAccessKey   string `env:"MINIO_ACCESS_KEY" default:"minioadmin"`
    MinIOSecretKey   string `env:"MINIO_SECRET_KEY" default:"minioadmin123"`
    MinIOUseSSL      bool   `env:"MINIO_USE_SSL" default:"false"`

    // OpenRouter (AI model gateway) configuration
    OpenRouterAPIKey  string `env:"OPENROUTER_API_KEY"`
    DefaultModel      string `env:"DEFAULT_MODEL" default:"nvidia/nemotron-3-embed-1b:free"`

    // Email provider configuration
    EmailProvider     string `env:"EMAIL_PROVIDER" default:"sendgrid"`
    SMTPFrom         string `env:"SMTP_FROM"`
    SendGridAPIKey    string `env:"SENDGRID_API_KEY"`
    AWSRegion        string `env:"AWS_REGION"`
    AWSAccessKeyID   string `env:"AWS_ACCESS_KEY_ID"`
    AWSSecretAccessKey string `env:"AWS_SECRET_ACCESS_KEY"`

    // JWT configuration
    JWTSecret        string `env:"JWT_SECRET" required:"true"`
    JWTExpiryHours    int    `env:"JWT_EXPIRY_HOURS" default:"24"`

    // Redis configuration (for task queue)
    RedisAddr        string `env:"REDIS_ADDR" default:"localhost:6379"`
    RedisPassword    string `env:"REDIS_PASSWORD"`
    RedisDB          int    `env:"REDIS_DB" default:"0"`

    // OpenTelemetry configuration
    OTelEndpoint     string `env:"OTEL_ENDPOINT"`
    OTelServiceName  string `env:"OTEL_SERVICE_NAME" default:"cadensend"`

    // App configuration
    Environment      string `env:"ENVIRONMENT" default:"development"`
    EnableMetrics    bool   `env:"ENABLE_METRICS" default:"true"`
    EnableTracing    bool   `env:"ENABLE_TRACING" default:"true"`
}

// LoadConfig loads configuration from environment variables
func LoadConfig() (*Config, error) {
    c := &Config{}

    // Parse environment variables
    // Note: In a real implementation, you'd use a library like github.com/spf13/viper
    // or github.com/caarlos0/env to parse environment variables

    // Set defaults for optional values
    if c.Port == "" {
        c.Port = "8080"
    }
    if c.Host == "" {
        c.Host = "localhost"
    }
    if c.LogLevel == "" {
        c.LogLevel = "info"
    }
    if c.DBMaxIdleConns == 0 {
        c.DBMaxIdleConns = 10
    }
    if c.DBMaxOpenConns == 0 {
        c.DBMaxOpenConns = 100
    }
    if c.DBConnMaxLifetime == 0 {
        c.DBConnMaxLifetime = 3600
    }
    if c.MinIOAccessKey == "" {
        c.MinIOAccessKey = "minioadmin"
    }
    if c.MinIOSecretKey == "" {
        c.MinIOSecretKey = "minioadmin123"
    }
    if c.DefaultModel == "" {
        c.DefaultModel = "nvidia/nemotron-3-embed-1b:free"
    }
    if c.JWTExpiryHours == 0 {
        c.JWTExpiryHours = 24
    }
    if c.RedisDB == 0 {
        c.RedisDB = 0
    }
    if c.OTelServiceName == "" {
        c.OTelServiceName = "cadensend"
    }

    // Validate required fields
    if c.DatabaseURL == "" {
        return nil, errors.New("DATABASE_URL is required")
    }
    if c.JWTSecret == "" {
        return nil, errors.New("JWT_SECRET is required")
    }

    return c, nil
}