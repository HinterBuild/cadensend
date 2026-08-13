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
from datetime import datetime, timezone

warnings.filterwarnings(
    "ignore",
    message=r"The default value of `allowed_objects` will change in a future version\..*",
)

from app.core.config import settings
from app.services.model_service import ModelService
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

    async def start(self):
        """Start the AI worker - ingests new sources and processes generation jobs."""
        self.running = True
        logger.info("AI Worker started")

        checkpoint_backend = get_checkpoint_backend()
        await checkpoint_backend.setup()

        qdrant_service.ensure_collection()

        logger.info("AI Worker initialized with LangGraph agent")

        while self.running:
            await self._process_pending_jobs()
            await asyncio.sleep(5)

    async def stop(self):
        """Stop the AI worker and cancel pending tasks."""
        self.running = False
        for task_id, task in self.tasks.items():
            task.cancel()
        logger.info("AI Worker stopped")

    async def _process_pending_jobs(self):
        """Process pending generation jobs from the queue."""
        try:
            import aioredis

            redis = await aioredis.from_url(settings.REDIS_URL)

            msg = await redis.lpop("generation_queue")
            if msg:
                job_data = json.loads(msg)
                task_name = job_data.get("task", "")
                task_id = str(uuid.uuid4())

                if task_name == "generate_plan":
                    self.tasks[task_id] = asyncio.create_task(
                        self._handle_generate_plan(job_data)
                    )
                elif task_name == "generate_issue":
                    self.tasks[task_id] = asyncio.create_task(
                        self._handle_generate_issue(job_data)
                    )
                elif task_name == "ingest_source":
                    self.tasks[task_id] = asyncio.create_task(
                        self._handle_ingest_source(job_data)
                    )

                logger.info("Queued job: %s (%s)", task_name, task_id)

        except Exception as e:
            logger.debug("No pending jobs or Redis error: %s", e)

    async def _handle_generate_plan(self, job_data: dict):
        """Handle a generate-plan job using the LangGraph agent."""
        try:
            result = await self.agent.run_plan_generation(
                brief=job_data.get("brief", {}),
                workspace_id=job_data.get("workspace_id", ""),
                series_id=job_data.get("series_id"),
                thread_id=job_data.get("thread_id"),
                model=job_data.get("model"),
            )

            logger.info("Plan generated: thread=%s, status=%s",
                        result.get("thread_id"), result.get("status"))
            await self._persist_plan_result(job_data.get("series_id"), result)

        except Exception as e:
            logger.error("Plan generation job failed: %s", e)
            import traceback
            traceback.print_exc()
            await self._persist_plan_result(
                job_data.get("series_id"),
                {"status": "failed", "plan": {}, "error": str(e)},
            )

    async def _persist_plan_result(self, series_id: str | None, result: dict):
        """Write plan generation status back so the UI can poll it."""
        if not series_id:
            return

        status = result.get("status") or ""
        plan = result.get("plan") or {}
        error = result.get("error") or ""
        if status in {"failed", "planning_failed"} and not plan:
            plan_status = "failed"
            if not error:
                error = status or "plan generation failed"
        elif plan:
            plan_status = "ready"
        else:
            plan_status = "failed"
            if not error:
                error = status or "plan generation failed"

        dsn = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
        try:
            import asyncpg

            conn = await asyncpg.connect(dsn)
            try:
                await conn.execute(
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
            finally:
                await conn.close()
            logger.info("Persisted plan status=%s for series=%s", plan_status, series_id)
        except Exception as persist_error:
            logger.error("Failed to persist plan result: %s", persist_error)

    async def _handle_generate_issue(self, job_data: dict):
        """Handle a generate-issue job using the LangGraph agent."""
        try:
            result = await self.agent.run_issue_generation(
                series_id=job_data.get("series_id", ""),
                brief=job_data.get("brief", {}),
                workspace_id=job_data.get("workspace_id", ""),
                issue_number=job_data.get("issue_number", 1),
                plan_item=job_data.get("plan_item", {}),
                thread_id=job_data.get("thread_id"),
                model=job_data.get("model"),
            )

            logger.info("Issue generated: thread=%s, status=%s",
                        result.get("thread_id"), result.get("status"))
            await self._persist_issue_result(job_data.get("issue_id"), result)

        except Exception as e:
            logger.error("Issue generation job failed: %s", e)
            import traceback
            traceback.print_exc()
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
        if status in {"failed"} or not issues:
            issue_status = "failed"
            if not error:
                error = status or "issue generation failed"
            content = {}
        else:
            issue_status = "ready"
            content = issues[0] if isinstance(issues[0], dict) else {"content": issues[0]}

        dsn = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
        try:
            import asyncpg

            conn = await asyncpg.connect(dsn)
            try:
                await conn.execute(
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
            finally:
                await conn.close()
            logger.info("Persisted issue status=%s for issue=%s", issue_status, issue_id)
        except Exception as persist_error:
            logger.error("Failed to persist issue result: %s", persist_error)

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
