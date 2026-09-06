# Cadensend system architecture

High-level view of the monorepo and how services connect at runtime.

## System diagram

```mermaid
flowchart LR
  User --> Web["Next.js web :3000"]
  Web --> API["control-api Go :8080"]
  API --> PG[(PostgreSQL)]
  API --> Redis[(Redis)]
  API --> AI["ai-engine FastAPI :8000"]
  Worker["control-worker Go"] --> Redis
  Worker --> PG
  Worker --> Brevo[Email / Brevo]
  AI --> Qdrant[(Qdrant)]
  AI --> MinIO[(MinIO)]
  AIWorker["ai-worker Python"] --> Redis
  AIWorker --> AI
```

## Service roles

| Service | Path | Responsibility |
| --- | --- | --- |
| **web** | `frontend/web/` | Dashboard, series creation, settings, Cadensend AI chat |
| **control-api** | `backend/control-api/` | Auth, REST API, orchestration, SSE proxy to AI |
| **control-worker** | `backend/control-worker/` | Async jobs: email delivery, scheduling (Asynq) |
| **ai-engine** | `ai-service/ai-engine/api/` | LLM calls, plan/issue generation, RAG, assistant agent |
| **ai-worker** | `ai-service/ai-engine/workers/` | Background AI: ingestion, generation |

## Data stores

| Store | Use |
| --- | --- |
| **PostgreSQL** | Users, workspaces, series, issues, sources, LLM config, assistant threads |
| **Qdrant** | Vector search for RAG |
| **Redis** | Job queue (Asynq) |
| **MinIO** | PDFs, assets, generated files |

## Request flow (series → email)

```mermaid
sequenceDiagram
  participant U as User
  participant W as web
  participant A as control-api
  participant AI as ai-engine
  participant Q as Qdrant
  participant R as Redis
  participant CW as control-worker

  U->>W: Create series + sources
  W->>A: POST /v1/series
  A->>A: Save to Postgres
  A->>R: Enqueue ingest / generate jobs
  R->>AI: ai-worker consumes jobs
  AI->>Q: Chunk, embed, retrieve
  AI->>A: Persist plan / issue content
  U->>W: Approve issue
  W->>A: Approve + schedule send
  A->>R: Enqueue delivery
  R->>CW: Deliver email
  CW->>U: Newsletter sent
```

## Repo layout

```
cadensend/
├── frontend/web/           # Next.js App Router UI
├── backend/
│   ├── control-api/        # Main REST API (Gin)
│   └── control-worker/     # Background worker
├── ai-service/ai-engine/
│   ├── api/                # FastAPI app
│   └── workers/            # Python job consumers
├── db/migrations/          # SQL migrations
├── packages/               # Shared contracts / email templates
└── docs/                   # Architecture and project docs
```

## Related docs

- [AGENTS.md](../AGENTS.md) — build commands and dev guidelines
- [ai-service/ai-engine/ARCHITECTURE.md](../ai-service/ai-engine/ARCHITECTURE.md) — LangGraph agent, RAG pipeline, AI internals
