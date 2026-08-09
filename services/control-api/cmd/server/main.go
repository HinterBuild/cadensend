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
        Level: cfg.LogLevel,
        UTC:   true,
    })
    log.SetFlags(0)
    loggerObj.Info("Starting control API", "config", cfg.Env)

    // Initialize database
    database.Init(cfg.DatabaseURL)
    db = database.Get()
    
    // Auto-migrate models
    database.AutoMigrate(
        &service.User{},
        &service.Workspace{},
        &service.Series{},
        &service.Issue{},
    )

    // Start background workers
    go startWorkers()
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
    r.GET("/healthz", healthHandler)
    r.GET("/version", versionHandler)

    // API v1 routes
    v1 := r.Group("/v1")
    {
        // Auth routes (no auth required)
        users := v1.Group("/users")
        {
            users.POST("", createUserHandler)
            users.POST("/login", loginHandler)
            users.POST("/magic-link", magicLinkHandler)
        }

        // Protected routes
        api := v1.Group("")
        api.Use(middleware.JWTMiddleware(cfg.JWTSecret))
        {
            // Series endpoints
            series := api.Group("/series")
            {
                series.POST("", createSeriesHandler)
                series.GET("/:id", getSeriesHandler)
                series.PATCH("/:id", updateSeriesHandler)
                series.POST("/:id/plan", generatePlanHandler)
                series.GET("/:id/issues", listIssuesHandler)
                series.POST("/:id/activate", activateSeriesHandler)
                series.POST("/:id/pause", pauseSeriesHandler)
                series.POST("/:id/resume", resumeSeriesHandler)
            }

            // Issue endpoints
            issues := api.Group("/issues")
            {
                issues.GET("/:id", getIssueHandler)
                issues.PATCH("/:id", updateIssueHandler)
                issues.POST("/:id/generate", generateIssueHandler)
                issues.POST("/:id/approve", approveIssueHandler)
                issues.POST("/:id/test-send", testSendIssueHandler)
            }

            // Source endpoints
            sources := api.Group("/sources")
            {
                sources.POST("/uploads", uploadSourceHandler)
                sources.POST("/urls", submitURLHandler)
                sources.GET("", listSourcesHandler)
                sources.GET("/:id", getSourceHandler)
                sources.GET("/:id/preview", previewSourceHandler)
                sources.POST("/:id/reindex", reindexSourceHandler)
                sources.DELETE("/:id", deleteSourceHandler)
            }

            // Retrieval endpoints
            retrieval := api.Group("/retrieval")
            {
                retrieval.POST("/preview/:series_id", retrievalPreviewHandler)
            }

            // Operation monitoring
            operations := api.Group("/operations")
            {
                operations.GET("/:id", getOperationHandler)
            }

            // Webhook endpoints (no auth - webhook signature verification instead)
            webhooks := v1.Group("/webhooks")
            {
                webhooks.POST("/email/:provider", emailWebhookHandler)
            }
        }
    }

    // Start HTTP server
    srv := &http.Server{
        Addr:    ":" + cfg.Port,
        Handler: r,
        ReadTimeout:  30 * time.Second,
        WriteTimeout: 30 * time.Second,
        IdleTimeout:  120 * time.Second,
    }

    // Graceful shutdown
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

    go func() {
        if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("Failed to start server: %v", err)
        }
    }()

    <-quit
    log.Println("Shutting down server...")

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := srv.Shutdown(ctx); err != nil {
        log.Fatalf("Server forced to shutdown: %v", err)
    }

    log.Println("Server exited")
}

func healthHandler(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{"status": "healthy"})
}

func versionHandler(c *gin.Context) {
    info := version.Get()
    c.JSON(http.StatusOK, gin.H{
        "name":    info.Name,
        "version": info.Version,
        "commit":  info.Commit,
    })
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
