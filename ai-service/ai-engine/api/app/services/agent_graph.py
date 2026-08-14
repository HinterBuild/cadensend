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
import re
from datetime import datetime

from langchain_core.messages import (
    BaseMessage,
    HumanMessage,
    AIMessage,
    SystemMessage,
)
from langgraph.graph import StateGraph, add_messages, START, END
from langgraph.checkpoint.base import BaseCheckpointSaver

from app.services.agent_tools import NewsletterTools, get_toolbox
from app.services.model_service import ModelService
from app.services.memory_store import LongTermMemoryStore
from app.services.graph_policy import (
    filter_citations,
    is_stub_issue,
    known_source_ids,
    quality_needs_revision,
    route_after_memory,
    route_after_plan,
    should_revise,
)
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
    needs_revision: bool


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
        self.graph = self._build_graph()
        self._compiled = None

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
        graph.add_node("generate_visuals", self._generate_visuals_node)
        graph.add_node("assemble_issue", self._assemble_issue_node)
        graph.add_node("quality_check", self._quality_check_node)
        graph.add_node("revise_issue", self._revise_issue_node)
        graph.add_node("save_memory", self._save_memory_node)

        graph.add_edge(START, "load_memory")
        graph.add_conditional_edges(
            "load_memory",
            self._after_memory,
            {
                "plan": "plan",
                "retrieve": "retrieve_context",
                "abort": "save_memory",
            },
        )
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
        graph.add_edge("generate_issue", "generate_visuals")
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

    def _after_memory(self, state: NewsletterState) -> str:
        return route_after_memory(state.get("workflow") or "plan", state.get("plan"))

    def _after_plan(self, state: NewsletterState) -> str:
        return route_after_plan(state.get("workflow") or "plan", state.get("status") or "")

    async def compile_graph(self, thread_id: str = "") -> Any:
        """Compile once per agent process; thread_id is passed at invoke time."""
        if self._compiled is None:
            from app.services.checkpoint_backend import PostgresCheckpointBackend

            checkpointer = PostgresCheckpointBackend()
            await checkpointer.setup()
            self._compiled = self.graph.compile(
                checkpointer=checkpointer,
                store=self.memory_store,
            )
        return self._compiled

    async def run_plan_generation(
        self,
        brief: Dict[str, Any],
        workspace_id: str,
        series_id: Optional[str] = None,
        thread_id: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run the plan generation workflow."""
        thread_id = thread_id or f"plan-{series_id or 'default'}"
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
            "needs_revision": False,
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
        thread_id = thread_id or f"issue-{series_id}-{issue_number}"
        chosen_model = self.model_service.resolve_model(model or brief.get("model"))

        issue_brief = {
            **brief,
            "issue_number": issue_number,
            "plan_item": plan_item,
        }

        if plan_item and isinstance(plan_item.get("modules"), list):
            plan = {"modules": plan_item["modules"]}
        elif plan_item:
            plan = {"modules": [plan_item]}
        else:
            plan = {"modules": []}

        initial_state: NewsletterState = {
            "messages": [],
            "brief": issue_brief,
            "workspace_id": workspace_id,
            "series_id": series_id,
            "plan": plan,
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
            "needs_revision": False,
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
        """Load latest plan/conversation notes for this workspace/series."""
        namespace = ("cadensend", "workspace", state["workspace_id"], "series", state.get("series_id") or "default")
        memory_context = []
        for key in ("latest_plan", "latest_conversation"):
            try:
                item = await self.memory_store.aget(namespace, key)
            except Exception as exc:
                logger.debug("Memory get skipped for %s: %s", key, exc)
                item = None
            if item is not None:
                value = item.value if hasattr(item, "value") else item
                memory_context.append({"id": key, "content": json.dumps(value)})
        state["memory_context"] = memory_context

        if route_after_memory(state.get("workflow") or "plan", state.get("plan")) == "abort":
            state["status"] = "failed"
            state["error"] = state.get("error") or "Issue generation needs a plan module."
            state["issues"] = []
        return state

    async def _plan_node(self, state: NewsletterState) -> NewsletterState:
        """Generate a curriculum plan from the brief."""
        brief = state["brief"]
        system_prompt = self._plan_system_prompt(brief, state.get("memory_context", []))
        user_prompt = (
            "Create a progressive email-course curriculum for this series.\n"
            f"{json.dumps(brief, indent=2)}\n\n"
            "Each module must have a unique title and unique learning objectives. "
            "Do not name modules 'Module 1'. Do not repeat the series goal as every objective."
        )
        lc_messages: List[BaseMessage] = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]
        state["messages"] = lc_messages

        try:
            plan = await self._generate_plan_json(state, brief, user_prompt, system_prompt)
            if self._is_placeholder_plan(plan, brief):
                plan = await self._generate_plan_json(
                    state,
                    brief,
                    user_prompt + "\nThe previous draft was a placeholder. Produce 4-8 distinct modules.",
                    system_prompt,
                )

            if self._is_placeholder_plan(plan, brief):
                state["plan"] = {}
                state["error"] = "Model returned a placeholder curriculum instead of distinct modules."
                state["status"] = "planning_failed"
                return state

            state["plan"] = plan
            state["status"] = "planning_complete"
            state["error"] = None
            state["messages"] = lc_messages + [AIMessage(content=json.dumps(plan, indent=2)[:2000])]
        except Exception as e:
            logger.error("Plan generation failed: %s", e)
            state["plan"] = {}
            state["error"] = str(e)
            state["status"] = "planning_failed"

        return state

    def _plan_system_prompt(self, brief: Dict[str, Any], memory_context: List[Dict]) -> str:
        memory_summary = ""
        if memory_context:
            memory_summary = "\nPrior notes:\n" + "\n".join(
                f"- {mem.get('content', '')[:400]}" for mem in memory_context[:3]
            )
        topic = brief.get("topic") or "this subject"
        goal = brief.get("goal") or "teach the topic thoroughly"
        level = brief.get("level") or "intermediate"
        return f"""You are a curriculum designer for a short email course.

Series topic: {topic}
Learner goal: {goal}
Audience level: {level}
{memory_summary}

Design 4-8 sequential lessons a busy professional can finish in one sitting each.
Return ONLY a JSON object. No markdown, no tools, no commentary.

Good titles are concrete, e.g. "vLLM vs Hugging Face serving", "Continuous batching and paged attention".
Bad titles: "Module 1", "Introduction", "Overview", or repeating the series goal.

Each module needs:
- title: unique lesson name
- summary: why this lesson exists and what comes after
- learning_objectives: 2-3 specific skills (not the series goal copied)
- duration_weeks: 1

JSON shape:
{{"modules":[{{"title":"...","summary":"...","learning_objectives":["..."],"duration_weeks":1}}],"prerequisites":["..."],"total_weeks":4}}
"""

    async def _generate_plan_json(
        self,
        state: NewsletterState,
        brief: Dict[str, Any],
        user_prompt: str,
        system_prompt: str,
    ) -> Dict[str, Any]:
        schema = {
            "modules": [
                {
                    "title": "string",
                    "summary": "string",
                    "learning_objectives": ["string"],
                    "duration_weeks": 1,
                }
            ],
            "prerequisites": ["string"],
            "total_weeks": 4,
        }
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        try:
            parsed = await self.model_service.generate_structured_output(
                messages,
                schema,
                model=state.get("model"),
                max_retries=1,
                temperature=0.4,
            )
        except Exception as exc:
            logger.warning("Structured plan output failed (%s); using plain completion", exc)
            text = await self.model_service.generate_response(
                messages + [{"role": "user", "content": "Return only a JSON object. No markdown fences."}],
                model=state.get("model"),
                temperature=0.4,
            )
            parsed = self._parse_json_object(text)
            if parsed is None:
                raise ValueError("Plan model did not return JSON") from exc
        return self._normalize_plan(parsed)

    @staticmethod
    def _parse_json_object(text: str) -> Optional[Dict[str, Any]]:
        raw = (text or "").strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
        try:
            value = json.loads(raw)
            return value if isinstance(value, dict) else None
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", raw, re.DOTALL)
            if not match:
                return None
            try:
                value = json.loads(match.group())
            except json.JSONDecodeError:
                return None
            return value if isinstance(value, dict) else None

    @staticmethod
    def _normalize_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
        if "plan" in plan and "modules" not in plan:
            nested = plan.get("plan")
            if isinstance(nested, dict):
                plan = nested
        modules = plan.get("modules") or []
        total = plan.get("total_weeks") or sum(int(m.get("duration_weeks") or 1) for m in modules) or len(modules)
        return {
            "modules": modules,
            "prerequisites": plan.get("prerequisites") or [],
            "total_weeks": total,
        }

    @staticmethod
    def _is_placeholder_plan(plan: Optional[Dict[str, Any]], brief: Dict[str, Any]) -> bool:
        if not plan:
            return True
        modules = plan.get("modules") or []
        if len(modules) < 3:
            return True
        titles = [str(m.get("title") or "").strip() for m in modules]
        if all(re.fullmatch(r"Module\s+\d+", title, re.IGNORECASE) for title in titles):
            return True
        if len({title.lower() for title in titles if title}) < min(3, len(titles)):
            return True
        goal = str(brief.get("goal") or "").strip().lower()
        objectives = [
            str(obj).strip().lower()
            for m in modules
            for obj in (m.get("learning_objectives") or [])
        ]
        if goal and objectives and all(obj == goal for obj in objectives):
            return True
        return False

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
        queries = []
        for module in plan.get("modules", []):
            title = str(module.get("title") or "").strip()
            if title:
                queries.append(title)
            for obj in module.get("learning_objectives", []):
                if obj:
                    queries.append(str(obj))

        topic = str(brief.get("topic") or "").strip()
        if topic:
            queries.append(topic)
        if not queries:
            queries = [brief.get("objective") or ""]

        seen = set()
        unique_queries = []
        for query in queries:
            key = query.strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            unique_queries.append(query.strip())

        all_context = []
        for obj in unique_queries[:5]:
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

        plan_items = plan.get("modules", [])
        if state.get("workflow") == "issue":
            plan_items = plan_items[:1]
        issues = []
        allowed_ids = known_source_ids(context)
        issue_schema = {
            "subject": "string",
            "preheader": "string",
            "content_blocks": [
                {
                    "type": "markdown",
                    "title": "string",
                    "text": "string",
                    "citations": [{"source_id": "string", "chunk_id": "string", "text": "string"}],
                }
            ],
            "visual_specs": [{"type": "mermaid", "content": "string", "alt_text": "string"}],
        }

        source_list = ", ".join(sorted(allowed_ids)) or "(none)"
        for i, module in enumerate(plan_items):
            objectives = module.get("learning_objectives", [])
            module_context = [
                c for c in context
                if c.get("related_objective") in objectives or c.get("related_objective") == module.get("title")
            ]
            if not module_context:
                module_context = [c for c in context if isinstance(c, dict)]

            system_prompt = (
                "You write a single email lesson for a professional learning series. "
                "Return only JSON. Ground claims in retrieved context. "
                "Cite only source_id values from the retrieved list. "
                f"Allowed source_ids: {source_list}."
            )
            context_text = ""
            if module_context:
                context_text = "\n\nRetrieved context:\n" + "\n".join(
                    f"[{c.get('source_id', '')} {c.get('chunk_id', '')}] {c.get('content', '')[:500]}"
                    for c in module_context[:8]
                )
            else:
                context_text = "\n\nNo retrieved sources. Write a cautious lesson and leave citations empty."

            user_prompt = (
                f"Lesson: {json.dumps(module, indent=2)}\n"
                f"Series topic: {brief.get('topic', '')}\n"
                f"Audience level: {brief.get('level', '')}\n"
                f"{context_text}"
            )
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]

            try:
                issue = await self.model_service.generate_structured_output(
                    messages,
                    issue_schema,
                    model=state.get("model"),
                    max_retries=1,
                    temperature=0.4,
                )
                if not isinstance(issue, dict) or "subject" not in issue:
                    raise ValueError("Issue JSON missing subject")
                issue = filter_citations(issue, allowed_ids)
                if is_stub_issue(issue):
                    raise ValueError("Model returned a stub issue")

                issue["module_index"] = i
                issue["module_title"] = module.get("title", "")
                issues.append(issue)

            except Exception as e:
                logger.error("Issue generation failed for module %d: %s", i, e)
                try:
                    raw = await self.model_service.generate_response(
                        messages + [{"role": "user", "content": "Return only a JSON object."}],
                        model=state.get("model"),
                        temperature=0.4,
                    )
                    parsed = self._parse_json_object(raw)
                    if parsed and not is_stub_issue(parsed):
                        parsed = filter_citations(parsed, allowed_ids)
                        parsed["module_index"] = i
                        parsed["module_title"] = module.get("title", "")
                        issues.append(parsed)
                    else:
                        state["error"] = str(e)
                except Exception:
                    state["error"] = str(e)

        state["issues"] = issues
        state["status"] = "issues_generated" if issues else "failed"
        if not issues and not state.get("error"):
            state["error"] = "Issue generation produced no usable content"
        return state

    async def _generate_visuals_node(self, state: NewsletterState) -> NewsletterState:
        """Generate visuals for each issue that requested them."""
        issues = state.get("issues", [])
        visuals = []

        for issue in issues:
            generated_for_issue = []
            for visual_spec in issue.get("visual_specs") or []:
                generated = self.tools_box.generate_visual(
                    description=visual_spec.get("description") or visual_spec.get("alt_text") or "Newsletter diagram",
                    diagram_type=visual_spec.get("type", "mermaid"),
                    content=visual_spec.get("content"),
                )
                generated_for_issue.append(generated)
                visuals.append(generated)
            if generated_for_issue:
                issue["visual_specs"] = generated_for_issue

        state["visual_specs"] = visuals
        state["issues"] = issues
        return state

    async def _assemble_issue_node(self, state: NewsletterState) -> NewsletterState:
        """Assemble the final issue structure with citations and visuals."""
        issues = state.get("issues", [])
        allowed = known_source_ids(state.get("retrieved_context") or [])
        cleaned = []
        for issue in issues:
            if not isinstance(issue, dict):
                continue
            issue = filter_citations(issue, allowed)
            if not issue.get("visual_specs"):
                issue["visual_specs"] = state.get("visual_specs") or []
            cleaned.append(issue)
        state["issues"] = cleaned
        state["status"] = "issue_assembled" if cleaned else state.get("status") or "failed"
        return state

    async def _quality_check_node(self, state: NewsletterState) -> NewsletterState:
        """Perform a quality check on the generated issues."""
        issues = state.get("issues", [])
        context = state.get("retrieved_context") or []
        needs = quality_needs_revision(issues, context)
        state["needs_revision"] = needs
        if needs:
            state["messages"] = list(state.get("messages") or []) + [
                AIMessage(content="Quality: retrieved sources exist but the issue has no valid citations.")
            ]
        if not issues:
            state["status"] = "failed"
        else:
            state["status"] = "quality_checked"
        return state

    def _should_revise(self, state: NewsletterState) -> str:
        return should_revise(
            state.get("revision_count") or 0,
            settings.MAX_REVISION_LOOPS,
            bool(state.get("needs_revision")),
        )

    async def _revise_issue_node(self, state: NewsletterState) -> NewsletterState:
        """Revise the issue based on quality check feedback."""
        state["revision_count"] = state.get("revision_count", 0) + 1
        issues = state.get("issues", [])
        context = state.get("retrieved_context", [])
        allowed = known_source_ids(context)
        modules = (state.get("plan") or {}).get("modules") or []
        issue_schema = {
            "subject": "string",
            "preheader": "string",
            "content_blocks": [
                {
                    "type": "markdown",
                    "title": "string",
                    "text": "string",
                    "citations": [{"source_id": "string", "chunk_id": "string", "text": "string"}],
                }
            ],
            "visual_specs": [{"type": "mermaid", "content": "string", "alt_text": "string"}],
        }

        revised_issues = []
        for index, issue in enumerate(issues):
            module_idx = issue.get("module_index", index)
            module_obj = modules[module_idx] if isinstance(module_idx, int) and module_idx < len(modules) else {}
            messages = [
                {
                    "role": "system",
                    "content": "You are an expert newsletter editor. Return only revised issue JSON. Cite only retrieved source_ids.",
                },
                {
                    "role": "user",
                    "content": (
                        "Revise this issue so claims are grounded and citations use retrieved sources.\n"
                        f"Issue:\n{json.dumps(issue, indent=2)}\n"
                        f"Module:\n{json.dumps(module_obj, indent=2)}\n"
                        f"Context:\n{json.dumps([{k: v for k, v in c.items() if k != 'related_objective'} for c in context[:6]], indent=2)}"
                    ),
                },
            ]
            try:
                revised = await self.model_service.generate_structured_output(
                    messages,
                    issue_schema,
                    model=state.get("model"),
                    max_retries=1,
                    temperature=0.3,
                )
                if not isinstance(revised, dict) or is_stub_issue(revised):
                    revised_issues.append(issue)
                    continue
                revised = filter_citations(revised, allowed)
                revised["module_index"] = issue.get("module_index", index)
                revised["module_title"] = issue.get("module_title", "")
                revised["revision_number"] = state["revision_count"]
                revised_issues.append(revised)
            except Exception as e:
                logger.error("Revision failed for module %s: %s", module_idx, e)
                revised_issues.append(issue)

        state["issues"] = revised_issues
        state["needs_revision"] = False
        return state

    async def _save_memory_node(self, state: NewsletterState) -> NewsletterState:
        """Save key context to long-term memory."""
        namespace = ("cadensend", "workspace", state["workspace_id"], "series", state.get("series_id") or "default")

        if state.get("status") in {"failed", "planning_failed", "validation_failed"}:
            return state

        if state.get("workflow") != "plan":
            await self.memory_store.summarize_and_store(
                namespace,
                "latest_conversation",
                state.get("messages", []),
            )

        plan = state.get("plan", {})
        if plan and state.get("workflow") == "plan":
            await self.memory_store.aput(
                namespace,
                "latest_plan",
                {"plan": plan, "created_at": datetime.now().isoformat()},
            )

        return state


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
