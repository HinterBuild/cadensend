// Package main is the entry point for the Cadensend Control API service
// This service provides the control plane for Cadensend, handling:
// - User authentication and tenancy
// - Series management (brief creation, planning, editing)
// - Issue lifecycle (generation, approval, scheduling, delivery)
// - Source management and RAG ingestion
// - Delivery orchestration and tracking
// - API contracts and state management

package main

import (
    "context"
    "log"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "github.com/gin-gonic/gin"
    "github.com/gin-gonic/gin/middleware/logger"
    "github.com/gin-gonic/gin/middleware/recovery"
    "github.com/gin-gonic/gin/middleware/cors"

    "github.com/hibiken/asynq"
    "github.com/prometheus/client_golang/prometheus"
    "gorm.io/gorm"

    "cadensend/services/control-api/internal/config"
    "cadensend/services/control-api/internal/database"
    "cadensend/services/control-api/internal/logger"
    "cadensend/services/control-api/internal/middleware"
    "cadensend/services/control-api/internal/telemetry"
    "cadensend/services/control-api/internal/service"
    "cadensend/services/control-api/internal/handler"
    "cadensend/services/control-api/internal/auth"
    "cadensend/services/control-api/internal/version"
)

var (
    cfg *config.Config
    db  *gorm.DB
)

func init() {
    // Load configuration
    cfg = config.LoadConfig()

    // Initialize logger
    loggerObj := logger.SetLogger(&logger.Config{
        Level:   cfg.LogLevel,
        UTC:     true,
    })
    log.SetFlags(0)
    loggerObj.Info("Starting control API", "config", cfg.Env)

    // Initialize database
    database.Init(cfg.DatabaseURL)
    db = database.Get()

    // Auto-migrate models
    database.AutoMigrate(
        &service.User{},
        &service.MagicLinkToken{},
        &service.Workspace{},
        &service.Series{},
        &service.Issue{},
        &service.Source{},
        &service.Schedule{},
        &service.Delivery{},
        &service.Recipient{},
    )

    log.Println("Database models migrated")
}

func main() {
    gin.SetMode(gin.ReleaseMode)
    r := gin.New()

    // Add middleware
    r.Use(logger.SetLogger(&logger.Config{
        Level:   cfg.LogLevel,
        UTC:     true,
        SkipPaths: []string{"/healthz", "/metrics"},
    }))
    r.Use(recovery.Recovery())
    r.Use(cors.New(cors.Config{
        AllowAllOrigins:  true,
        AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
        AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
        ExposeHeaders:    []string{"Content-Length"},
        AllowCredentials: true,
        MaxAge:           12 * time.Hour,
    }))
    r.Use(telemetry.Middleware("cadensend-control-api"))

    // Health check endpoint
    r.GET("/healthz", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{"status": "healthy"})
    })
    r.GET("/version", func(c *gin.Context) {
        info := version.Get()
        c.JSON(http.StatusOK, gin.H{
            "name":    info.Name,
            "version": info.Version,
            "commit":  info.Commit,
        })
    })

    // Initialize services
    userService := service.NewUserService(db, cfg.JWTSecret, cfg.JWTExpiry, nil)
    
    // Initialize handlers
    userHandler := handler.NewUserHandler(userService, cfg.JWTSecret)
    seriesHandler := handler.NewSeriesHandler(db)
    issueHandler := handler.NewIssueHandler(db)
    sourceHandler := handler.NewSourceHandler(db)
    retrievalHandler := handler.NewRetrievalHandler(db)
    operationsHandler := handler.NewOperationsHandler(db)
    webhookHandler := handler.NewWebhookHandler(db, cfg.JWTSecret, cfg.SendGridAPIKey)

    // API v1 routes
    v1 := r.Group("/v1")
    {
        // Auth routes (no auth required)
        userHandler.RegisterRoutes(v1)

        // Protected routes
        api := v1.Group("")
        api.Use(middleware.JWTMiddleware(cfg.JWTSecret))
        {
            seriesHandler.RegisterRoutes(api, middleware.JWTMiddleware(cfg.JWTSecret))
            issueHandler.RegisterRoutes(api, middleware.JWTMiddleware(cfg.JWTSecret))
            sourceHandler.RegisterRoutes(api, middleware.JWTMiddleware(cfg.JWTSecret))
            retrievalHandler.RegisterRoutes(api, middleware.JWTMiddleware(cfg.JWTSecret))
            operationsHandler.RegisterRoutes(api, middleware.JWTMiddleware(cfg.JWTSecret))
        }

        // Webhook endpoints (no auth - signature verification instead)
        webhookHandler.RegisterRoutes(v1)
    }

    // Start HTTP server
    srv := &http.Server{
        Addr:    ":" + cfg.Port,
        Handler: r,
        ReadTimeout:  30 * time.Second,
        WriteTimeout: 30 * time.Second,
        IdleTimeout:  120 * time.Second,
    }

    // Start background workers
    go startWorkers()

    // Graceful shutdown
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

    go func() {
        if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("Failed to start server: %v", err)
        }
    }()

    log.Printf("Control API listening on :%s", cfg.Port)

    <-quit
    log.Println("Shutting down server...")

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := srv.Shutdown(ctx); err != nil {
        log.Fatalf("Server forced to shutdown: %v", err)
    }

    log.Println("Server exited")
}

func startWorkers() {
    scheduler := asynq.NewServer(
        asynq.RedisClientOpt{Addr: "localhost:6379"},
        asynq.Config{Concurrency: 10},
    )

    mux := asynq.NewServeMux()
    mux.HandleFunc("issue:generate", generateIssueTask)
    mux.HandleFunc("issue:deliver", deliverIssueTask)
    mux.HandleFunc("source:ingest", ingestSourceTask)

    if err := scheduler.Run(mux); err != nil {
        log.Fatalf("Failed to start scheduler: %v", err)
    }
}

// Stub task handlers - these would be implemented with actual logic
func generateIssueTask(ctx context.Context, t *asynq.Task) error {
    log.Printf("Processing issue generation task")
   	return nil
}

func deliverIssueTask(ctx context.Context, t *asynq.Task) error {
    log.Printf("Processing issue delivery task")
   	return nil
}

func ingestSourceTask(ctx context.Context, t *asynq.Task) error {
    log.Printf("Processing source ingestion task")
   	return nil
}