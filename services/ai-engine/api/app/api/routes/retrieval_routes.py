"""API routes for retrieval preview"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/retrieval")

class RetrievalQuery(BaseModel):
    series_id: str
    query: str
    filters: dict = None

@router.post("/preview/{series_id}")
async def retrieval_preview(series_id: str, query: RetrievalQuery):
    """Preview retrieval results for a series"""
    # This would integrate with the Qdrant retrieval pipeline
    return {"message": "Retrieval preview", "series_id": series_id, "query": query.query}
