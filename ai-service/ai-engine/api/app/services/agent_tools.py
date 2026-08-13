"""Agent tools for the newsletter generation workflow.

Each tool wraps a specific capability (retrieval, plan analysis, visual generation, etc.)
that the LangGraph agent can call during execution.
"""

from typing import List, Dict, Any, Optional
import logging
import re

from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, SystemMessage

from app.services.model_service import ModelService
from app.rag.retrieval.retrieval import retrieval_service
from app.core.config import settings

logger = logging.getLogger(__name__)


class NewsletterTools:
    """Container for all agent tools with shared dependencies."""

    def __init__(self, model_service: Optional[ModelService] = None):
        self.model_service = model_service or ModelService()
        self._tools: Dict[str, callable] = {}
        self._register_tools()

    def _register_tools(self):
        """Register all available tools."""
        self._tools["retrieve_context"] = tool(self.retrieve_context)
        self._tools["search_sources"] = tool(self.search_sources)
        self._tools["generate_visual"] = tool(self.generate_visual)
        self._tools["get_series_context"] = tool(self.get_series_context)
        self._tools["validate_plan"] = tool(self.validate_plan)
        self._tools["estimate_generation_cost"] = tool(self.estimate_generation_cost)
        self._tools["analyze_retrieval_coverage"] = tool(self.analyze_retrieval_coverage)

    def get_tools(self) -> List:
        """Return all registered tools as a list for LangGraph."""
        return list(self._tools.values())

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
        logger.info("Retrieving context: query=%s, workspace=%s", query, workspace_id)

        try:
            embeddings = self.model_service.get_embeddings([query])
            results = retrieval_service.retrieve(
                embeddings[0],
                workspace_id=workspace_id,
                series_id=series_id,
                source_id=source_id,
                top_k=top_k or settings.TOP_K_RETRIEVAL,
            )

            formatted = []
            for r in results:
                payload = r.get("payload", {})
                formatted.append({
                    "score": r["score"],
                    "content": payload.get("text_preview", payload.get("content", ""))[:500],
                    "source_id": payload.get("source_id", ""),
                    "chunk_id": payload.get("chunk_id", ""),
                    "section_path": payload.get("section_path", []),
                    "heading": payload.get("section_path", ["Unknown"])[-1] if payload.get("section_path") else "Unknown",
                })
            return formatted
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
        embeddings = self.model_service.get_embeddings([query])
        results = retrieval_service.retrieve(
            embeddings[0],
            workspace_id=workspace_id,
            series_id=series_id,
            top_k=top_k or 10,
        )

        formatted = []
        for r in results:
            payload = r.get("payload", {})
            source_id = payload.get("source_id", "")
            formatted.append({
                "source_id": source_id,
                "score": r["score"],
                "title": payload.get("title", source_id),
                "section": payload.get("section_path", []),
                "preview": payload.get("text_preview", "")[:200],
            })
        return formatted

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
        """
        Retrieve series metadata, plan, and source information.

        Args:
            series_id: The series identifier
            workspace_id: Tenant workspace identifier
        """
        return {
            "series_id": series_id,
            "workspace_id": workspace_id,
            "sources": [],
            "plan": {},
            "recent_issues": [],
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
        for i, module in enumerate(modules):
            title = str(module.get("title") or "").strip()
            titles.append(title.lower())
            if not title:
                issues.append(f"Module {i + 1} missing a title")
            elif re.fullmatch(r"module\s+\d+", title, re.IGNORECASE):
                issues.append(f"Module {i + 1} has a placeholder title")
            if not module.get("learning_objectives"):
                issues.append(f"Module {i + 1} has no learning objectives")
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

        if not results or "error" in results[0]:
            return {"coverage_score": 0.0, "total_results": 0, "sources_hit": []}

        scores = [r["score"] for r in results]
        avg_score = sum(scores) / len(scores) if scores else 0.0

        sources_hit = list(set(r["source_id"] for r in results if r.get("source_id")))

        return {
            "coverage_score": round(avg_score, 4),
            "total_results": len(results),
            "sources_hit": sources_hit,
            "avg_score": round(avg_score, 4),
            "max_score": round(max(scores), 4) if scores else 0.0,
            "min_score": round(min(scores), 4) if scores else 0.0,
        }

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
