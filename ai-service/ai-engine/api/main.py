"""
Cadensend AI Engine API - FastAPI application.
"""

from contextlib import asynccontextmanager
from typing import AsyncIterator
import os
import warnings

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

warnings.filterwarnings(
    "ignore",
    message=r"The default value of `allowed_objects` will change in a future version\..*",
)

from app.core.config import settings
from app.core.database import init_db, close_db
from app.services.model_service import ModelService
from app.services.checkpoint_backend import get_checkpoint_backend
from app.api.routes import (
    brief_routes,
    series_routes,
    issue_routes,
    source_routes,
    retrieval_routes,
    health_routes,
    models_routes,
)

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
    allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class InternalTokenMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        token = (settings.INTERNAL_API_TOKEN or "").strip()
        if not token:
            return await call_next(request)
        path = request.url.path
        if path in {"/healthz", "/", "/docs", "/openapi.json"}:
            return await call_next(request)
        provided = request.headers.get("x-internal-token") or ""
        if provided != token:
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        return await call_next(request)


app.add_middleware(InternalTokenMiddleware)

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
app.include_router(brief_routes.router, prefix="/v1")
app.include_router(series_routes.router, prefix="/v1")
app.include_router(issue_routes.router, prefix="/v1")
app.include_router(source_routes.router, prefix="/v1")
app.include_router(retrieval_routes.router, prefix="/v1")
