"""Generation worker for AI Engine
Handles plan generation, issue generation, and visual generation workflows
"""

from typing import Optional, List, Dict, Any
import asyncio
import logging

logger = logging.getLogger(__name__)

class GenerationWorker:
    """Worker for AI generation tasks including planning and issue generation"""
    
    def __init__(self, model_service=None):
        self.model_service = model_service
        self.running = False
        
    async def start(self):
        """Start the generation worker background loop"""
        self.running = True
        logger.info("Generation worker started")
        while self.running:
            await asyncio.sleep(5)
            
    async def stop(self):
        """Stop the generation worker"""
        self.running = False
        logger.info("Generation worker stopped")

    async def generate_plan(self, brief: Dict[str, Any]) -> Dict[str, Any]:
        """Generate a curriculum plan based on a series brief"""
        try:
            schema = {
                "modules": [{"title": "string", "learning_objectives": ["string"], "duration_weeks": 1}],
                "prerequisites": ["string"],
                "total_weeks": 4
            }
            
            if self.model_service:
                plan = await self.model_service.generate_structured_output(
                    messages=[{"role": "user", "content": f"""Create a curriculum plan based on:
                    Topic: {brief.get("topic", "")}
                    Goal: {brief.get("goal", "")}
                    Level: {brief.get("level", "")}
                    Duration: {brief.get("duration", "")}
                    Cadence: {brief.get("cadence", "")}
                    
                    Output a structured JSON with modules, prerequisites, and learning objectives."""}],
                    schema=schema,
                    temperature=0.3,
                    max_tokens=4000
                )
            else:
                plan = {
                    "modules": [
                        {"title": f"Module {i+1}", "learning_objectives": ["Learn key concepts"], "duration_weeks": 1}
                        for i in range(4)
                    ],
                    "prerequisites": [],
                    "total_weeks": 4
                }
            
            return plan
            
        except Exception as e:
            logger.error(f"Plan generation failed: {e}")
            if self.model_service is None:
                return {
                    "modules": [
                        {"title": f"Module {i+1}", "learning_objectives": ["Learn key concepts"], "duration_weeks": 1}
                        for i in range(4)
                    ],
                    "prerequisites": [],
                    "total_weeks": 4,
                    "note": "Generated with default template (AI service unavailable)"
                }
            raise

    async def generate_issue(self, series_id: str, issue_id: str, objective: str) -> Dict[str, Any]:
        """Generate an email issue with RAG citations"""
        try:
            schema = {
                "subject": "string",
                "preheader": "string",
                "content_blocks": [{"type": "string", "title": "string", "text": "string", "citations": [{"source_id": "string", "chunk_id": "string", "locator": "string"}]}],
                "visual_specs": [{"type": "mermaid", "content": "string", "alt_text": "string"}],
            }
            
            if self.model_service:
                issue = await self.model_service.generate_structured_output(
                    messages=[{"role": "user", "content": f"""Generate a newsletter issue based on:
                    Series ID: {series_id}
                    Issue ID: {issue_id}
                    Objective: {objective}
                    
                    Output a structured JSON with subject, preheader, content blocks, and visual specs.
                    Every factual claim must include citations."""}],
                    schema=schema,
                    temperature=0.7,
                    max_tokens=4000
                )
            else:
                issue = {
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
                    "note": "Generated with default template (AI service unavailable)"
                }
            
            return issue
            
        except Exception as e:
            logger.error(f"Issue generation failed: {e}")
            if self.model_service is None:
                return {
                    "subject": "Weekly Issue",
                    "preheader": "Your latest learning content",
                    "content_blocks": [],
                    "visual_specs": [],
                    "note": "Generated with default template (AI service unavailable)"
                }
            raise

    async def generate_visual(self, description: str, diagram_type: str = "mermaid") -> Dict[str, Any]:
        """Generate a visual specification"""
        try:
            if self.model_service:
                content = await self.model_service.generate_response(
                    messages=[{"role": "user", "content": f"""Generate a {diagram_type} diagram based on:
                    Description: {description}
                    Output only the {diagram_type} code, no extra text."""}],
                    temperature=0.3,
                    max_tokens=2000
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
            logger.error(f"Visual generation failed: {e}")
            return {
                "type": diagram_type,
                "content": "graph TD\n    A[Error] --> B[Generation Failed]",
                "alt_text": description,
                "width": 800,
                "height": 600,
                "format": "svg",
                "error": str(e)
            }
