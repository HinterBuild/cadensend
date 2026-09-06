"""Cadensend AI chat routes."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.assistant_agent import get_assistant_agent, normalize_chat_messages

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assistant", tags=["assistant"])

MAX_MESSAGES = 40
MAX_CONTENT_LEN = 8000


class ChatMessage(BaseModel):
    role: str
    content: str = ""
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None
    name: Optional[str] = None


class AssistantChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(default_factory=list)
    model: Optional[str] = None
    workspace_id: str
    user_id: str
    user_jwt: str = Field(..., description="User JWT for control-api tool calls")
    agent: str = Field(default="operator", description="operator | series | issues")
    user_timezone: str = "UTC"
    thread_id: Optional[str] = None
    tagged_issue_ids: List[str] = Field(default_factory=list)


@router.post("/chat")
async def assistant_chat(request: AssistantChatRequest):
    """Stream Cadensend AI responses as Server-Sent Events."""
    if not request.user_jwt.strip():
        raise HTTPException(status_code=400, detail="user_jwt is required")
    if len(request.messages) > MAX_MESSAGES:
        raise HTTPException(status_code=400, detail=f"max {MAX_MESSAGES} messages per request")
    for msg in request.messages:
        if len(msg.content or "") > MAX_CONTENT_LEN:
            raise HTTPException(status_code=400, detail="message too long")

    agent = get_assistant_agent()
    payload = normalize_chat_messages([m.model_dump(exclude_none=True) for m in request.messages])

    async def event_generator():
        try:
            async for chunk in agent.stream_chat(
                messages=payload,
                model=request.model,
                workspace_id=request.workspace_id,
                user_id=request.user_id,
                jwt=request.user_jwt,
                agent=request.agent or "operator",
                user_timezone=request.user_timezone or "UTC",
                thread_id=request.thread_id,
                tagged_issue_ids=request.tagged_issue_ids,
            ):
                yield chunk
        except Exception as exc:
            logger.exception("Cadensend AI stream failed")
            yield f'data: {{"type":"error","message":"{str(exc)[:200]}"}}\n\n'
            yield 'data: {"type":"done"}\n\n'

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/agents")
async def list_agents():
    from app.services.assistant_tools import AGENT_PROFILES

    return {
        "agents": [
            {"id": key, "label": val["label"], "description": val["description"]}
            for key, val in AGENT_PROFILES.items()
        ]
    }
