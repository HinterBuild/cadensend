# AI Engine Service

See the [**main project README**](../README.md) for project overview, architecture, and contribution guide.

## Structure

```
ai-engine/
├── api/                        FastAPI + LangGraph + RAG
│   ├── app/
│   │   ├── services/           Business logic (agent_graph, model_service)
│   │   ├── platform/          Platform features (editorial tools)
│   │   └── main.py            FastAPI entry point
│   ├── tests/                 Pytest test suite
│   └── requirements.txt       Python dependencies
│
└── workers/                    Redis-backed AI worker
    └── main.py                Worker entry point
```

## API Endpoints

- `POST /v1/plans` - Generate curriculum plan
- `POST /v1/issues/:id/generate` - Generate issue content
- `POST /v1/sources/:id/ingest` - Ingest and chunk source
- `GET /v1/retrieval/search` - Search for citations

## Development

### Run the API

```bash
cd ai-service/ai-engine/api
python -m uvicorn main:app --reload --port 8000
```

### Run the Worker

```bash
cd ai-service/ai-engine
PYTHONPATH=api python workers/main.py
```

### Run Tests

```bash
pip install -r ai-service/ai-engine/api/requirements.txt
python -m pytest ai-service/ai-engine/api/tests/ -v
```

## Configuration

Environment variables are documented in the main [.env.example](../.env.example):

- `OPENROUTER_API_KEY` - Required for LLM inference
- `EMBEDDING_MODEL` - Embedding model (default: `nvidia/nemotron-3-embed-1b:free`)
- `DEFAULT_MODEL` - Chat model for plan generation
- `QDRANT_URL` - Vector store endpoint
- `REDIS_URL` - Job queue