package telemetry

import (
    "context"
    "errors"
    "time"

    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/export/trace"
    "go.opentelemetry.io/otel/propagation"
    "go.opentelemetry.io/otel/sdk/resource"
    "go.opentelemetry.io/otel/sdk/trace"
    "go.opentelemetry.io/otel/semconv"

    "cadensend/internal/config"
)

// TraceCleanup function for cleanup
// This function should be called when the application is shutting down
type TraceCleanup func(context.Context) error

// Init initializes OpenTelemetry
// This function sets up a trace exporter and returns a cleanup function
func Init(serviceName string) TraceCleanup {
    // Create exporter
    exporter, err := trace.NewExportingTraceProvider(
        trace.WithExporter(trace.ExporterConfig{
            URL: "http://localhost:14268/api/traces",
        }),
    )
    if err != nil {
        log.Printf("Failed to create trace exporter: %v", err)
        return func(context.Context) error { return nil }
    }

    // Create resource
    res, err := resource.New(context.Background(),
        resource.WithAttributes(
            semconv.ServiceNameKey.String(serviceName),
            semconv.ServiceVersionKey.String("1.0.0"),
        ),
    )
    if err != nil {
        log.Printf("Failed to create resource: %v", err)
        return func(context.Context) error { return nil }
    }

    // Create trace provider
    tp, err := trace.NewTracerProvider(
        trace.WithConfig(trace.Config{Resource: res}),
        trace.WithSpanProcessor(trace.NewSpanProcessor(exporter)),
    )
    if err != nil {
        log.Printf("Failed to create trace provider: %v", err)
        return func(context.Context) error { return nil }
    }

    // Set global trace provider
    otel.SetTracerProvider(tp)
    otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
        propagation.TraceContext{},
        propagation.Baggage{},
    ))

    // Return cleanup function
    return func(ctx context.Context) error {
        ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
        defer cancel()

        if err := tp.Shutdown(ctx); err != nil {
            return fmt.Errorf("failed to shutdown trace provider: %w", err)
        }

        if err := exporter.Shutdown(ctx); err != nil {
            return fmt.Errorf("failed to shutdown exporter: %w", err)
        }

        return nil
    }
}

// Middleware returns a Gin middleware for OpenTelemetry
// This middleware adds trace context to requests
type MiddlewareConfig struct {
    ServiceName string
}

// Middleware returns a Gin middleware for OpenTelemetry
func Middleware(serviceName string) gin.HandlerFunc {
    tp := otel.GetTracerProvider()

    return func(c *gin.Context) {
        // Get tracer
        tracer := tp.Tracer(serviceName)

        // Create span
        ctx, span := tracer.Start(
            c.Request.Context(),
            c.Request.URL.Path,
            trace.WithAttributes(
                attribute.String("http.method", c.Request.Method),
                attribute.String("http.url", c.Request.URL.String()),
                attribute.String("http.user_agent", c.Request.UserAgent()),
                attribute.String("http.host", c.Request.Host),
            ),
        )
        defer span.End()

        // Set span in context
        c.Request = c.Request.WithContext(ctx)

        // Process request
        c.Next()

        // Add response status to span
        span.SetAttributes(
            attribute.Int("http.status_code", c.Writer.Status()),
        )

        // Record error if status is 5xx
        if c.Writer.Status() >= 500 {
            span.SetAttributes(
                attribute.String("error", c.Errors.String()),
            )
        }
    }
}