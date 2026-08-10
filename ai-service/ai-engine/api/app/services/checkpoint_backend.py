"""Short-term memory checkpoint backend for LangGraph.

Provides per-thread conversation history checkpoints using PostgreSQL.
This is the "short-term memory" - it persists the state of each conversation
thread so the agent can resume and maintain context within a thread.
"""

from typing import Optional, Dict, Any, List
import json
import logging
import hashlib

from langgraph.checkpoint.base import BaseCheckpointBackend, Checkpoint, CheckpointMetadata
from langgraph.store.base import Item

logger = logging.getLogger(__name__)


class PostgresCheckpointBackend(BaseCheckpointBackend):
    """PostgreSQL-backed checkpoint storage for LangGraph threads.

    Stores conversation state (short-term memory) per thread, allowing
    the agent to resume conversations with full message history.
    """

    def __init__(self, db_url: Optional[str] = None):
        from app.core.config import settings
        self.db_url = db_url or settings.DATABASE_URL

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

    async def aput(
        self,
        checkpoint: Checkpoint,
        metadata: Optional[CheckpointMetadata] = None,
        *args,
        **kwargs,
    ) -> Checkpoint:
        """Store a checkpoint."""
        import asyncpg

        conn = await asyncpg.connect(self.db_url)
        try:
            thread_id = checkpoint.get("thread_id", "default")
            thread_ts = checkpoint.get("thread_ts", str(hash(str(checkpoint))))

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
                checkpoint.get("parent_ts"),
                json.dumps(checkpoint),
                json.dumps(metadata or {}),
            )
        finally:
            await conn.close()

        logger.info("Checkpoint saved: thread=%s, ts=%s", checkpoint.get("thread_id"), checkpoint.get("thread_ts"))
        return checkpoint

    async def aget(
        self,
        thread_id: Optional[str] = None,
        thread_ts: Optional[str] = None,
        *,
        checkpoint_id: Optional[str] = None,
        **kwargs,
    ) -> Optional[Checkpoint]:
        """Retrieve a checkpoint by thread_id and thread_ts."""
        import asyncpg

        conn = await asyncpg.connect(self.db_url)
        try:
            if checkpoint_id:
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
                return json.loads(row["checkpoint"])
        finally:
            await conn.close()
        return None

    async def alist(
        self,
        *,
        thread_id: Optional[str] = None,
        limit: int = 100,
        **kwargs,
    ) -> List[Checkpoint]:
        """List checkpoints for a thread."""
        import asyncpg

        conn = await asyncpg.connect(self.db_url)
        try:
            if thread_id:
                rows = await conn.fetch(
                    "SELECT checkpoint, metadata FROM langgraph_checkpoints WHERE thread_id = $1 ORDER BY thread_ts DESC LIMIT $2",
                    thread_id,
                    limit,
                )
            else:
                rows = await conn.fetch(
                    "SELECT checkpoint, metadata FROM langgraph_checkpoints ORDER BY thread_id, thread_ts DESC LIMIT $1",
                    limit,
                )

            return [json.loads(row["checkpoint"]) for row in rows]
        finally:
            await conn.close()

    async def abatch(self, *args, **kwargs) -> List[Checkpoint]:
        """Batch retrieval - not fully supported."""
        return await self.alist(**kwargs)

    async def delete(
        self,
        thread_id: Optional[str] = None,
        thread_ts: Optional[str] = None,
        **kwargs,
    ) -> None:
        """Delete checkpoints."""
        import asyncpg

        conn = await asyncpg.connect(self.db_url)
        try:
            if thread_ts:
                await conn.execute(
                    "DELETE FROM langgraph_checkpoints WHERE thread_id = $1 AND thread_ts = $2",
                    thread_id,
                    thread_ts,
                )
            elif thread_id:
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
