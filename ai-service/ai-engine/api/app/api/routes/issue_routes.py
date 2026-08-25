"""API routes for issue management."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import logging

from app.services.agent_graph import NewsletterAgent, get_agent
from app.services.model_service import ModelService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/issues")


class IssueGenerateRequest(BaseModel):
    series_id: str
    workspace_id: str
    objective: Optional[str] = None
    issue_number: Optional[int] = None
    plan_item: Optional[Dict[str, Any]] = None
    brief: Optional[Dict[str, Any]] = None
    model: Optional[str] = None
    refresh_from_current: bool = False
    refresh_source: Optional[Dict[str, Any]] = None


class IssueGenerateResponse(BaseModel):
    issue: Dict[str, Any]
    issue_id: str
    thread_id: str
    status: str = "complete"


@router.post("/{issue_id}/generate")
async def generate_issue(issue_id: str, request: IssueGenerateRequest):
    """Generate an email issue with RAG citations using the LangGraph agent.

    The agent uses:
    - Short-term memory: Per-thread message history (LangGraph checkpoints)
    - Long-term memory: Persistent PostgreSQL-backed memory store
    - Tools: RAG retrieval, visual generation, plan validation, coverage analysis
    - Bounded revision loops for quality control
    """
    try:
        agent = get_agent(ModelService())

        brief = request.brief or {
            "topic": request.objective or "untitled",
            "objective": request.objective or "",
        }
        if request.refresh_from_current:
            brief["refresh_mode"] = "stale_content_refresh"
        if request.refresh_source:
            brief["refresh_source"] = request.refresh_source

        plan_item = request.plan_item or {
            "title": f"Issue {request.issue_number or 1}",
            "learning_objectives": [request.objective or ""],
            "duration_weeks": 1,
        }

        result = await agent.run_issue_generation(
            series_id=request.series_id,
            brief=brief,
            workspace_id=request.workspace_id,
            issue_number=request.issue_number or 1,
            plan_item=plan_item,
            model=request.model,
        )

        issues = result.get("issues", [])
        if issues:
            issue_data = issues[0] if issues else {}
        else:
            issue_data = {}

        return IssueGenerateResponse(
            issue=issue_data,
            issue_id=issue_id,
            thread_id=result.get("thread_id", ""),
            status=result.get("status", "complete"),
        )
    except Exception as e:
        logger.error("Issue generation failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
