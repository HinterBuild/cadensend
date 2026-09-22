"""Pure information-retrieval metrics for evaluating RAG retrieval quality.

Kept free of Qdrant/LLM imports so metrics are cheap to unit-test and can be
reused against retrieval results from any source (live Qdrant queries,
recorded fixtures, or a future alternate retriever).

Every function takes a ranked list of retrieved chunk/document IDs and the
set of IDs a human labeled as relevant for that query — see
`rag/evaluation/README.md` for the labeled-query file format the harness
in `harness.py` consumes.
"""

from __future__ import annotations

import math
from typing import Sequence, Set


def recall_at_k(retrieved_ids: Sequence[str], relevant_ids: Set[str], k: int) -> float:
    """Fraction of relevant IDs that appear in the top k retrieved IDs."""
    if not relevant_ids:
        return 0.0
    top_k = set(retrieved_ids[:k])
    return len(top_k & relevant_ids) / len(relevant_ids)


def mrr(retrieved_ids: Sequence[str], relevant_ids: Set[str]) -> float:
    """Reciprocal rank of the first relevant ID in the ranked list (0 if none found)."""
    for rank, doc_id in enumerate(retrieved_ids, start=1):
        if doc_id in relevant_ids:
            return 1.0 / rank
    return 0.0


def ndcg_at_k(retrieved_ids: Sequence[str], relevant_ids: Set[str], k: int) -> float:
    """Normalized discounted cumulative gain at k, with binary relevance."""
    if not relevant_ids:
        return 0.0
    top_k = retrieved_ids[:k]
    dcg = sum(
        1.0 / math.log2(rank + 1)
        for rank, doc_id in enumerate(top_k, start=1)
        if doc_id in relevant_ids
    )
    ideal_hits = min(len(relevant_ids), k)
    idcg = sum(1.0 / math.log2(rank + 1) for rank in range(1, ideal_hits + 1))
    if idcg == 0:
        return 0.0
    return dcg / idcg


def is_empty_result(retrieved_ids: Sequence[str]) -> bool:
    """True when a query returned no results at all."""
    return len(retrieved_ids) == 0
