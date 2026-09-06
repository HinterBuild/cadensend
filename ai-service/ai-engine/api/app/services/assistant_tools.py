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


def _parse_issue_data(raw: str) -> Dict[str, Any]:
    try:
        parsed = json.loads(raw)
    except Exception:
        return {}
    data = parsed.get("data") if isinstance(parsed, dict) else None
    return data if isinstance(data, dict) else {}


class ListSeriesArgs(BaseModel):
    pass


class SeriesIdArgs(BaseModel):
    series_id: str = Field(..., description="Series UUID")


class IssueIdArgs(BaseModel):
    issue_id: str = Field(..., description="Issue UUID")


class SearchSourcesArgs(BaseModel):
    series_id: str = Field(..., description="Series UUID to search within")
    query: str = Field(..., description="Natural language search query")
    top_k: int = Field(default=5, description="Number of chunks to return")


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


class ProposeUpdateIssueArgs(BaseModel):
    issue_id: str
    subject: str = ""
    preheader: str = ""
    content_blocks: str = Field(
        default="",
        description="JSON array string of content blocks to replace issue body",
    )


class ProposeRescheduleIssueArgs(BaseModel):
    issue_id: str
    scheduled_at: str = Field(..., description="ISO datetime for delivery")


class ProposeTestSendArgs(BaseModel):
    issue_id: str
    email: str = Field(default="", description="Optional recipient email override")


class ProposeSetSeriesSkillArgs(BaseModel):
    series_id: str
    skill_id: str = Field(..., description="Platform skill id from list_skills")


class ProposeSetSeriesWorkflowArgs(BaseModel):
    series_id: str
    workflow_mode: str = Field(..., description="Workflow mode id from list_workflows")


class ProposeSyncConnectorArgs(BaseModel):
    connector_id: str = Field(..., description="Connector id from list_connectors")
    since: str = Field(default="", description="Optional ISO datetime for incremental sync")


class ProposeRestoreVersionArgs(BaseModel):
    issue_id: str
    version: int = Field(..., description="Version number from list_issue_versions")


class ProposeStudioSectionArgs(BaseModel):
    issue_id: str
    section_id: str = Field(..., description="Content block id to rewrite")
    instruction: str = Field(..., description="How to rewrite this section")
    topic: str = Field(default="", description="Series topic for context")
    goal: str = Field(default="", description="Series goal for context")
    persona: str = Field(default="practitioner")
    brand_voice: str = Field(default="default")


