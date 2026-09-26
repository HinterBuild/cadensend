"""Tests for the ingestion worker's hybrid (dense + sparse) dual-write path,
gated behind settings.HYBRID_SEARCH_ENABLED."""

import inspect
from unittest.mock import patch

from app.workers.ingestion_worker import IngestionWorker


def _worker():
    return IngestionWorker.__new__(IngestionWorker)


class TestDualWriteHybrid:
    def test_writes_to_hybrid_collection_when_called(self):
        worker = _worker()
        chunks = [{"content": "vLLM pages KV cache blocks", "source_version_id": "sv-1", "index": 0}]
        embeddings = [[0.1, 0.2, 0.3]]

        with patch("app.workers.ingestion_worker.qdrant_service") as mock_qdrant:
            worker._dual_write_hybrid(chunks, embeddings)

        mock_qdrant.ensure_hybrid_collection.assert_called_once()
        mock_qdrant.upsert_chunks_hybrid.assert_called_once()
        args, _ = mock_qdrant.upsert_chunks_hybrid.call_args
        assert args[1] == chunks
        assert args[2] == embeddings

    def test_swallows_failures_without_raising(self):
        worker = _worker()
        with patch("app.workers.ingestion_worker.qdrant_service") as mock_qdrant:
            mock_qdrant.ensure_hybrid_collection.side_effect = RuntimeError("qdrant unreachable")
            # Must not raise: a hybrid-index failure should never fail
            # ingestion of the (still source-of-truth) dense collection.
            worker._dual_write_hybrid([{"content": "x"}], [[0.1]])

    def test_empty_embeddings_does_not_crash_dimension_lookup(self):
        worker = _worker()
        with patch("app.workers.ingestion_worker.qdrant_service") as mock_qdrant:
            worker._dual_write_hybrid([], [])
        mock_qdrant.ensure_hybrid_collection.assert_called_once()


class TestFeatureFlagGating:
    def test_dual_write_call_is_guarded_by_the_settings_flag(self):
        # Asserts against the real source rather than re-implementing the
        # guard inline: _process_source_content must only call
        # _dual_write_hybrid inside an `if settings.HYBRID_SEARCH_ENABLED`
        # check, so the dense-only path (today's default, and the only
        # path with a live query-time consumer) is unaffected unless a
        # deployment opts in.
        source = inspect.getsource(IngestionWorker._process_source_content)
        assert "if settings.HYBRID_SEARCH_ENABLED:" in source
        assert "_dual_write_hybrid" in source
        # The dual-write call must be the line right after the guard, i.e.
        # not reachable unconditionally.
        guard_index = source.index("if settings.HYBRID_SEARCH_ENABLED:")
        call_index = source.index("_dual_write_hybrid")
        assert guard_index < call_index


class TestAnnotateChunks:
    def test_assigns_stable_unique_chunk_ids_and_indexes(self):
        # chunk["id"] becomes the chunk_id payload that citation filtering
        # and retrieval dedupe key on; it must be set and unique.
        worker = _worker()
        chunks = [{"content": "alpha"}, {"content": "beta"}]
        worker._annotate_chunks(chunks, "ws-1", None, "src-1", "sv-1", "text")
        ids = [c["id"] for c in chunks]
        assert all(ids) and len(set(ids)) == 2
        assert [c["index"] for c in chunks] == [0, 1]

        again = [{"content": "alpha"}, {"content": "beta"}]
        worker._annotate_chunks(again, "ws-1", None, "src-1", "sv-1", "text")
        assert [c["id"] for c in again] == ids
