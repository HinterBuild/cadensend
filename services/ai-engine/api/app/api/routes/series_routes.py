"""API routes for series management"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

router = APIRouter(prefix="/series")

class SeriesBrief(BaseModel):
    topic: str
    goal: str
    level: str
    timezone: str
    start_date: str
    duration: str
    cadence: str
    send_days: str
    send_time: str

class SeriesPlan(BaseModel):
    id: str
    series_id: str
    version: int
    modules: List[dict]
    created_at: datetime
    updated_at: datetime

@router.post("/{series_id}/plan")
async def generate_plan(series_id: str):
    """Generate a curriculum plan for a series"""
    # This would integrate with the LangGraph plan generation workflow
    return {"message": "Plan generation started", "series_id": series_id}
