"""API routes for source management"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sources")

class SourceUrlRequest(BaseModel):
    url: str
    workspace_id: str
    series_id: Optional[str] = None

@router.post("/urls")
async def submit_url_source(request: SourceUrlRequest):
    """Submit a URL source for ingestion"""
    try:
        from app.workers.ingestion_worker import IngestionWorker
        from app.services.model_service import ModelService
        
        worker = IngestionWorker(ModelService())
        result = await worker.process_url_source(
            request.url, 
            request.workspace_id, 
            request.series_id
        )
        return {"message": "Source submitted", "result": result}
    except Exception as e:
        logger.error(f"URL ingestion failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/uploads")
async def upload_file_source(
    file: UploadFile = File(...),
    workspace_id: str = Form(...),
    series_id: Optional[str] = Form(None)
):
    """Upload a file source for ingestion"""
    try:
        from app.workers.ingestion_worker import IngestionWorker
        from app.services.model_service import ModelService
        
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
        logger.error(f"File upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("")
async def list_sources():
    """List all sources"""
    return {"sources": []}