class ProposeRunWorkflowArgs(BaseModel):
    mode_id: str = Field(..., description="Workflow mode id from list_workflows")
    series_id: str = Field(default="", description="Optional series context")
    topic: str = Field(default="", description="Brief topic")
    goal: str = Field(default="", description="Brief goal")


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
        """Get one issue by id including content blocks and status."""
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

    async def list_skills_tool() -> str:
        """List available platform skills (writing styles, templates) that can be applied to a series."""
        return await client.list_skills()

    async def list_connectors_tool() -> str:
        """List external connectors (RSS, Notion, etc.) and whether each is configured."""
        return await client.list_connectors()

    async def list_workflows_tool() -> str:
        """List editorial workflow modes for issue generation."""
        return await client.list_workflows()

    async def search_sources_tool(series_id: str, query: str, top_k: int = 5) -> str:
        """Search ingested sources for a series using RAG retrieval."""
        return await client.search_sources(series_id, query, top_k)

    async def list_issue_versions_tool(issue_id: str) -> str:
        """List saved versions for an issue (for restore)."""
        return await client.list_issue_versions(issue_id)

    async def evaluate_issue_tool(issue_id: str) -> str:
        """Run editorial quality review on an issue (grounding, structure, CTA scores)."""
        raw = await client.get_issue(issue_id)
        issue = _parse_issue_data(raw)
        if not issue:
            return raw
        return await client.evaluate_issue(issue)

    async def analyze_issue_tool(issue_id: str) -> str:
        """Analyze issue readability, brand voice, and structure without changing content."""
        raw = await client.get_issue(issue_id)
        issue = _parse_issue_data(raw)
        if not issue:
            return raw
        content_json = issue.get("content_json")
        content: Dict[str, Any] = {}
        if content_json:
            try:
                content = json.loads(content_json) if isinstance(content_json, str) else content_json
            except Exception:
                content = {}
        blocks = content.get("content_blocks") or []
        text = "\n\n".join(
            str(b.get("text") or b.get("content") or "")
            for b in blocks
            if isinstance(b, dict)
        )
        return await client.studio_analyze({"text": text})

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
            "Add issue to series",
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

    async def propose_resume_series_tool(series_id: str) -> str:
        """Propose resuming a paused series. Requires user approval."""
        return _proposal("resume_series", "Resume series", {"series_id": series_id})

    async def propose_add_source_url_tool(series_id: str, url: str) -> str:
        """Propose adding a URL source to a series. Requires user approval."""
        return _proposal("add_source_url", f"Add source: {url}", {"series_id": series_id, "url": url})

    async def propose_update_issue_tool(
        issue_id: str,
        subject: str = "",
        preheader: str = "",
        content_blocks: str = "",
    ) -> str:
        """Propose editing issue subject, preheader, or content blocks. Requires user approval."""
        payload: Dict[str, Any] = {"issue_id": issue_id}
        if subject:
            payload["subject"] = subject
        if preheader:
            payload["preheader"] = preheader
        if content_blocks:
            payload["content_blocks"] = content_blocks
        return _proposal("update_issue", f"Update issue {issue_id[:8]}…", payload)

    async def propose_reschedule_issue_tool(issue_id: str, scheduled_at: str) -> str:
        """Propose rescheduling issue delivery. Requires user approval."""
        return _proposal(
            "reschedule_issue",
            "Reschedule issue",
            {"issue_id": issue_id, "scheduled_at": scheduled_at},
        )

    async def propose_cancel_send_tool(issue_id: str) -> str:
        """Propose cancelling a scheduled send. Requires user approval."""
        return _proposal("cancel_send", "Cancel scheduled send", {"issue_id": issue_id})

    async def propose_test_send_issue_tool(issue_id: str, email: str = "") -> str:
        """Propose sending a test email for an issue. Requires user approval."""
        return _proposal(
            "test_send_issue",
            "Send test email",
            {"issue_id": issue_id, "email": email},
        )

    async def propose_cancel_generation_tool(issue_id: str) -> str:
        """Propose cancelling in-progress issue generation. Requires user approval."""
        return _proposal("cancel_generation", "Cancel generation", {"issue_id": issue_id})

    async def propose_restore_issue_version_tool(issue_id: str, version: int) -> str:
        """Propose restoring a previous issue version. Requires user approval."""
        return _proposal(
            "restore_issue_version",
            f"Restore version {version}",
            {"issue_id": issue_id, "version": version},
        )

    async def propose_set_series_skill_tool(series_id: str, skill_id: str) -> str:
        """Propose applying a platform skill to a series. Requires user approval."""
        return _proposal(
            "set_series_skill",
            f"Apply skill {skill_id}",
            {"series_id": series_id, "skill_id": skill_id},
        )

    async def propose_set_series_workflow_tool(series_id: str, workflow_mode: str) -> str:
        """Propose setting the editorial workflow mode for a series. Requires user approval."""
        return _proposal(
            "set_series_workflow",
            f"Set workflow {workflow_mode}",
            {"series_id": series_id, "workflow_mode": workflow_mode},
        )

    async def propose_sync_connector_tool(connector_id: str, since: str = "") -> str:
        """Propose syncing a connector to pull external content. Requires user approval."""
        return _proposal(
            "sync_connector",
            f"Sync connector {connector_id}",
            {"connector_id": connector_id, "since": since},
        )

    async def propose_run_workflow_tool(
        mode_id: str,
        series_id: str = "",
        topic: str = "",
        goal: str = "",
    ) -> str:
        """Propose running an editorial workflow (e.g. deep research draft). Requires user approval."""
        return _proposal(
            "run_workflow",
            f"Run workflow {mode_id}",
            {"mode_id": mode_id, "series_id": series_id, "topic": topic, "goal": goal},
        )

    async def propose_studio_section_tool(
        issue_id: str,
        section_id: str,
        instruction: str,
        topic: str = "",
        goal: str = "",
        persona: str = "practitioner",
        brand_voice: str = "default",
    ) -> str:
        """Propose rewriting one issue section using the studio editor. Requires user approval."""
        return _proposal(
            "studio_section",
            f"Rewrite section {section_id}",
            {
                "issue_id": issue_id,
                "section_id": section_id,
                "instruction": instruction,
                "topic": topic,
                "goal": goal,
                "persona": persona,
                "brand_voice": brand_voice,
            },
        )

    return [
        StructuredTool.from_function(coroutine=list_series_tool, name="list_series", args_schema=ListSeriesArgs),
        StructuredTool.from_function(coroutine=get_series_tool, name="get_series", args_schema=SeriesIdArgs),
        StructuredTool.from_function(coroutine=list_issues_tool, name="list_issues", args_schema=SeriesIdArgs),
        StructuredTool.from_function(coroutine=get_issue_tool, name="get_issue", args_schema=IssueIdArgs),
        StructuredTool.from_function(coroutine=list_sources_tool, name="list_sources", args_schema=SeriesIdArgs),
        StructuredTool.from_function(coroutine=get_plan_tool, name="get_plan", args_schema=SeriesIdArgs),
        StructuredTool.from_function(coroutine=analytics_overview_tool, name="analytics_overview", args_schema=ListSeriesArgs),
        StructuredTool.from_function(coroutine=list_skills_tool, name="list_skills", args_schema=ListSeriesArgs),
        StructuredTool.from_function(coroutine=list_connectors_tool, name="list_connectors", args_schema=ListSeriesArgs),
        StructuredTool.from_function(coroutine=list_workflows_tool, name="list_workflows", args_schema=ListSeriesArgs),
        StructuredTool.from_function(coroutine=search_sources_tool, name="search_sources", args_schema=SearchSourcesArgs),
        StructuredTool.from_function(coroutine=list_issue_versions_tool, name="list_issue_versions", args_schema=IssueIdArgs),
        StructuredTool.from_function(coroutine=evaluate_issue_tool, name="evaluate_issue", args_schema=IssueIdArgs),
        StructuredTool.from_function(coroutine=analyze_issue_tool, name="analyze_issue", args_schema=IssueIdArgs),
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
        StructuredTool.from_function(coroutine=propose_resume_series_tool, name="propose_resume_series", args_schema=SeriesIdArgs),
        StructuredTool.from_function(coroutine=propose_add_source_url_tool, name="propose_add_source_url", args_schema=ProposeSourceArgs),
        StructuredTool.from_function(coroutine=propose_update_issue_tool, name="propose_update_issue", args_schema=ProposeUpdateIssueArgs),
        StructuredTool.from_function(coroutine=propose_reschedule_issue_tool, name="propose_reschedule_issue", args_schema=ProposeRescheduleIssueArgs),
        StructuredTool.from_function(coroutine=propose_cancel_send_tool, name="propose_cancel_send", args_schema=IssueIdArgs),
        StructuredTool.from_function(coroutine=propose_test_send_issue_tool, name="propose_test_send_issue", args_schema=ProposeTestSendArgs),
        StructuredTool.from_function(coroutine=propose_cancel_generation_tool, name="propose_cancel_generation", args_schema=IssueIdArgs),
        StructuredTool.from_function(coroutine=propose_restore_issue_version_tool, name="propose_restore_issue_version", args_schema=ProposeRestoreVersionArgs),
        StructuredTool.from_function(coroutine=propose_set_series_skill_tool, name="propose_set_series_skill", args_schema=ProposeSetSeriesSkillArgs),
        StructuredTool.from_function(coroutine=propose_set_series_workflow_tool, name="propose_set_series_workflow", args_schema=ProposeSetSeriesWorkflowArgs),
        StructuredTool.from_function(coroutine=propose_sync_connector_tool, name="propose_sync_connector", args_schema=ProposeSyncConnectorArgs),
        StructuredTool.from_function(coroutine=propose_run_workflow_tool, name="propose_run_workflow", args_schema=ProposeRunWorkflowArgs),
        StructuredTool.from_function(coroutine=propose_studio_section_tool, name="propose_studio_section", args_schema=ProposeStudioSectionArgs),
    ]


