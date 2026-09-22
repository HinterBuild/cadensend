# Retrieval evaluation

Measures retrieval quality (Recall@5/10/20, MRR, NDCG@10, empty-result rate)
against a labeled query set, so a change to chunking, embeddings, or
retrieval (e.g. adding hybrid search or a reranker) can be judged by
evidence instead of guesswork — see `plan.md`'s "Update 1 release gates."

## Labeled query format

A JSON array of objects, one per evaluation query:

```json
[
  {
    "query": "How does continuous batching improve GPU utilization?",
    "relevant_ids": ["chk_01J8QK...", "chk_01J8QM..."],
    "category": "conceptual"
  },
  {
    "query": "paged attention",
    "relevant_ids": ["chk_01J8QK..."],
    "category": "keyword"
  }
]
```

- `query` — the natural-language question a user (or the issue-generation
  retrieval step) might ask.
- `relevant_ids` — the `chunk_id` values a human has judged relevant for
  that query. IDs that were never retrieved by any candidate system are
  simply never matched — no need to remove them.
- `category` (optional) — a free-text label (`"conceptual"`, `"keyword"`,
  `"multi_source"`, ...) so `EvaluationReport.by_category()` can break
  results down by query type, per plan.md's evaluation-set categories.

Build this file per workspace/corpus from real or representative content —
there is no bundled default set, since relevance is corpus-specific.

## Running an evaluation

```python
from app.rag.evaluation import evaluate_retrieval, load_labeled_queries
from app.rag.retrieval.retrieval import retrieval_service
from app.services.model_service import ModelService

queries = load_labeled_queries("path/to/labeled_queries.json")
model_service = ModelService()

def retrieve_fn(query: str) -> list[str]:
    embedding = model_service.get_embeddings([query])[0]
    results = retrieval_service.retrieve(embedding, workspace_id="...", top_k=20)
    return [r["chunk_id"] for r in results]

report = evaluate_retrieval(queries, retrieve_fn)
print(report.summary())
# {"query_count": 2, "avg_recall_at_5": 0.75, "avg_recall_at_10": 1.0, ...}

for category, sub_report in report.by_category().items():
    print(category, sub_report.summary())
```

`evaluate_retrieval` only needs a `retrieve_fn(query: str) -> list[str]`
callable — it doesn't import Qdrant or any LLM client directly, so it can
run against a live vector store, a recorded fixture, or a stub in tests.
