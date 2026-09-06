"""LangChain tools for the dashboard Cadensend AI."""

from __future__ import annotations

import json
from typing import Any, Dict, List

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from app.services.assistant_client import ControlAPIClient

PROPOSE_PREFIX = "propose_"


def _proposal(action: str, label: str, payload: Dict[str, Any]) -> str:
    return json.dumps(
        {
            "proposal": True,
            "action": action,
            "label": label,
            "payload": payload,
        }
    )


class ListSeriesArgs(BaseModel):
    pass


class SeriesIdArgs(BaseModel):
    series_id: str = Field(..., description="Series UUID")


class IssueIdArgs(BaseModel):
    issue_id: str = Field(..., description="Issue UUID")


class ShowSeriesSetupFormArgs(BaseModel):
    topic: str = Field(..., description="Series topic title")
    goal: str = Field(..., description="Main learning goal for readers")
    timezone: str = Field(default="UTC", description="Default IANA timezone for the form")


class ProposeCreateSeriesArgs(BaseModel):
    topic: str = Field(..., description="Series topic, e.g. AI fundamentals")
    goal: str = Field(..., description="Learning outcome for the reader")
    level: str = Field(default="beginner", description="beginner, intermediate, or advanced")
    timezone: str = Field(default="UTC", description="IANA timezone")
    duration: str = Field(default="1 month", description="e.g. 1 week, 1 month, 3 months")
    cadence: str = Field(default="weekly", description="daily, weekly, biweekly, or monthly")
    send_time: str = Field(default="09:00", description="HH:MM local send time")
    send_days: str = Field(default="Monday", description="Comma-separated weekdays for weekly sends")
    model: str = Field(default="", description="Optional OpenRouter model id")


class ProposeUpdateSeriesArgs(BaseModel):
    series_id: str
    topic: str = ""
    goal: str = ""
    level: str = ""
    timezone: str = ""
    cadence: str = ""
    send_time: str = ""
    send_days: str = ""


class ProposeCreateIssueArgs(BaseModel):
    series_id: str
    objective: str = Field(..., description="What this issue should cover")
    scheduled_at: str = Field(default="", description="Optional ISO datetime")


class ProposeModelArgs(BaseModel):
    series_id: str = ""
    issue_id: str = ""
    model: str = ""


class ProposeSourceArgs(BaseModel):
    series_id: str
    url: str = Field(..., description="Public URL to ingest")


