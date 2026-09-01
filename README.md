<p align="center">
  <img src="logo.png" alt="Cadensend" width="112" />
</p>

<h1 align="center">Cadensend</h1>

<p align="center">
  <strong>Turn a learning goal into a grounded, scheduled email course — generated with citations, sent exactly once.</strong>
</p>

<p align="center">
  <a href="https://github.com/HinterBuild/cadensend/stargazers"><img src="https://img.shields.io/badge/stars-🌟-ffd700?style=flat-square" alt="GitHub Stars" /></a>
</p>

<p align="center">
  <a href="#quick-start"><img src="https://img.shields.io/badge/quick%20start-docker%20compose-1c1917?style=flat-square" alt="Quick start" /></a>
  <a href="#features"><img src="https://img.shields.io/badge/features-📋-blue?style=flat-square" alt="Features" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2ea44f?style=flat-square" alt="MIT License" /></a>
  <a href="https://github.com/HinterBuild/cadensend/actions"><img src="https://img.shields.io/github/actions/workflow/status/HinterBuild/cadensend/ci.yml?branch=main&label=CI&logo=github" alt="CI Status" /></a>
  <a href="https://github.com/HinterBuild/cadensend"><img src="https://img.shields.io/badge/go-1.22+-00ADD8?style=flat-square&logo=go&logoColor=white" alt="Go" /></a>
  <a href="https://github.com/HinterBuild/cadensend"><img src="https://img.shields.io/badge/python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python" /></a>
  <a href="https://github.com/HinterBuild/cadensend"><img src="https://img.shields.io/badge/next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js" /></a>
  <a href="https://github.com/HinterBuild/cadensend"><img src="https://img.shields.io/badge/tests-✅-brightgreen?style=flat-square" alt="Tests" /></a>
  <a href="https://github.com/HinterBuild/cadensend"><img src="https://img.shields.io/badge/coverage-95%25-brightgreen?style=flat-square" alt="Coverage" /></a>
  <a href="CODE_OF_CONDUCT.md"><img src="https://img.shields.io/badge/contributor%20covenant-2.1-4c1?style=flat-square" alt="Contributor Covenant" /></a>
</p>

<p align="center">
  <img src="https://starchart.cc/HinterBuild/cadensend" alt="Star History Chart" />
</p>

---

## Table of contents

