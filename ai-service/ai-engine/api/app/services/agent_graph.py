"""LangGraph newsletter agent workflow.

Implements a multi-agent LangGraph that orchestrates plan generation,
issue generation, retrieval, and visual creation with:
- Short-term memory: Per-thread message history (checkpoint-based)
- Long-term memory: Persistent PostgreSQL-backed memory store
- Tool integration: RAG retrieval, visual generation, plan validation
- Bounded revision loops for quality control
"""

from typing import List, Dict, Any, Optional, Annotated, TypedDict, Sequence
import logging
import json
import asyncio
from datetime import datetime

from langchain_core.messages import (
    BaseMessage,
    HumanMessage,
    AIMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langgraph.graph import StateGraph, add_messages, START, END
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.base import BaseCheckpointSaver, Checkpoint, CheckpointMetadata
from langgraph.store.base import BaseStore

from app.services.agent_tools import NewsletterTools, get_toolbox
from app.services.model_service import ModelService
from app.services.memory_store import LongTermMemoryStore
from app.core.config import settings

logger = logging.getLogger(__name__)


class NewsletterState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    brief: Dict[str, Any]
    workspace_id: str
    series_id: Optional[str]
    plan: Optional[Dict[str, Any]]
    issues: List[Dict[str, Any]]
    retrieved_context: List[Dict[str, Any]]
    revision_count: int
    status: str
    error: Optional[str]
    citations: List[Dict[str, Any]]
    visual_specs: List[Dict[str, Any]]
    memory_context: List[Dict[str, Any]]
    model: Optional[str]
    workflow: str


class NewsletterAgent:
    """Orchestrates the newsletter generation workflow using LangGraph."""

    def __init__(
        self,
        model_service: Optional[ModelService] = None,
        memory_store: Optional[LongTermMemoryStore] = None,
        checkpoint_factory: Optional[BaseCheckpointSaver] = None,
    ):
        self.model_service = model_service or ModelService()
        self.memory_store = memory_store or LongTermMemoryStore()
        self.checkpoint_factory = checkpoint_factory

        self.tools_box: NewsletterTools = get_toolbox(self.model_service)
        self.tools = self.tools_box.get_tools()

        self.graph = self._build_graph()

    def _chat_model(self, state: NewsletterState, temperature: float = 0.7, max_tokens: int = 4000):
        """OpenRouter chat model for this run (user choice or ENV default)."""
        return self.model_service.get_chat_model(
            model=state.get("model"),
            temperature=temperature,
            max_tokens=max_tokens,
        )

    def _build_graph(self) -> StateGraph:
        """Build the LangGraph state machine."""
        graph = StateGraph(NewsletterState)

        graph.add_node("load_memory", self._load_memory_node)
        graph.add_node("plan", self._plan_node)
        graph.add_node("validate_plan", self._validate_plan_node)
        graph.add_node("retrieve_context", self._retrieve_context_node)
        graph.add_node("generate_issue", self._generate_issue_node)
        graph.add_node("analyze_coverage", self._analyze_coverage_node)
        graph.add_node("generate_visuals", self._generate_visuals_node)
        graph.add_node("assemble_issue", self._assemble_issue_node)
        graph.add_node("quality_check", self._quality_check_node)
        graph.add_node("revise_issue", self._revise_issue_node)
        graph.add_node("save_memory", self._save_memory_node)
        graph.add_node("tools", ToolNode(self.tools))

        graph.add_edge(START, "load_memory")
        graph.add_edge("load_memory", "plan")
        graph.add_edge("plan", "validate_plan")
        graph.add_conditional_edges(
            "validate_plan",
            self._after_plan,
            {
                "plan_done": "save_memory",
                "generate": "retrieve_context",
            },
        )
        graph.add_edge("retrieve_context", "generate_issue")
        graph.add_edge("generate_issue", "analyze_coverage")
        graph.add_edge("analyze_coverage", "generate_visuals")
        graph.add_edge("generate_visuals", "assemble_issue")
        graph.add_edge("assemble_issue", "quality_check")

        graph.add_conditional_edges(
            "quality_check",
            self._should_revise,
            {
                "revise": "revise_issue",
                "done": "save_memory",
            },
        )
        graph.add_edge("revise_issue", "quality_check")
        graph.add_edge("save_memory", END)

        return graph

    def _after_plan(self, state: NewsletterState) -> str:
        """Plan jobs stop after validation; issue jobs continue into retrieval."""
        if state.get("workflow") == "plan":
            return "plan_done"
        return "generate"

    def _build_default_system_prompt(self, brief: Dict[str, Any], memory_context: List[Dict]) -> str:
        """Build the system prompt for the agent."""
        memory_summary = ""
        if memory_context:
            memory_summary = "\n## Long-term Memory Context\n"
            for mem in memory_context[:5]:
                memory_summary += f"- {mem.get('content', '')}\n"
            memory_summary += "\nUse this to maintain consistency with past decisions.\n"

        return f"""
You are Cadensend's Newsletter Architect — an expert AI agent that creates grounded, educational email courses.

Your job is to take a series brief and produce a complete curriculum plan with well-researched, cited content.

Core Principles:
1. **Grounded**: Every factual claim must be verifiable through retrieved context
2. **Educational**: Content should teach, not just inform — use concrete examples
3. **Concise**: Email issues are short-read format (5-10 minutes)
4. **Citable**: Every claim maps to specific retrieved sources with citations
5. **Revision-bounded**: Iterate at most {settings.MAX_REVISION_LOOPS} times

Series Brief:
- Topic: {brief.get('topic', '')}
- Goal: {brief.get('goal', '')}
- Level: {brief.get('level', '')}
- Duration: {brief.get('duration', '')}
- Cadence: {brief.get('cadence', '')}

Tools available:
- retrieve_context: Search ingested sources for relevant content
- search_sources: Find source materials related to a query
- generate_visual: Create Mermaid/D2 diagrams with alt text
- get_series_context: Retrieve series metadata and plan
- validate_plan: Check plan correctness and constraints
- estimate_generation_cost: Calculate token and cost estimates
- analyze_retrieval_coverage: Assess retrieval quality
{memory_summary}

You MUST use tools to retrieve context before generating any content. Never hallucinate facts.
If retrieval returns no results, note this gap and proceed with a disclaimer.
"""

    async def compile_graph(self, thread_id: str) -> Any:
        """Compile the graph with checkpoints and memory."""
        from app.services.checkpoint_backend import PostgresCheckpointBackend

        checkpointer = PostgresCheckpointBackend()
        await checkpointer.setup()

        compiled = self.graph.compile(
            checkpointer=checkpointer,
            store=self.memory_store,
        )

        return compiled

    async def run_plan_generation(
        self,
        brief: Dict[str, Any],
        workspace_id: str,
        series_id: Optional[str] = None,
        thread_id: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run the plan generation workflow."""
        thread_id = thread_id or f"plan-{series_id or 'default'}-{datetime.now().isoformat()}"
        memory_namespace = ("cadensend", "workspace", workspace_id, "series", series_id or "default")
        chosen_model = self.model_service.resolve_model(model or brief.get("model"))

        initial_state: NewsletterState = {
            "messages": [],
            "brief": brief,
            "workspace_id": workspace_id,
            "series_id": series_id,
            "plan": None,
            "issues": [],
            "retrieved_context": [],
            "revision_count": 0,
            "status": "planning",
            "error": None,
            "citations": [],
            "visual_specs": [],
            "memory_context": [],
            "model": chosen_model,
            "workflow": "plan",
        }

        compiled = await self.compile_graph(thread_id)

        try:
            result = await compiled.ainvoke(
                initial_state,
                config={"configurable": {"thread_id": thread_id}},
            )

            return {
                "thread_id": thread_id,
                "status": result.get("status", "complete"),
                "plan": result.get("plan"),
                "error": result.get("error"),
                "messages": [
                    {"type": type(m).__name__, "content": m.content}
                    for m in result.get("messages", [])
                ],
            }
        except Exception as e:
            logger.error("Workflow failed: %s", e)
            return {
                "thread_id": thread_id,
                "status": "failed",
                "error": str(e),
            }

    async def run_issue_generation(
        self,
        series_id: str,
        brief: Dict[str, Any],
        workspace_id: str,
        issue_number: int,
        plan_item: Dict[str, Any],
        thread_id: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run the issue generation workflow."""
        thread_id = thread_id or f"issue-{series_id}-{issue_number}-{datetime.now().isoformat()}"
        chosen_model = self.model_service.resolve_model(model or brief.get("model"))

        issue_brief = {
            **brief,
            "issue_number": issue_number,
            "plan_item": plan_item,
        }

        initial_state: NewsletterState = {
            "messages": [],
            "brief": issue_brief,
            "workspace_id": workspace_id,
            "series_id": series_id,
            "plan": None,
            "issues": [],
            "retrieved_context": [],
            "revision_count": 0,
            "status": "generating",
            "error": None,
            "citations": [],
            "visual_specs": [],
            "memory_context": [],
            "model": chosen_model,
            "workflow": "issue",
        }

        compiled = await self.compile_graph(thread_id)

        try:
            result = await compiled.ainvoke(
                initial_state,
                config={"configurable": {"thread_id": thread_id}},
            )

            return {
                "thread_id": thread_id,
                "status": result.get("status", "complete"),
                "issues": result.get("issues", []),
                "error": result.get("error"),
                "citations": result.get("citations", []),
                "visual_specs": result.get("visual_specs", []),
                "messages": [
                    {"type": type(m).__name__, "content": m.content}
                    for m in result.get("messages", [])
                ],
            }
        except Exception as e:
            logger.error("Issue generation failed: %s", e)
            return {
                "thread_id": thread_id,
                "status": "failed",
                "error": str(e),
            }

    async def _load_memory_node(self, state: NewsletterState) -> NewsletterState:
        """Load relevant long-term memories for this workspace/series."""
        namespace = ("cadensend", "workspace", state["workspace_id"], "series", state.get("series_id") or "default")

        memories = await self.memory_store.asearch(
            namespace,
            query="series brief goals style preferences",
            limit=5,
        )

        memory_context = [
            {
                "id": f"{'/'.join(m.namespace)}:{m.key}",
                "content": json.dumps(m.value),
            }
            for m in memories
        ]
        state["memory_context"] = memory_context
        return state

    async def _plan_node(self, state: NewsletterState) -> NewsletterState:
        """Generate a curriculum plan from the brief."""
        brief = state["brief"]
        system_prompt = self._build_default_system_prompt(brief, state.get("memory_context", []))
        system_prompt += "\n\nGenerate a detailed curriculum plan in JSON format with modules, learning objectives, prerequisites, and total weeks."

        messages: List[BaseMessage] = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Create a curriculum plan for: {json.dumps(brief, indent=2)}"),
        ]

        state["messages"] = messages

        try:
            response = await self._chat_model(state, temperature=0.3).ainvoke(messages)
            plan_text = response.content

            try:
                plan = json.loads(plan_text)
            except json.JSONDecodeError:
                import re
                json_match = re.search(r'[\{\[].*[\}\]]', plan_text, re.DOTALL)
                if json_match:
                    plan = json.loads(json_match.group())
                else:
                    plan = self._default_plan(brief)

            if "plan" not in plan and "modules" in plan:
                pass
            elif "plan" in plan:
                plan = plan["plan"]

            state["plan"] = plan
            state["status"] = "planning_complete"
            state["messages"] = messages + [AIMessage(content=json.dumps(plan, indent=2)[:2000])]

        except Exception as e:
            logger.error("Plan generation failed: %s", e)
            state["plan"] = self._default_plan(brief)
            state["error"] = str(e)
            state["status"] = "planning_failed"

        return state

    async def _validate_plan_node(self, state: NewsletterState) -> NewsletterState:
        """Validate the generated plan."""
        plan = state.get("plan") or {}
        validation = self.tools_box.validate_plan(plan, state["series_id"] or "")

        if not validation["valid"]:
            state["error"] = f"Plan validation failed: {validation['issues']}"
            state["status"] = "validation_failed"
            for issue in validation["issues"]:
                state["messages"] = state["messages"] + [
                    AIMessage(content=f"Validation issue: {issue}")
                ]
        else:
            state["status"] = "plan_validated"
            if validation.get("warnings"):
                for warning in validation["warnings"]:
                    state["messages"] = state["messages"] + [
                        AIMessage(content=f"Warning: {warning}")
                    ]

        return state

    async def _retrieve_context_node(self, state: NewsletterState) -> NewsletterState:
        """Retrieve relevant context for the brief's learning objectives."""
        brief = state["brief"]
        workspace_id = state["workspace_id"]
        series_id = state.get("series_id")

        plan = state.get("plan") or {}
        objectives = []
        for module in plan.get("modules", []):
            for obj in module.get("learning_objectives", []):
                objectives.append(obj)

        if not objectives:
            objectives = [brief.get("topic", "")]

        all_context = []
        for obj in objectives[:5]:
            context = self.tools_box.retrieve_context(
                query=obj,
                workspace_id=workspace_id,
                series_id=series_id,
                top_k=5,
            )
            for c in context:
                c["related_objective"] = obj
                all_context.append(c)

        state["retrieved_context"] = all_context
        state["status"] = "context_retrieved"
        return state

    async def _generate_issue_node(self, state: NewsletterState) -> NewsletterState:
        """Generate newsletter issues based on the plan and retrieved context."""
        brief = state["brief"]
        plan = state.get("plan") or {}
        context = state.get("retrieved_context", [])
        workspace_id = state["workspace_id"]

        plan_items = plan.get("modules", [])
        issues = []

        for i, module in enumerate(plan_items):
            module_context = [c for c in context if c.get("related_objective") in module.get("learning_objectives", [])]

            system_prompt = self._build_default_system_prompt(brief, state.get("memory_context", []))
            system_prompt += f"""

Generate a newsletter issue for module {i + 1}:
- Title: {module.get('title', '')}
- Objectives: {module.get('learning_objectives', [])}
- Duration: {module.get('duration_weeks', 1)} weeks

The issue should include:
1. A compelling subject line
2. A brief preheader
3. Content blocks (markdown text with inline citations)
4. Any relevant visual specifications

Citations format: {{ "source_id": "...", "chunk_id": "...", "text": "..." }}
Only include citations for claims supported by the retrieved context.
"""

            context_text = ""
            if module_context:
                context_text = "\n\n## Retrieved Context\n" + "\n".join(
                    f"[{c.get('source_id', '')}] {c.get('content', '')[:300]}"
                    for c in module_context[:5]
                    if "error" not in c
                )

            messages: List[BaseMessage] = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=f"Generate issue for: {json.dumps(module, indent=2)}\n{context_text}"),
            ]

            try:
                response = await self._chat_model(state).ainvoke(messages)
                issue_text = response.content

                try:
                    issue = json.loads(issue_text)
                except json.JSONDecodeError:
                    import re
                    json_match = re.search(r'[\{\[]', issue_text, re.DOTALL)
                    if json_match:
                        issue = json.loads(json_match.group())
                    else:
                        issue = self._default_issue(module)

                issue["module_index"] = i
                issue["module_title"] = module.get("title", "")
                issues.append(issue)

            except Exception as e:
                logger.error("Issue generation failed for module %d: %s", i, e)
                issues.append(self._default_issue(module))

        state["issues"] = issues
        state["status"] = "issues_generated"
        return state

    async def _analyze_coverage_node(self, state: NewsletterState) -> NewsletterState:
        """Analyze retrieval coverage for generated issues."""
        brief = state["brief"]
        workspace_id = state["workspace_id"]
        series_id = state.get("series_id")

        coverage = self.tools_box.analyze_retrieval_coverage(
            query=brief.get("topic", ""),
            workspace_id=workspace_id,
            series_id=series_id,
            top_k=20,
        )

        state["messages"] = state["messages"] + [
            AIMessage(content=f"Retrieval coverage analysis: {json.dumps(coverage, indent=2)}")
        ]
        return state

    async def _generate_visuals_node(self, state: NewsletterState) -> NewsletterState:
        """Generate visuals for each issue that requested them."""
        issues = state.get("issues", [])
        visuals = []

        for issue in issues:
            for visual_spec in issue.get("visual_specs", []):
                generated = self.tools_box.generate_visual(
                    description=visual_spec.get("description", "Newsletter diagram"),
                    diagram_type=visual_spec.get("type", "mermaid"),
                    content=visual_spec.get("content"),
                )
                visuals.append(generated)

        state["visual_specs"] = visuals
        return state

    async def _assemble_issue_node(self, state: NewsletterState) -> NewsletterState:
        """Assemble the final issue structure with citations and visuals."""
        issues = state.get("issues", [])
        visuals = state.get("visual_specs", [])

        for issue in issues:
            if "visual_specs" not in issue or not issue["visual_specs"]:
                issue["visual_specs"] = []

        state["issues"] = issues
        state["status"] = "issue_assembled"
        return state

    async def _quality_check_node(self, state: NewsletterState) -> NewsletterState:
        """Perform a quality check on the generated issues."""
        issues = state.get("issues", [])

        for issue in issues:
            content_blocks = issue.get("content_blocks", [])
            total_citations = sum(len(b.get("citations", [])) for b in content_blocks)

            if total_citations == 0 and len(content_blocks) > 2:
                state["messages"] = state["messages"] + [
                    AIMessage(content="Warning: No citations found in content blocks")
                ]

        state["status"] = "quality_checked"
        return state

    def _should_revise(self, state: NewsletterState) -> str:
        """Decide whether to revise or finish."""
        if state.get("revision_count", 0) >= settings.MAX_REVISION_LOOPS:
            return "done"

        messages = state.get("messages", [])
        recent = messages[-3:] if messages else []

        needs_revision = False
        for msg in recent:
            if isinstance(msg, ToolMessage):
                result = msg.content
                if result and "error" in result.lower():
                    needs_revision = True
                    break

        if state.get("error") and "validation" in state.get("error", "").lower():
            needs_revision = True

        if needs_revision:
            return "revise"
        return "done"

    async def _revise_issue_node(self, state: NewsletterState) -> NewsletterState:
        """Revise the issue based on quality check feedback."""
        state["revision_count"] = state.get("revision_count", 0) + 1

        issues = state.get("issues", [])
        brief = state["brief"]
        context = state.get("retrieved_context", [])

        for issue in issues:
            module_idx = issue.get("module_index", 0)
            module_obj = (state.get("plan", {}).get("modules", [{}])[module_idx]
                          if module_idx < len(state.get("plan", {}).get("modules", []))
                          else {})

            revision_prompt = f"""
Revise this newsletter issue. The current version has quality issues.

Original issue:
{json.dumps(issue, indent=2)}

Module context:
{json.dumps(module_obj, indent=2)}

Retrieved context:
{json.dumps([{k: v for k, v in c.items() if k != 'related_objective'} for c in context[:5]], indent=2)}

Improve:
1. Add more citations where facts are stated
2. Fix any factual inconsistencies
3. Improve clarity and engagement
4. Ensure all content is grounded in retrieved sources

Output the revised issue as JSON.
"""

            messages = [
                SystemMessage(content="You are an expert newsletter editor. Revise the given issue."),
                HumanMessage(content=revision_prompt),
            ]

            try:
                response = await self._chat_model(state).ainvoke(messages)
                revised = json.loads(response.content)
                revised["module_index"] = issue.get("module_index", 0)
                revised["module_title"] = issue.get("module_title", "")
                revised["revision_number"] = state["revision_count"]
                issues[module_idx] = revised
            except Exception as e:
                logger.error("Revision failed for module %d: %s", module_idx, e)

        state["issues"] = issues
        return state

    async def _save_memory_node(self, state: NewsletterState) -> NewsletterState:
        """Save key context to long-term memory."""
        namespace = ("cadensend", "workspace", state["workspace_id"], "series", state.get("series_id") or "default")

        await self.memory_store.summarize_and_store(
            namespace,
            "latest_conversation",
            state.get("messages", []),
        )

        plan = state.get("plan", {})
        if plan:
            await self.memory_store.aput(
                namespace,
                "latest_plan",
                {"plan": plan, "created_at": datetime.now().isoformat()},
            )

        return state

    def _default_plan(self, brief: Dict[str, Any]) -> Dict[str, Any]:
        """Generate a default plan when AI fails."""
        return {
            "modules": [
                {
                    "title": f"Module {i + 1}",
                    "learning_objectives": [brief.get("goal", "Learn key concepts")],
                    "duration_weeks": 1,
                }
                for i in range(4)
            ],
            "prerequisites": [],
            "total_weeks": 4,
        }

    def _default_issue(self, module: Dict[str, Any]) -> Dict[str, Any]:
        """Generate a default issue when AI fails."""
        return {
            "subject": f"Weekly Issue: {module.get('title', 'Learning Module')}",
            "preheader": "Your latest learning content",
            "content_blocks": [
                {
                    "type": "markdown",
                    "title": "Welcome",
                    "text": f"This is your issue for {module.get('title', 'the series')}.",
                    "citations": [],
                }
            ],
            "visual_specs": [
                {"type": "mermaid", "content": "graph TD\n    A[Start] --> B[End]", "alt_text": "Simple flowchart"}
            ],
        }


_agent: Optional[NewsletterAgent] = None


def get_agent(
    model_service: Optional[ModelService] = None,
    memory_store: Optional[LongTermMemoryStore] = None,
) -> NewsletterAgent:
    """Get the global agent instance."""
    global _agent
    if _agent is None:
        _agent = NewsletterAgent(model_service, memory_store)
    return _agent
