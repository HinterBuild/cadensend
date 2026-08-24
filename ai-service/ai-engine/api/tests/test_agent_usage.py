"""Unit tests for token-usage aggregation in the LangGraph agent helpers."""

import unittest
from types import SimpleNamespace

from app.services.agent_graph import _aggregate_usage


class UsageAggregationTests(unittest.TestCase):
    def test_sums_usage_metadata_across_turns(self):
        messages = [
            SimpleNamespace(usage_metadata={"input_tokens": 120, "output_tokens": 40}),
            SimpleNamespace(usage_metadata=None),
            SimpleNamespace(usage_metadata={"input_tokens": 80, "output_tokens": 60}),
        ]
        usage = _aggregate_usage(messages)
        self.assertEqual(usage["input_tokens"], 200)
        self.assertEqual(usage["output_tokens"], 100)

    def test_empty_messages(self):
        usage = _aggregate_usage([])
        self.assertEqual(usage, {"input_tokens": 0, "output_tokens": 0})

    def test_missing_usage_metadata(self):
        usage = _aggregate_usage([SimpleNamespace(usage_metadata=None)])
        self.assertEqual(usage["input_tokens"], 0)


if __name__ == "__main__":
    unittest.main()
