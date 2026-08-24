"""API routes for source management."""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional
import logging

from app.workers.ingestion_worker import IngestionWorker
from app.services.model_service import ModelService
from app.rag.embeddings.qdrant import qdrant_service
from qdrant_client.http import models as rest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sources")


class SourceUrlRequest(BaseModel):
    url: str
    workspace_id: str
    series_id: Optional[str] = None


@router.post("/urls")
async def submit_url_source(request: SourceUrlRequest):
    """Submit a URL source for ingestion."""
    try:
        worker = IngestionWorker(ModelService())
        result = await worker.process_url_source(
            request.url,
            request.workspace_id,
            request.series_id
        )
        return {"message": "Source submitted", "result": result}
    except Exception as e:
        logger.error("URL ingestion failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/uploads")
async def upload_file_source(
    file: UploadFile = File(...),
    workspace_id: str = Form(...),
    series_id: Optional[str] = Form(None),
):
    """Upload a file source for ingestion."""
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="Filename is required")
        content = await file.read()
        worker = IngestionWorker(ModelService())
        result = await worker.process_file_source(
            content,
            file.filename,
            workspace_id,
            series_id
        )
        return {"message": "File uploaded and ingestion started", "result": result}
    except Exception as e:
        logger.error("File upload failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
async def list_sources():
    """List all sources."""
    return {"sources": []}


class SourceChunksRequest(BaseModel):
    workspace_id: str
    limit: Optional[int] = 20


def _scroll_chunks(workspace_id: str, source_id: str, limit: int) -> tuple:
    points, _next = qdrant_service.client.scroll(
        collection_name=qdrant_service.collection_name,
        scroll_filter=rest.Filter(
            must=[
                rest.FieldCondition(key="workspace_id", match=rest.MatchValue(value=workspace_id)),
                rest.FieldCondition(key="source_id", match=rest.MatchValue(value=source_id)),
                rest.FieldCondition(key="active", match=rest.MatchValue(value=True)),
            ]
        ),
        with_payload=True,
        with_vectors=False,
        limit=max(1, min(limit, 100)),
    )
    return points, _next


class SourcePreviewRequest(BaseModel):
    workspace_id: str
    source_id: Optional[str] = None
    top_k: Optional[int] = 8


@router.post("/{source_id}/chunks")
async def source_chunks(source_id: str, request: SourceChunksRequest):
    """Indexed chunk previews for one ingested source (tenant-scoped)."""
    if not request.workspace_id:
        raise HTTPException(status_code=400, detail="workspace_id is required")
    try:
        points, _ = _scroll_chunks(request.workspace_id, source_id, request.limit or 20)
        chunks = []
        for point in points:
            payload = point.payload or {}
            chunks.append(
                {
                    "chunk_index": payload.get("chunk_index"),
                    "heading_path": payload.get("section_path") or [],
                    "preview": (payload.get("text_preview") or "")[:500],
                }
            )
        chunks.sort(key=lambda c: c["chunk_index"] if isinstance(c["chunk_index"], int) else 0)
        return {"data": {"source_id": source_id, "total": len(chunks), "chunks": chunks}}
    except Exception as e:
        logger.error("Source chunk listing failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{source_id}/preview")
async def source_preview(source_id: str, request: SourcePreviewRequest):
    """What has this source contributed to the index? Tenant-scoped chunk roll."""
    if not request.workspace_id:
        raise HTTPException(status_code=400, detail="workspace_id is required")
    try:
        points, _ = _scroll_chunks(
            request.workspace_id,
            source_id,
            max(request.top_k or 8, 8),
        )
        chunks = []
        for point in points:
            payload = point.payload or {}
            chunks.append(
                {
                    "chunk_index": payload.get("chunk_index"),
                    "title": payload.get("title") or "",
                    "heading_path": payload.get("section_path") or [],
                    "preview": (payload.get("content") or payload.get("text_preview") or "")[:800],
                }
            )
        chunks.sort(key=lambda c: c["chunk_index"] if isinstance(c["chunk_index"], int) else 0)
        return {"data": {"source_id": source_id, "total": len(chunks), "chunks": chunks}}
    except Exception as e:
        logger.error("Source preview failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
