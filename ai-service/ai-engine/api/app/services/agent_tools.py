"""Agent tools for the newsletter generation workflow.

Each tool wraps a specific capability (retrieval, plan analysis, visual generation, etc.)
that the LangGraph agent can call during execution.
"""

from typing import List, Dict, Any, Optional
import logging
import json
import re

from langchain_core.tools import tool

from app.services.model_service import ModelService
from app.services.graph_policy import coverage_report
from app.services.prompt_injection import sanitize_source_text
from app.services.series_catalog import PostgresSeriesCatalog
from app.core.config import settings

logger = logging.getLogger(__name__)


class NewsletterTools:
    """Container for all agent tools with shared dependencies."""

    def __init__(
        self,
        model_service: Optional[ModelService] = None,
        catalog=None,
        retrieval=None,
    ):
        self.model_service = model_service or ModelService()
        self.catalog = catalog or PostgresSeriesCatalog()
        self._retrieval = retrieval
        self._tools: Dict[str, callable] = {}
        self._register_tools()

    @property
    def retrieval(self):
        if self._retrieval is None:
            from app.rag.retrieval.retrieval import retrieval_service

            self._retrieval = retrieval_service
        return self._retrieval

    def _register_tools(self):
        """Register all available tools."""
        self._tools["retrieve_context"] = tool(self.retrieve_context)
        self._tools["search_sources"] = tool(self.search_sources)
        self._tools["generate_visual"] = tool(self.generate_visual)
        self._tools["get_series_context"] = tool(self.get_series_context)
        self._tools["list_series_sources"] = tool(self.list_series_sources)
        self._tools["get_issue_history"] = tool(self.get_issue_history)
        self._tools["validate_plan"] = tool(self.validate_plan)
        self._tools["analyze_retrieval_coverage"] = tool(self.analyze_retrieval_coverage)
        self._tools["generate_glossary"] = tool(self.generate_glossary)
        self._tools["generate_examples"] = tool(self.generate_examples)
        self._tools["generate_analogies"] = tool(self.generate_analogies)
        self._tools["generate_counterexamples"] = tool(self.generate_counterexamples)
        self._tools["generate_case_study"] = tool(self.generate_case_study)
        self._tools["generate_scenarios"] = tool(self.generate_scenarios)

    def get_tools(self) -> List:
        """Return all registered tools as a list for LangGraph."""
        return list(self._tools.values())

    def _format_retrieval_hits(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        formatted: List[Dict[str, Any]] = []
        for r in results:
            payload = r.get("payload", {}) or {}
            raw_text = payload.get("text_preview", payload.get("content", "")) or ""
            safe_text = sanitize_source_text(str(raw_text))
            source_id = payload.get("source_id", "")
            section_path = payload.get("section_path", []) or []
            formatted.append(
                {
                    "score": r.get("score"),
                    "content": safe_text[:500],
                    "source_id": source_id,
                    "chunk_id": payload.get("chunk_id", ""),
                    "section_path": section_path,
                    "heading": section_path[-1] if section_path else "Unknown",
                    "title": payload.get("title", source_id),
                    "preview": safe_text[:200],
                }
            )
        return formatted

    def retrieve_context(
        self,
        query: str,
        workspace_id: str,
        series_id: Optional[str] = None,
        source_id: Optional[str] = None,
        top_k: Optional[int] = 10,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve relevant context from ingested sources using RAG.

        Args:
            query: The search query (e.g., learning objective, topic)
            workspace_id: Tenant workspace identifier (mandatory for isolation)
            series_id: Optional series filter to narrow results
            source_id: Optional source filter to narrow results
            top_k: Maximum number of results to return
        """
        logger.debug("Retrieving context: query=%s, workspace=%s", query, workspace_id)

        try:
            embeddings = self.model_service.get_embeddings([query])
            results = self.retrieval.retrieve(
                embeddings[0],
                workspace_id=workspace_id,
                series_id=series_id,
                source_id=source_id,
                top_k=top_k or settings.TOP_K_RETRIEVAL,
                score_threshold=settings.COVERAGE_MIN_SCORE,
            )
            return self._format_retrieval_hits(results)
        except Exception as e:
            logger.error("Context retrieval failed: %s", e)
            return []

    def search_sources(
        self,
        query: str,
        workspace_id: str,
        series_id: Optional[str] = None,
        top_k: Optional[int] = 10,
    ) -> List[Dict[str, Any]]:
        """
        Search for sources related to a query.

        Args:
            query: Search terms
            workspace_id: Tenant workspace identifier
            series_id: Optional series filter
            top_k: Maximum results
        """
        try:
            embeddings = self.model_service.get_embeddings([query])
            results = self.retrieval.retrieve(
                embeddings[0],
                workspace_id=workspace_id,
                series_id=series_id,
                top_k=top_k or 10,
                score_threshold=settings.COVERAGE_MIN_SCORE,
            )
            return self._format_retrieval_hits(results)
        except Exception as e:
            logger.error("Source search failed: %s", e)
            return []

    def generate_visual(
        self,
        description: str,
        diagram_type: str = "mermaid",
        content: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate a visual specification (Mermaid/D2 diagram).

        Args:
            description: What the diagram should show
            diagram_type: "mermaid" or "d2"
            content: Optional existing content to refine
        """
        logger.info("Generating visual: type=%s, desc=%s", diagram_type, description)

        prompt = f"""
Create a {diagram_type} diagram based on:
{description}

Output ONLY the {diagram_type} code, no extra text or markdown fences.
"""

        if content:
            prompt = f"""
Given this existing {diagram_type} diagram:
{content}

Refine it based on:
{description}

Output the refined {diagram_type} code only.
"""

        if self.model_service:
            result = self.model_service.generate_text(
                [{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=2000,
            )
        else:
            result = f"graph TD\n    A[{description[:50]}] --> B[Result]"

        safe_diagram = self._validate_diagram(result, diagram_type)

        return {
            "type": diagram_type,
            "content": safe_diagram,
            "alt_text": description,
            "width": 800,
            "height": 600,
            "format": "svg",
        }

    def get_series_context(
        self,
        series_id: str,
        workspace_id: str,
    ) -> Dict[str, Any]:
        """Load series metadata and stored plan from Postgres."""
        row = self.catalog.get_series(series_id, workspace_id)
        if not row:
            return {
                "found": False,
                "series_id": series_id,
                "workspace_id": workspace_id,
            }
        sources = self.catalog.list_sources(
            series_id, workspace_id, settings.AGENT_SOURCE_LIST_LIMIT
        )
        return {
            "found": True,
            "series_id": row["id"],
            "workspace_id": row["workspace_id"],
            "topic": row.get("topic") or "",
            "goal": row.get("goal") or "",
            "level": row.get("level") or "",
            "timezone": row.get("timezone") or "UTC",
            "cadence": row.get("cadence") or "",
            "start_date": row.get("start_date") or "",
            "send_time": row.get("send_time") or "",
            "send_days": row.get("send_days") or "",
            "status": row.get("status") or "",
            "plan_status": row.get("plan_status") or "",
            "plan": row.get("plan_json") or {},
            "source_count": len(sources),
            "ready_source_count": sum(1 for src in sources if src.get("status") == "ready"),
        }

    def list_series_sources(
        self,
        series_id: str,
        workspace_id: str,
    ) -> Dict[str, Any]:
        """List ingested sources for this series (status, type, title)."""
        sources = self.catalog.list_sources(
            series_id, workspace_id, settings.AGENT_SOURCE_LIST_LIMIT
        )
        return {
            "series_id": series_id,
            "sources": sources,
            "count": len(sources),
        }

    def get_issue_history(
        self,
        series_id: str,
        workspace_id: str,
    ) -> Dict[str, Any]:
        """Prior emails in this series so later lessons do not repeat earlier ones."""
        issues = self.catalog.list_issues(series_id, settings.ISSUE_HISTORY_LIMIT)
        return {
            "series_id": series_id,
            "workspace_id": workspace_id,
            "issues": issues,
            "count": len(issues),
        }

    def validate_plan(
        self,
        plan: Dict[str, Any],
        series_id: str,
    ) -> Dict[str, Any]:
        """
        Validate a curriculum plan for correctness.

        Args:
            plan: The plan structure to validate
            series_id: Related series ID for context
        """
        issues = []
        warnings = []

        modules = plan.get("modules", [])
        if not modules:
            issues.append("Plan has no modules")
        elif len(modules) > 20:
            warnings.append(f"Plan has {len(modules)} modules - consider splitting")

        titles = []
        seen_objectives: set[str] = set()
        for i, module in enumerate(modules):
            title = str(module.get("title") or "").strip()
            titles.append(title.lower())
            if not title:
                issues.append(f"Module {i + 1} missing a title")
            elif re.fullmatch(r"module\s+\d+", title, re.IGNORECASE):
                issues.append(f"Module {i + 1} has a placeholder title")
            objectives = module.get("learning_objectives") or []
            if not objectives:
                issues.append(f"Module {i + 1} has no learning objectives")
            for raw_obj in objectives:
                objective = str(raw_obj or "").strip().lower()
                if not objective:
                    continue
                if objective in seen_objectives:
                    issues.append(f"Duplicate learning objective: {raw_obj}")
                seen_objectives.add(objective)
            duration = module.get("duration_weeks", 1)
            if duration is not None and duration <= 0:
                issues.append(f"Module {i + 1} has invalid duration")

        unique_titles = {t for t in titles if t}
        if modules and len(unique_titles) < min(3, len(modules)):
            issues.append("Modules must have distinct titles")

        total_weeks = plan.get("total_weeks", 0)
        if total_weeks <= 0:
            issues.append("Plan has invalid total duration")

        return {
            "valid": len(issues) == 0,
            "issues": issues,
            "warnings": warnings,
            "module_count": len(modules),
            "total_weeks": total_weeks,
        }

    def estimate_generation_cost(
        self,
        plan: Dict[str, Any],
        source_count: int,
        avg_chunk_count: int = 50,
    ) -> Dict[str, Any]:
        """
        Estimate the token usage and cost for generating content.

        Args:
            plan: The curriculum plan
            source_count: Number of sources
            avg_chunk_count: Average chunks per source
        """
        modules = plan.get("modules", [])
        estimated_tokens = 0

        for module in modules:
            objectives = len(module.get("learning_objectives", []))
            estimated_tokens += objectives * 500

        embedding_tokens = source_count * avg_chunk_count * 10
        total_output_tokens = len(modules) * 2000

        return {
            "estimated_input_tokens": embedding_tokens + estimated_tokens,
            "estimated_output_tokens": total_output_tokens,
            "total_tokens": embedding_tokens + estimated_tokens + total_output_tokens,
            "estimated_cost_usd": (embedding_tokens + estimated_tokens + total_output_tokens) / 1000 * 0.001,
            "module_count": len(modules),
        }

    def analyze_retrieval_coverage(
        self,
        query: str,
        workspace_id: str,
        series_id: Optional[str] = None,
        top_k: int = 20,
    ) -> Dict[str, Any]:
        """
        Analyze how well retrieval covers the query space.

        Args:
            query: The search query
            workspace_id: Tenant workspace identifier
            series_id: Optional series filter
            top_k: Number of results to analyze
        """
        results = self.retrieve_context(query, workspace_id, series_id, None, top_k)
        report = coverage_report(results, settings.COVERAGE_MIN_SCORE)
        report["query"] = query
        return report

    def generate_glossary(
        self,
        issue_text: str,
        audience_level: str = "",
        max_terms: int = 8,
    ) -> Dict[str, Any]:
        """Create a concise glossary from terms used in a lesson draft."""
        return self._generate_learning_aid(
            task="glossary",
            schema={
                "terms": [
                    {
                        "term": "string",
                        "definition": "string",
                        "why_it_matters": "string",
                    }
                ]
            },
            prompt=(
                "Create a small glossary from the terms used in this issue draft. "
                "Prefer the most important or potentially confusing terms. "
                f"Keep it suitable for audience level: {audience_level or 'general'}.\n\n"
                f"Issue draft:\n{issue_text[:6000]}"
            ),
            fallback={"terms": []},
            limit=max_terms,
        )

    def generate_examples(
        self,
        concept: str,
        audience_level: str = "",
        count: int = 3,
    ) -> Dict[str, Any]:
        """Generate concrete examples that make a concept easier to understand."""
        return self._generate_learning_aid(
            task="examples",
            schema={
                "examples": [
                    {
                        "title": "string",
                        "example": "string",
                        "why_it_helps": "string",
                    }
                ]
            },
            prompt=(
                "Generate concrete examples that make this idea easier to understand. "
                f"Audience level: {audience_level or 'general'}.\n\n"
                f"Concept:\n{concept[:2000]}"
            ),
            fallback={"examples": []},
            limit=count,
        )

    def generate_analogies(
        self,
        concept: str,
        audience_level: str = "",
        count: int = 3,
    ) -> Dict[str, Any]:
        """Generate analogies for a hard concept."""
        return self._generate_learning_aid(
            task="analogies",
            schema={
                "analogies": [
                    {
                        "analogy": "string",
                        "mapping": "string",
                        "limit": "string",
                    }
                ]
            },
            prompt=(
                "Create analogies for this hard concept. "
                "Each analogy should explain what maps well and where the analogy breaks. "
                f"Audience level: {audience_level or 'general'}.\n\n"
                f"Concept:\n{concept[:2000]}"
            ),
            fallback={"analogies": []},
            limit=count,
        )

    def generate_counterexamples(
        self,
        concept: str,
        rule: str = "",
        count: int = 3,
    ) -> Dict[str, Any]:
        """Show where a concept, rule, or heuristic breaks down."""
        return self._generate_learning_aid(
            task="counterexamples",
            schema={
                "counterexamples": [
                    {
                        "scenario": "string",
                        "why_it_breaks": "string",
                        "takeaway": "string",
                    }
                ]
            },
            prompt=(
                "Generate counterexamples showing where this concept, rule, or heuristic does not apply. "
                f"Concept: {concept[:1200]}\n"
                f"Rule or claim: {rule[:1200]}"
            ),
            fallback={"counterexamples": []},
            limit=count,
        )

    def generate_case_study(
        self,
        topic: str,
        lesson_goal: str = "",
    ) -> Dict[str, Any]:
        """Turn a topic into a short, practical case study."""
        return self._generate_learning_aid(
            task="case study",
            schema={
                "title": "string",
                "context": "string",
                "problem": "string",
                "actions": ["string"],
                "result": "string",
                "lesson": "string",
            },
            prompt=(
                "Turn this topic into a short, useful case study. "
                f"Topic: {topic[:1200]}\n"
                f"Lesson goal: {lesson_goal[:1200]}"
            ),
            fallback={
                "title": "",
                "context": "",
                "problem": "",
                "actions": [],
                "result": "",
                "lesson": "",
            },
        )

    def generate_scenarios(
        self,
        topic: str,
        skill_focus: str = "",
        count: int = 3,
    ) -> Dict[str, Any]:
        """Create realistic scenarios where the reader can apply the lesson."""
        return self._generate_learning_aid(
            task="scenarios",
            schema={
                "scenarios": [
                    {
                        "scenario": "string",
                        "decision": "string",
                        "good_answer_shape": "string",
                    }
                ]
            },
            prompt=(
                "Create realistic situations where the lesson can be applied. "
                f"Topic: {topic[:1200]}\n"
                f"Skill focus: {skill_focus[:1200]}"
            ),
            fallback={"scenarios": []},
            limit=count,
        )

    def _generate_learning_aid(
        self,
        task: str,
        schema: Dict[str, Any],
        prompt: str,
        fallback: Dict[str, Any],
        limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Generate structured helper content for teaching aids."""
        if not self.model_service:
            return fallback

        response = self.model_service.generate_text(
            [
                {
                    "role": "system",
                    "content": (
                        "You create compact teaching aids for newsletter writers. "
                        "Output valid JSON only."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Task: generate {task}.\n"
                        f"{prompt}\n\n"
                        f"Return valid JSON matching this schema: {json.dumps(schema)}"
                    ),
                },
            ],
            temperature=0.3,
            max_tokens=1800,
        )

        try:
            parsed = json.loads(response)
        except json.JSONDecodeError:
            logger.warning("Learning aid tool %s returned invalid JSON", task)
            return fallback

        if limit is None:
            return parsed if isinstance(parsed, dict) else fallback

        return self._trim_learning_aid(parsed, fallback, limit)

    def _trim_learning_aid(
        self,
        parsed: Any,
        fallback: Dict[str, Any],
        limit: int,
    ) -> Dict[str, Any]:
        if not isinstance(parsed, dict):
            return fallback
        for key, value in parsed.items():
            if isinstance(value, list):
                parsed[key] = value[: max(1, limit)]
        return parsed

    def _validate_diagram(self, diagram_code: str, diagram_type: str) -> str:
        """Validate diagram code for safety and correctness."""
        if diagram_type == "mermaid":
            if diagram_code.count("%%{") > 5:
                diagram_code = diagram_code.replace("%%{", "").replace("%%}", "")

            if "<script" in diagram_code.lower():
                return "graph TD\n    A[Unsafe diagram rejected]"

            return diagram_code.strip()
        elif diagram_type == "d2":
            if "<script" in diagram_code.lower():
                return "x -> y: Safe fallback"

            return diagram_code.strip()

        return diagram_code.strip()


_tool_box: Optional[NewsletterTools] = None


def get_toolbox(model_service: Optional[ModelService] = None) -> NewsletterTools:
    """Get or create the global tools instance."""
    global _tool_box
    if _tool_box is None:
        _tool_box = NewsletterTools(model_service)
    return _tool_box
