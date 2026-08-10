module backend/control-api

go 1.22

require (
	github.com/gin-gonic/gin v1.9.1
	github.com/golang-jwt/jwt/v5 v5.2.1
	github.com/google/uuid v1.6.0
	github.com/hibiken/asynq v0.24.0
	github.com/minio/minio-go/v7 v7.0.54
	github.com/prometheus/client_golang v1.18.0
	github.com/qdrant/go-client v1.7.0
	github.com/robfig/cron/v3 v3.0.1
	go.opentelemetry.io/otel v1.21.0
	golang.org/x/crypto v0.24.0
	golang.org/x/sync v0.7.0
	gorm.io/driver/postgres v1.5.4
	gorm.io/gorm v1.25.12
)
