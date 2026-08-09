"""Generation worker for LangGraph workflows
Handles plan generation and issue generation workflows
"""

from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
import logging
import asyncio
import time

from app.core.config import settings
from app.services.model_service import ModelService

logger = logging.getLogger(__name__)

class GenerationWorker:
    """Worker for AI generation workflows"""
    
    def __init__(self, model_service: ModelService):
        self.model_service = model_service
        self.running = False
    
    async def start(self):
        """Start the generation worker background process"""
        self.running = True
        logger.info("Generation worker started")
        
        while self.running:
            await self._process_pending_generations()
            await asyncio.sleep(5)
    
    async def stop(self):
        """Stop the generation worker"""
        self.running = False
        logger.info("Generation worker stopped")
    
    async def generate_plan(self, brief: Dict[str, Any]) -> Dict[str, Any]:
        """Generate a curriculum plan based on a series brief"""
        try:
            # Import LangGraph components
            from langgraph.graph import StateGraph, END
            from langgraph.graph.message import add_messages
            from typing import TypedDict, Annotated
            from langchain_core.messages import HumanMessage, AIMessage
            
            # Define state
            class PlanState(TypedDict):
                messages: Annotated[list, add_messages]
                brief: Dict[str, Any]
                plan: Optional[Dict[str, Any]]
                revision_count: int
            
            # Create workflow
            workflow = StateGraph(PlanState)
            
            # Define nodes
            async def normalize_brief(state: PlanState):
                """Node: Normalize brief"""
                return {"brief": state["brief"]}
            
            async def create_curriculum(state: PlanState):
                """Node: Create curriculum"""
                brief = state["brief"]
                messages = [
                    HumanMessage(content=f"""Create a curriculum plan based on:
                    Topic: {brief.get("topic", "")}
                    Goal: {brief.get("goal", "")}
                    Level: {brief.get("level", "")}
                    Duration: {brief.get("duration", "")}
                    Cadence: {brief.get("cadence", "")}
                    
                    Output a structured JSON with modules, prerequisites, and learning objectives.
                    Maximum {settings.MAX_REVISION_LOOPS} revision attempts.
                    """)
                ]
                
                response = await self.model_service.generate_structured_output(
                    [msg.dict() for msg in messages],
                    {
                        "modules": [{"title": "string", "learning_objectives": ["string"], "duration_weeks": 1}],
                        "prerequisites": ["string"],
                        "total_weeks": 4
                    }
                )
                
                return {"plan": response, "messages": [AIMessage(content=str(response))]}
            
            async def check_coverage(state: PlanState):
                """Node: Check coverage and prerequisites"""
                plan = state.get("plan", {})
                issues = []
                
                if not plan.get("modules"):
                    issues.append("Plan is missing modules")
                if not plan.get("learning_objectives"):
                    issues.append("Plan is missing learning objectives")
                    
                return {"coverage_issues": issues}
            
            async def validate_plan(state: PlanState):
                """Node: Validate plan"""
                plan = state.get("plan", {})
                coverage_issues = state.get("coverage_issues", [])
                
                if len(coverage_issues) > 0:
                    if state.get("revision_count", 0) < settings.MAX_REVISION_LOOPS:
                        # Revise the plan
                        return {"next_step": "create_curriculum"}
                    else:
                        return {"next_step": "return_typed_plan"}
                
                return {"next_step": "return_typed_plan"}
            
            async def return_typed_plan(state: PlanState):
                """Node: Return typed plan"""
                return {"plan": state["plan"]}
            
            # Add nodes to workflow
            workflow.add_node("normalize_brief", normalize_brief)
            workflow.add_node("create_curriculum", create_curriculum)
            workflow.add_node("check_coverage", check_coverage)
            workflow.add_node("validate_plan", validate_plan)
            workflow.add_node("return_typed_plan", return_typed_plan)
            
            # Add edges
            workflow.add_edge("normalize_brief", "create_curriculum")
            workflow.add_edge("create_curriculum", "check_coverage")
            workflow.add_edge("check_coverage", "validate_plan")
            workflow.add_conditional_edges(
                "validate_plan",
                lambda x: x["next_step"],
                {
                    "create_curriculum": "create_curriculum",
                    "return_typed_plan": "return_typed_plan"
                }
            )
            workflow.add_edge("return_typed_plan", END)
            
            # Set entry point
            workflow.set_entry_point("normalize_brief")
            
            # Compile and run
            app = workflow.compile()
            result = await app.ainvoke({
                "brief": brief,
                "messages": [],
                "plan": None,
                "revision_count": 0
            })
            
            return result["plan"]
            
        except Exception as e:
            logger.error(f"Plan generation failed: {e}")
            raise
    
    async def generate_issue(self, series_id: str, issue_id: str, brief: Dict[str, Any]) -> Dict[str, Any]:
        """Generate an email issue with RAG citations"""
        try:
            # Import LangGraph components
            from langgraph.graph import StateGraph, END
            from langgraph.graph.message import add_messages
            from typing import TypedDict, Annotated
            from langchain_core.messages import HumanMessage, AIMessage
            
            # Define state
            class IssueState(TypedDict):
                messages: Annotated[list, add_messages]
                series_id: str
                issue_id: str
                brief: Dict[str, Any]
                issue_content: Optional[Dict[str, Any]]
                revision_count: int
            
            # Create workflow
            workflow = StateGraph(IssueState)
            
            # Define nodes
            async def load_issue_input(state: IssueState):
                """Node: Load immutable issue input"""
                return {
                    "series_id": state["series_id"],
                    "issue_id": state["issue_id"],
                    "brief": state["brief"]
                }
            
            async def retrieve_context(state: IssueState):
                """Node: Retrieve grounded context"""
                # This would integrate with Qdrant retrieval
                # For now, we'll generate without retrieval
                return {}
            
            async def write_issue(state: IssueState):
                """Node: Write structured issue"""
                brief = state["brief"]
                messages = [
                    HumanMessage(content=f"""Generate a newsletter issue based on:
                    Series ID: {state["series_id"]}
                    Issue ID: {state["issue_id"]}
                    Brief: {str(brief)}
                    
                    Output a structured JSON with subject, preheader, content blocks, and visual specs.
                    Every factual claim must include citations.
                    """)
                ]
                
                response = await self.model_service.generate_structured_output(
                    [msg.dict() for msg in messages],
                    {
                        "subject": "string",
                        "preheader": "string",
                        "content_blocks": [{"type": "string", "title": "string", "text": "string", "citations": [{"source_id": "string", "chunk_id": "string", "locator": "string"}]}],
                        "visual_specs": [{"type": "mermaid", "content": "string", "alt_text": "string"}],
                        "citations": [{"block_id": "string", "source_id": "string", "chunk_id": "string", "locator": "string"}]
                    }
                )
                
                return {"issue_content": response, "messages": [AIMessage(content=str(response))]}
            
            async def validate_output(state: IssueState):
                """Node: Quality gate and validation"""
                content = state.get("issue_content", {})
                
                # Check required fields
                required = ["subject", "preheader", "content_blocks"]
                for field in required:
                    if field not in content:
                        # Revise
                        if state.get("revision_count", 0) < settings.MAX_REVISION_LOOPS:
                            return {"next_step": "write_issue"}
                        else:
                            return {"next_step": "return_issue"}
                
                return {"next_step": "return_issue"}
            
            async def return_issue(state: IssueState):
                """Node: Return typed issue"""
                return {"issue_content": state["issue_content"]}
            
            # Add nodes to workflow
            workflow.add_node("load_input", load_issue_input)
            workflow.add_node("retrieve_context", retrieve_context)
            workflow.add_node("write_issue", write_issue)
            workflow.add_node("validate_output", validate_output)
            workflow.add_node("return_issue", return_issue)
            
            # Add edges
            workflow.add_edge("load_input", "retrieve_context")
            workflow.add_edge("retrieve_context", "write_issue")
            workflow.add_edge("write_issue", "validate_output")
            workflow.add_conditional_edges(
                "validate_output",
                lambda x: x["next_step"],
                {
                    "write_issue": "write_issue",
                    "return_issue": "return_issue"
                }
            )
            workflow.add_edge("return_issue", END)
            
            # Set entry point
            workflow.set_entry_point("load_input")
            
            # Compile and run
            app = workflow.compile()
            result = await app.ainvoke({
                "series_id": series_id,
                "issue_id": issue_id,
                "brief": brief,
                "messages": [],
                "issue_content": None,
                "revision_count": 0
            })
            
            return result["issue_content"]
            
        except Exception as e:
            logger.error(f"Issue generation failed: {e}")
            raise
