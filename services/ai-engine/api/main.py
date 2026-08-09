"""
Cadensend AI Engine API - FastAPI application
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import logging

from app.core.config import settings
from app.core.database import init_db, close_db
from app.services.model_service import ModelService
from app.workers.ingestion_worker import IngestionWorker, get_ingestion_worker

logging.basicConfig(level=settings.LOG_LEVEL.upper())
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Cadensend AI Engine API",
    description="AI services for newsletter generation, RAG, planning, and visual content",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
try:
    model_service = ModelService()
except Exception as e:
    logger.warning(f"Failed to initialize model service: {e}")
    model_service = None

@app.on_event("startup")
async def startup_event():
    await init_db()
    logger.info("AI Engine API started")

@app.on_event("shutdown")
async def shutdown_event():
    await close_db()
    logger.info("AI Engine API stopped")

@app.get("/healthz")
async def healthz():
    return {"status": "healthy"}

@app.get("/")
async def root():
    return {"message": "Cadensend AI Engine API", "version": "0.1.0"}

# Plan generation endpoint
@app.post("/v1/series/{series_id}/plan")
async def generate_plan(series_id: str):
    from app.workers.generation_worker import GenerationWorker
    worker = GenerationWorker(model_service)
    
    plan = await worker.generate_plan({
        "topic": "AI",
        "goal": "Learn AI",
        "level": "beginner",
        "duration": "4 weeks",
        "cadence": "weekly"
    })
    return {"plan": plan, "series_id": series_id}

# Issue generation endpoint
@app.post("/v1/issues/{issue_id}/generate")
async def generate_issue(issue_id: str):
    from app.workers.generation_worker import GenerationWorker
    worker = GenerationWorker(model_service)
    
    issue = await worker.generate_issue("series-1", issue_id, "Issue objective")
    return {"issue": issue, "issue_id": issue_id}

# Source URL submission endpoint
@app.post("/v1/sources/urls")
async def submit_url_source(url: str, workspace_id: str):
    worker = get_ingestion_worker()
    result = await worker.process_url_source(url, workspace_id)
    return {"message": "Source submitted", "url": url, "result": result}

# Source file upload endpoint
@app.post("/v1/sources/uploads")
async def upload_file_source(workspace_id: str):
    return {"message": "Upload endpoint - use multipart form data"}

# Retrieval preview endpoint
@app.post("/v1/retrieval/preview/{series_id}")
async def retrieval_preview(series_id: str, query: str):
    embeddings = model_service.get_embeddings([query])
    from app.rag.retrieval.retrieval import retrieval_service
    results = retrieval_service.retrieve(
        embeddings[0],
        workspace_id="current",
        series_id=series_id,
        top_k=10
    )
    return {"results": results}

# Visual generation endpoint
@app.post("/v1/visuals/generate")
async def generate_visual(
    issue_id: str,
    content_description: str,
    diagram_type: str = "mermaid"
):
    from app.visuals.visual_service import visual_service, VisualSpecInput
    spec_input = VisualSpecInput(
        content_description=content_description,
        diagram_type=diagram_type,
    )
    spec = visual_service.create_visual_spec(spec_input, model_service)
    filepath = visual_service.render_visual(spec)
    return {"spec": spec, "filepath": filepath}
