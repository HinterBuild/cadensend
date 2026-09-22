"""Retrieval evaluation: pure IR metrics plus a harness to score a labeled
query set against a retriever. See README.md for the fixture format and
metrics.py / harness.py for the implementation.
"""

from app.rag.evaluation.harness import EvaluationReport, LabeledQuery, QueryResult, evaluate_retrieval
from app.rag.evaluation.loader import load_labeled_queries
from app.rag.evaluation.metrics import is_empty_result, mrr, ndcg_at_k, recall_at_k

__all__ = [
    "EvaluationReport",
    "LabeledQuery",
    "QueryResult",
    "evaluate_retrieval",
    "load_labeled_queries",
    "is_empty_result",
    "mrr",
    "ndcg_at_k",
    "recall_at_k",
]
