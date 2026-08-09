"""API routes for retrieval preview"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/retrieval")

class RetrievalPreview(BaseModel):
    query: str
    top_k: Optional[int] = 10

class RetrievalResult(BaseModel):
    score: float
    payload: Dict[str, Any]
    id: str

@router.post("/preview/{series_id}")
async def retrieval_preview(series_id: str, request: RetrievalPreview):
    """Preview retrieval results for debugging"""
    try:
        from app.services.model_service import ModelService
        from app.rag.retrieval.retrieval import retrieval_service
        
        model_service = ModelService()
        embeddings = model_service.get_embeddings([request.query])
        
        results = retrieval_service.retrieve(
            embeddings[0],
            workspace_id="current",
            series_id=series_id,
            top_k=request.top_k or 10
        )
        
        return {"results": results, "series_id": series_id}
    except Exception as e:
        logger.error(f"Retrieval preview failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
