"""API routes for source management"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/sources")

class SourceRequest(BaseModel):
    url: str = None
    file: bytes = None

@router.post("/urls")
async def submit_url(source: SourceRequest):
    """Submit a URL source for ingestion"""
    # This would trigger the RAG ingestion pipeline
    return {"message": "Source submitted", "url": source.url}

@router.post("/uploads")
async def upload_source(source: SourceRequest):
    """Upload a file source"""
    # This would handle file uploads to object storage
    return {"message": "File uploaded"}
