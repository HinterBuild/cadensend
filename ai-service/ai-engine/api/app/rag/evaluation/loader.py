"""Loads a labeled query set from a JSON fixture file for the eval harness."""

from __future__ import annotations

import json
from pathlib import Path
from typing import List

from app.rag.evaluation.harness import LabeledQuery


def load_labeled_queries(path: str | Path) -> List[LabeledQuery]:
    """Load labeled queries from a JSON file shaped as a list of objects:
    {"query": str, "relevant_ids": [str, ...], "category": str (optional)}.
    See rag/evaluation/README.md for the full format and an example.
    """
    data = json.loads(Path(path).read_text())
    if not isinstance(data, list):
        raise ValueError(f"{path}: expected a JSON array of labeled queries")

    queries: List[LabeledQuery] = []
    for index, entry in enumerate(data):
        if not isinstance(entry, dict):
            raise ValueError(f"{path}[{index}]: expected an object")
        query = str(entry.get("query") or "").strip()
        if not query:
            raise ValueError(f"{path}[{index}]: missing required 'query'")
        relevant_ids = entry.get("relevant_ids") or []
        if not isinstance(relevant_ids, list):
            raise ValueError(f"{path}[{index}]: 'relevant_ids' must be a list")
        queries.append(
            LabeledQuery(
                query=query,
                relevant_ids=[str(item) for item in relevant_ids],
                category=str(entry.get("category") or ""),
            )
        )
    return queries
