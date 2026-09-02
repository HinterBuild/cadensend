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
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"gorm.io/gorm"

	"backend/control-api/internal/config"
	"backend/control-api/internal/database"
	applogger "backend/control-api/internal/logger"
	"backend/control-api/internal/middleware"
	"backend/control-api/internal/service"
	"backend/control-api/internal/version"
)

var (
	cfg *config.Config
	db  *gorm.DB
)

func init() {
	cfg = config.LoadConfig()

	log.SetFlags(0)
	applogger.SetLogger(&applogger.Config{
		Level: cfg.LogLevel,
		UTC:   true,
	})
	log.Println("Starting control API", "env", cfg.Env)
}

func setupDatabase() {
	database.Init(cfg.DatabaseURL)
	db = database.Get()

	if err := database.AutoMigrate(
		&service.User{},
		&service.MagicLinkToken{},
		&service.PasswordResetToken{},
		&service.Workspace{},
		&service.Series{},
		&service.Issue{},
		&service.Source{},
		&service.Schedule{},
		&service.Delivery{},
		&service.Recipient{},
		&service.AuditLog{},
		&service.GenerationRun{},
		&service.WorkspaceLLMConfig{},
		&service.LLMUsage{},
	); err != nil {
		log.Println("AutoMigrate warning:", err)
	}

	if err := database.EnsureAppSchema(); err != nil {
		log.Println("EnsureAppSchema warning:", err)
	}

	log.Println("Database models migrated")
}

