# Control API Service - Go

See the [**main project README**](..%2F..%2F..%2FREADME.md) for project overview, architecture, and contribution guide.

This service provides the control plane for Cadensend, handling:
- User authentication and tenancy
- Series management (brief creation, planning, editing)
- Issue lifecycle (generation, approval, scheduling, delivery)
- Source management and RAG ingestion
- Delivery orchestration and tracking
- API contracts and state management

## Service Structure

```
backend/control-api/
├── cmd/
│   ├── server/ (main entry point)
│   └── migrations/ (Go migrations runner)
    ├── internal/
    │   ├── auth/ (JWT auth, magic link, OAuth)
    │   ├── service/ (business logic services)
│   ├── service/ (business logic)
│   ├── handler/ (HTTP handlers)
│   └── middleware/ (auth, logging, tracing)
├── migration/
│   └── 001_create_tables.up.sql (schema)
├── cmd/
│   └── server/main.go
└── go.mod
```

## Key Components

### 1. Auth System
- Magic link login with JWT
- Workspace role-based access control
- Short-lived sessions with refresh token rotation
- API key management for internal services

### 2. Repository Layer
- PostgreSQL repositories using GORM
- Transaction management for data consistency
- Optimistic locking for concurrent access
- Query building for complex filters

### 3. Business Logic
- Series creation and management
- Issue generation orchestration
- Source ingestion and validation
- Delivery scheduling and tracking

### 4. API Endpoints
- Series endpoints (/v1/series/*)
- Issue endpoints (/v1/issues/*)
- Source endpoints (/v1/sources/*)
- Operations monitoring (/v1/operations/*)
- Webhook handlers (/v1/webhooks/*)

### 5. Observability
- OpenTelemetry tracing
- Structured logging with correlation IDs
- Metrics collection
- Error tracking and alerting

## Implementation Timeline (Week 1-2)

**Week 1**
- Product contracts and architecture
- Finalize SeriesBrief, SeriesPlan, IssueContent, VisualSpec schemas
- Define state machines and error codes
- Architecture decisions for Qdrant, jobs, model gateway, rendering

**Week 2**
- Monorepo setup and CI
- Authentication/workspace skeleton
- PostgreSQL migrations/repositories
- Go API/worker skeleton
- Local PostgreSQL, Qdrant, MinIO environment
- OpenTelemetry baseline

## Local Development

```bash
# Start all services
docker compose up -d

# Build and run Go services
docker compose up --build go-api go-worker

# Run migrations
./scripts/run_migrations.sh

# Run tests
make test-go
```

## Dependencies

- Go 1.22+
- PostgreSQL 15+
- Redis (optional, for job queues)
- Docker for local development

## Testing

- Unit tests for repositories and business logic
- Integration tests for PostgreSQL and cross-service contracts
- E2E tests for the full acceptance criteria
- AI-specific evaluation (retrieval and generation quality)
