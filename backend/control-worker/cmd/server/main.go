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

    "github.com/prometheus/client_golang/prometheus"

    "backend/control-worker/internal/config"
    "backend/control-worker/internal/database"
    "backend/control-worker/internal/logger"
    "backend/control-worker/internal/telemetry"
    "backend/control-worker/internal/scheduler"
    "backend/control-worker/internal/delivery"
)

var cfg *config.Config

func init() {
    cfg = config.LoadConfig()
    
    database.Init(cfg.DatabaseURL)
    go scheduler.StartScheduler(cfg)
    go delivery.StartDeliveryWorker(cfg)
}

func main() {
    gin.SetMode(gin.ReleaseMode)
    r := gin.New()

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
        AllowCredentials: true,
    }))
    r.Use(telemetry.Middleware("cadensend-control-worker"))

    r.GET("/healthz", healthHandler)
    r.GET("/metrics", metricsHandler)

    srv := &http.Server{
        Addr:    ":" + cfg.Port,
        Handler: r,
        ReadTimeout:  30 * time.Second,
        WriteTimeout: 30 * time.Second,
        IdleTimeout:  120 * time.Second,
    }

    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

    go func() {
        if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("Failed to start server: %v", err)
        }
    }()

    log.Println("Control worker started")

    <-quit
    log.Println("Shutting down worker...")

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := srv.Shutdown(ctx); err != nil {
        log.Fatalf("Server forced to shutdown: %v", err)
    }

    log.Println("Worker exited")
}

func healthHandler(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{"status": "healthy"})
}

func metricsHandler(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{"metrics": "enabled"})
}
