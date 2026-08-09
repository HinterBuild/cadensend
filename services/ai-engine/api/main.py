"""
Cadensend AI Engine API - FastAPI application
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.core.config import settings
from app.core.database import init_db, close_db
from app.services.model_service import ModelService

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

# Initialize services at startup
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

# Import and include routers
from app.api.routes import series_routes, issue_routes, source_routes, retrieval_routes, health_routes

app.include_router(health_routes.router)
app.include_router(series_routes.router, prefix="/v1")
app.include_router(issue_routes.router, prefix="/v1")
app.include_router(source_routes.router, prefix="/v1")
app.include_router(retrieval_routes.router, prefix="/v1")