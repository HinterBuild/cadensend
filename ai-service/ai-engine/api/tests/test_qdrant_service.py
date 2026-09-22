"""Tests for the Qdrant embeddings service, focused on the hybrid
(dense + sparse) collection setup added for hybrid search."""

from unittest.mock import Mock, patch

from app.rag.embeddings.qdrant import DENSE_VECTOR_NAME, SPARSE_VECTOR_NAME, QdrantService
from app.rag.sparse import encode_sparse


def _mock_service_with_client():
    with patch("app.rag.embeddings.qdrant.QdrantClient") as mock_client_class:
        mock_client = Mock()
        mock_client_class.return_value = mock_client
        service = QdrantService()
        return service, mock_client


class TestEnsureHybridCollection:
    def test_creates_collection_with_named_dense_and_sparse_vectors(self):
        service, mock_client = _mock_service_with_client()
        mock_client.get_collections.return_value = Mock(collections=[])

        created = service.ensure_hybrid_collection("newsletter_chunks_hybrid_v1", embedding_dim=1536)

        assert created is True
        mock_client.create_collection.assert_called_once()
        _, kwargs = mock_client.create_collection.call_args
        assert kwargs["collection_name"] == "newsletter_chunks_hybrid_v1"
        assert DENSE_VECTOR_NAME in kwargs["vectors_config"]
        assert SPARSE_VECTOR_NAME in kwargs["sparse_vectors_config"]
        assert kwargs["vectors_config"][DENSE_VECTOR_NAME].size == 1536

    def test_does_not_recreate_existing_collection(self):
        service, mock_client = _mock_service_with_client()
        existing = Mock()
        existing.name = "newsletter_chunks_hybrid_v1"
        mock_client.get_collections.return_value = Mock(collections=[existing])

        created = service.ensure_hybrid_collection("newsletter_chunks_hybrid_v1")

        assert created is True
        mock_client.create_collection.assert_not_called()

    def test_original_dense_collection_setup_is_unaffected(self):
        # ensure_collection (the existing, live single-dense-vector path)
        # must keep using the plain recreate_collection call, unchanged by
        # the new hybrid path living alongside it.
        service, mock_client = _mock_service_with_client()
        mock_client.get_collections.return_value = Mock(collections=[])

        service.ensure_collection(embedding_dim=2048)

        mock_client.recreate_collection.assert_called_once()
        mock_client.create_collection.assert_not_called()


class TestSparseVectorConversion:
    def test_converts_local_sparse_vector_to_qdrant_type(self):
        local_vector = encode_sparse("vLLM pages KV cache blocks")
        qdrant_vector = QdrantService.to_qdrant_sparse_vector(local_vector)

        assert list(qdrant_vector.indices) == local_vector.indices
        assert list(qdrant_vector.values) == local_vector.values


class TestUpsertChunksHybrid:
    def test_points_carry_named_dense_and_sparse_vectors(self):
        service, mock_client = _mock_service_with_client()
        chunks = [
            {
                "id": "chk-1",
                "content": "vLLM pages KV cache blocks for throughput.",
                "source_version_id": "sv-1",
                "source_id": "src-1",
                "workspace_id": "ws-1",
                "index": 0,
            }
        ]
        embeddings = [[0.1, 0.2, 0.3]]

        service.upsert_chunks_hybrid("newsletter_chunks_hybrid_v1", chunks, embeddings)

        mock_client.upsert.assert_called_once()
        _, kwargs = mock_client.upsert.call_args
        assert kwargs["collection_name"] == "newsletter_chunks_hybrid_v1"
        points = kwargs["points"]
        assert len(points) == 1
        point = points[0]
        assert DENSE_VECTOR_NAME in point.vector
        assert SPARSE_VECTOR_NAME in point.vector
        assert point.vector[DENSE_VECTOR_NAME] == [0.1, 0.2, 0.3]
        assert point.payload["embedding_version"] == "hybrid-v1"
        assert point.payload["chunk_id"] == "chk-1"
        assert point.payload["source_id"] == "src-1"

    def test_point_id_differs_from_dense_only_collection(self):
        # Same chunk indexed into both collections must get different point
        # IDs (they're tagged with different embedding_version strings),
        # otherwise deleting one collection's points by ID could collide
        # with the other's.
        service, _ = _mock_service_with_client()
        dense_id = service._generate_deterministic_id("sv-1", 0, "dense-v1")
        hybrid_id = service._generate_deterministic_id("sv-1", 0, "hybrid-v1")
        assert dense_id != hybrid_id

    def test_hybrid_collection_is_untouched_by_dense_only_upsert(self):
        service, mock_client = _mock_service_with_client()
        chunks = [{"content": "x", "source_version_id": "sv-1", "index": 0}]
        service.upsert_chunks(chunks, [[0.1, 0.2]])

        _, kwargs = mock_client.upsert.call_args
        assert kwargs["collection_name"] == service.collection_name
        assert kwargs["collection_name"] != "newsletter_chunks_hybrid_v1"


