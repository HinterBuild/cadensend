// Package telemetry provides OpenTelemetry integration for the control API
// This package handles tracing, metrics, and observability
package telemetry

import (
    "context"
    "fmt"
    "net/http"
    "os"

    "github.com/gin-gonic/gin"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/exporters/otlp/otlphttp"
    "go.opentelemetry.io/otel/propagation"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    "go.opentelemetry.io/otel/sdk/resource"
    semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
)

var (
    serviceName = getenv("OTEL_SERVICE_NAME", "cadensend-control-api")
    endpoint    = getenv("OTEL_ENDPOINT", "http://localhost:4318")
)

// Init initializes OpenTelemetry
func Init(serviceName string) context.CancelFunc {
    ctx := context.Background()
    if serviceName != "" {
        service = serviceName
    }

    // Try to create OTLP exporter
    exp, err := otlphttp.New(ctx,
        otlphttp.WithEndpoint(endpoint),
        otlphttp.WithInsecure(),
    )
    if err != nil {
        // Fallback to default tracer provider
        fmt.Printf("Failed to create OTLP exporter: %v\n", err)
        return func() {}
    }

    // Set up tracer provider
    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exp),
        sdktrace.WithResource(resource.NewWithAttributes(
            semconv.SchemaURL,
            semconv.ServiceNameKey.String(service),
        )),
    )

    otel.SetTracerProvider(tp)
    otel.SetTextMapPropagator(propagation.New())

    return func() {
        _ = tp.Shutdown(ctx)
    }
}

// Middleware returns a Gin middleware for OpenTelemetry tracing
func Middleware(serviceName string) gin.HandlerFunc {
    tracer := otel.Tracer(serviceName)

    return func(c *gin.Context) {
        ctx, span := tracer.Start(c.Request.Context(), c.FullPath())
        defer span.End()

        span.SetAttributes(
            attribute.String("http.method", c.Request.Method),
            attribute.String("http.route", c.FullPath()),
            attribute.String("http.user_agent", c.Request.UserAgent()),
            attribute.Int("http.status_code", 0),
        )

        c.Request = c.Request.WithContext(ctx)

        c.Next()

        span.SetAttributes(
            attribute.Int("http.status_code", c.Writer.Status()),
        )
    }
}

func getenv(key, defaultValue string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return defaultValue
