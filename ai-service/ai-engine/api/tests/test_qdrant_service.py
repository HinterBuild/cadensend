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
