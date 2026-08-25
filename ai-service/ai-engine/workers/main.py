#!/usr/bin/env python3
"""
AI Engine Worker - Background processing service.

Handles source ingestion and issue generation tasks using the LangGraph agent.
The worker consumes a reliable Redis list queue: jobs move to a processing
list on pop and are acknowledged on completion, so a crash mid-job never
loses work. Terminal failures land in a dead-letter list and are persisted
to generation_runs for visibility in the Run Center.
"""

import asyncio
import contextlib
import logging
import json
import signal
import time
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
from app.core.database import asyncpg_dsn
from app.services.graph_policy import is_stub_issue, pick_generated_issue
from app.services.issue_schedule import issue_send_times
from app.services.model_service import ModelService, openrouter_api_key, resolve_default_model
from app.services.openrouter_limits import (
    reset_generation_model,
    set_generation_model,
    uses_free_tier_pacing,
)
from app.services.agent_graph import get_agent
from app.services.checkpoint_backend import get_checkpoint_backend
from app.workers.ingestion_worker import IngestionWorker
from app.rag.chunking.text_splitter import chunking_service
from app.rag.embeddings.qdrant import qdrant_service

logging.basicConfig(level=settings.LOG_LEVEL.upper())
logger = logging.getLogger(__name__)

QUEUE_KEY = "generation_queue"
PROCESSING_KEY = "generation_queue:processing"
DEAD_LETTER_KEY = "generation_queue:dead"
CANCEL_CHANNEL = "generation_queue:cancel"
MAX_JOB_ATTEMPTS = 3


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
        # In-flight LLM jobs keyed by cancel key ("issue:<id>" / "series:<id>")
        # so a user cancellation can abort the running asyncio task.
        self._running_jobs: dict[str, asyncio.Task] = {}
        self._cancel_listener: asyncio.Task | None = None
        self._redis: redis_async.Redis | None = None
        self._pg: asyncpg.Pool | None = None
        self._llm_task: asyncio.Task | None = None
        self._last_llm_finished: float = 0.0

    async def start(self):
        """Start the AI worker - ingests new sources and processes generation jobs."""
        self.running = True
        logger.info("AI Worker started")

        checkpoint_backend = get_checkpoint_backend()
        await checkpoint_backend.setup()

        logger.info("Connecting to Qdrant at %s", settings.QDRANT_URL)
        qdrant_service.ensure_collection()

        await self._recover_processing_queue()
        self._cancel_listener = asyncio.create_task(self._listen_for_generation_cancels())
        logger.info("AI Worker initialized with LangGraph agent")

        while self.running:
            await self._process_pending_jobs()
            self._reap_tasks()

    async def stop(self):
        """Stop the AI worker and cancel pending tasks."""
        self.running = False
        if self._cancel_listener is not None:
            self._cancel_listener.cancel()
            self._cancel_listener = None
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
                socket_timeout=None,
                socket_connect_timeout=10,
                retry_on_timeout=True,
                health_check_interval=30,
                max_connections=20,
            )
        return self._redis

    async def _pg_pool(self) -> asyncpg.Pool:
        if self._pg is None:
            dsn = asyncpg_dsn()
            self._pg = await asyncpg.create_pool(dsn, min_size=1, max_size=5)
        return self._pg

    async def _recover_processing_queue(self):
        """Re-queue jobs stranded in the processing list by an earlier crash."""
        redis = self._redis_client()
        recovered = 0
        while True:
            raw = await redis.rpoplpush(PROCESSING_KEY, QUEUE_KEY)
            if raw is None:
                break
            recovered += 1
        if recovered:
            logger.warning("Recovered %d interrupted job(s) back onto the queue", recovered)

    def _reap_tasks(self):
        finished = [task_id for task_id, task in self.tasks.items() if task.done()]
        for task_id in finished:
            del self.tasks[task_id]

    def _llm_busy(self) -> bool:
        return self._llm_task is not None and not self._llm_task.done()

    def _mark_llm_finished(self, _task: asyncio.Task) -> None:
        self._last_llm_finished = time.monotonic()

    async def _process_pending_jobs(self):
        """Pop one job at a time with reliable-queue semantics.

        BRPOPLPUSH moves the job onto the processing list immediately; the
        ack happens after the handler finishes. Multiple workers can run
        concurrently without double-processing because each pop is atomic.
        """
        try:
            redis = self._redis_client()
            popped = await redis.brpoplpush(QUEUE_KEY, PROCESSING_KEY, timeout=5)
            if not popped:
                return
            msg = popped
            job_data = json.loads(msg)
            task_name = job_data.get("task", "")
            if task_name in {"generate_plan", "generate_issue"}:
                free = uses_free_tier_pacing(job_data.get("model"))
                if free and self._llm_busy():
                    # Put it back at the head and retry shortly.
                    await redis.lrem(PROCESSING_KEY, 1, msg)
                    await redis.lpush(QUEUE_KEY, msg)
                    await asyncio.sleep(1)
                    return
                if free and task_name == "generate_issue" and self._last_llm_finished:
                    gap = float(settings.ISSUE_JOB_GAP_SECONDS)
                    wait = gap - (time.monotonic() - self._last_llm_finished)
                    if wait > 0:
                        logger.info(
                            "Waiting %.0fs before next issue (OpenRouter free-tier pacing)",
                            wait,
                        )
                        await asyncio.sleep(wait)
                self._dispatch_job(msg, ack=redis)
                if not free and task_name == "generate_issue":
                    for _ in range(4):
                        extra = await redis.lpop(QUEUE_KEY)
                        if not extra:
                            break
                        extra_data = json.loads(extra)
                        extra_task = extra_data.get("task", "")
                        extra_free = uses_free_tier_pacing(extra_data.get("model"))
                        if extra_task == "generate_issue" and not extra_free:
                            self._dispatch_job(extra, ack=redis)
                        else:
                            await redis.lpush(QUEUE_KEY, extra)
                            break
                return

            self._dispatch_job(msg, ack=redis)
            for _ in range(4):
                extra = await redis.lpop(QUEUE_KEY)
                if not extra:
                    break
                extra_task = json.loads(extra).get("task", "")
                if extra_task == "ingest_source":
                    self._dispatch_job(extra, ack=redis)
                else:
                    await redis.lpush(QUEUE_KEY, extra)
                    break
        except Exception as e:
            if _is_idle_redis_timeout(e):
                return
            logger.warning("Job poll failed: %s", e)

    def _dispatch_job(self, msg: str, ack=None):
        job_data = json.loads(msg)
        task_name = job_data.get("task", "")
        task_id = str(uuid.uuid4())
        series_id = job_data.get("series_id")
        issue_id = job_data.get("issue_id")
        source_id = job_data.get("source_id")
        attempts = int(job_data.get("_attempts") or 0)

        async def _finalize(done_task: asyncio.Task):
            """Ack (or requeue / dead-letter) once the handler settles."""
            try:
                exc = done_task.exception()
            except asyncio.CancelledError:
                return
            redis = self._redis_client()
            await redis.lrem(PROCESSING_KEY, 1, msg)
            if exc is None:
                return
            if attempts + 1 >= MAX_JOB_ATTEMPTS:
                await redis.lpush(DEAD_LETTER_KEY, json.dumps({
                    "job": job_data,
                    "error": str(exc),
                    "failed_at": time.time(),
                    "attempts": attempts + 1,
                }))
                await self._record_dead_letter(job_data, attempts + 1, str(exc))
                logger.error(
                    "Job %s dead-lettered after %d attempts series=%s issue=%s source=%s: %s",
                    task_name, attempts + 1, series_id, issue_id, source_id, exc,
                )
                return
            retry = dict(job_data)
            retry["_attempts"] = attempts + 1
            await redis.lpush(QUEUE_KEY, json.dumps(retry))
            logger.warning(
                "Job %s failed (attempt %d/%d); requeued series=%s issue=%s: %s",
                task_name, attempts + 1, MAX_JOB_ATTEMPTS, series_id, issue_id, exc,
            )

        handler = None
        if task_name == "generate_plan":
            handler = self._handle_generate_plan(job_data)
        elif task_name == "generate_issue":
            handler = self._handle_generate_issue(job_data)
        elif task_name == "ingest_source":
            handler = self._handle_ingest_source(job_data)
        else:
            logger.warning("Unknown generation task: %s", task_name)
            return

        task = asyncio.create_task(handler)
        cancel_key = ""
        if task_name == "generate_issue" and issue_id:
            cancel_key = f"issue:{issue_id}"
        elif task_name == "generate_plan" and series_id:
            cancel_key = f"series:{series_id}"
        if cancel_key:
            self._running_jobs[cancel_key] = task
            task.add_done_callback(lambda _t, key=cancel_key: self._running_jobs.pop(key, None))
        if task_name in {"generate_plan", "generate_issue"}:
            self._llm_task = task
            task.add_done_callback(self._mark_llm_finished)
        self.tasks[task_id] = task
        task.add_done_callback(lambda t: asyncio.ensure_future(_finalize(t)))
        logger.info(
            "Queued job=%s id=%s attempts=%d series=%s issue=%s source=%s",
            task_name, task_id, attempts, series_id, issue_id, source_id,
        )

    async def _listen_for_generation_cancels(self):
        """Abort in-flight generation tasks when the API publishes a cancel.

        Jobs still sitting in the queue are handled separately by the
        pre-flight status check before any model call is made.
        """
        redis = self._redis_client()
        pubsub = redis.pubsub()
        try:
            await pubsub.subscribe(CANCEL_CHANNEL)
            logger.info("Subscribed to %s for generation cancellations", CANCEL_CHANNEL)
            while self.running:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if not message:
                    continue
                data = message.get("data")
                if isinstance(data, bytes):
                    data = data.decode("utf-8", "replace")
                if not isinstance(data, str):
                    continue
                try:
                    payload = json.loads(data)
                except ValueError:
                    continue
                key = f"{payload.get('target_type', '')}:{payload.get('target_id', '')}"
                job_task = self._running_jobs.get(key)
                if job_task is not None and not job_task.done():
                    job_task.cancel()
                    logger.info("Cancellation received for %s; aborting in-flight generation", key)
                else:
                    logger.info(
                        "Cancellation received for %s but no in-flight task matches (pre-flight check will handle it)",
                        key,
                    )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Generation cancellation listener crashed; restart it via worker restart")
            with contextlib.suppress(Exception):
                await pubsub.unsubscribe(CANCEL_CHANNEL)
                await pubsub.aclose()

    async def _record_dead_letter(self, job_data: dict, attempts: int, error: str):
        """Persist terminal failures so the Run Center can show them."""
        task_name = job_data.get("task", "")
        target_type = {"generate_plan": "series", "generate_issue": "issue"}.get(task_name, "unknown")
        target_id = job_data.get("issue_id") or job_data.get("series_id") or ""
        if not target_id:
            return
        try:
            pool = await self._pg_pool()
            created_by = job_data.get("created_by") or await _lookup_created_by(pool, target_type, target_id)
            if not created_by:
                return
            await pool.execute(
                """
                INSERT INTO generation_runs (
                    id, target_id, target_type, status, model,
                    error_code, error_msg, created_by, created_at, updated_at, completed_at
                )
                VALUES ($1::uuid, $2::uuid, $3, 'failed', $4, 'job_failed', $5, $6::uuid, NOW(), NOW(), NOW())
                """,
                str(uuid.uuid4()),
                target_id,
                target_type,
                job_data.get("model") or "",
                f"gave up after {attempts} attempts: {error}"[:500],
                created_by,
            )
        except Exception:
            logger.exception("Failed to record dead-letter run for %s %s", target_type, target_id)

    async def _handle_generate_plan(self, job_data: dict):
        """Handle a generate-plan job using the LangGraph agent."""
        series_id = job_data.get("series_id")
        token = set_generation_model(job_data.get("model"))
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

            # Pre-flight: skip jobs whose series is no longer waiting on us.
            pool = await self._pg_pool()
            current_status = await pool.fetchval(
                "SELECT plan_status FROM series WHERE id = $1::uuid",
                series_id,
            )
            if current_status != "generating":
                logger.info(
                    "Skipping plan generation for series=%s (plan_status is %s; likely canceled)",
                    series_id, current_status,
                )
                return

            result = await self._run_with_fallback(
                lambda model: self.agent.run_plan_generation(
                    brief={**job_data.get("brief", {}), "model": model},
                    workspace_id=job_data.get("workspace_id", ""),
                    series_id=series_id,
                    thread_id=job_data.get("thread_id") or f"plan-{series_id}",
                    model=model,
                ),
                requested_model=job_data.get("model"),
            )

            logger.info("Plan generated series=%s thread=%s status=%s",
                        series_id, result.get("thread_id"), result.get("status"))
            await self._record_generation_usage(
                target_id=series_id,
                target_type="series",
                result=result,
                requested_model=job_data.get("model"),
                created_by=job_data.get("created_by"),
                status=str(result.get("status") or ""),
                error=result.get("error") or "",
            )
            await self._persist_plan_result(series_id, result)
            await self._materialize_issues_from_plan(series_id, result, job_data)

        except asyncio.CancelledError:
            logger.info("Plan generation canceled series=%s", series_id)
            raise
        except Exception as e:
            logger.exception("Plan generation job failed series=%s", series_id)
            await self._persist_plan_result(
                series_id,
                {"status": "failed", "plan": {}, "error": str(e)},
            )
        finally:
            reset_generation_model(token)

    async def _handle_generate_issue(self, job_data: dict):
        """Handle a generate-issue job using the LangGraph agent."""
        issue_id = job_data.get("issue_id")
        token = set_generation_model(job_data.get("model"))
        try:
            # Pre-flight: the user may have canceled while this job sat in the
            # queue. Only proceed if the issue is still waiting on us.
            pool = await self._pg_pool()
            current_status = await pool.fetchval(
                "SELECT status FROM issues WHERE id = $1::uuid",
                issue_id,
            )
            if current_status != "generating":
                logger.info(
                    "Skipping generation for issue=%s (status is %s; likely canceled)",
                    issue_id, current_status,
                )
                return

            result = await self._run_with_fallback(
                lambda model: self.agent.run_issue_generation(
                    series_id=job_data.get("series_id", ""),
                    brief={**job_data.get("brief", {}), "model": model},
                    workspace_id=job_data.get("workspace_id", ""),
                    issue_number=job_data.get("issue_number", 1),
                    plan_item=job_data.get("plan_item", {}),
                    thread_id=job_data.get("thread_id") or f"issue-{job_data.get('issue_id') or 'unknown'}",
                    model=model,
                ),
                requested_model=job_data.get("model"),
            )

            logger.info("Issue generated: thread=%s, status=%s",
                        result.get("thread_id"), result.get("status"))
            await self._record_generation_usage(
                target_id=job_data.get("issue_id"),
                target_type="issue",
                result=result,
                requested_model=job_data.get("model"),
                created_by=job_data.get("created_by"),
                status=str(result.get("status") or ""),
                error=result.get("error") or "",
            )
            await self._persist_issue_result(job_data.get("issue_id"), result)

        except asyncio.CancelledError:
            # User-initiated cancellation: the cancel endpoint already restored
            # the issue's status; nothing to persist. Re-raise so the finalize
            # callback acks the job instead of treating it as a failure.
            logger.info("Issue generation canceled issue=%s", job_data.get("issue_id"))
            raise
        except Exception as e:
            logger.exception("Issue generation job failed issue=%s", job_data.get("issue_id"))
            await self._persist_issue_result(
                job_data.get("issue_id"),
                {"status": "failed", "issues": [], "error": str(e)},
            )
        finally:
            reset_generation_model(token)

    async def _run_with_fallback(self, runner, requested_model: str | None):
        """Run an LLM workflow; on failure with a non-default model, retry once
        with the platform default before giving up."""
        try:
            return await runner(resolve_default_model(requested_model))
        except Exception as primary_error:
            chosen = resolve_default_model(requested_model)
            fallback = resolve_default_model(None)
            if chosen == fallback:
                raise
            logger.warning(
                "Model %s failed (%s); retrying once with default %s",
                chosen, primary_error, fallback,
            )
            return await runner(fallback)

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
            updated = await pool.fetchval(
                """
                UPDATE series
                SET plan_status = $1,
                    plan_json = $2::jsonb,
                    plan_error = $3,
                    updated_at = NOW()
                WHERE id = $4::uuid AND plan_status = 'generating'
                RETURNING id
                """,
                plan_status,
                json.dumps(plan),
                error,
                series_id,
            )
            if updated is None:
                logger.info("Skipped persist for series=%s (plan no longer generating; likely canceled)", series_id)
                return
            logger.info("Persisted plan status=%s for series=%s", plan_status, series_id)
        except Exception as persist_error:
            logger.exception("Failed to persist plan result series=%s: %s", series_id, persist_error)

    async def _materialize_issues_from_plan(self, series_id: str | None, result: dict, job_data: dict):
        """Reconcile the series' issues with a (re)generated plan.

        First materialization creates one scheduled issue per module. On plan
        regeneration the existing outline is reconciled instead of skipped:
        - issues that have not been sent/approved adopt the new module titles
        - missing sequence numbers are created and queued for generation
        - already sent/approved/in-flight issues are left untouched
        """
        if not series_id:
            return
        status = result.get("status") or ""
        plan = result.get("plan") or {}
        if status in {"failed", "planning_failed", "validation_failed"}:
            return
        modules = [module for module in (plan.get("modules") or []) if isinstance(module, dict)]
        if not modules:
            logger.warning("Plan ready but no modules to materialize series=%s", series_id)
            return

        try:
            pool = await self._pg_pool()
            jobs: list[dict] = []
            async with pool.acquire() as conn:
                async with conn.transaction():
                    series = await conn.fetchrow(
                        """
                        SELECT workspace_id, topic, goal, level, timezone, cadence,
                               start_date, send_time, manual_approval, created_by
                        FROM series
                        WHERE id = $1::uuid AND deleted_at IS NULL
                        """,
                        series_id,
                    )
                    if series is None:
                        return
                    existing_rows = await conn.fetch(
                        """
                        SELECT id, sequence_no, status FROM issues
                        WHERE series_id = $1::uuid AND deleted_at IS NULL
                        ORDER BY sequence_no ASC
                        """,
                        series_id,
                    )
                    by_sequence = {int(row["sequence_no"]): row for row in existing_rows}

                    send_times = issue_send_times(
                        series["start_date"] or "",
                        series["send_time"] or "09:00",
                        series["timezone"] or "UTC",
                        series["cadence"] or "weekly",
                        max(len(modules), len(by_sequence)),
                    )
                    model = job_data.get("model") or ""
                    auto_send = not bool(series["manual_approval"])
                    created_by = str(series["created_by"])
                    workspace_id = str(series["workspace_id"])
                    immutable_statuses = {"sent", "approved", "generating"}

                    for index, module in enumerate(modules):
                        sequence_no = index + 1
                        title = str(module.get("title") or f"Issue {sequence_no}").strip()
                        send_at = send_times[min(index, len(send_times) - 1)]
                        row = by_sequence.get(sequence_no)

                        if row is not None:
                            # Reconcile: refresh objective on untouched issues only.
                            issue_id = str(row["id"])
                            if str(row["status"]) not in immutable_statuses:
                                await conn.execute(
                                    """
                                    UPDATE issues
                                    SET objective = $2, updated_at = NOW()
                                    WHERE id = $1::uuid
                                    """,
                                    issue_id,
                                    title,
                                )
                                jobs.append(
                                    {
                                        "task": "generate_issue",
                                        "issue_id": issue_id,
                                        "series_id": series_id,
                                        "workspace_id": workspace_id,
                                        "created_by": created_by,
                                        "issue_number": sequence_no,
                                        "model": model,
                                        "brief": {
                                            "topic": series["topic"],
                                            "goal": series["goal"],
                                            "level": series["level"],
                                            "objective": title,
                                            "model": model,
                                        },
                                        "thread_id": f"issue-{issue_id}",
                                        "plan_item": module,
                                        "_reconciled": True,
                                    }
                                )
                            continue

                        issue_id = str(uuid.uuid4())
                        await conn.execute(
                            """
                            INSERT INTO issues (
                                id, series_id, sequence_no, objective, scheduled_at,
                                status, locked, created_by, created_at, updated_at
                            )
                            VALUES (
                                $1::uuid, $2::uuid, $3, $4, $5,
                                'generating', FALSE, $6::uuid, NOW(), NOW()
                            )
                            """,
                            issue_id,
                            series_id,
                            sequence_no,
                            title,
                            send_at,
                            created_by,
                        )
                        if auto_send:
                            await conn.execute(
                                """
                                INSERT INTO schedules (
                                    id, issue_id, job_type, run_at, status,
                                    attempts, max_attempts, created_by, created_at, updated_at
                                )
                                VALUES (
                                    $1::uuid, $2::uuid, 'delivery', $3, 'pending',
                                    0, 5, $4::uuid, NOW(), NOW()
                                )
                                """,
                                str(uuid.uuid4()),
                                issue_id,
                                send_at,
                                created_by,
                            )
                        jobs.append(
                            {
                                "task": "generate_issue",
                                "issue_id": issue_id,
                                "series_id": series_id,
                                "workspace_id": workspace_id,
                                "created_by": created_by,
                                "issue_number": sequence_no,
                                "model": model,
                                "brief": {
                                    "topic": series["topic"],
                                    "goal": series["goal"],
                                    "level": series["level"],
                                    "objective": title,
                                    "model": model,
                                },
                                "thread_id": f"issue-{issue_id}",
                                "plan_item": module,
                            }
                        )

            redis = self._redis_client()
            for job in jobs:
                await redis.rpush(QUEUE_KEY, json.dumps(job))
            logger.info(
                "Reconciled %s issue(s) from plan series=%s modules=%s auto_send=%s",
                len(jobs),
                series_id,
                len(modules),
                not bool(series["manual_approval"]) if series else False,
            )
        except Exception:
            logger.exception("Failed to reconcile issues from plan series=%s", series_id)

    async def _handle_generate_issue(self, job_data: dict):
        """Handle a generate-issue job using the LangGraph agent."""
        token = set_generation_model(job_data.get("model"))
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
        finally:
            reset_generation_model(token)

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
            # Status guard: if the user canceled mid-run, their restored
            # status wins and this late result is dropped.
            updated = await pool.fetchval(
                """
                UPDATE issues
                SET status = $1,
                    content_json = $2::jsonb,
                    generate_error = $3,
                    updated_at = NOW()
                WHERE id = $4::uuid AND status = 'generating'
                RETURNING id
                """,
                issue_status,
                json.dumps(content),
                error,
                issue_id,
            )
            if updated is None:
                logger.info("Skipped persist for issue=%s (no longer generating; likely canceled)", issue_id)
                return
            logger.info("Persisted issue status=%s for issue=%s", issue_status, issue_id)
        except Exception as persist_error:
            logger.exception("Failed to persist issue result issue=%s: %s", issue_id, persist_error)

    async def _record_generation_usage(
        self,
        target_id: str | None,
        target_type: str,
        result: dict,
        requested_model: str | None,
        created_by: str | None,
        status: str,
        error: str,
    ):
        """Persist one generation_runs row with aggregated token usage.

        LangChain AIMessages carry usage_metadata when the provider reports it;
        totals are summed across every model turn of the workflow.
        """
        if not target_id:
            return
        usage = result.get("usage") or {}
        tokens_in = int(usage.get("input_tokens") or 0)
        tokens_out = int(usage.get("output_tokens") or 0)

        model_used = resolve_default_model(requested_model)
        failed = status in {"failed", "planning_failed", "validation_failed"}

        try:
            pool = await self._pg_pool()
            created_by = created_by or await _lookup_created_by(pool, target_type, target_id)
            if not created_by:
                return
            await pool.execute(
                """
                INSERT INTO generation_runs (
                    id, target_id, target_type, status, model,
                    tokens_in, tokens_out, cost_usd, prompt_version,
                    error_code, error_msg, created_by, created_at, updated_at, completed_at
                )
                VALUES (
                    $1::uuid, $2::uuid, $3, $4, $5,
                    $6, $7, 0, 'v1',
                    $8, $9, $10::uuid, NOW(), NOW(),
                    CASE WHEN $11 THEN NULL ELSE NOW() END
                )
                """,
                str(uuid.uuid4()),
                target_id,
                target_type,
                "failed" if failed else "completed",
                model_used,
                tokens_in,
                tokens_out,
                ("generation_failed" if failed else None),
                (error or "")[:500],
                created_by,
                failed,
            )
            logger.info(
                "Recorded generation run target=%s/%s model=%s tokens_in=%s tokens_out=%s status=%s",
                target_type, target_id, model_used, tokens_in, tokens_out,
                "failed" if failed else "completed",
            )
        except Exception:
            logger.exception("Failed to record generation usage for %s %s", target_type, target_id)

    async def _handle_ingest_source(self, job_data: dict):
        """Handle a source ingestion job."""
        source_id = job_data.get("source_id")
        try:
            source_type = job_data.get("source_type", "url")
            if source_type in {"url", "rss", "website"}:
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