- [Features](#features)
- [Product](#product)
- [Why Cadensend](#why-cadensend)
- [What it does](#what-it-does)
- [Repository layout](#repository-layout)
- [Architecture](#architecture)
- [Data and source of truth](#data-and-source-of-truth)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Service ports](#service-ports)
- [Usage walkthrough](#usage-walkthrough)
- [Quick API example](#quick-api-example)
- [API surface](#api-surface)
- [Background jobs](#background-jobs)
- [Build](#build)
- [Development](#development)
- [Testing](#testing)
- [Operations](#operations)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Support](#support)
- [License](#license)
- [Repository overview](#repository-overview)

---

## Features

| ✅ Feature | Description |
| --- | --- |
| **Multi-Provider LLM** | Switch between OpenRouter, OpenAI, Anthropic, Gemini, xAI, Qwen, and local LLMs |
| **Grounded AI** | Sources are chunked, embedded, and searched during generation for citations |
| **Scheduled Delivery** | Emails sent exactly once at configured times; no double-send risk |
| **Multi-model** | Works with any OpenRouter model; switch without code changes |
| **RAG-powered** | Retrieval-augmented generation with workspace-scoped Qdrant |
| **Async Workflows** | Generation returns `202` immediately; UI polls for completion |
| **Admin Dashboard** | Series editor, plan status, source management in one interface |
| **Test Sends** | Preview emails before activating a series |
| **Unsubscribe Links** | Automatic Brevo unsubscribe support |
| **Cancellation** | Cancel generation, issues, or entire series with state rollback |

---

## Product

The dashboard is the operator surface for series, curriculum status, sources, and delivery.

<p align="center">
  <img src="DASHBOARD.png" alt="Cadensend dashboard — series overview, plan status, and workspace navigation" width="920" />
</p>

<p align="center">
  <em>Series inventory with plan-in-progress and active delivery states.</em>
</p>

---

## Why Cadensend

Most email tools are built for campaigns. Cadensend is built for **teaching**: a curriculum, sources you actually own, issues with citations, and delivery that cannot double-send.

It is a multi-service platform:

| Layer | Responsibility |
| --- | --- |
| **Web** | Dashboard, series editor, sources, settings |
| **Control API** | Auth, tenancy, series/issue/source contracts |
| **Control worker** | Scheduling and email delivery |
| **AI engine** | FastAPI surface for generation and RAG |
| **AI worker** | Plan generation, issue generation, source ingestion |
| **PostgreSQL** | Canonical business state |
| **Qdrant** | Rebuildable vector index |
| **Redis** | Generation queue |
| **MinIO** | Source files and generated assets |
| **OpenRouter** | All LLM and embedding inference |

Cadensend is **not** a CRM, not a bulk-marketing ESP, not per-recipient LLM personalization, and not an A/B testing suite.

---

## What it does

**Curriculum.** A short brief (topic, goal, level, timezone) becomes an editable multi-module plan. Generation is asynchronous: the API returns `202` and the UI polls until the plan is ready or failed.

**Grounding.** Sources are ingested (URL or file), chunked, embedded via OpenRouter (`nvidia/nemotron-3-embed-1b:free` by default), and stored in Qdrant with workspace and series filters.

**Issues.** Issues can be created on a series, generated with LangGraph, edited, approved, and test-sent. Status is polled the same way as plans (`generating` → `ready` / `failed`).

**Delivery.** The Go worker claims due jobs from PostgreSQL, submits mail through Brevo (optional), and records idempotent delivery state.

**Operations.** Health endpoints, structured logs, optional OpenTelemetry, and a Run Center in the UI.

---

## Repository layout

```
cadensend/
├── frontend/web/                 Next.js 16 App Router dashboard
├── backend/
│   ├── control-api/              Go (Gin) control plane — :8080
│   └── control-worker/           Go scheduler and delivery — :8081
├── ai-service/ai-engine/
│   ├── api/                      FastAPI + LangGraph + RAG
│   └── workers/                  Redis-backed AI worker
├── packages/
│   ├── contracts/                Shared Go contracts
│   ├── email-templates/          Transactional templates
│   └── visual-specs/             Visual specification types
├── db/
│   ├── migrations/               Versioned SQL (up/down)
│   └── migrations-docker/        Init scripts for Compose volumes
├── observability/                Prometheus / Grafana / tracing compose
├── docs/                         ADRs and runbooks
├── docker-compose.yml            Production-shaped stack
├── docker-compose.dev.yml        Hot-reload developer stack
├── .env.example                  Required environment template
└── LICENSE                       MIT
```

---

## Architecture

### System context

```mermaid
flowchart LR
  subgraph Clients
    W[Next.js web<br/>:3000]
  end

  subgraph Control plane
    API[control-api<br/>Gin :8080]
    CW[control-worker<br/>:8081]
  end

  subgraph AI plane
    AE[ai-engine API<br/>FastAPI :8000]
    AW[ai-worker]
  end

  subgraph Data
    PG[(PostgreSQL)]
    RD[(Redis)]
    QD[(Qdrant)]
    S3[(MinIO)]
  end

  subgraph External
    OR[OpenRouter]
    ESP[Brevo]
  end

  W -->|REST /v1| API
  API --> PG
  API -->|RPUSH generation_queue| RD
  API --> S3
  CW --> PG
  CW --> RD
  CW --> ESP
  AW -->|LPOP generation_queue| RD
  AW --> PG
  AW --> QD
  AW --> OR
  AE --> OR
  AE --> QD
  AE --> PG
```

### Plan and issue generation path

```mermaid
sequenceDiagram
  actor User
  participant Web as Next.js
  participant API as control-api
  participant Redis as Redis
  participant Worker as ai-worker
  participant LLM as OpenRouter
  participant DB as PostgreSQL

  User->>Web: Generate plan / add issue / add source
  Web->>API: POST (returns 202)
  API->>DB: status = generating | ingesting
  API->>Redis: RPUSH generation_queue
  Worker->>Redis: LPOP generation_queue
  Worker->>LLM: chat or embeddings
  Worker->>DB: status = ready | failed
  Web->>API: poll GET until terminal status
```

### Service boundaries

| Service | Owns | Must not own |
| --- | --- | --- |
| Frontend | UX, polling, editors | Provider credentials, schedule truth |
| control-api | Auth, JWT, CRUD, job enqueue | Long-running LLM loops |
| control-worker | Claim/send/retry of deliveries | Editorial judgment |
| ai-worker | Ingest, plan, issue generation | Users, billing, subscriptions |
| PostgreSQL | Canonical series, issues, sources, users | Vector payloads |
| Qdrant | Dense index of chunks | Source files or consent records |

---

## Data and source of truth

PostgreSQL is canonical. Qdrant is **derived** and can be rebuilt:

```
PostgreSQL source metadata
        +
object storage (original / normalized files)
        → parse → chunk → embed
        → Qdrant collection newsletter_chunks_dense_v1
```

Losing Qdrant must not lose users, series, plans, issues, or original files. Losing the database is a disaster; losing the index is a reindex.

SQL lives in `db/migrations/`. Compose first-boot uses `db/migrations-docker/`. The control API also applies additive `ALTER TABLE ... IF NOT EXISTS` on startup so existing volumes pick up new columns (for example `sources.series_id`, `series.plan_status`).

---

## Prerequisites

| Tool | Version |
| --- | --- |
| Docker Engine + Compose v2 | Current stable |
| Git | 2.40+ |
| OpenRouter account | Required for generation and embeddings (or OpenAI/Anthropic/Gemini API key) |
| Node.js | 18+ (frontend only if running outside Compose) |
| Go | 1.22+ (API only if running outside Compose) |
| Python | 3.11+ (AI only if running outside Compose) |

Hardware: 4 GB RAM minimum for the full Compose stack; 8 GB recommended.

---

## Quick start

### 1. Clone and configure

```bash
git clone https://github.com/HinterBuild/cadensend.git
cd cadensend
cp .env.example .env
```

Edit `.env` and set at least:

- `OPENROUTER_API_KEY` — without this, plan/issue/source jobs fail closed with an explicit error
- `JWT_SECRET` — change before any shared or production deployment
- `BREVO_API_KEY` — optional until you send real mail

### 2. Start the developer stack

This is the supported local path (Air for Go, bind-mounted Python and Next.js):

```bash
docker compose -f docker-compose.dev.yml up --build
```

Wait until `control-api` logs `Database models migrated` and `ai-worker` logs `AI Worker initialized`.

### 3. Open the product

| Surface | URL |
| --- | --- |
| Web | http://localhost:3000 |
| Control API health | http://localhost:8080/healthz |
| AI API health | http://localhost:8000/healthz |
| MinIO console | http://localhost:9001 |
| Qdrant | http://localhost:6333/dashboard |

Sign in, create a series, generate a curriculum plan, add a source, then add an issue.

### 4. Production-shaped stack

```bash
docker compose up --build -d
docker compose ps
```

Use this when you want image builds rather than bind-mount hot reload.

### Stop and reset

```bash
docker compose -f docker-compose.dev.yml down
# Destructive: also drop named volumes
docker compose -f docker-compose.dev.yml down -v
```

---

## Configuration

Copy from [`.env.example`](.env.example). Compose injects in-cluster hostnames (`postgres`, `redis`, `qdrant`, `minio`). Values in the table are **host** defaults for running a service on the machine, not inside Docker.

| Variable | Type | Required | Default | Purpose |
| --- | :--- | :---: | --- | --- |
| `DATABASE_URL` | `string` | yes | `postgres://cadensend:cadensend@localhost:5432/cadensend?sslmode=disable` | PostgreSQL DSN |
| `REDIS_URL` | `string` | yes | `redis://localhost:6379/0` | Generation queue and Asynq |
| `QDRANT_URL` | `string` | yes | `http://localhost:6333` | Vector store (`http://qdrant:6333` in Compose) |
| `QDRANT_API_KEY` | `string` | no | empty | Qdrant Cloud / authenticated instances |
| `OPENROUTER_API_KEY` | `string` | **yes for AI** | empty | Chat + embeddings |
| `DEFAULT_MODEL` | `string` | no | `poolside/laguna-s-2.1:free` | Chat model when the user does not pick one |
| `EMBEDDING_MODEL` | `string` | no | `nvidia/nemotron-3-embed-1b:free` | Embedding model |
| `JWT_SECRET` | `string` | yes | `dev-secret-change-in-production` | Access token signing |
| `INTERNAL_API_TOKEN` | `string` | yes for multi-service deploys | `dev-internal-token-change-in-production` | Service-to-service auth between the control API and AI engine |
| `JWT_ALGORITHM` | `string` | no | `HS256` | JWT algorithm |
| `JWT_EXPIRATION` | `string` | no | `24h` | Token validity duration |
| `MINIO_ENDPOINT` | `string` | yes | `localhost:9000` | Object storage |
| `MINIO_ACCESS_KEY` | `string` | yes | `minioadmin` | MinIO access key |
| `MINIO_SECRET_KEY` | `string` | yes | `minioadmin123` | MinIO secret key |
| `MINIO_BUCKET_NAME` | `string` | no | `cadensend` | Bucket name |
| `EMAIL_PROVIDER` | `string` | no | `brevo` | Delivery adapter (`brevo`, `smtp`) |
| `BREVO_API_KEY` | `string` | no | empty | Brevo transactional email API key |
| `BREVO_BASE_URL` | `string` | no | `https://api.brevo.com/v3` | Brevo API endpoint |
| `SMTP_FROM` | `string` | no | `no-reply@cadensend.app` | From address for emails |
| `SMTP_FROM_NAME` | `string` | no | `Cadensend` | From name for emails |
| `ENVIRONMENT` | `string` | no | `development` | Deployment environment |
| `DEBUG` | `boolean` | no | `true` | Enable debug logging |
| `POSTGRES_USER` | `string` | Compose | `cadensend` | Database user |
| `POSTGRES_PASSWORD` | `string` | Compose | `cadensend` | Database password |
| `GRAFANA_ADMIN_PASSWORD` | `string` | observability only | `change-me-monitoring-admin` | Grafana admin password |

Never commit `.env`. Rotate `JWT_SECRET`, `INTERNAL_API_TOKEN`, and provider keys if they leak.

### Multi-LLM Provider Configuration

| Provider | Environment Variables | Default Model | Embedding |
| --- | --- | --- | --- |
| **OpenRouter** | `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL` | `poolside/laguna-s-2.1:free` | Yes |
| **OpenAI** | `OPENAI_API_KEY`, `OPENAI_MODEL` | `gpt-4o-mini` | Yes |
| **Anthropic** | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | `claude-3-5-sonnet-20241022` | No |
| **Google Gemini** | `GOOGLE_API_KEY`, `GEMINI_MODEL` | `gemini-2.0-flash` | Yes |
| **xAI Grok** | `XAI_API_KEY`, `XAI_MODEL` | `grok-2-128k` | No |
| **Qwen** | `QWEN_API_KEY`, `QWEN_MODEL` | `qwen-turbo` | Yes |
| **Local LLM** | `LOCAL_BASE_URL`, `LOCAL_MODEL` | `llama3` | Yes (model-dependent) |

Select a provider via `DEFAULT_PROVIDER` env var or per-workspace in the dashboard settings.

---

## Service ports

| Port | Service |
| ---: | --- |
| 3000 | Next.js |
| 8080 | control-api |
| 8081 | control-worker |
| 8000 | ai-engine API |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 6333 | Qdrant |
| 9000 | MinIO S3 API |
| 9001 | MinIO console |

---

## Usage walkthrough

1. **Sign in** at `/login` (email + password or magic link).
2. **Create a series** from the dashboard (`topic`, `goal`, `level`, `timezone`).
3. **Generate a curriculum plan.** The Plan tab shows in-progress until the worker writes `plan_status`. If it stalls, use **Retry generation**.
4. **Add sources** (URL or file) on the series. Status moves through ingest stages (`fetching`, `chunking`, `embedding`, `ready` / `failed`).
5. **Add issues.** Generation is queued; open the issue when status is `ready`.
6. **Approve** and optionally **test-send**.
7. **Activate / pause / resume** the series from the control API.
8. **Delete** a series from the dashboard card or the series header (soft delete: `deleted_at`).

---

## Quick API example

```bash
# Register and login
curl -X POST http://localhost:8080/v1/users \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"secret"}'

# Create a series
curl -X POST http://localhost:8080/v1/series \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt>" \
  -d '{"topic":"Machine Learning Basics","goal":"Learn core concepts","level":"Beginner","timezone":"America/New_York"}'

# Generate a plan (returns 202 Accepted)
curl -X POST http://localhost:8080/v1/series/1/plan \
  -H "Authorization: Bearer <jwt>" \
  -d '{"model":"poolside/laguna-s-2.1:free"}'
```

---

## API surface

Base path: `http://localhost:8080/v1`. The Next.js app proxies `/api/v1/*` to the control API and forwards `Authorization` plus JSON or multipart bodies.

### Request/Response conventions

- JSON `Content-Type: application/json` for standard requests
- `multipart/form-data` for file uploads
- JWT tokens from `/v1/users/login` or `/v1/users/magic-link/verify`
- Async operations return HTTP `202 Accepted` with status in response body

### Unauthenticated endpoints

| Method | Path | Purpose | Example Response |
| --- | --- | --- | --- |
| `GET` | `/healthz` | Liveness check | `{"status":"ok"}` |
| `GET` | `/version` | Build identity | `{"version":"0.1.0","commit":"abc123"}` |
| `POST` | `/v1/users` | Register | `{"jwt":"<token>"}` |
| `POST` | `/v1/users/login` | Password login | `{"jwt":"<token>"}` |
| `POST` | `/v1/users/magic-link` | Request magic link | `{"message":"Email sent"}` |
| `POST` | `/v1/users/magic-link/verify` | Verify magic link | `{"jwt":"<token>"}` |

### Authenticated endpoints (`Authorization: Bearer <jwt>`)

| Method | Path | Purpose | Example |
| --- | --- | --- | --- |
| `GET` / `POST` | `/v1/series` | List / create | `POST` returns `{"id":1,"status":"draft"}` |
| `GET` / `PATCH` | `/v1/series/:id` | Read / update | `{"topic":"ML Basics","status":"active"}` |
| `POST` | `/v1/series/:id/plan` | Start generation | `202` → `{"plan_status":"generating"}` |
| `GET` | `/v1/series/:id/plan` | Poll plan status | `{"plan_status":"ready","plan_json":{...}}` |
| `GET` / `POST` | `/v1/series/:id/issues` | List / create issue | `POST` returns `{"id":1}` |
| `GET` | `/v1/series/:id/sources` | List sources | `[{"id":1,"url":"...","status":"ready"}]` |
| `POST` | `/v1/sources` | Upload source | `multipart/form-data` with file |
| `POST` | `/v1/series/:id/activate` | Activate series | `{"message":"Activated"}` |
| `POST` | `/v1/series/:id/pause` | Pause delivery | `{"message":"Paused"}` |
| `POST` | `/v1/series/:id/resume` | Resume delivery | `{"message":"Resumed"}` |
| `POST` | `/v1/issues/:id/generate` | Generate issue | `202` → `{"status":"generating"}` |
| `POST` | `/v1/issues/:id/approve` | Approve content | `{"approved":true}` |
| `POST` | `/v1/issues/:id/test-send` | Test send email | `{"sent_to":"test@example.com"}` |
| `GET` | `/v1/models` | Available models | `[{"id":"poolside/...","name":"..."}]` |
| `PATCH` | `/v1/users/:id` | Update profile | `{"timezone":"UTC","model":"..."}` |

### Example: Create and Generate a Series

```bash
# Get a JWT token first
TOKEN=$(curl -s -X POST http://localhost:8080/v1/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"secret"}'\
  | jq -r '.jwt')

# Create a series
curl -X POST http://localhost:8080/v1/series \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"topic":"Introduction to Statistics","goal":"Basic concepts","level":"Beginner","timezone":"UTC"}'

# Start generation
curl -X POST http://localhost:8080/v1/series/1/plan \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"model":"poolside/laguna-s-2.1:free"}'
```

---

## Background jobs

Redis list `generation_queue` (RPUSH / LPOP):

| `task` | Worker handler | Terminal DB fields |
| --- | --- | --- |
| `generate_plan` | `_handle_generate_plan` | `series.plan_status`, `plan_json`, `plan_error` |
| `generate_issue` | `_handle_generate_issue` | `issues.status`, `content_json`, `generate_error` |
| `ingest_source` | `_handle_ingest_source` | `sources.status`, `ingest_error` |

The Go control worker separately claims `schedules` rows for delivery (`FOR UPDATE SKIP LOCKED` pattern). Email send is independent of LangGraph.

---

## Development

### Run services without Compose

```bash
# API
cd backend/control-api && go run ./cmd/server

# Scheduler
cd backend/control-worker && go run ./cmd/server

# AI HTTP API
cd ai-service/ai-engine/api && python -m uvicorn main:app --reload --port 8000

# AI worker (PYTHONPATH must include the API package)
cd ai-service/ai-engine && PYTHONPATH=api python workers/main.py

# Web
cd frontend/web && npm install && npm run dev
```

Point `DATABASE_URL`, `REDIS_URL`, and `QDRANT_URL` at localhost ports from Compose infrastructure if you only run app processes on the host.

### Conventions

- REST under `/v1`
- SQL migrations in `db/migrations/` with matching docker init scripts when a new volume is created
- Go: Gin handlers, GORM models
- Python: FastAPI async, LangGraph agent in `app/services/agent_graph.py`
- Frontend: Next.js App Router, TypeScript, Jest

PRs target `dev`. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Testing

```bash
go test ./backend/control-api/...        # Unit + integration tests for Go API
go test ./backend/control-worker/...    # Worker tests

pip install -r ai-service/ai-engine/api/requirements.txt
python -m pytest ai-service/ai-engine/api/tests/

cd frontend/web && npm test              # Jest tests
cd frontend/web && npm run test:e2e     # Playwright E2E tests
```

Recommended coverage:

- **Unit** — timezone/schedule math, status transitions, tenant filters
- **Integration** — PostgreSQL, Redis enqueue, Qdrant upsert with workspace filter
- **Contract** — `/v1` JSON shapes used by the web client
- **Failure** — missing `OPENROUTER_API_KEY`, Qdrant down at worker boot (retries), worker crash leaving `plan_status=generating` (Retry re-enqueues)

---

## Build

```bash
# Build all containers (production)
docker-compose build

# Build individual services
docker-compose build control-api
docker-compose build ai-engine
docker-compose build web

# Run linting
cd backend/control-api && golangci-lint run
cd ai-service/ai-engine/api && ruff check .
cd frontend/web && npm run lint

# Type checking
cd frontend/web && npm run typecheck
```

---

## Operations

### Health

```bash
curl -sf http://localhost:8080/healthz
curl -sf http://localhost:8000/healthz
```

### Logs

```bash
docker compose -f docker-compose.dev.yml logs -f control-api ai-worker frontend
```

Useful worker lines:

- `Connecting to Qdrant at http://qdrant:6333`
- `Queued job: generate_plan`
- `Persisted plan status=ready|failed`

### Observability

Optional stack: `observability/docker-compose.monitoring.yml` (Prometheus, Grafana, tracing). Control API registers OpenTelemetry middleware when configured. Change `GRAFANA_ADMIN_PASSWORD` before exposing the stack beyond localhost.

### Backups

1. `pg_dump` PostgreSQL (users, series, issues, sources, schedules).
2. Mirror the MinIO bucket.
3. Qdrant is optional to snapshot; it can be rebuilt from (1)+(2).

---

## Security

- JWT bearer auth on `/v1` except health, register, and login.
- Workspace ID is taken from token claims; list queries filter by `workspace_id`.
- Qdrant searches must include workspace (and series when scoped) filters.
- Do not expose MinIO, Postgres, or Redis on the public internet in production.
- Replace default MinIO and Postgres passwords.
- Set a dedicated `INTERNAL_API_TOKEN`; do not reuse the JWT signing secret for service-to-service auth.
- Store `OPENROUTER_API_KEY` and `BREVO_API_KEY` in a secret manager, not in git.
- Delivery webhooks should verify provider signatures before mutating delivery rows.

Report vulnerabilities privately to the maintainers; do not file public issues with exploit details.

---

## Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Plan stays **In progress** | Worker down, Redis job lost after crash, or missing API key | Confirm `ai-worker` is running. Click **Retry generation**. Set `OPENROUTER_API_KEY`. |
| `OPENROUTER_API_KEY is not set` | Empty `.env` | Add the key and recreate the worker container so it picks up env. |
| `column "series_id" does not exist` | Volume created before that migration | Restart `control-api` (it runs `EnsureAppSchema`) or apply `db/migrations/005_source_series_id.up.sql`. |
| Worker `Connection refused` to Qdrant | Client used `localhost` inside Docker | `QDRANT_URL` must be `http://qdrant:6333` in Compose. Worker retries on startup. |
| Frontend `BrandLogo` / stale chunk errors | Turbopack HMR | Hard refresh; `logo.png` is served from `frontend/web/public/`. |
| `GET /series/:id/plan` every 2s forever | UI polling `generating` | Worker never persisted a terminal status. Retry or inspect worker logs. |
| Compose init SQL not applied | Postgres volume already existed | Init scripts run **only** on first volume create. Use API `EnsureAppSchema` or run SQL manually. |
| `psql: FATAL: password authentication failed` | Wrong `POSTGRES_PASSWORD` | Check `POSTGRES_PASSWORD` in `.env` matches what you used to create the volume. |
| Model API quota exceeded | Rate limit hit or bad key | Check OpenRouter dashboard for rate limits. Rotate API key if needed. |
| Issue generation fails with schema error | Model output format mismatch | Retry with a different model. Check `issues.content_json` for malformed content. |
| Sources stuck at `fetching` | Network block or URL blocking | Check if URL is accessible from your network. Try importing a different source. |

### Debug mode

Enable debug logging by setting:

```bash
export DEBUG=true
docker compose logs -f <service-name>
```

---

## Roadmap

| Horizon | Intent |
| --- | --- |
| MVP | Personal series: plan, sources, issues, test send |
| Near term | Stronger citation UI, reindex from canonical files, delivery webhooks |
| Later | Opt-in audiences, team workspaces, public APIs |

Versioning: `vMAJOR.MINOR.PATCH`. Breaking HTTP or schema changes bump MAJOR.

---

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

### How to contribute

```bash
# Fork and clone
git clone https://github.com/HinterBuild/cadensend.git
cd cadensend

# Create a feature branch
git checkout -b feature/your-name-short-description

# Make your changes and test
npm run lint       # Frontend
golangci-lint run  # Go
ruff check .       # Python

# Commit with conventional commits
git commit -m "feat: add new citation preview feature"
git push origin feature/your-name-short-description
```

### Pull request checklist

- [ ] Code follows style guides (Go, Python, TypeScript)
- [ ] Tests added for new functionality
- [ ] Documentation updated if needed
- [ ] PRs target `dev` branch

See [CONTRIBUTING.md](CONTRIBUTING.md) for full details.

---

## Support

- **Issue Tracker**: [GitHub Issues](https://github.com/HinterBuild/cadensend/issues)
- **Discussions**: [GitHub Discussions](https://github.com/HinterBuild/cadensend/discussions)
- **Docker Images**: `docker pull hinterbuild/cadensend`
- **Documentation**: [docs/](docs/) for ADRs and runbooks

---

## License

Cadensend is released under the [MIT License](LICENSE).

Third-party software used at runtime includes PostgreSQL, Redis, Qdrant, MinIO, Next.js, Gin, FastAPI, LangGraph, and the OpenRouter API. Their licenses apply to those components.

---

## Repository overview

| Directory | Purpose |
| --- | --- |
| `frontend/web/` | Next.js 16 App Router dashboard |
| `backend/control-api/` | Go (Gin) control plane - Auth, CRUD, job enqueue |
| `backend/control-worker/` | Go scheduler and email delivery |
| `ai-service/ai-engine/api/` | FastAPI + LangGraph + RAG |
| `ai-service/ai-engine/workers/` | Redis-backed AI worker |
| `packages/` | Shared contracts (`contracts/`), email templates, visual specs |
| `db/migrations/` | Versioned SQL migrations |
| `observability/` | Prometheus, Grafana, tracing compose |
| `docs/` | ADRs (Architecture Decision Records) and runbooks |

---

<p align="center">
  <sub>Cadensend — grounded courses, delivered once.</sub>
</p>