def build_assistant_tools(client: ControlAPIClient) -> List[StructuredTool]:
    async def list_series_tool() -> str:
        """List all series in the workspace."""
        return await client.list_series()

    async def get_series_tool(series_id: str) -> str:
        """Get one series by id."""
        return await client.get_series(series_id)

    async def list_issues_tool(series_id: str) -> str:
        """List issues for a series."""
        return await client.list_issues(series_id)

    async def get_issue_tool(issue_id: str) -> str:
        """Get one issue by id."""
        return await client.get_issue(issue_id)

    async def list_sources_tool(series_id: str) -> str:
        """List sources attached to a series."""
        return await client.list_sources(series_id)

    async def get_plan_tool(series_id: str) -> str:
        """Get curriculum plan status and modules for a series."""
        return await client.get_plan(series_id)

    async def analytics_overview_tool() -> str:
        """Workspace analytics: series counts, delivery stats."""
        return await client.analytics_overview()

    async def show_series_setup_form_tool(
        topic: str,
        goal: str,
        timezone: str = "UTC",
    ) -> str:
        """Open an interactive setup form for level, duration, cadence, send time, send days, and timezone."""
        return json.dumps(
            {
                "form": True,
                "form_type": "series_setup",
                "defaults": {
                    "topic": topic,
                    "goal": goal,
                    "level": "beginner",
                    "duration": "1 month",
                    "cadence": "weekly",
                    "send_time": "09:00",
                    "send_days": ["Monday"],
                    "timezone": timezone or "UTC",
                },
            }
        )

    async def propose_create_series_tool(
        topic: str,
        goal: str,
        level: str = "beginner",
        timezone: str = "UTC",
        duration: str = "1 month",
        cadence: str = "weekly",
        send_time: str = "09:00",
        send_days: str = "Monday",
        model: str = "",
    ) -> str:
        """Propose creating a new email course series. Requires user approval before execution."""
        return _proposal(
            "create_series",
            f"Create series: {topic}",
            {
                "topic": topic,
                "goal": goal,
                "level": level,
                "timezone": timezone,
                "duration": duration,
                "cadence": cadence,
                "send_time": send_time,
                "send_days": send_days,
                "model": model,
            },
        )

    async def propose_update_series_tool(
        series_id: str,
        topic: str = "",
        goal: str = "",
        level: str = "",
        timezone: str = "",
        cadence: str = "",
        send_time: str = "",
        send_days: str = "",
    ) -> str:
        """Propose updating series fields. Requires user approval."""
        updates = {k: v for k, v in {
            "topic": topic, "goal": goal, "level": level, "timezone": timezone,
            "cadence": cadence, "send_time": send_time, "send_days": send_days,
        }.items() if v}
        return _proposal("update_series", f"Update series {series_id}", {"series_id": series_id, **updates})

    async def propose_delete_series_tool(series_id: str) -> str:
        """Propose deleting a series. Requires user approval."""
        return _proposal("delete_series", f"Delete series {series_id}", {"series_id": series_id})

    async def propose_create_issue_tool(series_id: str, objective: str, scheduled_at: str = "") -> str:
        """Propose adding a new issue to a series. Requires user approval."""
        return _proposal(
            "create_issue",
            f"Add issue to series",
            {"series_id": series_id, "objective": objective, "scheduled_at": scheduled_at},
        )

    async def propose_generate_plan_tool(series_id: str, model: str = "") -> str:
        """Propose generating the curriculum plan for a series. Requires user approval."""
        return _proposal(
            "generate_plan",
            "Generate curriculum plan",
            {"series_id": series_id, "model": model},
        )

    async def propose_generate_issue_tool(issue_id: str, model: str = "") -> str:
        """Propose AI-generating issue content. Requires user approval."""
        return _proposal(
            "generate_issue",
            "Generate issue content",
            {"issue_id": issue_id, "model": model},
        )

    async def propose_approve_issue_tool(issue_id: str) -> str:
        """Propose approving an issue for delivery. Requires user approval."""
        return _proposal("approve_issue", "Approve issue", {"issue_id": issue_id})

    async def propose_activate_series_tool(series_id: str) -> str:
        """Propose activating a series for scheduled delivery. Requires user approval."""
        return _proposal("activate_series", "Activate series", {"series_id": series_id})

    async def propose_pause_series_tool(series_id: str) -> str:
        """Propose pausing an active series. Requires user approval."""
        return _proposal("pause_series", "Pause series", {"series_id": series_id})

    async def propose_add_source_url_tool(series_id: str, url: str) -> str:
        """Propose adding a URL source to a series. Requires user approval."""
        return _proposal("add_source_url", f"Add source: {url}", {"series_id": series_id, "url": url})

    return [
        StructuredTool.from_function(coroutine=list_series_tool, name="list_series", args_schema=ListSeriesArgs),
        StructuredTool.from_function(coroutine=get_series_tool, name="get_series", args_schema=SeriesIdArgs),
        StructuredTool.from_function(coroutine=list_issues_tool, name="list_issues", args_schema=SeriesIdArgs),
        StructuredTool.from_function(coroutine=get_issue_tool, name="get_issue", args_schema=IssueIdArgs),
        StructuredTool.from_function(coroutine=list_sources_tool, name="list_sources", args_schema=SeriesIdArgs),
        StructuredTool.from_function(coroutine=get_plan_tool, name="get_plan", args_schema=SeriesIdArgs),
        StructuredTool.from_function(coroutine=analytics_overview_tool, name="analytics_overview", args_schema=ListSeriesArgs),
        StructuredTool.from_function(
            coroutine=show_series_setup_form_tool,
            name="show_series_setup_form",
            args_schema=ShowSeriesSetupFormArgs,
        ),
        StructuredTool.from_function(coroutine=propose_create_series_tool, name="propose_create_series", args_schema=ProposeCreateSeriesArgs),
        StructuredTool.from_function(coroutine=propose_update_series_tool, name="propose_update_series", args_schema=ProposeUpdateSeriesArgs),
        StructuredTool.from_function(coroutine=propose_delete_series_tool, name="propose_delete_series", args_schema=SeriesIdArgs),
        StructuredTool.from_function(coroutine=propose_create_issue_tool, name="propose_create_issue", args_schema=ProposeCreateIssueArgs),
        StructuredTool.from_function(coroutine=propose_generate_plan_tool, name="propose_generate_plan", args_schema=ProposeModelArgs),
        StructuredTool.from_function(coroutine=propose_generate_issue_tool, name="propose_generate_issue", args_schema=ProposeModelArgs),
        StructuredTool.from_function(coroutine=propose_approve_issue_tool, name="propose_approve_issue", args_schema=IssueIdArgs),
        StructuredTool.from_function(coroutine=propose_activate_series_tool, name="propose_activate_series", args_schema=SeriesIdArgs),
        StructuredTool.from_function(coroutine=propose_pause_series_tool, name="propose_pause_series", args_schema=SeriesIdArgs),
        StructuredTool.from_function(coroutine=propose_add_source_url_tool, name="propose_add_source_url", args_schema=ProposeSourceArgs),
    ]


AGENT_PROFILES: Dict[str, Dict[str, Any]] = {
    "operator": {
        "label": "Operator",
        "description": "Full workspace assistant",
        "tool_filter": None,
    },
    "series": {
        "label": "Series",
        "description": "Create and manage email courses",
        "tool_filter": lambda name: name.startswith("propose_create") or name.startswith("propose_update")
        or name.startswith("propose_delete") or name.startswith("propose_generate_plan")
        or name.startswith("propose_activate") or name.startswith("propose_pause")
        or name.startswith("propose_add_source")
        or name in {"list_series", "get_series", "list_sources", "get_plan", "analytics_overview", "show_series_setup_form"},
    },
    "issues": {
        "label": "Issues",
        "description": "Draft, generate, and approve issues",
        "tool_filter": lambda name: "issue" in name or name in {"list_series", "get_series", "list_issues", "get_plan"},
    },
}