func main() {
	gin.SetMode(gin.ReleaseMode)

	setupDatabase()

	r := gin.New()

	// Add middleware
	isDev := cfg.Env != "production"
	r.Use(gin.Logger())
	r.Use(gin.Recovery())
	r.Use(middleware.RequestIDMiddleware())
	r.Use(middleware.SecurityHeadersMiddleware(isDev))
	r.Use(corsMiddleware())
	r.Use(middleware.RateLimitMiddleware())

	// Health check endpoint (deep checks included)
	r.GET("/healthz", func(c *gin.Context) {
		checks := deepHealthChecks()
		status := http.StatusOK
		for _, ok := range checks {
			if !ok {
				status = http.StatusServiceUnavailable
			}
		}
		c.JSON(status, gin.H{"status": map[bool]string{true: "healthy", false: "degraded"}[status == http.StatusOK], "checks": checks})
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
	authMW := middleware.JWTMiddleware(cfg.JWTSecret, db)
	recipients := newRecipientsHandler(db, userService)

	// Expired auth tokens would otherwise accumulate forever.
	go func() {
		ticker := time.NewTicker(12 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			userService.CleanupExpiredTokens()
		}
	}()

	// API v1 routes
	v1 := r.Group("/v1")
	{
		// Auth routes (no auth required)
		users := v1.Group("/users")
		{
			users.POST("", createUserHandler(db, userService))
			users.POST("/login", loginHandler(db, userService))
			users.POST("/magic-link", magicLinkHandler(db, userService))
			users.POST("/magic-link/verify", verifyMagicLinkHandler(db, userService))
			users.POST("/forgot-password", forgotPasswordHandler(db, userService))
			users.POST("/reset-password", resetPasswordHandler(db, userService))
		}

		// Public recipient lifecycle links (emailed, token-verified)
		v1.GET("/recipients/verify", recipients.publicVerify)

		// Protected routes
		api := v1.Group("")
		api.Use(authMW)
		{
			protectedUsers := api.Group("/users")
			{
				protectedUsers.GET("/me", meHandler(db, userService))
				protectedUsers.POST("/me/session/refresh", refreshSessionHandler(db, userService))
				protectedUsers.POST("/me/sessions/revoke", revokeSessionsHandler(db, userService))
				protectedUsers.GET("/:id", getUserHandler(db, userService))
				protectedUsers.PATCH("/:id", updateUserHandler(db, userService))
				protectedUsers.PATCH("/:id/password", changePasswordHandler(db, userService))
				protectedUsers.DELETE("/:id", deleteAccountHandler(db, userService))
			}

			series := api.Group("/series")
			{
				series.GET("", listSeriesHandler(db))
				series.POST("", createSeriesHandler(db))
				series.POST("/brief-extract", extractSeriesBriefHandler())
				series.GET("/:id", getSeriesHandler(db))
				series.PATCH("/:id", updateSeriesHandler(db))
				series.POST("/:id/plan", generatePlanHandler(db))
				series.GET("/:id/plan", getPlanHandler(db))
				series.GET("/:id/issues", listIssuesHandler(db))
				series.POST("/:id/issues", createIssueHandler(db))
				series.GET("/:id/sources", listSeriesSourcesHandler(db))
				series.POST("/:id/activate", activateSeriesHandler(db))
				series.POST("/:id/pause", pauseSeriesHandler(db))
				series.POST("/:id/resume", resumeSeriesHandler(db))
				series.POST("/:id/test-send", testSendSeriesHandler(db))
				series.POST("/:id/retrieval-preview", retrievalPreviewHandler(db))
				series.PATCH("/:id/platform", updateSeriesPlatformHandler(db))
				series.DELETE("/:id", deleteSeriesHandler(db))
			}

			// Issue endpoints
			issues := api.Group("/issues")
			{
				issues.GET("/:id", getIssueHandler(db))
				issues.PATCH("/:id", updateIssueHandler(db))
				issues.POST("/:id/generate", generateIssueHandler(db))
				issues.POST("/:id/approve", approveIssueHandler(db))
				issues.POST("/:id/test-send", testSendIssueHandler(db))
				issues.GET("/:id/versions", listIssueVersionsHandler(db))
				issues.GET("/:id/versions/:version", getIssueVersionHandler(db))
				issues.POST("/:id/versions/:version/restore", restoreIssueVersionHandler(db))
				issues.POST("/:id/schedule", rescheduleIssueHandler(db))
				issues.POST("/:id/cancel-send", cancelIssueSendHandler(db))
				issues.POST("/:id/cancel-generation", cancelIssueGenerationHandler(db))
				issues.GET("/:id/preview-html", previewEmailHTMLHandler(db))
			}

			// Source endpoints
			sources := api.Group("/sources")
			{
				sources.POST("/uploads", uploadSourceHandler(db))
				sources.POST("/urls", submitURLHandler(db))
				sources.GET("", listSourcesHandler(db))
				sources.GET("/:id", getSourceHandler(db))
				sources.GET("/:id/preview", previewSourceHandler(db))
				sources.POST("/:id/chunks", sourceChunksHandler(db))
				sources.POST("/:id/reindex", reindexSourceHandler(db))
				sources.DELETE("/:id", deleteSourceHandler(db))
			}

			// Recipient (audience) management
			api.GET("/recipients", recipients.list)
			api.POST("/recipients", recipients.create)
			api.DELETE("/recipients/:id", recipients.remove)
			api.POST("/recipients/:id/resend-verification", recipients.resendVerification)
			api.PATCH("/recipients/:id/suppression", recipients.setSuppressed)

			api.GET("/llm-providers", listLLMProvidersHandler(db))
			api.GET("/llm-providers/:id/models", getLLMProviderModelsHandler(db))
			api.GET("/llm-providers/config", getLLMProviderConfigHandler(db))
			api.PUT("/llm-providers/config", updateLLMProviderConfigHandler(db))
			api.POST("/llm-providers/:provider/validate", validateLLMProviderHandler(db))
			api.GET("/llm-usage", getLLMUsageHandler(db))

			// Operation monitoring
			operations := api.Group("/operations")
			{
				operations.GET("/:id", getOperationHandler(db))
			}

			api.GET("/models", listModelsHandler())
			api.GET("/analytics/overview", analyticsOverviewHandler(db))
			api.GET("/runs", listRunsHandler(db))

			platform := api.Group("/platform")
			{
				platform.GET("/catalog", platformCatalogHandler())
				platform.GET("/skills", platformSkillsHandler())
				platform.GET("/connectors", platformConnectorsHandler())
				platform.PUT("/connectors/:id/config", platformConnectorConfigHandler(db))
				platform.POST("/connectors/sync", platformConnectorSyncHandler(db))
				platform.GET("/workflows", platformWorkflowsHandler())
				platform.GET("/insights/types", platformInsightTypesHandler())
				platform.POST("/insights/compute", platformInsightsComputeHandler(db))
				platform.POST("/sandbox", platformSandboxHandler())
				platform.POST("/evaluate", platformEvaluateHandler())
				platform.POST("/workflows/run", platformWorkflowRunHandler())
				platform.POST("/plugins/validate", platformPluginValidateHandler())
				platform.GET("/studio/meta", platformStudioMetaHandler())
				platform.POST("/studio/compose", platformStudioComposeHandler())
				platform.POST("/studio/section", platformStudioSectionHandler())
				platform.POST("/studio/analyze", platformStudioAnalyzeHandler())
				platform.POST("/studio/lines", platformStudioLinesHandler())
				platform.GET("/editorial/assets", editorialAssetsHandler(db))
				platform.POST("/editorial/assets", editorialAssetsHandler(db))
			}

			settings := api.Group("/settings")
			{
				settings.GET("/email-providers", listEmailProvidersHandler())
				settings.GET("/email-provider", getEmailProviderHandler(db))
				settings.PUT("/email-provider", updateEmailProviderHandler(db))
				settings.POST("/email-provider/test", testEmailProviderHandler(db))
			}
		}

		// Webhook endpoints (secret-verified, no JWT)
		webhooks := v1.Group("/webhooks")
		{
			webhooks.POST("/email/:provider", emailWebhookHandler(db))
			// Unsubscribe: GET renders the confirmation page, POST performs it.
			webhooks.GET("/unsubscribe", recipients.publicUnsubscribeForm)
			webhooks.POST("/unsubscribe", recipients.publicUnsubscribeConfirm)
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

// corsMiddleware allows only explicitly configured origins. In development,
// localhost ports are accepted for convenience; production requires an exact
// FRONTEND_ORIGIN match.
func corsMiddleware() gin.HandlerFunc {
	allowed := strings.TrimSpace(os.Getenv("FRONTEND_ORIGIN"))
	if allowed == "" {
		allowed = "http://localhost:3000"
	}
	isDev := cfg.Env != "production"
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		matched := origin == allowed
		if !matched && isDev && strings.HasPrefix(origin, "http://localhost:") {
			matched = true
		}
		if matched {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization, X-Request-ID")
		c.Header("Access-Control-Expose-Headers", "Content-Length, X-Request-ID")
		c.Header("Vary", "Origin")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

// deepHealthChecks verifies that backing services are reachable.
func deepHealthChecks() map[string]bool {
	checks := map[string]bool{}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	sqlDB, err := db.DB()
	if err == nil {
		checks["postgres"] = sqlDB.PingContext(ctx) == nil
	} else {
		checks["postgres"] = false
	}

	addr, dbNum, password := parseRedisURL(cfg.RedisURL)
	client := redis.NewClient(&redis.Options{Addr: addr, Password: password, DB: dbNum})
	defer client.Close()
	if err := client.Ping(ctx).Err(); err == nil {
		checks["redis"] = true
	} else {
		checks["redis"] = false
	}

	return checks
}

func parseRedisURL(rawURL string) (addr string, dbNum int, password string) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL, 0, ""
	}

	addr = u.Host
	if u.User != nil {
		password, _ = u.User.Password()
	}

	if u.Path != "" && u.Path != "/" {
		path := strings.TrimPrefix(u.Path, "/")
		parts := strings.Split(path, "/")
		if len(parts) > 0 && parts[0] != "" {
			dbNum, _ = strconv.Atoi(parts[0])
		}
	}

	return addr, dbNum, password
}
