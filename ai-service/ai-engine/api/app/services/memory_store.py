"""Long-term memory store for the newsletter agent.

Uses PostgreSQL to persist conversation memories between generations.
"""

from typing import List, Dict, Any, Optional, Annotated, Sequence
import logging
import json
import hashlib

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from langgraph.store.base import BaseStore, Item
from langgraph.store.base.acl import ContainerAuth
from langgraph.store.base.namespace import Coords

from app.core.config import settings

logger = logging.getLogger(__name__)


class LongTermMemoryStore(BaseStore):
    """PostgreSQL-backed long-term memory store.

    Stores persistent memories about workspaces, series, and writing style
    that persist across conversation sessions.
    """

    def __init__(self, db_url: Optional[str] = None):
        self.db_url = db_url or settings.DATABASE_URL
        self.llm = None
        if settings.OPENROUTER_API_KEY:
            self.llm = ChatOpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=settings.OPENROUTER_API_KEY,
                model=settings.DEFAULT_MODEL,
                temperature=0.3,
                max_tokens=2000,
            )

    async def aput(
        self,
        namespace: tuple[str, ...],
        key: str,
        value: dict,
        *,
        coops: Annotated[Sequence[str], Coords],
        auth: Annotated[ContainerAuth, Coords],
        update: bool = False,
    ) -> None:
        """Store a memory in a namespace + key path."""
        import asyncpg

        conn = await asyncpg.connect(self.db_url)
        try:
            await conn.execute(
                """
                INSERT INTO agent_memories (namespace, key, value, updated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (namespace, key) DO UPDATE SET
                    value = EXCLUDED.value,
                    updated_at = NOW()
                """,
                json.dumps(list(namespace)),
                key,
                json.dumps(value),
            )
        finally:
            await conn.close()
        logger.info("Stored memory: namespace=%s, key=%s", namespace, key)

    async def aget(
        self,
        namespace: tuple[str, ...],
        key: str,
        *,
        coops: Annotated[Sequence[str], Coords],
        auth: Annotated[ContainerAuth, Coords],
    ) -> Optional[dict]:
        """Retrieve a memory by namespace + key."""
        import asyncpg

        conn = await asyncpg.connect(self.db_url)
        try:
            row = await conn.fetchrow(
                "SELECT value FROM agent_memories WHERE namespace = $1 AND key = $2",
                json.dumps(list(namespace)),
                key,
            )
            if row:
                return json.loads(row["value"])
        finally:
            await conn.close()
        return None

    async def asearch(
        self,
        namespace: tuple[str, ...],
        /,
        query: str,
        *,
        coops: Annotated[Sequence[str], Coords],
        auth: Annotated[ContainerAuth, Coords],
        limit: int = 10,
        **kwargs,
    ) -> List[Item]:
        """Search memories matching a query using semantic similarity on key/value text."""
        import asyncpg

        namespace_str = json.dumps(list(namespace))
        conn = await asyncpg.connect(self.db_url)
        try:
            rows = await conn.fetch(
                """
                SELECT key, value, updated_at
                FROM agent_memories
                WHERE namespace = $1
                  AND (key ILIKE $2 OR value::text ILIKE $2)
                ORDER BY updated_at DESC
                LIMIT $3
                """,
                namespace_str,
                f"%{query}%",
                limit,
            )
        finally:
            await conn.close()

        results = []
        for row in rows:
            results.append(
                Item(
                    namespace=list(namespace),
                    key=row["key"],
                    value=json.loads(row["value"]),
                    updated_at=row["updated_at"],
                    id=f"{namespace_str}:{row['key']}",
                )
            )
        return results

    async def abatch_get(
        self,
        specs: Sequence[tuple[str, ...]],
        /,
        *,
        coops: Annotated[Sequence[str], Coords],
        auth: Annotated[ContainerAuth, Coords],
        **kwargs,
    ) -> List[Optional[dict]]:
        """Batch retrieval of memories. Not fully implemented."""
        results = []
        for spec in specs:
            results.append(await self.aget(spec[0], spec[1], coops=coops, auth=auth))
        return results

    async def abatch_aput(
        self,
        specs: Sequence[tuple[str, ...]],
        /,
        values: Sequence[dict],
        *,
        coops: Annotated[Sequence[str], Coords],
        auth: Annotated[ContainerAuth, Coords],
        **kwargs,
    ) -> None:
        """Batch store memories."""
        for spec, value in zip(specs, values):
            await self.aput(spec[0], spec[1], value, coops=coops, auth=auth, update=True)

    async def adelete(
        self,
        namespace: tuple[str, ...],
        /,
        key: str,
        *,
        coops: Annotated[Sequence[str], Coords],
        auth: Annotated[ContainerAuth, Coords],
    ) -> None:
        """Delete a memory."""
        import asyncpg

        conn = await asyncpg.connect(self.db_url)
        try:
            await conn.execute(
                "DELETE FROM agent_memories WHERE namespace = $1 AND key = $2",
                json.dumps(list(namespace)),
                key,
            )
        finally:
            await conn.close()

    async def asearch_delete(
        self,
        namespace: tuple[str, ...],
        /,
        query: str,
        *,
        coops: Annotated[Sequence[str], Coords],
        auth: Annotated[ContainerAuth, Coords],
        **kwargs,
    ) -> None:
        """Delete memories matching a query."""
        import asyncpg

        namespace_str = json.dumps(list(namespace))
        conn = await asyncpg.connect(self.db_url)
        try:
            await conn.execute(
                """
                DELETE FROM agent_memories
                WHERE namespace = $1 AND (key ILIKE $2 OR value::text ILIKE $2)
                """,
                namespace_str,
                f"%{query}%",
            )
        finally:
            await conn.close()

    async def summarize_and_store(
        self,
        namespace: tuple[str, ...],
        key: str,
        conversation: List[BaseMessage],
    ) -> str:
        """Summarize a conversation thread and store the summary as a memory."""
        if not self.llm:
            logger.warning("Cannot summarize: LLM not configured")
            return ""

        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a memory extraction assistant. Summarize the key information from this conversation that should be remembered for future planning sessions. Focus on:
1. The topic and learning objectives
2. The writing style preferences
3. Audience knowledge level
4. Source materials referenced
5. Any recurring themes or constraints

Be concise but comprehensive - this will be used as long-term memory for future newsletter generation."""),
            ("human", "Conversation:\n{conversation}"),
        ])

        formatted = "\n".join(f"{'Human' if isinstance(m, HumanMessage) else 'Assistant'}: {m.content}" for m in conversation)

        try:
            summary = await self.llm.ainvoke(prompt.format_messages(conversation=formatted))
            summary_text = summary.content if hasattr(summary, 'content') else str(summary)
        except Exception as e:
            logger.error("Failed to summarize conversation: %s", e)
            summary_text = formatted[:500]

        await self.aput(
            namespace,
            key,
            {"summary": summary_text, "message_count": len(conversation)},
            coops=[],
            auth=ContainerAuth(),
            update=True,
        )

        return summary_text


memory_store = LongTermMemoryStore()
