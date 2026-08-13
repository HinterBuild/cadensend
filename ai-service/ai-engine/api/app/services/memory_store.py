"""Long-term memory store for the newsletter agent.

Uses PostgreSQL to persist conversation memories between generations.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Iterable
from datetime import datetime
from typing import Any, Optional

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate
from langgraph.store.base import (
    BaseStore,
    GetOp,
    Item,
    ListNamespacesOp,
    MatchCondition,
    Op,
    PutOp,
    Result,
    SearchItem,
    SearchOp,
)

from app.core.config import settings
from app.services.model_service import ModelService

logger = logging.getLogger(__name__)


class LongTermMemoryStore(BaseStore):
    """PostgreSQL-backed long-term memory store."""

    def __init__(self, db_url: Optional[str] = None, model_service: Optional[ModelService] = None):
        self.db_url = db_url or settings.DATABASE_URL
        self.model_service = model_service or ModelService()
        self.llm = self.model_service.get_chat_model(temperature=0.3, max_tokens=2000)

    def batch(self, ops: Iterable[Op]) -> list[Result]:
        return asyncio.run(self.abatch(list(ops)))

    async def abatch(self, ops: Iterable[Op]) -> list[Result]:
        import asyncpg

        operations = list(ops)
        if not operations:
            return []

        conn = await asyncpg.connect(self.db_url)
        try:
            results: list[Result] = []
            for op in operations:
                if isinstance(op, GetOp):
                    results.append(await self._handle_get(conn, op))
                elif isinstance(op, SearchOp):
                    results.append(await self._handle_search(conn, op))
                elif isinstance(op, PutOp):
                    results.append(await self._handle_put(conn, op))
                elif isinstance(op, ListNamespacesOp):
                    results.append(await self._handle_list_namespaces(conn, op))
                else:
                    raise TypeError(f"Unsupported store operation: {type(op).__name__}")

            return results
        finally:
            await conn.close()

    async def _handle_get(self, conn: Any, op: GetOp) -> Item | None:
        row = await conn.fetchrow(
            """
            SELECT namespace, key, value, updated_at
            FROM agent_memories
            WHERE namespace = $1 AND key = $2
            """,
            self._serialize_namespace(op.namespace),
            op.key,
        )
        if row is None:
            return None
        return self._item_from_row(row)

    async def _handle_search(self, conn: Any, op: SearchOp) -> list[SearchItem]:
        params: list[Any] = []
        conditions: list[str] = []

        namespace_filter = self._namespace_where_clause(op.namespace_prefix, params)
        if namespace_filter:
            conditions.append(namespace_filter)

        if op.query:
            params.append(f"%{op.query}%")
            query_param = f"${len(params)}"
            conditions.append(f"(key ILIKE {query_param} OR value::text ILIKE {query_param})")

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        limit = max(op.limit, 0)
        offset = max(op.offset, 0)

        rows = await conn.fetch(
            f"""
            SELECT namespace, key, value, updated_at
            FROM agent_memories
            {where_clause}
            ORDER BY updated_at DESC
            LIMIT {limit}
            OFFSET {offset}
            """,
            *params,
        )

        results = [self._search_item_from_row(row) for row in rows]
        if op.filter:
            results = [item for item in results if self._matches_filter(item.value, op.filter)]
        return results[:limit]

    async def _handle_put(self, conn: Any, op: PutOp) -> None:
        namespace = self._serialize_namespace(op.namespace)

        if op.value is None:
            await conn.execute(
                "DELETE FROM agent_memories WHERE namespace = $1 AND key = $2",
                namespace,
                op.key,
            )
            return None

        await conn.execute(
            """
            INSERT INTO agent_memories (namespace, key, value, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (namespace, key) DO UPDATE SET
                value = EXCLUDED.value,
                updated_at = NOW()
            """,
            namespace,
            op.key,
            json.dumps(op.value),
        )
        logger.debug("Stored memory: namespace=%s, key=%s", op.namespace, op.key)
        return None

    async def _handle_list_namespaces(
        self,
        conn: Any,
        op: ListNamespacesOp,
    ) -> list[tuple[str, ...]]:
        rows = await conn.fetch("SELECT DISTINCT namespace FROM agent_memories ORDER BY namespace")

        namespaces = [tuple(json.loads(row["namespace"])) for row in rows]
        if op.match_conditions:
            namespaces = [
                namespace
                for namespace in namespaces
                if all(self._matches_namespace(namespace, condition) for condition in op.match_conditions)
            ]

        if op.max_depth is not None:
            namespaces = [namespace[: op.max_depth] for namespace in namespaces]
            namespaces = list(dict.fromkeys(namespaces))

        start = max(op.offset, 0)
        end = start + max(op.limit, 0)
        return namespaces[start:end]

    @staticmethod
    def _serialize_namespace(namespace: tuple[str, ...]) -> str:
        return json.dumps(list(namespace))

    def _namespace_where_clause(
        self,
        namespace_prefix: tuple[str, ...],
        params: list[Any],
    ) -> str:
        if not namespace_prefix:
            return ""

        exact_namespace = self._serialize_namespace(namespace_prefix)
        nested_prefix = f"{exact_namespace[:-1]},%"

        params.append(exact_namespace)
        exact_param = f"${len(params)}"
        params.append(nested_prefix)
        nested_param = f"${len(params)}"
        return f"(namespace = {exact_param} OR namespace LIKE {nested_param})"

    @staticmethod
    def _matches_filter(value: dict[str, Any], filters: dict[str, Any]) -> bool:
        for key, expected in filters.items():
            if value.get(key) != expected:
                return False
        return True

    @staticmethod
    def _matches_namespace(
        namespace: tuple[str, ...],
        condition: MatchCondition,
    ) -> bool:
        path = condition.path
        if condition.match_type == "prefix":
            if len(path) > len(namespace):
                return False
            return all(part == "*" or part == namespace[idx] for idx, part in enumerate(path))

        if len(path) > len(namespace):
            return False

        start_index = len(namespace) - len(path)
        return all(
            part == "*" or part == namespace[start_index + idx]
            for idx, part in enumerate(path)
        )

    @staticmethod
    def _item_from_row(row: Any) -> Item:
        namespace = tuple(json.loads(row["namespace"]))
        value = row["value"]
        if isinstance(value, str):
            value = json.loads(value)

        timestamp = row["updated_at"]
        return Item(
            namespace=namespace,
            key=row["key"],
            value=value,
            created_at=timestamp,
            updated_at=timestamp,
        )

    @classmethod
    def _search_item_from_row(cls, row: Any) -> SearchItem:
        item = cls._item_from_row(row)
        return SearchItem(
            namespace=item.namespace,
            key=item.key,
            value=item.value,
            created_at=item.created_at,
            updated_at=item.updated_at,
            score=None,
        )

    async def summarize_and_store(
        self,
        namespace: tuple[str, ...],
        key: str,
        conversation: list[BaseMessage],
    ) -> str:
        """Summarize a conversation thread and store the summary as a memory."""
        if not self.llm:
            logger.warning("Cannot summarize: LLM not configured")
            return ""

        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    """You are a memory extraction assistant. Summarize the key information from this conversation that should be remembered for future planning sessions. Focus on:
1. The topic and learning objectives
2. The writing style preferences
3. Audience knowledge level
4. Source materials referenced
5. Any recurring themes or constraints

Be concise but comprehensive - this will be used as long-term memory for future newsletter generation.""",
                ),
                ("human", "Conversation:\n{conversation}"),
            ]
        )

        formatted = "\n".join(
            f"{'Human' if isinstance(message, HumanMessage) else 'Assistant'}: {message.content}"
            for message in conversation
            if isinstance(message, (HumanMessage, AIMessage))
        )

        try:
            summary = await self.llm.ainvoke(prompt.format_messages(conversation=formatted))
            summary_text = summary.content if isinstance(summary.content, str) else str(summary.content)
        except Exception as exc:
            logger.error("Failed to summarize conversation: %s", exc)
            summary_text = formatted[:500]

        await self.aput(
            namespace,
            key,
            {"summary": summary_text, "message_count": len(conversation)},
        )
        return summary_text


memory_store = LongTermMemoryStore()
