"""Short-term memory checkpoint backend for LangGraph.

Provides per-thread conversation history checkpoints using PostgreSQL.
This is the "short-term memory" - it persists the state of each conversation
thread so the agent can resume and maintain context within a thread.
"""

from typing import Optional, Dict, Any, List, AsyncIterator
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
from langgraph.store.base import Item

logger = logging.getLogger(__name__)


class PostgresCheckpointBackend(BaseCheckpointSaver):
    """PostgreSQL-backed checkpoint storage for LangGraph threads.

    Stores conversation state (short-term memory) per thread, allowing
    the agent to resume conversations with full message history.
    """

    def __init__(self, db_url: Optional[str] = None, /, **kwargs: Any):
        from app.core.config import settings
        self.db_url = db_url or settings.DATABASE_URL
        super().__init__()

    async def setup(self):
        """Ensure checkpoint tables exist."""
        import asyncpg

        conn = await asyncpg.connect(self.db_url)
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

    def _get_thread_info(self, checkpoint: Checkpoint) -> tuple:
        """Extract thread_id and thread_ts from checkpoint."""
        thread_id = checkpoint.get("id", "default")
        thread_ts = checkpoint.get("ts", str(uuidlib.uuid4()))
        parent_ts = checkpoint.get("metadata", {}).get("parents", {}).get(thread_id) if isinstance(checkpoint.get("metadata"), dict) else None
        return thread_id, thread_ts, parent_ts

    async def aput(
        self,
        config: Dict[str, Any],
        checkpoint: Checkpoint,
        metadata: Optional[CheckpointMetadata] = None,
        new_versions: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Store a checkpoint and return the config."""
        import asyncpg

        thread_id, thread_ts, parent_ts = self._get_thread_info(checkpoint)

        conn = await asyncpg.connect(self.db_url)
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
                json.dumps(checkpoint),
                json.dumps(metadata or {}),
            )
        finally:
            await conn.close()

        logger.info("Checkpoint saved: thread=%s, ts=%s", thread_id, thread_ts)
        return {"thread_id": thread_id, "thread_ts": thread_ts}

    async def aput_writes(
        self,
        config: Dict[str, Any],
        writes: List[tuple],
        task_id: str,
        task_path: str = "",
        **kwargs,
    ) -> None:
        """Store intermediate writes for a task. No-op for now."""
        pass

    async def aget_tuple(self, config: Dict[str, Any]) -> Optional[CheckpointTuple]:
        """Retrieve a checkpoint tuple by config."""
        import asyncpg

        thread_id = config.get("thread_id", "default")
        thread_ts = config.get("thread_ts")

        conn = await asyncpg.connect(self.db_url)
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
                checkpoint = json.loads(row["checkpoint"])
                metadata = json.loads(row["metadata"]) if row["metadata"] else {}
                return CheckpointTuple(
                    config=config,
                    checkpoint=checkpoint,
                    metadata=metadata,
                )
        finally:
            await conn.close()
        return None

    async def alist(
        self,
        config: Optional[Dict[str, Any]] = None,
        *,
        filter: Optional[Dict[str, Any]] = None,
        before: Optional[Dict[str, Any]] = None,
        limit: Optional[int] = None,
        **kwargs,
    ) -> AsyncIterator[CheckpointTuple]:
        """List checkpoints for a thread."""
        import asyncpg

        thread_id = config.get("thread_id", "default") if config else None
        limit_val = limit or 100

        conn = await asyncpg.connect(self.db_url)
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
                checkpoint = json.loads(row["checkpoint"])
                metadata = json.loads(row["metadata"]) if row["metadata"] else {}
                yield CheckpointTuple(
                    config={"thread_id": checkpoint.get("id", "default"), "thread_ts": checkpoint.get("ts")},
                    checkpoint=checkpoint,
                    metadata=metadata,
                )
        finally:
            await conn.close()

    async def get_tuple(self, config: Dict[str, Any]) -> Optional[CheckpointTuple]:
        """Sync version - delegates to async."""
        import asyncio
        return asyncio.get_event_loop().run_until_complete(self.aget_tuple(config))

    def get(self, config: Dict[str, Any]) -> Optional[Checkpoint]:
        """Get a single checkpoint."""
        import asyncio
        loop = asyncio.get_event_loop()
        tuple_result = loop.run_until_complete(self.aget_tuple(config))
        return tuple_result.checkpoint if tuple_result else None

    def list(self, config: Optional[Dict[str, Any]] = None, **kwargs) -> Iterator[CheckpointTuple]:
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
        import asyncpg

        conn = await asyncpg.connect(self.db_url)
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
