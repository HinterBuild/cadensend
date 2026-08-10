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
	"github.com/hibiken/asynq"
	"gorm.io/gorm"

	"backend/control-api/internal/config"
	"backend/control-api/internal/database"
	applogger "backend/control-api/internal/logger"
	"backend/control-api/internal/middleware"
	"backend/control-api/internal/service"
	"backend/control-api/internal/telemetry"
	"backend/control-api/internal/version"
)

var (
	cfg *config.Config
	db  *gorm.DB
)

func init() {
	// Load configuration
	cfg = config.LoadConfig()

	// Initialize logger
	log.SetFlags(0)
	applogger.SetLogger(&applogger.Config{
		Level: cfg.LogLevel,
		UTC:   true,
	})
	log.Println("Starting control API", "env", cfg.Env)

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
	r.Use(gin.Logger())
	r.Use(gin.Recovery())
	r.Use(corsMiddleware())
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
	authMW := middleware.JWTMiddleware(cfg.JWTSecret)

	// API v1 routes
	v1 := r.Group("/v1")
	{
		// Auth routes (no auth required)
		users := v1.Group("/users")
		{
			users.POST("", createUserHandler(db, userService))
			users.POST("/login", loginHandler(db, userService))
			users.POST("/magic-link", magicLinkHandler(db, userService))
			users.GET("/:id", getUserHandler(db, userService))
		}

		// Protected routes
		api := v1.Group("")
		api.Use(authMW)
		{
			// Series endpoints
			series := api.Group("/series")
			{
				series.POST("", createSeriesHandler(db))
				series.GET("/:id", getSeriesHandler(db))
				series.PATCH("/:id", updateSeriesHandler(db))
				series.POST("/:id/plan", generatePlanHandler(db))
				series.GET("/:id/issues", listIssuesHandler(db))
				series.POST("/:id/activate", activateSeriesHandler(db))
				series.POST("/:id/pause", pauseSeriesHandler(db))
				series.POST("/:id/resume", resumeSeriesHandler(db))
			}

			// Issue endpoints
			issues := api.Group("/issues")
			{
				issues.GET("/:id", getIssueHandler(db))
				issues.PATCH("/:id", updateIssueHandler(db))
				issues.POST("/:id/generate", generateIssueHandler(db))
				issues.POST("/:id/approve", approveIssueHandler(db))
				issues.POST("/:id/test-send", testSendIssueHandler(db))
			}

			// Source endpoints
			sources := api.Group("/sources")
			{
				sources.POST("/uploads", uploadSourceHandler(db))
				sources.POST("/urls", submitURLHandler(db))
				sources.GET("", listSourcesHandler(db))
				sources.GET("/:id", getSourceHandler(db))
				sources.GET("/:id/preview", previewSourceHandler(db))
				sources.POST("/:id/reindex", reindexSourceHandler(db))
				sources.DELETE("/:id", deleteSourceHandler(db))
			}

			// Retrieval endpoints
			retrieval := api.Group("/retrieval")
			{
				retrieval.POST("/preview/:series_id", retrievalPreviewHandler(db))
			}

			// Operation monitoring
			operations := api.Group("/operations")
			{
				operations.GET("/:id", getOperationHandler(db))
			}
		}

		// Webhook endpoints (no auth)
		webhooks := v1.Group("/webhooks")
		{
			webhooks.POST("/email/:provider", emailWebhookHandler(db))
		}
	}

	// Start HTTP server
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
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

// corsMiddleware provides basic CORS support without an external dependency
func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization")
		c.Header("Access-Control-Expose-Headers", "Content-Length")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

func startWorkers() {
	scheduler := asynq.NewServer(
		asynq.RedisClientOpt{Addr: cfg.RedisURL},
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

func generateIssueTask(ctx context.Context, t *asynq.Task) error {
	log.Printf("Processing issue generation task: %s", t.Type())
	return nil
}

func deliverIssueTask(ctx context.Context, t *asynq.Task) error {
	log.Printf("Processing issue delivery task: %s", t.Type())
	return nil
}

func ingestSourceTask(ctx context.Context, t *asynq.Task) error {
	log.Printf("Processing source ingestion task: %s", t.Type())
	return nil
}
