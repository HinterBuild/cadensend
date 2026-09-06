"""Streaming Cadensend AI agent for the dashboard."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any, AsyncIterator, Dict, List, Optional

from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, SystemMessage, ToolMessage

from app.core.config import settings
from app.services.assistant_client import ControlAPIClient
from app.services.assistant_tools import AGENT_PROFILES, PROPOSE_PREFIX, build_assistant_tools
from app.services.model_service import ModelService, get_chat_model_for_workspace, resolve_provider_config

logger = logging.getLogger(__name__)

MAX_HISTORY = 40
MAX_TOOL_ROUNDS = 8

SYSTEM_PROMPT = """You are Cadensend AI — an expert operator for an AI email course platform.

You help users create series, plan curricula, manage issues, add sources, and activate delivery — all through conversation.

Rules:
- Be concise, warm, and action-oriented.
- When creating a series: ask for topic, then goal (one question at a time). Once you have both, call show_series_setup_form — never list level/duration/cadence/send time/send days/timezone as numbered text questions.
- After the user submits the setup form (tool result), call propose_create_series with those values.
- Use read tools (list_series, get_series, list_issues, etc.) to look up current state before proposing changes.
- For ANY write action (create, update, delete, generate, approve, activate, pause, add source), call the matching propose_* tool. Never claim you executed a write without a propose tool.
- After a propose tool runs, tell the user what you prepared and that they can approve it in the chat card.
- When tool results include series or issues, reference ids so the UI can link them.
- If OPENROUTER_API_KEY is missing, explain that an admin must configure it.
- Default timezone UTC if the user does not specify one.
- For "N day" or "N week" courses, set duration accordingly and cadence to daily or weekly as appropriate.

Available agents: operator (default), series (course setup), issues (drafting). Stay within your agent's scope."""


def _sse(event: Dict[str, Any]) -> str:
    return f"data: {json.dumps(event, default=str)}\n\n"


def _chunk_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                if item.get("type") == "text":
                    parts.append(str(item.get("text") or ""))
                elif "text" in item:
                    parts.append(str(item["text"]))
        return "".join(parts)
    return ""


def _normalize_tool_calls(tool_calls: Any) -> List[Dict[str, Any]]:
    """Map UI/OpenAI tool call payloads to LangChain's expected shape."""
    if not tool_calls:
        return []
    out: List[Dict[str, Any]] = []
    for tc in tool_calls:
        if not isinstance(tc, dict):
            continue
        args = tc.get("args")
        if args is None:
            args = tc.get("input") or {}
        out.append(
            {
                "id": str(tc.get("id") or uuid.uuid4()),
                "name": str(tc.get("name") or ""),
                "args": args if isinstance(args, dict) else {},
                "type": str(tc.get("type") or "tool_call"),
            }
        )
    return out


