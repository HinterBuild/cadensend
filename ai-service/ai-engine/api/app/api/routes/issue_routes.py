"""API routes for issue management"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/issues")

class IssueGenerateRequest(BaseModel):
    series_id: str
    objective: Optional[str] = None

class IssueGenerateResponse(BaseModel):
    issue: Dict[str, Any]
    issue_id: str

@router.post("/{issue_id}/generate")
async def generate_issue(issue_id: str, request: IssueGenerateRequest):
    """Generate an email issue with RAG citations using LangGraph"""
    try:
        from app.services.model_service import ModelService
        from app.workers.generation_worker import GenerationWorker
        
        model_service = ModelService()
        worker = GenerationWorker(model_service)
        
        issue = await worker.generate_issue(
            request.series_id, 
            issue_id, 
            request.objective or ""
        )
        return IssueGenerateResponse(issue=issue, issue_id=issue_id)
    except Exception as e:
        logger.error(f"Issue generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
