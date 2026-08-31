"""Workflow engine — multi-agent pipelines and 20 workflow modes."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage, SystemMessage

from app.platform.catalog import WORKFLOWS
from app.services.model_service import ModelService

logger = logging.getLogger(__name__)

AGENT_PROMPTS: Dict[str, str] = {
    "researcher": "You are a research agent. Gather facts from context only. Output bullet findings with source references.",
    "writer": "You are a newsletter writer. Turn research into engaging sections matching the skill format.",
    "editor": "You are an editor. Tighten prose, fix structure, ensure citations are present. Output final JSON.",
    "judge": "Score drafts 1-10 on clarity, originality, and grounding. Pick the winner and explain why.",
    "fact_check": "Verify each factual claim against provided context. Flag unsupported claims.",
    "voice": "Rewrite the draft to match the brand voice: {voice_profile}. Preserve facts.",
    "compliance": "Review for legal/medical/finance risks. Flag hedging needs and remove overclaims.",
    "structure": "Choose the best newsletter structure for this content. Output section outline only.",
    "hook": "Write 3 subject line options and an opening paragraph that hooks the reader.",
    "closer": "Write a strong ending with a clear CTA aligned to the issue goal.",
    "repurposing": "Convert this issue into: blog post summary, 3 social posts, landing page hero.",
    "critic": "Challenge weak claims, vague phrasing, and filler. Be specific and constructive.",
    "planner": "Select which sources to include and in what order. Justify each inclusion.",
    "memory": "Inject relevant brand history and audience context into the draft preamble.",
    "personalization": "Adapt intros and examples for segment: {segment}. Keep core content.",
    "recovery": "The prior generation failed quality checks. Produce a simpler, safer fallback draft.",
}


class WorkflowEngine:
    """Runs workflow modes and multi-agent pipelines."""

    def __init__(self, model_service: Optional[ModelService] = None) -> None:
        self.model_service = model_service or ModelService()
        self._workflows = {w.id: w for w in WORKFLOWS}

    def list_workflows(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": w.id,
                "name": w.name,
                "description": w.description,
                "category": w.category,
                "metadata": w.metadata,
            }
            for w in self._workflows.values()
        ]

    def get_mode_overlay(self, mode_id: str, brief: Dict[str, Any]) -> str:
        """Return system prompt overlay for a workflow mode."""
        wf = self._workflows.get(mode_id)
        if not wf:
            return ""
        role = wf.metadata.get("role", "")
        if role and role in AGENT_PROMPTS:
            return f"\nWORKFLOW AGENT ({wf.name}):\n{AGENT_PROMPTS[role]}\n"
        if mode_id == "debate":
            return "\nDEBATE MODE: Propose two opposing framings, argue each briefly, then synthesize the stronger angle.\n"
        if mode_id == "comparison":
            return "\nCOMPARISON MODE: Generate two variants, merge the best sections from each.\n"
        if mode_id == "question_driven":
            q = brief.get("reader_question", brief.get("goal", ""))
            return f"\nQUESTION-DRIVEN MODE: Answer this reader problem directly: {q}\n"
        if mode_id == "source_first":
            return "\nSOURCE-FIRST MODE: Every claim must cite retrieved context. If ungrounded, omit or hedge.\n"
        if mode_id == "angle_explorer":
            return "\nANGLE EXPLORER: Propose 5 editorial angles as headlines with one-line rationales before drafting.\n"
        if mode_id == "series_continuity":
            return "\nSERIES CONTINUITY: Reference prior lessons explicitly. Build on what readers already know.\n"
        if mode_id == "researcher_writer_editor":
            return "\nMULTI-AGENT PIPELINE: Research → Write → Edit. Each phase builds on the prior.\n"
        return f"\nWORKFLOW MODE: {wf.name}\n{wf.description}\n"

    async def run_pipeline(
        self,
        mode_id: str,
        brief: Dict[str, Any],
        context: str,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Execute multi-agent pipeline (researcher → writer → editor or single agent)."""
        wf = self._workflows.get(mode_id)
        if not wf:
            return {"status": "skipped", "reason": "unknown workflow"}

        chat = self.model_service.get_chat_model(model=model, temperature=0.5, max_tokens=4000)
        steps: List[Dict[str, Any]] = []

        if mode_id == "researcher_writer_editor":
            agents = ["researcher", "writer", "editor"]
            accumulated = context
            for agent_role in agents:
                prompt = AGENT_PROMPTS[agent_role]
                messages = [
                    SystemMessage(content=prompt),
                    HumanMessage(content=f"Brief:\n{json.dumps(brief, indent=2)}\n\nContext:\n{accumulated}"),
                ]
                response = await chat.ainvoke(messages)
                content = response.content if hasattr(response, "content") else str(response)
                steps.append({"agent": agent_role, "output": content[:2000]})
                accumulated = content
            return {"status": "complete", "steps": steps, "final": accumulated}

        # Single-agent workflow modes
        role = wf.metadata.get("role", mode_id)
        prompt = AGENT_PROMPTS.get(role, wf.description)
        if "{voice_profile}" in prompt:
            prompt = prompt.replace("{voice_profile}", brief.get("tone", "professional"))
        if "{segment}" in prompt:
            prompt = prompt.replace("{segment}", brief.get("segment", "general"))

        messages = [
            SystemMessage(content=prompt),
            HumanMessage(content=f"Brief:\n{json.dumps(brief, indent=2)}\n\nContext:\n{context}"),
        ]
        response = await chat.ainvoke(messages)
        content = response.content if hasattr(response, "content") else str(response)
        steps.append({"agent": role, "output": content[:2000]})
        return {"status": "complete", "steps": steps, "final": content}

    async def post_process_issue(
        self,
        issue_json: Dict[str, Any],
        workflow_mode: str,
        brief: Dict[str, Any],
        context: str = "",
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run post-generation workflow agents on a completed issue."""
        if not workflow_mode or workflow_mode == "default":
            return issue_json

        post_agents = {
            "judge", "fact_check", "voice", "compliance", "critic", "hook", "closer",
            "repurposing", "personalization", "recovery",
        }
        if workflow_mode in post_agents:
            result = await self.run_pipeline(workflow_mode, brief, json.dumps(issue_json) + "\n" + context, model)
            if result.get("final"):
                try:
                    return json.loads(result["final"])
                except json.JSONDecodeError:
                    issue_json["_workflow_notes"] = result.get("final", "")[:500]
        return issue_json


_engine: WorkflowEngine | None = None


def get_workflow_engine(model_service: Optional[ModelService] = None) -> WorkflowEngine:
    global _engine
    if _engine is None:
        _engine = WorkflowEngine(model_service)
    return _engine
