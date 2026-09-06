# AGENTS.md - Project Guidance for AI Coding Agents

## Build & Run Commands

```bash
docker compose up -d

docker compose -f docker-compose.yml -f docker-compose.frontend-dev.yml up

# Start individual services
cd backend/control-api && go run ./cmd/server
cd backend/control-worker && go run ./cmd/server
cd ai-service/ai-engine/api && python -m uvicorn main:app --reload --port 8000
cd ai-service/ai-engine/workers && python workers/main.py
cd frontend/web && npm run dev

# Run tests
make test
# or individually:
go test ./backend/control-api/...
go test ./backend/control-worker/...
pip install -r ai-service/ai-engine/api/requirements.txt -r ai-service/ai-engine/api/requirements-dev.txt && python -m pytest ai-service/ai-engine/api/tests/
cd frontend/web && npm test

# Build all
docker-compose build
```

## Architecture Overview

### Services
- **control-api** (Go, :8080): User auth, series/issue/source management, orchestration
- **control-worker** (Go, :8081): Job scheduling, email delivery, background tasks
- **ai-engine** (Python, :8000): Plan generation, RAG ingestion, issue generation, visuals
- **ai-worker** (Python): Background AI tasks (ingestion, generation)
- **web** (Next.js, :3000): Frontend dashboard and UI

### Service Locations
- `backend/control-api/` - Go control API
- `backend/control-worker/` - Go control worker
- `ai-service/ai-engine/` - Python AI engine (API + Workers)
- `frontend/web/` - Next.js frontend

### Key Integrations
- OpenRouter API for LLM inference (nvidia/nemotron-3-embed-1b:free)
- Qdrant for vector storage and retrieval
- PostgreSQL for relational data
- MinIO for object storage
- Brevo for email delivery
- Redis for job queue (Asynq)

### Testing Approach
- Go: standard `go test` with mock databases
- Python: pytest with pytest-asyncio
- Frontend: Jest + React Testing Library
- Integration tests: docker-compose environment

## Development Guidelines

1. All PRs require passing CI checks
2. Database migrations are in `db/migrations/`
3. API routes follow RESTful patterns
4. Frontend uses Next.js App Router
5. Python services use FastAPI with async patterns
6. Go services use Gin framework with structured handlers
