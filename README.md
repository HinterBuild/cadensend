<p align="center">
  <img src="logo.png" alt="Cadensend" width="80" />
</p>

<h1 align="center">Cadensend</h1>

<p align="center">
  Turn a learning goal into a grounded, scheduled email course — generated with citations, sent exactly once.
</p>

---

## Quick start

**Requires:** Docker + Docker Compose v2, ~8 GB RAM recommended.

```bash
git clone https://github.com/HinterBuild/cadensend.git
cd cadensend
cp .env.example .env
```

Set these in `.env` before starting:

| Variable | Required | Notes |
| --- | :---: | --- |
| `OPENROUTER_API_KEY` | yes | Plan/issue generation and embeddings |
| `JWT_SECRET` | yes | Change from default before any shared deploy |
| `BREVO_API_KEY` | no | Only needed for real email delivery |

**Start everything:**

```bash
# Hot-reload dev stack (recommended)
docker compose -f docker-compose.dev.yml up --build

# Or production-shaped images
docker compose up --build -d
```

**Open the app:** http://localhost:3000

| Service | URL |
| --- | --- |
| Web | http://localhost:3000 |
| Control API | http://localhost:8080/healthz |
| AI API | http://localhost:8000/healthz |
| MinIO console | http://localhost:9001 |
| Qdrant | http://localhost:6333/dashboard |

**First run:** sign in → create a series → generate plan → add sources → add/generate issues → test send.

**Stop / reset:**

```bash
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml down -v   # also wipes DB volumes
```

---

## What it does

Cadensend is a multi-service platform for **teaching by email**, not bulk marketing:

1. **Curriculum** — brief → AI-generated multi-module plan (async, poll until ready)
2. **Grounding** — ingest URLs/files, chunk + embed into Qdrant, cite during generation
3. **Issues** — generate, edit, approve, and schedule newsletter issues
4. **Delivery** — Go worker sends exactly once via Brevo (or SMTP)

---

## Architecture

```
frontend/web          Next.js dashboard (:3000)
backend/control-api   Auth, CRUD, job enqueue (:8080)
backend/control-worker  Schedules + email delivery (:8081)
ai-service/ai-engine  FastAPI + LangGraph + RAG (:8000)
ai-service/workers    Redis queue consumer (plan, issue, ingest)

PostgreSQL  canonical state  |  Redis  job queue
Qdrant      vector index (rebuildable)  |  MinIO  source files
```

Async jobs (`generate_plan`, `generate_issue`, `ingest_source`) are pushed to Redis; the AI worker processes them and updates PostgreSQL. The UI polls status until `ready` or `failed`.

---

## Common commands

```bash
# Logs
docker compose -f docker-compose.dev.yml logs -f control-api ai-worker frontend

# Run tests
go test ./backend/control-api/...
go test ./backend/control-worker/...
pip install -r ai-service/ai-engine/api/requirements.txt && python -m pytest ai-service/ai-engine/api/tests/
cd frontend/web && npm test

# Run a single service on the host (infra still in Docker)
cd backend/control-api && go run ./cmd/server
cd backend/control-worker && go run ./cmd/server
cd ai-service/ai-engine/api && python -m uvicorn main:app --reload --port 8000
cd ai-service/ai-engine && PYTHONPATH=api python workers/main.py
cd frontend/web && npm run dev
```

Full env reference: [`.env.example`](.env.example). Agent/CI notes: [`AGENTS.md`](AGENTS.md).

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Plan stuck on "In progress" | Check `ai-worker` logs; set `OPENROUTER_API_KEY`; retry generation |
| `OPENROUTER_API_KEY is not set` | Add key to `.env`, recreate worker container |
| Frontend module / stale build errors | `rm -rf frontend/web/.next && docker compose restart frontend` |
| Qdrant connection refused in Docker | `QDRANT_URL` must be `http://qdrant:6333` inside Compose |
| DB schema errors on old volume | Restart `control-api` (runs migrations) or `down -v` for fresh DB |

---

## Project layout

```
frontend/web/              Dashboard (Next.js)
backend/control-api/       Go API
backend/control-worker/    Go scheduler + mailer
ai-service/ai-engine/      Python AI API + workers
db/migrations/             SQL migrations
docker-compose.yml         Production-shaped stack
docker-compose.dev.yml     Dev stack with hot reload
```

---

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). MIT [LICENSE](LICENSE).
