# Cadensend

![Logo](logo.png)

[![Build Status](https://img.shields.io/github/actions/workflow/status/HinterBuild/cadensend/ci.yml?branch=main&style=flat-square)](https://github.com/HinterBuild/cadensend/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/HinterBuild/cadensend?style=flat-square)](https://github.com/HinterBuild/cadensend/blob/main/LICENSE)
[![Docker Pulls](https://img.shields.io/docker/pulls/cadensend/cadensend?style=flat-square)](https://hub.docker.com/r/cadensend/cadensend)
[![Go Version](https://img.shields.io/badge/go-1.22+-blue?style=flat-square)](https://go.dev/doc/go1)
[![Python Version](https://img.shields.io/badge/python-3.11+-blue?style=flat-square)](https://www.python.org/downloads/release/python-3.11/)
[![Qdrant](https://img.shields.io/badge/qdrant-1.3+-blue?style=flat-square)](https://github.com/qdrant/qdrant)
[![Contributors](https://img.shields.io/github/contributors/HinterBuild/cadensend?style=flat-square)](https://github.com/HinterBuild/cadensend/graphs/contributors)
[![Release](https://img.shields.io/github/v/release/HinterBuild/cadensend?style=flat-square)](https://github.com/HinterBuild/cadensend/releases)

Turn learning goals into grounded, scheduled email courses — delivered exactly once.

## What is Cadensend?

Cadensend solves the problem of people wanting to teach through email, not bulk-marketing. Traditional email platforms lack the capability to create personalized, grounded learning experiences. Cadensend provides:

- **Grounded content**: Every factual claim is linked to specific retrieved chunks with citations
- **Idempotent delivery**: Each issue is sent exactly once, no duplicates
- **Just-in-time generation**: Issues are created 24-48 hours before delivery
- **Timezone-aware scheduling**: Delivers at the right local time for each recipient

### Non-goals

Based on the product plan, Cadensend is intentionally NOT:

- A CRM system
- A platform for arbitrary subscriber uploads
- An A/B testing framework
- A per-recipient LLM generation system

## Demo

*Cadensend's Create Series wizard: turn a learning goal into an editable curriculum plan.*

## Features

### Planning & Curriculum
- AI-generated multi-issue learning curriculum from a short brief (topic, outcome, level, timeline)
- Editable, reorderable, lockable plan timeline with prerequisite/cadence validation

### RAG & Grounding
- Structure-aware chunking with heading-path metadata
- Qdrant dense vector retrieval with mandatory workspace/tenant filters
- Structured citations that map every claim to a retrieved chunk
- Idempotent re-ingestion via deterministic point IDs

### Writing
- LangGraph-driven issue generation with bounded revision loops
- Section-level regeneration (no full re-draft)
- Content-block AST (not raw LLM HTML)

### Visuals
- Deterministic Mermaid/D2 diagram generation rendered server-side to SVG/PNG
- Alt-text requirement; unsafe diagrams rejected

### Delivery
- Durable PostgreSQL job scheduler (FOR UPDATE SKIP LOCKED)
- Delivery idempotency key prevents duplicate sends
- Signed email webhooks + state-machine delivery tracking
- Pause/resume + approval reminders

### Operations
- OpenTelemetry traces across API → worker → LangGraph → Qdrant → provider
- Per-model token/cost tracking + per-workspace budgets
- Backup/restore; Qdrant rebuild path from canonical data

## Quick start

```bash
git clone https://github.com/HinterBuild/cadensend.git
cd cadensend
docker compose up -d
cd frontend/web && npm run dev  # Frontend (dev mode)
```

### Local stack

- **Frontend**: http://localhost:3000
- **Control API**: http://localhost:8080 (health: /healthz)
- **AI API**: http://localhost:8000 (health: /healthz)

### First milestone smoke test

1. Sign in and create a series brief
2. Upload one source (PDF/Markdown/HTML)
3. Watch ingestion and verify chunks appear in Qdrant
4. Generate the first issue with citations
5. Create and preview a diagram
6. Send a test email
7. Approve the issue
8. Verify scheduled delivery time

*Note: Local tests replace external models with deterministic fixtures.*

Copy `.env.example` to `.env` and fill in your secrets:

```bash
cp .env.example .env
# Edit .env with your values
```

## How it works

### Architecture Overview

```mermaid
graph TD
    WEB["Next.js frontend"] --> API["Go control API"]
    API --> PG[("PostgreSQL<br/>business state + outbox")]
    API --> OBJ["S3-compatible storage<br/>sources + assets"]
    PG --> WORK["Go scheduler/delivery workers"]
    WORK --> AI["Python AI workers<br/>FastAPI + LangGraph"]
    AI --> QD[("Qdrant<br/>rebuildable RAG index")]
    AI --> OBJ
    WORK --> ESP["Email provider"]
    ESP --> API
</graph>
```

### Service boundaries

- **Frontend**: Forms, editors, previews, monitoring. Does NOT own schedule truth or direct provider credentials.
- **Go API**: Auth, tenancy, business state, contracts. Does NOT own long model calls or editorial reasoning.
- **Go Workers**: Job claiming, scheduling, rendering, sending, retries. Owns topic planning and content judgment.
- **Python AI Workers**: Parsing, embeddings, retrieval, LangGraph generation. Does NOT own users, subscriptions, schedules or billing state.
- **PostgreSQL**: Canonical metadata, state, outbox, audit. Large original files and vector indexes live in derived stores.
- **Object Storage**: Original and normalized files, generated assets. Authoritative status transitions happen elsewhere.
- **Qdrant**: Dense/sparse vectors and retrieval payloads. Derived data only; canonical sources are in PostgreSQL and object storage.
- **Email Provider**: Message submission and provider events. Final internal delivery state is in PostgreSQL.

### Source-of-truth rule

PostgreSQL is the canonical business state. Qdrant contains rebuildable vector indexes derived from:

```
PostgreSQL source metadata
        +
Object storage original/normalized content
        -> parsing/chunking/embedding
        -> Qdrant index
```

If Qdrant is lost, the product must reindex. Losing Qdrant must not lose user source files, consent records, plans, issues or audit history.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| DATABASE_URL | postgres://cadensend:cadensend@localhost:5432/cadensend?sslmode=disable | PostgreSQL business state |
| REDIS_URL | redis://localhost:6379/0 | Job queue (Asynq) |
| QDRANT_URL | http://localhost:6333 | Vector search |
| MINIO_ENDPOINT | localhost:9000 | S3-compatible source/assets |
| OPENROUTER_API_KEY | — | Model gateway |
| SMTP_FROM / EMAIL_PROVIDER | — | Delivery adapter |

See `.env.example` and `docker-compose.yml` for detailed environment setup.

## Usage walkthrough

Based on the 10 acceptance criteria from the product plan:

1. **Sign in** → create a series brief
2. **Generate plan** → edit/reorder/lock plan items
3. **Attach source** → upload URL or document
4. **Watch ingestion** → see progress and source errors
5. **Generate issue** → inspect retrieval context + citations
6. **Check diagram/preview** → desktop/mobile/plain-text views
7. **Test send** → send to verified address
8. **Approve + activate** → schedule for delivery
9. **Pause/resume** → control in Run Center
10. **Monitor delivery** → see exactly one issue at configured time

## Development

### Prerequisites

- Go 1.22+
- Python 3.11+
- Node 18+
- Docker
- Docker Compose

### Repository layout

```
cadensend/
├── frontend/
│   └── web/                    # Next.js frontend dashboard
├── backend/
│   ├── control-api/            # Go control API (auth, series, issues, sources)
│   └── control-worker/         # Go control worker (scheduling, delivery)
├── ai-service/
│   └── ai-engine/
│       ├── api/                # Python FastAPI app (LangGraph, RAG)
│       ├── workers/            # Python background workers
│       ├── rag/                # RAG pipeline (chunking, embeddings, retrieval)
│       └── visuals/            # Visual generation (Mermaid/D2)
├── packages/
│   ├── contracts/              # Go data contracts
│   ├── email-templates/        # SendGrid email templates
│   └── visual-specs/           # Visual specification types
├── db/
│   ├── migrations/             # PostgreSQL migrations
│   └── seeds/                  # Seed data
├── infra/
│   ├── docker/
│   └── terraform/
├── observability/              # Prometheus, Grafana, Jaeger configs
├── docs/
│   ├── adr/                    # Architecture Decisions
│   └── runbooks/
└── .github/workflows/
```

### Testing

Testing pyramid:

- **Unit tests**: Schedule/timezone calculations, state transitions, idempotency keys, tenant-filter injection, etc.
- **Integration tests**: PostgreSQL concurrency, object-storage uploads, Qdrant ingestion/filtering, reindex from canonical sources.
- **End-to-end scenario**: Full vertical slice from creating a series to verifying delivery.
- **Failure tests**: Worker crashes during ingestion, Qdrant unavailable, partial indexing failures, etc.

AI evaluation:

- Retrieval Recall@10 + NDCG@10 on labeled evaluation set
- Generation schema validation subset
- Cost and latency measurement

### Branch convention

Feature branches off `dev`. Pull requests to `dev`. Deploy to `staging` before production. The project uses trunk-based development principles.

## Roadmap & releases

### Product releases

| Release | Timeline | Outcome | Primary user |
|---------|----------|---------|-------------|
| MVP | Q1 2026 | Personal learning series | Individual learner/creator |
| Update 1 | Q2 2026 | High-quality grounded content | Technical educators |
| Update 2 | Q3 2026 | Opt-in audiences | Newsletter creators |
| Update 3 | Q4 2026 | Adaptive segmented learning | Learning businesses |
| Update 4 | H1 2027 | Teams, governance and enterprise | Companies and training teams |
| Update 5 | H2 2027 | Platform APIs and scale | Partners and larger customers |

### Tagging convention

Semantic versioning: `vX.Y.Z` where X = major release, Y = update, Z = patch.

## Contributing

### Code of conduct

Please respect our [Code of Conduct](CODE_OF_CONDUCT.md).

### Development workflow

1. Create a feature branch from `dev`
2. Make your changes
3. Run tests locally: `make test` (if available)
4. Push to your branch
5. Open a pull request to `dev`
6. Review and iterate as needed

### Pull request template

We use GitHub's pull request templates to ensure consistent reviews.

## Community & support

- **GitHub Discussions**: For questions, feature requests, and community support
- **Issues**: For bug reports and feature requests
- **Discord**: Join our community for real-time discussions

Note: This is a community-supported project. Commercial support is available through enterprise partnerships.

## License

Cadensend is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

### Acknowledgments

- **Qdrant**: Apache-2.0 licensed vector database for RAG
- **OpenTelemetry**: Observability and tracing
- **Docker**: Container orchestration
- **Go**, **Python**, **Node.js**: Core technology stack

---

<sub>Built with ❤️ for lifelong learners</sub>
