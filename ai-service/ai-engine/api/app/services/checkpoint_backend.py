"""Short-term memory checkpoint backend for LangGraph.

Provides per-thread conversation history checkpoints using PostgreSQL.
This is the "short-term memory" - it persists the state of each conversation
thread so the agent can resume and maintain context within a thread.
"""

from collections.abc import AsyncIterator, Iterator, Sequence
from typing import Optional, Dict, Any
import base64
import json
import logging
import uuid as uuidlib

from langgraph.checkpoint.base import (
    BaseCheckpointSaver,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
    create_checkpoint,
    get_checkpoint_id,
    get_checkpoint_metadata,
)
from langchain_core.runnables import RunnableConfig

logger = logging.getLogger(__name__)


class PostgresCheckpointBackend(BaseCheckpointSaver):
    """PostgreSQL-backed checkpoint storage for LangGraph threads.

    Stores conversation state (short-term memory) per thread, allowing
    the agent to resume conversations with full message history.
    """

    def __init__(self, db_url: Optional[str] = None, /, **kwargs: Any):
        super().__init__()
        from app.core.config import settings
        from app.core.database import asyncpg_dsn
        self.db_url = asyncpg_dsn(db_url or settings.DATABASE_URL)

    async def _connect(self):
        import asyncpg
        from app.core.database import asyncpg_dsn
        return await asyncpg.connect(asyncpg_dsn(self.db_url))

    @staticmethod
    def _get_configurable(config: Optional[RunnableConfig]) -> Dict[str, Any]:
        if not config:
            return {}
        configurable = config.get("configurable")
        if isinstance(configurable, dict):
            return configurable
        return config

    def _checkpoint_config(self, thread_id: str, thread_ts: Optional[str] = None) -> RunnableConfig:
        configurable: Dict[str, Any] = {"thread_id": thread_id}
        if thread_ts:
            configurable["thread_ts"] = thread_ts
        return {"configurable": configurable}

    async def setup(self):
        """Ensure checkpoint tables exist."""
        conn = await self._connect()
        try:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS langgraph_checkpoints (
                    thread_id TEXT NOT NULL,
                    thread_ts TEXT NOT NULL,
                    parent_ts TEXT,
                    checkpoint JSONB NOT NULL,
                    metadata JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
                    PRIMARY KEY (thread_id, thread_ts)
                )
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_checkpoints_thread ON langgraph_checkpoints(thread_id)
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_ts ON langgraph_checkpoints(thread_ts)
            """)
        finally:
            await conn.close()

    def _get_thread_info(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: Optional[CheckpointMetadata],
    ) -> tuple[str, str, Optional[str]]:
        """Extract thread_id and thread_ts from checkpoint."""
        configurable = self._get_configurable(config)
        thread_id = str(configurable.get("thread_id") or checkpoint.get("id") or "default")
        thread_ts = str(configurable.get("thread_ts") or checkpoint.get("ts") or uuidlib.uuid4())

        parent_ts: Optional[str] = None
        if metadata and isinstance(metadata.get("parents"), dict):
            parent_ts = metadata["parents"].get(thread_id)
        return thread_id, thread_ts, parent_ts

    def _encode(self, obj: Any) -> str:
        """Persist LangGraph values, including LangChain messages."""
        kind, payload = self.serde.dumps_typed(obj)
        if isinstance(payload, str):
            payload = payload.encode("utf-8")
        return json.dumps({
            "__lg": True,
            "t": kind,
            "d": base64.b64encode(payload).decode("ascii"),
        })

    def _decode(self, raw: Any) -> Any:
        if raw is None:
            return {}
        data = json.loads(raw) if isinstance(raw, (str, bytes, bytearray)) else raw
        if isinstance(data, dict) and data.get("__lg") and "t" in data and "d" in data:
            return self.serde.loads_typed((data["t"], base64.b64decode(data["d"])))
        return data

    async def aput(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: Optional[CheckpointMetadata] = None,
        new_versions: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> RunnableConfig:
        """Store a checkpoint and return the config."""
        thread_id, thread_ts, parent_ts = self._get_thread_info(config, checkpoint, metadata)

        conn = await self._connect()
        try:
            await conn.execute(
                """
                INSERT INTO langgraph_checkpoints (thread_id, thread_ts, parent_ts, checkpoint, metadata)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (thread_id, thread_ts) DO UPDATE SET
                    checkpoint = EXCLUDED.checkpoint,
                    metadata = EXCLUDED.metadata
                """,
                thread_id,
                thread_ts,
                parent_ts,
                self._encode(checkpoint),
                self._encode(metadata or {}),
            )
        finally:
            await conn.close()

        logger.debug("Checkpoint saved: thread=%s, ts=%s", thread_id, thread_ts)
        return self._checkpoint_config(thread_id, thread_ts)

    async def aput_writes(
        self,
        config: RunnableConfig,
        writes: Sequence[tuple],
        task_id: str,
        task_path: str = "",
        **kwargs,
    ) -> None:
        """Store intermediate writes for a task. No-op for now."""
        pass

    async def aget_tuple(self, config: RunnableConfig) -> Optional[CheckpointTuple]:
        """Retrieve a checkpoint tuple by config."""
        configurable = self._get_configurable(config)
        thread_id = str(configurable.get("thread_id", "default"))
        thread_ts = configurable.get("thread_ts")

        conn = await self._connect()
        try:
            if thread_ts:
                row = await conn.fetchrow(
                    "SELECT checkpoint, metadata FROM langgraph_checkpoints WHERE thread_id = $1 AND thread_ts = $2",
                    thread_id,
                    thread_ts,
                )
            else:
                row = await conn.fetchrow(
                    "SELECT checkpoint, metadata FROM langgraph_checkpoints WHERE thread_id = $1 ORDER BY thread_ts DESC LIMIT 1",
                    thread_id,
                )

            if row:
                checkpoint = self._decode(row["checkpoint"])
                metadata = self._decode(row["metadata"]) if row["metadata"] else {}
                return CheckpointTuple(
                    config=self._checkpoint_config(thread_id, thread_ts or checkpoint.get("ts")),
                    checkpoint=checkpoint,
                    metadata=metadata,
                )
        finally:
            await conn.close()
        return None

    async def alist(
        self,
        config: Optional[RunnableConfig] = None,
        *,
        filter: Optional[Dict[str, Any]] = None,
        before: Optional[RunnableConfig] = None,
        limit: Optional[int] = None,
        **kwargs,
    ) -> AsyncIterator[CheckpointTuple]:
        """List checkpoints for a thread."""
        configurable = self._get_configurable(config)
        thread_id = str(configurable.get("thread_id")) if configurable.get("thread_id") else None
        limit_val = limit or 100

        conn = await self._connect()
        try:
            if thread_id:
                rows = await conn.fetch(
                    "SELECT checkpoint, metadata FROM langgraph_checkpoints WHERE thread_id = $1 ORDER BY thread_ts DESC LIMIT $2",
                    thread_id,
                    limit_val,
                )
            else:
                rows = await conn.fetch(
                    "SELECT checkpoint, metadata FROM langgraph_checkpoints ORDER BY thread_id, thread_ts DESC LIMIT $1",
                    limit_val,
                )

            for row in rows:
                checkpoint = self._decode(row["checkpoint"])
                metadata = self._decode(row["metadata"]) if row["metadata"] else {}
                yield CheckpointTuple(
                    config=self._checkpoint_config(
                        str(checkpoint.get("id", thread_id or "default")),
                        checkpoint.get("ts"),
                    ),
                    checkpoint=checkpoint,
                    metadata=metadata,
                )
        finally:
            await conn.close()

    def get_tuple(self, config: RunnableConfig) -> Optional[CheckpointTuple]:
        """Sync version - delegates to async."""
        import asyncio
        return asyncio.get_event_loop().run_until_complete(self.aget_tuple(config))

    def get(self, config: RunnableConfig) -> Optional[Checkpoint]:
        """Get a single checkpoint."""
        import asyncio
        loop = asyncio.get_event_loop()
        tuple_result = loop.run_until_complete(self.aget_tuple(config))
        return tuple_result.checkpoint if tuple_result else None

    def list(self, config: Optional[RunnableConfig] = None, **kwargs) -> Iterator[CheckpointTuple]:
        """Sync version of alist."""
        import asyncio
        async def _collect():
            result = []
            async for t in self.alist(config, **kwargs):
                result.append(t)
            return result
        loop = asyncio.get_event_loop()
        return iter(loop.run_until_complete(_collect()))

    async def adelete_thread(self, thread_id: str) -> None:
        """Delete all checkpoints for a thread."""
        conn = await self._connect()
        try:
            await conn.execute(
                "DELETE FROM langgraph_checkpoints WHERE thread_id = $1",
                thread_id,
            )
        finally:
            await conn.close()


checkpoint_backend: Optional[PostgresCheckpointBackend] = None


def get_checkpoint_backend() -> PostgresCheckpointBackend:
    """Get the global checkpoint backend instance."""
    global checkpoint_backend
    if checkpoint_backend is None:
        checkpoint_backend = PostgresCheckpointBackend()
    return checkpoint_backend
