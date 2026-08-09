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
    "github.com/open-telemetry/opentelemetry-go"
    "github.com/open-telemetry/opentelemetry-go/api/trace"
    "github.com/prometheus/client_golang/prometheus"
    "gorm.io/gorm"

    "cadensend/internal/config"
    "cadensend/internal/database"
    "cadensend/internal/logger"
    "cadensend/internal/telemetry"
    "cadensend/pkg/auth"
    "cadensend/pkg/version"
)

func init() {
    // Initialize telemetry (OpenTelemetry)
    cleanup := telemetry.Init("")
    defer cleanup(context.Background())

    // Initialize database connection pool
    database.Init()

    // Start background workers
    go startWorkers()

    // Register metrics
    prometheus.Register()
}

func main() {
    gin.SetMode(gin.ReleaseMode)
    r := gin.New()

    // Add middleware
    r.Use(logger.SetLogger(&logger.Config{
        UTC:            true,
        SkipPaths:      []string{},
    }))
    r.Use(recovery.Recovery())
    r.Use(cors.New(cors.Config{
        AllowAllOrigins: true,
        AllowMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
        AllowHeaders:   []string{"Origin", "Content-Type", "Accept", "Authorization"},
    }))
    r.Use(telemetry.Middleware("cadensend-control-api"))

    // Health check endpoint
    r.GET("/healthz", healthHandler)

    // API v1 routes
    v1 := r.Group("/v1")
    {
        // Series endpoints
        series := v1.Group("/series")
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
        issues := v1.Group("/issues")
        {
            issues.GET("/:id", getIssueHandler)
            issues.PATCH("/:id", updateIssueHandler)
            issues.POST("/:id/generate", generateIssueHandler)
            issues.POST("/:id/approve", approveIssueHandler)
            issues.POST("/:id/test-send", testSendIssueHandler)
        }

        // Source endpoints
        sources := v1.Group("/sources")
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
        retrieval := v1.Group("/retrieval")
        {
            retrieval.POST("/preview/:series_id", retrievalPreviewHandler)
        }

        // Operation monitoring
        operations := v1.Group("/operations")
        {
            operations.GET("/:id", getOperationHandler)
        }

        // Webhook endpoints
        webhooks := v1.Group("/webhooks")
        {
            webhooks.POST("/email/:provider", emailWebhookHandler)
        }
    }

    // Start HTTP server
    srv := &http.Server{
        Addr:    ":8080",
        Handler: r,
        // Add timeout configurations
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
    // Health check logic
    c.JSON(http.StatusOK, gin.H{"status": "healthy"})
}

func startWorkers() {
    // Initialize task scheduler
    scheduler := asynq.NewServer(
        asynq.RedisClientOpt{Addr: "localhost:6379"},
        asynq.Config{Concurrency: 10},
    )

    // Register task handlers
    mux := asynq.NewServeMux()
    mux.HandleFunc("issue:generate", generateIssueTask)
    mux.HandleFunc("issue:deliver", deliverIssueTask)
    mux.HandleFunc("source:ingest", ingestSourceTask)

    if err := scheduler.Run(mux); err != nil {
        log.Fatalf("Failed to start scheduler: %v", err)
    }
}