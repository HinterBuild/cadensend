"""Generation worker for AI Engine.
Handles plan generation, issue generation, and visual generation workflows.
"""

from typing import Optional, List, Dict, Any, TYPE_CHECKING
import asyncio
import logging

logger = logging.getLogger(__name__)


class GenerationWorker:
    """Worker for AI generation tasks including planning and issue generation."""

    def __init__(self, model_service: Optional[Any] = None):
        self.model_service = model_service
        self.running = False

    async def start(self):
        """Start the generation worker background loop."""
        self.running = True
        logger.info("Generation worker started")
        while self.running:
            await asyncio.sleep(5)

    async def stop(self):
        """Stop the generation worker."""
        self.running = False
        logger.info("Generation worker stopped")

    async def generate_plan(self, brief: Dict[str, Any]) -> Dict[str, Any]:
        """Generate a curriculum plan based on a series brief."""
        try:
            schema = {
                "modules": [{"title": "string", "learning_objectives": ["string"], "duration_weeks": 1}],
                "prerequisites": ["string"],
                "total_weeks": 4,
            }

            if self.model_service:
                return await self.model_service.generate_structured_output(
                    messages=[{"role": "user", "content": self._build_plan_prompt(brief)}],
                    schema=schema,
                    temperature=0.3,
                    max_tokens=4000,
                )

            return self._default_plan()

        except Exception as e:
            logger.error("Plan generation failed: %s", e)
            raise

    async def generate_issue(self, series_id: str, issue_id: str, objective: str) -> Dict[str, Any]:
        """Generate an email issue with RAG citations."""
        try:
            schema = {
                "subject": "string",
                "preheader": "string",
                "content_blocks": [{"type": "string", "title": "string", "text": "string", "citations": [{"source_id": "string", "chunk_id": "string", "locator": "string"}]}],
                "visual_specs": [{"type": "mermaid", "content": "string", "alt_text": "string"}],
            }

            if self.model_service:
                return await self.model_service.generate_structured_output(
                    messages=[{"role": "user", "content": self._build_issue_prompt(series_id, issue_id, objective)}],
                    schema=schema,
                    temperature=0.7,
                    max_tokens=4000,
                )

            return self._default_issue(objective)

        except Exception as e:
            logger.error("Issue generation failed: %s", e)
            raise

    async def generate_visual(self, description: str, diagram_type: str = "mermaid") -> Dict[str, Any]:
        """Generate a visual specification."""
        try:
            if self.model_service:
                content = await self.model_service.generate_response(
                    messages=[{"role": "user", "content": (
                        f"Generate a {diagram_type} diagram based on:\n"
                        f"Description: {description}\n"
                        f"Output only the {diagram_type} code, no extra text."
                    )}],
                    temperature=0.3,
                    max_tokens=2000,
                )
            else:
                content = "graph TD\n    A[Start] --> B[Process] --> C[End]"
                content += "\n\n# Generated with default template (AI service unavailable)"

            return {
                "type": diagram_type,
                "content": content,
                "alt_text": description,
                "width": 800,
                "height": 600,
                "format": "svg",
            }

        except Exception as e:
            logger.error("Visual generation failed: %s", e)
            return {
                "type": diagram_type,
                "content": "graph TD\n    A[Error] --> B[Generation Failed]",
                "alt_text": description,
                "width": 800,
                "height": 600,
                "format": "svg",
                "error": str(e),
            }

    def _build_plan_prompt(self, brief: Dict[str, Any]) -> str:
        """Build the prompt for plan generation."""
        return (
            "Create a curriculum plan based on:\n"
            f"Topic: {brief.get('topic', '')}\n"
            f"Goal: {brief.get('goal', '')}\n"
            f"Level: {brief.get('level', '')}\n"
            f"Duration: {brief.get('duration', '')}\n"
            f"Cadence: {brief.get('cadence', '')}\n"
            "Output a structured JSON with modules, prerequisites, and learning objectives."
        )

    def _build_issue_prompt(self, series_id: str, issue_id: str, objective: str) -> str:
        """Build the prompt for issue generation."""
        return (
            "Generate a newsletter issue based on:\n"
            f"Series ID: {series_id}\n"
            f"Issue ID: {issue_id}\n"
            f"Objective: {objective}\n"
            "Output a structured JSON with subject, preheader, content blocks, and visual specs.\n"
            "Every factual claim must include citations."
        )

    def _default_plan(self) -> Dict[str, Any]:
        """Return a default plan when the AI service is unavailable or fails."""
        return {
            "modules": [
                {"title": f"Module {i + 1}", "learning_objectives": ["Learn key concepts"], "duration_weeks": 1}
                for i in range(4)
            ],
            "prerequisites": [],
            "total_weeks": 4,
        }

    def _default_issue(self, objective: str) -> Dict[str, Any]:
        """Return a default issue when the AI service is unavailable."""
        return {
            "subject": f"Weekly Issue: {objective[:50] if objective else 'Learning Series'}",
            "preheader": "Your latest learning content",
            "content_blocks": [
                {
                    "type": "markdown",
                    "title": "Welcome",
                    "text": f"This is your issue for the series on {objective}.",
                    "citations": [],
                }
            ],
            "visual_specs": [
                {"type": "mermaid", "content": "graph TD\n    A[Start] --> B[End]", "alt_text": "Simple flowchart"}
            ],
            "note": "Generated with default template (AI service unavailable)",
        }
