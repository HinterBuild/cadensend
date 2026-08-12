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
            )

            logger.info("Plan generated: thread=%s, status=%s",
                        result.get("thread_id"), result.get("status"))

        except Exception as e:
            logger.error("Plan generation job failed: %s", e)
            import traceback
            traceback.print_exc()

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
            )

            logger.info("Issue generated: thread=%s, status=%s",
                        result.get("thread_id"), result.get("status"))

        except Exception as e:
            logger.error("Issue generation job failed: %s", e)
            import traceback
            traceback.print_exc()

    async def _handle_ingest_source(self, job_data: dict):
        """Handle a source ingestion job."""
        try:
            source_type = job_data.get("source_type", "url")
            if source_type == "url":
                result = await self.ingestion_worker.process_url_source(
                    url=job_data.get("url", ""),
                    workspace_id=job_data.get("workspace_id", ""),
                    series_id=job_data.get("series_id"),
                )
            else:
                result = await self.ingestion_worker.process_file_source(
                    content=job_data.get("content", b""),
                    filename=job_data.get("filename", "upload"),
                    workspace_id=job_data.get("workspace_id", ""),
                    series_id=job_data.get("series_id"),
                )

            logger.info("Source ingested: source_id=%s, chunks=%d",
                        result.get("source_id"), result.get("total_chunks", 0))

        except Exception as e:
            logger.error("Source ingestion job failed: %s", e)
            import traceback
            traceback.print_exc()


if __name__ == "__main__":
    worker = AIWorker()
    asyncio.run(worker.start())
