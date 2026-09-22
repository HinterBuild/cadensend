"""Runs a labeled query set against a retriever and aggregates IR metrics.

This is the piece plan.md's "retrieval evaluation set" section describes:
a way to measure Recall@K, MRR, NDCG@K, and empty-result rate before
promoting a change to chunking, embeddings, or retrieval (e.g. hybrid
search, reranking) — see the module docstring in metrics.py and
rag/evaluation/README.md for the labeled-query format.

Deliberately decoupled from any specific embedding/vector-store client:
callers pass a `retrieve_fn(query: str) -> list[str]` returning ranked
chunk IDs, so this harness works against live Qdrant, a recorded fixture,
or a stub in tests without needing network access.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, List, Sequence

from app.rag.evaluation.metrics import is_empty_result, mrr, ndcg_at_k, recall_at_k

RetrieveFn = Callable[[str], Sequence[str]]


@dataclass
class LabeledQuery:
    """One evaluation example: a query and the chunk IDs a human labeled relevant."""

    query: str
    relevant_ids: List[str]
    category: str = ""


@dataclass
class QueryResult:
    """Per-query metrics for one LabeledQuery."""

    query: str
    category: str
    recall_at_5: float
    recall_at_10: float
    recall_at_20: float
    mrr: float
    ndcg_at_10: float
    empty_result: bool
    retrieved_count: int


@dataclass
class EvaluationReport:
    """Aggregated metrics across an entire labeled query set."""

    results: List[QueryResult] = field(default_factory=list)

    @property
    def query_count(self) -> int:
        return len(self.results)

    def _avg(self, attr: str) -> float:
        if not self.results:
            return 0.0
        return sum(getattr(r, attr) for r in self.results) / len(self.results)

    @property
    def avg_recall_at_5(self) -> float:
        return self._avg("recall_at_5")

    @property
    def avg_recall_at_10(self) -> float:
        return self._avg("recall_at_10")

    @property
    def avg_recall_at_20(self) -> float:
        return self._avg("recall_at_20")

    @property
    def avg_mrr(self) -> float:
        return self._avg("mrr")

    @property
    def avg_ndcg_at_10(self) -> float:
        return self._avg("ndcg_at_10")

    @property
    def empty_result_rate(self) -> float:
        if not self.results:
            return 0.0
        return sum(1 for r in self.results if r.empty_result) / len(self.results)

    def by_category(self) -> dict[str, "EvaluationReport"]:
        """Split results into one sub-report per category label, for
        per-slice analysis (e.g. "conceptual" vs "keyword" queries)."""
        categories: dict[str, list[QueryResult]] = {}
        for result in self.results:
            categories.setdefault(result.category or "uncategorized", []).append(result)
        return {name: EvaluationReport(results=items) for name, items in categories.items()}

    def summary(self) -> dict:
        return {
            "query_count": self.query_count,
            "avg_recall_at_5": round(self.avg_recall_at_5, 4),
            "avg_recall_at_10": round(self.avg_recall_at_10, 4),
            "avg_recall_at_20": round(self.avg_recall_at_20, 4),
            "avg_mrr": round(self.avg_mrr, 4),
            "avg_ndcg_at_10": round(self.avg_ndcg_at_10, 4),
            "empty_result_rate": round(self.empty_result_rate, 4),
        }


def evaluate_retrieval(queries: Sequence[LabeledQuery], retrieve_fn: RetrieveFn) -> EvaluationReport:
    """Run every labeled query through retrieve_fn and score the results."""
    results: List[QueryResult] = []
    for labeled in queries:
        relevant = set(labeled.relevant_ids)
        retrieved = list(retrieve_fn(labeled.query))
        results.append(
            QueryResult(
                query=labeled.query,
                category=labeled.category,
                recall_at_5=recall_at_k(retrieved, relevant, 5),
                recall_at_10=recall_at_k(retrieved, relevant, 10),
                recall_at_20=recall_at_k(retrieved, relevant, 20),
                mrr=mrr(retrieved, relevant),
                ndcg_at_10=ndcg_at_k(retrieved, relevant, 10),
                empty_result=is_empty_result(retrieved),
                retrieved_count=len(retrieved),
            )
        )
    return EvaluationReport(results=results)