def _issues_agent_tools(name: str) -> bool:
    if "issue" in name or "studio" in name or "evaluate" in name or "analyze_issue" in name:
        return True
    if name in {
        "list_series", "get_series", "list_issues", "get_plan", "list_sources",
        "search_sources", "list_issue_versions", "list_skills", "list_workflows",
    }:
        return True
    return False


def _series_agent_tools(name: str) -> bool:
    if name.startswith("propose_create") or name.startswith("propose_update"):
        return True
    if name.startswith("propose_delete") or name.startswith("propose_generate_plan"):
        return True
    if name.startswith("propose_activate") or name.startswith("propose_pause") or name.startswith("propose_resume"):
        return True
    if name.startswith("propose_add_source") or name.startswith("propose_set_series"):
        return True
    if name.startswith("propose_sync_connector"):
        return True
    return name in {
        "list_series", "get_series", "list_sources", "get_plan", "analytics_overview",
        "show_series_setup_form", "list_skills", "list_connectors", "list_workflows",
        "search_sources",
    }


AGENT_PROFILES: Dict[str, Dict[str, Any]] = {
    "operator": {
        "label": "Operator",
        "description": "Full workspace assistant — series, issues, skills, connectors, and editorial tools",
        "tool_filter": None,
    },
    "series": {
        "label": "Series",
        "description": "Create and manage email courses, skills, connectors, and sources",
        "tool_filter": _series_agent_tools,
    },
    "issues": {
        "label": "Issues",
        "description": "Draft, edit, review, generate, and approve issues",
        "tool_filter": _issues_agent_tools,
    },
}