def _mock_hit(hit_id: str, score: float, payload: dict | None = None):
    hit = Mock()
    hit.id = hit_id
    hit.score = score
    hit.payload = payload or {"chunk_id": hit_id}
    hit.vector = None
    return hit


class TestDenseSearchUnaffectedByRefactor:
    """search() was refactored to share _build_tenant_filter with
    hybrid_search(); these confirm its externally observable behavior
    (query, filter, results) is identical to before."""

    def test_search_still_enforces_workspace_filter(self):
        service, mock_client = _mock_service_with_client()
        mock_client.search.return_value = [_mock_hit("p1", 0.9)]

        service.search([0.1, 0.2], workspace_id="ws-1")

        _, kwargs = mock_client.search.call_args
        conditions = kwargs["query_filter"].must
        assert any(
            c.key == "workspace_id" and c.match.value == "ws-1" for c in conditions
        )
        assert any(c.key == "active" and c.match.value is True for c in conditions)

    def test_search_still_returns_score_payload_id_vector_shape(self):
        service, mock_client = _mock_service_with_client()
        mock_client.search.return_value = [_mock_hit("p1", 0.9, {"chunk_id": "c1"})]

        results = service.search([0.1, 0.2], workspace_id="ws-1")

        assert results == [{"score": 0.9, "payload": {"chunk_id": "c1"}, "id": "p1", "vector": None}]


class TestHybridSearch:
    def test_queries_both_named_vectors_with_same_tenant_filter(self):
        service, mock_client = _mock_service_with_client()
        mock_client.search.side_effect = [
            [_mock_hit("p1", 0.9), _mock_hit("p2", 0.8)],  # dense
            [_mock_hit("p2", 5.0), _mock_hit("p3", 4.0)],  # sparse
        ]

        service.hybrid_search(
            "newsletter_chunks_hybrid_v1",
            query_embedding=[0.1, 0.2],
            query_text="paged attention",
            workspace_id="ws-1",
        )

        assert mock_client.search.call_count == 2
        for call in mock_client.search.call_args_list:
            _, kwargs = call
            assert kwargs["collection_name"] == "newsletter_chunks_hybrid_v1"
            conditions = kwargs["query_filter"].must
            assert any(c.key == "workspace_id" and c.match.value == "ws-1" for c in conditions)

    def test_fuses_and_ranks_agreement_first(self):
        service, mock_client = _mock_service_with_client()
        mock_client.search.side_effect = [
            [_mock_hit("p1", 0.9), _mock_hit("p2", 0.8)],  # dense: p1 first
            [_mock_hit("p2", 5.0), _mock_hit("p1", 4.0)],  # sparse: p2 first
        ]

        results = service.hybrid_search(
            "newsletter_chunks_hybrid_v1",
            query_embedding=[0.1, 0.2],
            query_text="paged attention",
            workspace_id="ws-1",
        )

        result_ids = [r["id"] for r in results]
        # Both p1 and p2 appear near the top of both lists, so RRF should
        # rank them ahead of anything appearing in only one list.
        assert set(result_ids) == {"p1", "p2"}

    def test_skips_sparse_search_when_query_has_no_tokens(self):
        service, mock_client = _mock_service_with_client()
        mock_client.search.return_value = [_mock_hit("p1", 0.9)]

        service.hybrid_search(
            "newsletter_chunks_hybrid_v1",
            query_embedding=[0.1, 0.2],
            query_text="the a an",  # all stopwords -> empty sparse vector
            workspace_id="ws-1",
        )

        # Only the dense search call, since the sparse vector was empty.
        assert mock_client.search.call_count == 1

    def test_respects_top_k_after_fusion(self):
        service, mock_client = _mock_service_with_client()
        mock_client.search.side_effect = [
            [_mock_hit(f"d{i}", 1.0 - i * 0.01) for i in range(10)],
            [_mock_hit(f"s{i}", 10.0 - i) for i in range(10)],
        ]

        results = service.hybrid_search(
            "newsletter_chunks_hybrid_v1",
            query_embedding=[0.1],
            query_text="vllm paging",
            workspace_id="ws-1",
            top_k=3,
        )

        assert len(results) == 3
