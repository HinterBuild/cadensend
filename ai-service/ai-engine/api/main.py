"""
Cadensend AI Engine API - FastAPI application.
"""

from contextlib import asynccontextmanager
from typing import AsyncIterator
import warnings

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

warnings.filterwarnings(
    "ignore",
    message=r"The default value of `allowed_objects` will change in a future version\..*",
)

from app.core.config import settings
from app.core.database import init_db, close_db
from app.services.model_service import ModelService
from app.services.checkpoint_backend import get_checkpoint_backend
from app.api.routes import series_routes, issue_routes, source_routes, retrieval_routes, health_routes, models_routes

import logging

logging.basicConfig(level=settings.LOG_LEVEL.upper())
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage application lifecycle: database and service initialization."""
    await init_db()
    backend = get_checkpoint_backend()
    await backend.setup()
    logger.info("AI Engine API started")
    yield
    await close_db()
    logger.info("AI Engine API stopped")


app = FastAPI(
    title="Cadensend AI Engine API",
    description="AI services for newsletter generation, RAG, planning, and visual content",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    model_service = ModelService()
except Exception as e:
    logger.warning("Failed to initialize model service: %s", e)
    model_service = None


@app.get("/healthz")
async def healthz():
    return {"status": "healthy"}


@app.get("/")
async def root():
    return {"message": "Cadensend AI Engine API", "version": "0.1.0"}


# Include routers
app.include_router(health_routes.router)
app.include_router(models_routes.router, prefix="/v1")
app.include_router(series_routes.router, prefix="/v1")
app.include_router(issue_routes.router, prefix="/v1")
app.include_router(source_routes.router, prefix="/v1")
app.include_router(retrieval_routes.router, prefix="/v1")