def _is_idle_redis_timeout(exc: BaseException) -> bool:
    text = str(exc).lower()
    return "timeout" in text


async def _lookup_created_by(pool: asyncpg.Pool, target_type: str, target_id: str) -> str | None:
    """Best-effort lookup of the owning user for generation_runs rows."""
    try:
        async with pool.acquire() as conn:
            if target_type == "issue":
                row = await conn.fetchrow(
                    "SELECT created_by FROM issues WHERE id = $1::uuid",
                    target_id,
                )
            else:
                row = await conn.fetchrow(
                    "SELECT created_by FROM series WHERE id = $1::uuid",
                    target_id,
                )
            return str(row["created_by"]) if row else None
    except Exception:
        logger.exception("created_by lookup failed for %s %s", target_type, target_id)
        return None


async def _main() -> None:
    worker = AIWorker()
    loop = asyncio.get_running_loop()
    stop_signal = asyncio.Event()

    def _request_stop():
        logger.info("Shutdown signal received; finishing in-flight jobs")
        stop_signal.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        with contextlib.suppress(NotImplementedError):
            loop.add_signal_handler(sig, _request_stop)

    worker_task = asyncio.create_task(worker.start())
    await stop_signal.wait()
    worker_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await worker_task
    await worker.stop()


if __name__ == "__main__":
    asyncio.run(_main())
