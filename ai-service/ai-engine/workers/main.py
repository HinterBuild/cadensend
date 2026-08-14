#!/usr/bin/env python3
"""
AI Engine Worker - Background processing service.

Handles source ingestion and issue generation tasks using the LangGraph agent.
The worker listens for Redis pub/sub messages and processes generation jobs
with full short-term and long-term memory support.
"""

import asyncio
import logging
import json
import uuid
import warnings
import base64

import asyncpg
import redis.asyncio as redis_async

warnings.filterwarnings(
    "ignore",
    message=r"The default value of `allowed_objects` will change in a future version\..*",
)

from app.core.config import settings
from app.services.graph_policy import is_stub_issue, pick_generated_issue
from app.services.model_service import ModelService, openrouter_api_key
from app.services.agent_graph import get_agent
from app.services.checkpoint_backend import get_checkpoint_backend
from app.workers.ingestion_worker import IngestionWorker
from app.rag.chunking.text_splitter import chunking_service
from app.rag.embeddings.qdrant import qdrant_service

logging.basicConfig(level=settings.LOG_LEVEL.upper())
logger = logging.getLogger(__name__)


class AIWorker:
    """Background worker for AI tasks: ingestion, plan generation, issue generation.

    Implements the full LangGraph agent workflow with:
    - Short-term memory: Per-thread checkpoints (conversation state)
    - Long-term memory: PostgreSQL-backed persistent memory store
    - Tool integration: RAG retrieval, visual generation, plan validation
    """

    def __init__(self):
        self.model_service = ModelService()
        self.agent = get_agent(self.model_service)
        self.ingestion_worker = IngestionWorker(self.model_service)
        self.running = False
        self.tasks: dict[str, asyncio.Task] = {}
        self._redis: redis_async.Redis | None = None
        self._pg: asyncpg.Pool | None = None

    async def start(self):
        """Start the AI worker - ingests new sources and processes generation jobs."""
        self.running = True
        logger.info("AI Worker started")

        checkpoint_backend = get_checkpoint_backend()
        await checkpoint_backend.setup()

        logger.info("Connecting to Qdrant at %s", settings.QDRANT_URL)
        qdrant_service.ensure_collection()

        logger.info("AI Worker initialized with LangGraph agent")

        while self.running:
            await self._process_pending_jobs()
            self._reap_tasks()

    async def stop(self):
        """Stop the AI worker and cancel pending tasks."""
        self.running = False
        for task_id, task in self.tasks.items():
            task.cancel()
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None
        if self._pg is not None:
            await self._pg.close()
            self._pg = None
        logger.info("AI Worker stopped")

    def _redis_client(self) -> redis_async.Redis:
        if self._redis is None:
            self._redis = redis_async.from_url(
                settings.REDIS_URL,
                decode_responses=True,
            )
        return self._redis

    async def _pg_pool(self) -> asyncpg.Pool:
        if self._pg is None:
            dsn = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
            self._pg = await asyncpg.create_pool(dsn, min_size=1, max_size=5)
        return self._pg

    def _reap_tasks(self):
        finished = [task_id for task_id, task in self.tasks.items() if task.done()]
        for task_id in finished:
            del self.tasks[task_id]

    async def _process_pending_jobs(self):
        """Block on the queue, then drain a small burst of ready jobs."""
        try:
            redis = self._redis_client()
            popped = await redis.brpop("generation_queue", timeout=5)
            if not popped:
                return
            messages = [popped[1]]
            for _ in range(4):
                extra = await redis.lpop("generation_queue")
                if not extra:
                    break
                messages.append(extra)
            for msg in messages:
                self._dispatch_job(msg)
        except Exception as e:
            logger.warning("Job poll failed: %s", e)

    def _dispatch_job(self, msg: str):
        job_data = json.loads(msg)
        task_name = job_data.get("task", "")
        task_id = str(uuid.uuid4())
        series_id = job_data.get("series_id")
        issue_id = job_data.get("issue_id")
        source_id = job_data.get("source_id")

        if task_name == "generate_plan":
            self.tasks[task_id] = asyncio.create_task(self._handle_generate_plan(job_data))
        elif task_name == "generate_issue":
            self.tasks[task_id] = asyncio.create_task(self._handle_generate_issue(job_data))
        elif task_name == "ingest_source":
            self.tasks[task_id] = asyncio.create_task(self._handle_ingest_source(job_data))
        else:
            logger.warning("Unknown generation task: %s", task_name)
            return

        self.tasks[task_id].add_done_callback(
            lambda t, name=task_name, sid=series_id, iid=issue_id, src=source_id: None
            if t.cancelled()
            else logger.error(
                "Job %s crashed series=%s issue=%s source=%s: %s",
                name, sid, iid, src, t.exception(),
            )
            if t.exception()
            else None
        )
        logger.info(
            "Queued job=%s id=%s series=%s issue=%s source=%s",
            task_name, task_id, series_id, issue_id, source_id,
        )

    async def _handle_generate_plan(self, job_data: dict):
        """Handle a generate-plan job using the LangGraph agent."""
        series_id = job_data.get("series_id")
        try:
            if openrouter_api_key() == "not-configured":
                await self._persist_plan_result(
                    series_id,
                    {
                        "status": "failed",
                        "plan": {},
                        "error": "OPENROUTER_API_KEY is not set. Add it to .env and restart the AI worker.",
                    },
                )
                return

            result = await self.agent.run_plan_generation(
                brief=job_data.get("brief", {}),
                workspace_id=job_data.get("workspace_id", ""),
                series_id=job_data.get("series_id"),
                thread_id=job_data.get("thread_id") or f"plan-{series_id}",
                model=job_data.get("model"),
            )

            logger.info("Plan generated series=%s thread=%s status=%s",
                        series_id, result.get("thread_id"), result.get("status"))
            await self._persist_plan_result(series_id, result)

        except Exception as e:
            logger.exception("Plan generation job failed series=%s", series_id)
            await self._persist_plan_result(
                series_id,
                {"status": "failed", "plan": {}, "error": str(e)},
            )

    async def _persist_plan_result(self, series_id: str | None, result: dict):
        """Write plan generation status back so the UI can poll it."""
        if not series_id:
            return

        status = result.get("status") or ""
        plan = result.get("plan") or {}
        error = result.get("error") or ""
        if status in {"failed", "planning_failed", "validation_failed"}:
            plan_status = "failed"
            if not error:
                error = status or "plan generation failed"
        elif plan:
            plan_status = "ready"
        else:
            plan_status = "failed"
            if not error:
                error = status or "plan generation failed"

        try:
            pool = await self._pg_pool()
            await pool.execute(
                """
                UPDATE series
                SET plan_status = $1,
                    plan_json = $2::jsonb,
                    plan_error = $3,
                    updated_at = NOW()
                WHERE id = $4::uuid
                """,
                plan_status,
                json.dumps(plan),
                error,
                series_id,
            )
            logger.info("Persisted plan status=%s for series=%s", plan_status, series_id)
        except Exception as persist_error:
            logger.exception("Failed to persist plan result series=%s: %s", series_id, persist_error)

    async def _handle_generate_issue(self, job_data: dict):
        """Handle a generate-issue job using the LangGraph agent."""
        try:
            result = await self.agent.run_issue_generation(
                series_id=job_data.get("series_id", ""),
                brief=job_data.get("brief", {}),
                workspace_id=job_data.get("workspace_id", ""),
                issue_number=job_data.get("issue_number", 1),
                plan_item=job_data.get("plan_item", {}),
                thread_id=job_data.get("thread_id") or f"issue-{job_data.get('issue_id') or 'unknown'}",
                model=job_data.get("model"),
            )

            logger.info("Issue generated: thread=%s, status=%s",
                        result.get("thread_id"), result.get("status"))
            await self._persist_issue_result(job_data.get("issue_id"), result)

        except Exception as e:
            logger.exception("Issue generation job failed issue=%s", job_data.get("issue_id"))
            await self._persist_issue_result(
                job_data.get("issue_id"),
                {"status": "failed", "issues": [], "error": str(e)},
            )

    async def _persist_issue_result(self, issue_id: str | None, result: dict):
        """Write issue generation status back so the UI can poll it."""
        if not issue_id:
            return

        issues = result.get("issues") or []
        error = result.get("error") or ""
        status = result.get("status") or ""
        content = pick_generated_issue(issues)
        if status in {"failed"} or content is None or is_stub_issue(content):
            issue_status = "failed"
            if not error:
                error = status or "issue generation failed"
            content = {}
        else:
            issue_status = "ready"

        try:
            pool = await self._pg_pool()
            await pool.execute(
                """
                UPDATE issues
                SET status = $1,
                    content_json = $2::jsonb,
                    generate_error = $3,
                    updated_at = NOW()
                WHERE id = $4::uuid
                """,
                issue_status,
                json.dumps(content),
                error,
                issue_id,
            )
            logger.info("Persisted issue status=%s for issue=%s", issue_status, issue_id)
        except Exception as persist_error:
            logger.exception("Failed to persist issue result issue=%s: %s", issue_id, persist_error)

    async def _handle_ingest_source(self, job_data: dict):
        """Handle a source ingestion job."""
        source_id = job_data.get("source_id")
        try:
            source_type = job_data.get("source_type", "url")
            if source_type == "url":
                result = await self.ingestion_worker.process_url_source(
                    url=job_data.get("url", ""),
                    workspace_id=job_data.get("workspace_id", ""),
                    series_id=job_data.get("series_id"),
                    source_id=source_id,
                )
            else:
                raw = job_data.get("content_b64") or job_data.get("content") or b""
                if isinstance(raw, str):
                    content = base64.b64decode(raw)
                else:
                    content = raw
                result = await self.ingestion_worker.process_file_source(
                    content=content,
                    filename=job_data.get("filename", "upload"),
                    workspace_id=job_data.get("workspace_id", ""),
                    series_id=job_data.get("series_id"),
                    source_id=source_id,
                )

            logger.info("Source ingested: source_id=%s, chunks=%d",
                        result.get("source_id"), result.get("total_chunks", 0))

        except Exception as e:
            logger.error("Source ingestion job failed: %s", e)
            import traceback
            traceback.print_exc()
            if source_id:
                await self.ingestion_worker._update_source_status(source_id, "failed", str(e))


if __name__ == "__main__":
    worker = AIWorker()
    asyncio.run(worker.start())
