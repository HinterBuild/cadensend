#!/usr/bin/env python3
"""
Cadensend AI Engine API - FastAPI application
This service provides the AI plane for Cadensend, handling:
- Planning and curriculum generation (LangGraph)
- RAG ingestion, retrieval, and embedding
- Issue generation with grounded citations
- Visual generation (Mermaid/D2 diagrams)
- API endpoints for orchestration by the Go control plane
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio

from app.core.config import settings
from app.core.database import init_db, close_db
from app.api.routes import series_routes, issue_routes, source_routes, retrieval_routes, health_routes
from app.services.model_service import ModelService
from app.workers.ingestion_worker import IngestionWorker
from app.workers.generation_worker import GenerationWorker

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    await init_db()
    app.state.model_service = ModelService()
    app.state.ingestion_worker = IngestionWorker(app.state.model_service)
    app.state.generation_worker = GenerationWorker(app.state.model_service)
    
    # Start background workers in background task
    ingestion_task = asyncio.create_task(app.state.ingestion_worker.start())
    generation_task = asyncio.create_task(app.state.generation_worker.start())
    
    yield
    
    # Cleanup
    await close_db()
    ingestion_task.cancel()
    generation_task.cancel()

app = FastAPI(
    title="Cadensend AI Engine API",
    description="AI services for newsletter generation, RAG, planning, and visual content",
    version="0.1.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health_routes.router)
app.include_router(series_routes.router, prefix="/v1")
app.include_router(issue_routes.router, prefix="/v1")
app.include_router(source_routes.router, prefix="/v1")
app.include_router(retrieval_routes.router, prefix="/v1")

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Cadensend AI Engine API", "version": "0.1.0"}
