// Package main is the entry point for the Cadensend Control Worker service
// This service handles job scheduling, execution, and delivery
// It owns: job claiming, scheduling, rendering, sending, retries

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
    r.Use(telemetry.Middleware("cadensend-control-worker"))

    // Health check endpoint
    r.GET("/healthz", healthHandler)

    // Metrics endpoint
    r.GET("/metrics", metricsHandler)

    // Start HTTP server
    srv := &http.Server{
        Addr:    ":8081",
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

    // Start scheduler and delivery workers
    go startScheduler()
    go startDeliveryWorker()

    log.Println("Control worker started")

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

func metricsHandler(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{"metrics": "enabled"})
}

func startScheduler() {
    // Initialize scheduler task processor
    ssrv := asynq.NewServer(
        asynq.RedisClientOpt{Addr: "localhost:6379"},
        asynq.Config{
            Concurrency: 10,
            QueuePriority: map[string]int{
                "critical": 5,
                "default":  3,
                "low":      1,
            },
        },
    )

    // Register task handlers
    mux := asynq.NewServeMux()
    mux.HandleFunc("issue:generate", generateIssueTask)
    mux.HandleFunc("issue:deliver", deliverIssueTask)
    mux.HandleFunc("source:ingest", ingestSourceTask)
    mux.HandleFunc("schedule:run", runScheduleTask)

    if err := ssrv.Run(mux); err != nil {
        log.Fatalf("Failed to start scheduler: %v", err)
    }
}