def normalize_chat_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Normalize API chat payloads before LangChain conversion."""
    out: List[Dict[str, Any]] = []
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        normalized = dict(msg)
        tool_calls = normalized.get("tool_calls")
        if tool_calls is None:
            tool_calls = normalized.get("toolCalls")
        if tool_calls:
            normalized["tool_calls"] = _normalize_tool_calls(tool_calls)
            normalized.pop("toolCalls", None)
        out.append(normalized)
    return out


def _to_lc_messages(messages: List[Dict[str, Any]]) -> List:
    out = []
    for msg in messages[-MAX_HISTORY:]:
        role = msg.get("role")
        content = str(msg.get("content") or "")
        if role == "user":
            out.append(HumanMessage(content=content))
        elif role == "assistant":
            tool_calls = _normalize_tool_calls(msg.get("tool_calls"))
            if tool_calls:
                out.append(AIMessage(content=content or "", tool_calls=tool_calls))
            else:
                out.append(AIMessage(content=content))
        elif role == "tool":
            out.append(
                ToolMessage(
                    content=content,
                    tool_call_id=str(msg.get("tool_call_id") or ""),
                    name=str(msg.get("name") or ""),
                )
            )
    return out


def _filter_tools(tools: List, agent: str) -> List:
    profile = AGENT_PROFILES.get(agent) or AGENT_PROFILES["operator"]
    fn = profile.get("tool_filter")
    if not fn:
        return tools
    return [t for t in tools if fn(t.name)]


def _entity_hint(name: str, output: str) -> Optional[str]:
    try:
        data = json.loads(output)
    except Exception:
        return None
    if name == "list_series" and isinstance(data.get("series"), list):
        return "series_list"
    if name == "get_series" and data.get("data"):
        return "series"
    if name == "list_issues" and isinstance(data.get("data"), list):
        return "issue_list"
    if name == "get_issue" and data.get("data"):
        return "issue"
    if name == "get_plan":
        return "plan"
    if name == "analytics_overview":
        return "analytics"
    return None


class AssistantAgent:
    def __init__(self, model_service: Optional[ModelService] = None):
        self.model_service = model_service or ModelService()

    async def _stream_model_turn(
        self,
        bound,
        lc_messages: List,
    ) -> AsyncIterator[str | AIMessage]:
        """Stream token events from the model, then yield the assembled AIMessage."""
        gathered: AIMessageChunk | None = None
        async for chunk in bound.astream(lc_messages):
            if gathered is None:
                gathered = chunk
            else:
                gathered = gathered + chunk
            token = _chunk_text(chunk.content)
            if token:
                yield _sse({"type": "token", "content": token})

        if gathered is None:
            yield AIMessage(content="")
            return

        response = gathered if isinstance(gathered, AIMessage) else AIMessage(
            content=gathered.content or "",
            tool_calls=getattr(gathered, "tool_calls", None) or [],
            additional_kwargs=getattr(gathered, "additional_kwargs", {}) or {},
        )
        yield response

    async def stream_chat(
        self,
        *,
        messages: List[Dict[str, Any]],
        model: Optional[str],
        workspace_id: str,
        user_id: str,
        jwt: str,
        agent: str = "operator",
        user_timezone: str = "UTC",
        thread_id: Optional[str] = None,
    ) -> AsyncIterator[str]:
        run_id = str(uuid.uuid4())
        yield _sse({"type": "run_start", "run_id": run_id, "agent": agent, "thread_id": thread_id})

        provider_config = resolve_provider_config(provider=None, model=model, workspace_id=workspace_id)
        has_key = bool((provider_config.api_key or "").strip())
        if provider_config.provider == "openrouter" and not has_key:
            has_key = bool((settings.OPENROUTER_API_KEY or "").strip())
        if provider_config.provider == "local":
            has_key = True
        if not has_key:
            yield _sse({
                "type": "error",
                "message": f"No API key configured for {provider_config.provider}. Add one in Settings → AI provider.",
            })
            yield _sse({"type": "done", "run_id": run_id})
            return

        client = ControlAPIClient(jwt=jwt)
        all_tools = build_assistant_tools(client)
        tools = _filter_tools(all_tools, agent)
        tool_map = {t.name: t for t in tools}

        chat = get_chat_model_for_workspace(workspace_id, model=model, temperature=0.35, max_tokens=2048)
        bound = chat.bind_tools(tools)

        lc_messages = [
            SystemMessage(
                content=(
                    f"{SYSTEM_PROMPT}\n\n"
                    f"Agent profile: {agent}\n"
                    f"Workspace: {workspace_id}\n"
                    f"User: {user_id}\n"
                    f"User timezone: {user_timezone}"
                )
            ),
            *_to_lc_messages(messages),
        ]

        rounds = 0
        while rounds < MAX_TOOL_ROUNDS:
            rounds += 1
            response: Optional[AIMessage] = None
            try:
                async for item in self._stream_model_turn(bound, lc_messages):
                    if isinstance(item, str):
                        yield item
                    else:
                        response = item
            except Exception as exc:
                logger.exception("Cadensend AI model stream failed")
                yield _sse({"type": "error", "message": str(exc)})
                yield _sse({"type": "done", "run_id": run_id})
                return

            if response is None:
                yield _sse({"type": "error", "message": "Empty model response"})
                yield _sse({"type": "done", "run_id": run_id})
                return

            tool_calls = getattr(response, "tool_calls", None) or []

            if tool_calls:
                lc_messages.append(response)
                for tc in tool_calls:
                    tc_id = tc.get("id") or str(uuid.uuid4())
                    name = tc.get("name") or ""
                    args = tc.get("args") or {}
                    yield _sse({"type": "tool_start", "id": tc_id, "name": name, "input": args})

                    tool = tool_map.get(name)
                    if not tool:
                        result = json.dumps({"error": f"unknown tool: {name}"})
                    else:
                        try:
                            result = await tool.ainvoke(args)
                        except Exception as exc:
                            result = json.dumps({"error": str(exc)})

                    entity_type = _entity_hint(name, result)
                    yield _sse({
                        "type": "tool_result",
                        "id": tc_id,
                        "name": name,
                        "output": result,
                        "entity_type": entity_type,
                    })

                    if name == "show_series_setup_form":
                        try:
                            form_data = json.loads(result)
                        except Exception:
                            form_data = {}
                        if form_data.get("form"):
                            yield _sse({
                                "type": "form",
                                "id": tc_id,
                                "form_type": form_data.get("form_type") or "series_setup",
                                "defaults": form_data.get("defaults") or args,
                            })
                            yield _sse({"type": "done", "run_id": run_id, "awaiting_form": True})
                            return

                    if name.startswith(PROPOSE_PREFIX):
                        try:
                            proposal = json.loads(result)
                        except Exception:
                            proposal = {}
                        if proposal.get("proposal"):
                            yield _sse({
                                "type": "permission",
                                "id": tc_id,
                                "action": proposal.get("action"),
                                "label": proposal.get("label"),
                                "payload": proposal.get("payload"),
                            })
                            yield _sse({"type": "done", "run_id": run_id, "awaiting_permission": True})
                            return

                    lc_messages.append(ToolMessage(content=result, tool_call_id=tc_id, name=name))
                continue

            yield _sse({"type": "done", "run_id": run_id})
            return

        yield _sse({"type": "error", "message": "Too many tool rounds. Try a simpler request."})
        yield _sse({"type": "done", "run_id": run_id})


_agent: Optional[AssistantAgent] = None


def get_assistant_agent() -> AssistantAgent:
    global _agent
    if _agent is None:
        _agent = AssistantAgent()
    return _agent
