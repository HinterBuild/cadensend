"""API routes for series management."""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import logging
import asyncio

from app.services.agent_graph import NewsletterAgent, get_agent
from app.services.model_service import ModelService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/series")


class PlanGenerateRequest(BaseModel):
    brief: Dict[str, Any]
    workspace_id: str = Field(..., description="Workspace identifier for RAG isolation")
    series_id: Optional[str] = Field(None, description="Optional series identifier")
    model: Optional[str] = Field(None, description="OpenRouter model id; defaults to DEFAULT_MODEL")


class PlanGenerateResponse(BaseModel):
    plan: Dict[str, Any]
    series_id: str
    thread_id: str
    status: str = "complete"


@router.post("/{series_id}/plan")
async def generate_plan(series_id: str, request: PlanGenerateRequest):
    """Generate a curriculum plan for a series using LangGraph with tools,
    short-term memory (per-thread checkpoints), and long-term memory (PostgreSQL store).
    """
    try:
        agent = get_agent(ModelService())

        result = await agent.run_plan_generation(
            brief=request.brief,
            workspace_id=request.workspace_id,
            series_id=series_id,
            model=request.model,
        )

        return PlanGenerateResponse(
            plan=result.get("plan", {}),
            series_id=series_id,
            thread_id=result.get("thread_id", ""),
            status=result.get("status", "complete"),
        )
    except Exception as e:
        logger.error("Plan generation failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{series_id}/plan/stream")
async def generate_plan_stream(series_id: str, request: PlanGenerateRequest):
    """Stream plan generation progress using LangGraph events."""
    from fastapi.responses import StreamingResponse

    async def event_generator():
        agent = get_agent(ModelService())

        async def run():
            compiled = await agent.compile_graph(f"stream-{series_id}")
            initial_state: Dict[str, Any] = {
                "messages": [],
                "brief": request.brief,
                "workspace_id": request.workspace_id,
                "series_id": series_id,
                "plan": None,
                "issues": [],
                "retrieved_context": [],
                "revision_count": 0,
                "status": "planning",
                "error": None,
                "citations": [],
                "visual_specs": [],
                "memory_context": [],
                "model": agent.model_service.resolve_model(request.model or request.brief.get("model")),
            }

            async for event in compiled.astream_events(
                initial_state,
                config={"configurable": {"thread_id": f"stream-{series_id}"}},
                version="v1",
            ):
                if event["event"] == "on_chat_model_stream":
                    content = event["data"]["chunk"].content
                    if content:
                        yield f"data: {content}\n\n"

        try:
            yield "data: Starting plan generation...\n\n"
            async for chunk in run():
                yield chunk
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error("Stream generation failed: %s", e)
            yield f"data: {{\"error\": \"{str(e)}\"}}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
