"""API routes for retrieval preview."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import logging

from app.services.model_service import ModelService
from app.rag.retrieval.retrieval import retrieval_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/retrieval")


class RetrievalPreview(BaseModel):
    query: str
    workspace_id: str
    series_id: Optional[str] = None
    top_k: Optional[int] = 8


@router.post("/preview/{series_id}")
async def retrieval_preview(series_id: str, request: RetrievalPreview):
    """Preview the exact chunks a generation would retrieve for a query.

    workspace_id is mandatory: retrieval is always tenant-scoped.
    """
    if not request.workspace_id:
        raise HTTPException(status_code=400, detail="workspace_id is required")
    try:
        model_service = ModelService()
        embeddings = model_service.get_embeddings([request.query])

        results = retrieval_service.retrieve_preview(
            embeddings[0],
            workspace_id=request.workspace_id,
            series_id=series_id if series_id and series_id != "workspace" else None,
            top_k=max(1, min(request.top_k or 8, 25)),
        )

        return {"results": results, "series_id": series_id, "query": request.query}
    except Exception as e:
        logger.error("Retrieval preview failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
