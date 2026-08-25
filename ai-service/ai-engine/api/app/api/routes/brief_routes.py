"""API routes for newsletter brief extraction."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Dict, Optional
import logging

from app.services.brief_extractor import BriefExtractor
from app.services.model_service import ModelService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/brief")


class BriefExtractRequest(BaseModel):
    raw_text: str = Field(..., min_length=20, description="Messy notes, transcript, or raw input")
    source_type: Optional[str] = Field("notes", description="notes|transcript|voice|research")
    preferred_level: Optional[str] = None
    preferred_tone: Optional[str] = None
    preferred_length: Optional[str] = None
    preferred_cadence: Optional[str] = None
    model: Optional[str] = None


class BriefExtractResponse(BaseModel):
    brief: Dict[str, Any]


@router.post("/extract")
async def extract_brief(request: BriefExtractRequest):
    try:
        extractor = BriefExtractor(ModelService())
        brief = await extractor.extract(
            raw_text=request.raw_text,
            source_type=request.source_type or "notes",
            preferred_level=request.preferred_level,
            preferred_tone=request.preferred_tone,
            preferred_length=request.preferred_length,
            preferred_cadence=request.preferred_cadence,
            model=request.model,
        )
        return BriefExtractResponse(brief=brief)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Brief extraction failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
