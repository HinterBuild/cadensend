"""Tests for retrieval service."""

from unittest.mock import Mock, patch
from app.rag.retrieval.retrieval import RetrievalService


def test_retrieve_returns_results():
    """Test that retrieve returns results with scores."""
    with patch('app.rag.retrieval.retrieval.QdrantClient') as mock_client_class:
        mock_client = Mock()
        mock_client_class.return_value = mock_client

        mock_hit = Mock()
        mock_hit.score = 0.95
        mock_hit.id = "point-1"
        mock_hit.payload = {
            "source_id": "src-1",
            "chunk_id": "chunk-1",
            "section_path": ["Section 1"],
        }
        mock_hit.vector = [0.1, 0.2, 0.3]
        mock_client.search.return_value = [mock_hit]

        service = RetrievalService()
        results = service.retrieve([0.1, 0.2, 0.3], workspace_id="ws_001")

        assert len(results) == 1
        assert results[0]["score"] == 0.95
        assert results[0]["payload"]["source_id"] == "src-1"


def test_retrieve_mandatory_workspace_filter():
    """Test that workspace_id is always included in filters."""
    with patch('app.rag.retrieval.retrieval.QdrantClient') as mock_client_class:
        mock_client = Mock()
        mock_client_class.return_value = mock_client
        mock_client.search.return_value = []

        service = RetrievalService()
        service.retrieve([0.1, 0.2, 0.3], workspace_id="ws_001", series_id="series-1")

        _, kwargs = mock_client.search.call_args
        query_filter = kwargs.get('query_filter')

        assert query_filter is not None
        assert len(query_filter.must) >= 2  # workspace_id + active


def test_retrieve_with_optional_filters():
    """Test that optional filters are applied correctly."""
    with patch('app.rag.retrieval.retrieval.QdrantClient') as mock_client_class:
        mock_client = Mock()
        mock_client_class.return_value = mock_client
        mock_client.search.return_value = []

        service = RetrievalService()
        service.retrieve([0.1, 0.2, 0.3], workspace_id="ws_001", series_id="series-1", top_k=5)

        _, kwargs = mock_client.search.call_args
        assert kwargs.get('limit') == 5


def test_deduplicate_results():
    """Test that duplicate chunks are removed."""
    service = RetrievalService.__new__(RetrievalService)

    results = [
        {"id": "1", "score": 0.95, "chunk_id": "chunk-1", "source_id": "src-1"},
        {"id": "2", "score": 0.90, "chunk_id": "chunk-1", "source_id": "src-1"},  # Duplicate
        {"id": "3", "score": 0.85, "chunk_id": "chunk-2", "source_id": "src-2"},
    ]

    deduped = service._deduplicate_and_diversify(results, 10)
    assert len(deduped) == 2  # Duplicate removed


def test_format_results():
    """Test that results are formatted correctly."""
    service = RetrievalService.__new__(RetrievalService)

    mock_hit = Mock()
    mock_hit.id = "point-1"
    mock_hit.score = 0.95
    mock_hit.payload = {"source_id": "src-1", "chunk_id": "chunk-1"}
    mock_hit.vector = [0.1, 0.2]

    formatted = service._format_results([mock_hit])

    assert formatted[0]["score"] == 0.95
    assert formatted[0]["source_id"] == "src-1"
    assert formatted[0]["payload"] == mock_hit.payload
