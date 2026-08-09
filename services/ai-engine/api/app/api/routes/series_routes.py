"""API routes for series management"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/series")

class PlanGenerateRequest(BaseModel):
    brief: Dict[str, Any]

class PlanGenerateResponse(BaseModel):
    plan: Dict[str, Any]
    series_id: str

@router.post("/{series_id}/plan")
async def generate_plan(series_id: str, request: PlanGenerateRequest):
    """Generate a curriculum plan for a series using LangGraph"""
    try:
        from app.services.model_service import ModelService
        from app.workers.generation_worker import GenerationWorker
        
        model_service = ModelService()
        worker = GenerationWorker(model_service)
        
        plan = await worker.generate_plan(request.brief)
        return PlanGenerateResponse(plan=plan, series_id=series_id)
    except Exception as e:
        logger.error(f"Plan generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
