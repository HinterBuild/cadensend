"""
Cadensend AI Engine API - FastAPI application
This service provides the AI plane for Cadensend, handling:
- Planning and curriculum generation (LangGraph)
- RAG ingestion, retrieval, and embedding
- Issue generation with grounded citations
- Visual generation (Mermaid/D2 diagrams)
- API endpoints for orchestration by the Go control plane
"""

from fastapi import FastAPI, BackgroundTasks, HTTPException, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import asyncio
import logging

from app.core.config import settings
from app.core.database import init_db, close_db
from app.services.model_service import ModelService
from app.rag.chunking.text_splitter import chunking_service
from app.rag.embeddings.qdrant import qdrant_service
from app.rag.retrieval.retrieval import retrieval_service
from app.visuals.visual_service import visual_service

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

model_service = ModelService()

class SeriesBriefCreate(BaseModel):
    topic: str
    goal: str
    level: str
    timezone: str
    start_date: str
    duration: str
    cadence: str
    send_days: str
    send_time: str
    language: str = "en"
    citation_req: str = "required"
    verify_recipient: bool = True
    manual_approval: bool = True

class PlanGenerateRequest(BaseModel):
    brief: Dict[str, Any]
    series_id: str

class IssueGenerateRequest(BaseModel):
    series_id: str
    issue_id: str
    objective: str

class SourceUrlRequest(BaseModel):
    url: str
    workspace_id: str
    series_id: Optional[str] = None

@app.on_event("startup")
async def startup_event():
    await init_db()
    qdrant_service.ensure_collection(settings.EMBEDDING_DIMENSION)
    logger.info("AI Engine API started")

@app.on_event("shutdown")
async def shutdown_event():
    await close_db()
    logger.info("AI Engine API stopped")

@app.get("/healthz")
async def healthz():
    return {"status": "healthy"}

@app.post("/v1/series/{series_id}/plan")
async def generate_plan(series_id: str, request: PlanGenerateRequest):
    """Generate a curriculum plan based on a series brief using LangGraph"""
    from app.workers.generation_worker import GenerationWorker
    worker = GenerationWorker(model_service)
    
    plan = await worker.generate_plan(request.brief)
    return {"plan": plan, "series_id": series_id}

@app.post("/v1/issues/{issue_id}/generate")
async def generate_issue(issue_id: str, request: IssueGenerateRequest):
    """Generate an email issue with RAG citations using LangGraph"""
    from app.workers.generation_worker import GenerationWorker
    worker = GenerationWorker(model_service)
    
    issue = await worker.generate_issue(
        request.series_id, 
        issue_id, 
        request.objective
    )
    return {"issue": issue, "issue_id": issue_id}

@app.post("/v1/sources/urls")
async def submit_url_source(request: SourceUrlRequest):
    """Submit a URL source for ingestion"""
    from app.workers.ingestion_worker import IngestionWorker
    worker = IngestionWorker(model_service)
    
    await worker.process_url_source(request.url, request.workspace_id)
    return {"message": "Source submitted", "url": request.url}

@app.post("/v1/sources/uploads")
async def upload_file_source(
    file: UploadFile = File(...),
    workspace_id: str = Form(...),
    series_id: Optional[str] = Form(None)
):
    """Upload a file source for ingestion"""
    content = await file.read()
    
    from app.workers.ingestion_worker import IngestionWorker
    worker = IngestionWorker(model_service)
    
    await worker.process_file_source(content, file.filename, workspace_id)
    return {"message": "File uploaded and ingestion started"}

@app.post("/v1/retrieval/preview/{series_id}")
async def retrieval_preview(series_id: str, query: str, top_k: int = 10):
    """Preview retrieval results for debugging"""
    from app.services.model_service import ModelService
    embeddings = model_service.get_embeddings([query])
    results = retrieval_service.retrieve(
        embeddings[0],
        workspace_id="current",
        series_id=series_id,
        top_k=top_k
    )
    return {"results": results}

@app.post("/v1/visuals/generate")
async def generate_visual(
    issue_id: str,
    content_description: str,
    diagram_type: str = "mermaid",
    data: Optional[Dict[str, Any]] = None
):
    """Generate a visual specification for an issue"""
    spec_input = {
        "content_description": content_description,
        "diagram_type": diagram_type,
        "data": data or {},
    }
    
    spec = visual_service.create_visual_spec(spec_input, model_service)
    filepath = visual_service.render_visual(spec)
    
    return {"spec": spec, "filepath": filepath}

@app.get("/")
async def root():
    return {"message": "Cadensend AI Engine API", "version": "0.1.0"}
