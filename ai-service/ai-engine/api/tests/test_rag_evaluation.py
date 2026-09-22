"""Tests for the retrieval evaluation metrics and harness."""

import json

from app.rag.evaluation import (
    LabeledQuery,
    evaluate_retrieval,
    is_empty_result,
    load_labeled_queries,
    mrr,
    ndcg_at_k,
    recall_at_k,
)


class TestRecallAtK:
    def test_all_relevant_found_is_full_recall(self):
        assert recall_at_k(["a", "b", "c"], {"a", "b"}, 5) == 1.0

    def test_partial_recall(self):
        assert recall_at_k(["a", "x", "y"], {"a", "b"}, 5) == 0.5

    def test_none_found_is_zero(self):
        assert recall_at_k(["x", "y"], {"a", "b"}, 5) == 0.0

    def test_only_counts_within_k(self):
        # relevant id is retrieved, but ranked below k=1
        assert recall_at_k(["x", "a"], {"a"}, 1) == 0.0
        assert recall_at_k(["x", "a"], {"a"}, 2) == 1.0

    def test_no_relevant_ids_is_zero_not_divide_by_zero(self):
        assert recall_at_k(["a", "b"], set(), 5) == 0.0


class TestMRR:
    def test_first_result_relevant_is_full_score(self):
        assert mrr(["a", "b"], {"a"}) == 1.0

    def test_second_result_relevant_is_half(self):
        assert mrr(["x", "a"], {"a"}) == 0.5

    def test_nothing_relevant_is_zero(self):
        assert mrr(["x", "y"], {"a"}) == 0.0

    def test_empty_retrieved_is_zero(self):
        assert mrr([], {"a"}) == 0.0


class TestNDCGAtK:
    def test_relevant_first_beats_relevant_last(self):
        first = ndcg_at_k(["a", "x", "y"], {"a"}, 5)
        last = ndcg_at_k(["x", "y", "a"], {"a"}, 5)
        assert first > last
        assert first == 1.0  # single relevant doc, ranked first = ideal order

    def test_no_relevant_ids_is_zero(self):
        assert ndcg_at_k(["a", "b"], set(), 5) == 0.0

    def test_nothing_relevant_retrieved_is_zero(self):
        assert ndcg_at_k(["x", "y"], {"a"}, 5) == 0.0


class TestIsEmptyResult:
    def test_empty_list_is_empty(self):
        assert is_empty_result([]) is True

    def test_nonempty_list_is_not_empty(self):
        assert is_empty_result(["a"]) is False


class TestEvaluateRetrieval:
    def test_aggregates_metrics_across_queries(self):
        queries = [
            LabeledQuery(query="q1", relevant_ids=["a", "b"], category="conceptual"),
            LabeledQuery(query="q2", relevant_ids=["z"], category="keyword"),
        ]

        def retrieve_fn(query: str):
            return {"q1": ["a", "b", "c"], "q2": ["x", "y"]}[query]

        report = evaluate_retrieval(queries, retrieve_fn)

        assert report.query_count == 2
        assert report.avg_recall_at_10 == 0.5  # 1.0 for q1, 0.0 for q2
        assert report.empty_result_rate == 0.0

    def test_empty_retrieval_counts_toward_empty_rate(self):
        queries = [LabeledQuery(query="q1", relevant_ids=["a"])]
        report = evaluate_retrieval(queries, lambda q: [])
        assert report.empty_result_rate == 1.0
        assert report.avg_recall_at_10 == 0.0

    def test_by_category_splits_results(self):
        queries = [
            LabeledQuery(query="q1", relevant_ids=["a"], category="conceptual"),
            LabeledQuery(query="q2", relevant_ids=["b"], category="keyword"),
        ]
        report = evaluate_retrieval(queries, lambda q: ["a", "b"])
        by_cat = report.by_category()
        assert set(by_cat.keys()) == {"conceptual", "keyword"}
        assert by_cat["conceptual"].query_count == 1

    def test_summary_is_json_serializable(self):
        queries = [LabeledQuery(query="q1", relevant_ids=["a"])]
        report = evaluate_retrieval(queries, lambda q: ["a"])
        json.dumps(report.summary())  # raises if not serializable


class TestLoadLabeledQueries:
    def test_loads_valid_file(self, tmp_path):
        path = tmp_path / "queries.json"
        path.write_text(
            json.dumps(
                [
                    {"query": "what is paging", "relevant_ids": ["c1", "c2"], "category": "conceptual"},
                    {"query": "vLLM", "relevant_ids": ["c3"]},
                ]
            )
        )
        queries = load_labeled_queries(path)
        assert len(queries) == 2
        assert queries[0].query == "what is paging"
        assert queries[0].relevant_ids == ["c1", "c2"]
        assert queries[0].category == "conceptual"
        assert queries[1].category == ""

    def test_rejects_non_array_root(self, tmp_path):
        path = tmp_path / "bad.json"
        path.write_text(json.dumps({"query": "x"}))
        try:
            load_labeled_queries(path)
            assert False, "expected ValueError"
        except ValueError:
            pass

    def test_rejects_entry_missing_query(self, tmp_path):
        path = tmp_path / "bad.json"
        path.write_text(json.dumps([{"relevant_ids": ["a"]}]))
        try:
            load_labeled_queries(path)
            assert False, "expected ValueError"
        except ValueError:
            pass
