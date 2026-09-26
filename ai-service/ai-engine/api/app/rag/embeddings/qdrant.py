"""Embeddings service for RAG pipeline.
Handles embedding generation and Qdrant storage.
"""

from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models as rest
from qdrant_client.http.models import Distance, VectorParams
import logging
import time
import uuid

from app.core.config import settings
from app.rag.sparse import SparseVector as LocalSparseVector, encode_sparse, reciprocal_rank_fusion

logger = logging.getLogger(__name__)

COLLECTION_NAME = "newsletter_chunks_dense_v1"

# Named vector keys inside the hybrid collection (a point carries both).
DENSE_VECTOR_NAME = "dense"
SPARSE_VECTOR_NAME = "sparse"


class QdrantService:
    """Service for interacting with Qdrant vector database."""

    def __init__(self, qdrant_url: Optional[str] = None, api_key: Optional[str] = None):
        self.qdrant_url = qdrant_url or settings.QDRANT_URL
        self.client = QdrantClient(url=self.qdrant_url, api_key=api_key or settings.QDRANT_API_KEY)
        self.collection_name = settings.QDRANT_COLLECTION_NAME or COLLECTION_NAME

    def ensure_collection(self, embedding_dim: Optional[int] = None, retries: int = 15, delay_seconds: float = 2.0) -> bool:
        """Create collection if it doesn't exist, retrying until Qdrant is reachable."""
        last_error: Exception | None = None
        for attempt in range(1, retries + 1):
            try:
                collections = self.client.get_collections()
                collection_names = [c.name for c in collections.collections]

                if self.collection_name not in collection_names:
                    embedding_dim = embedding_dim or settings.EMBEDDING_DIMENSION
                    self.client.recreate_collection(
                        collection_name=self.collection_name,
                        vectors_config=VectorParams(
                            size=embedding_dim,
                            distance=Distance.COSINE,
                        )
                    )
                    logger.info("Created collection: %s", self.collection_name)
                    self._create_payload_indexes()

                return True
            except Exception as e:
                last_error = e
                logger.warning(
                    "Qdrant not ready at %s (attempt %d/%d): %s",
                    self.qdrant_url,
                    attempt,
                    retries,
                    e,
                )
                time.sleep(delay_seconds)

        raise last_error or RuntimeError("Failed to connect to Qdrant")

    def ensure_hybrid_collection(
        self, collection_name: str, embedding_dim: int = 2048, retries: int = 15, delay_seconds: float = 2.0
    ) -> bool:
        """Create a hybrid (dense + sparse) collection if it doesn't exist.

        Separate from ensure_collection/COLLECTION_NAME on purpose: an
        existing single-dense-vector collection can't be altered in place
        to add a named sparse vector, so hybrid search ships as a new,
        independently versioned collection per plan.md's "dual-write/
        reindex migration rather than in-place silent mutation." The
        ingestion worker populates it (when HYBRID_SEARCH_ENABLED) and
        hybrid_search() queries it; generation still retrieves from the
        dense collection until it is switched over deliberately.
        """
        last_error: Exception | None = None
        for attempt in range(1, retries + 1):
            try:
                collections = self.client.get_collections()
                collection_names = [c.name for c in collections.collections]

                if collection_name not in collection_names:
                    self.client.create_collection(
                        collection_name=collection_name,
                        vectors_config={
                            DENSE_VECTOR_NAME: VectorParams(
                                size=embedding_dim,
                                distance=Distance.COSINE,
                            ),
                        },
                        sparse_vectors_config={
                            SPARSE_VECTOR_NAME: rest.SparseVectorParams(
                                index=rest.SparseIndexParams(on_disk=False),
                            ),
                        },
                    )
                    logger.info("Created hybrid collection: %s", collection_name)
                    self._create_payload_indexes(collection_name=collection_name)

                return True
            except Exception as e:
                last_error = e
                logger.warning(
                    "Qdrant not ready at %s (attempt %d/%d): %s",
                    self.qdrant_url,
                    attempt,
                    retries,
                    e,
                )
                time.sleep(delay_seconds)

        raise last_error or RuntimeError("Failed to connect to Qdrant")

    def _create_payload_indexes(self, collection_name: Optional[str] = None):
        """Create payload indexes for efficient filtering."""
        target = collection_name or self.collection_name
        indexes = [
            ("workspace_id", "keyword"),
            ("series_id", "keyword"),
            ("source_id", "keyword"),
            ("source_version_id", "keyword"),
            ("chunk_id", "keyword"),
            ("active", "bool"),
        ]

        for field, schema in indexes:
            try:
                self.client.create_payload_index(
                    collection_name=target,
                    field_name=field,
                    field_schema=rest.PayloadSchemaType(schema),
                )
                logger.info("Created payload index: %s", field)
            except Exception as e:
                logger.warning("Failed to create payload index %s: %s", field, e)

    def upsert_chunks(self, chunks: List[Dict], embeddings: List[List[float]]) -> Any:
        """Upsert chunks with embeddings to Qdrant."""
        points = []

        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            point_id = self._generate_deterministic_id(
                chunk.get("source_version_id", ""),
                chunk.get("index", i),
                "dense-v1",
            )

            point = rest.PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "workspace_id": chunk.get("workspace_id", ""),
                    "series_id": chunk.get("series_id", ""),
                    "source_id": chunk.get("source_id", ""),
                    "source_version_id": chunk.get("source_version_id", ""),
                    "chunk_id": chunk.get("id", ""),
                    "chunk_index": chunk.get("index", i),
                    "title": chunk.get("title", ""),
                    "section_path": chunk.get("heading_path", []),
                    "language": chunk.get("language", "en"),
                    "source_type": chunk.get("source_type", ""),
                    "published_at": chunk.get("published_at", ""),
                    "content_hash": chunk.get("checksum", ""),
                    "embedding_version": "dense-v1",
                    "visibility": chunk.get("visibility", "series"),
                    "active": True,
                    "text_preview": (chunk.get("content") or chunk.get("text") or "")[:500],
                    "content": (chunk.get("content") or chunk.get("text") or "")[:2000],
                },
            )
            points.append(point)

        result = self.client.upsert(
            collection_name=self.collection_name,
            points=points,
        )

        logger.info("Upserted %d points to Qdrant", len(points))
        return result

    def upsert_chunks_hybrid(
        self, collection_name: str, chunks: List[Dict], embeddings: List[List[float]]
    ) -> Any:
        """Upsert chunks with both dense and sparse vectors into a hybrid
        collection (see ensure_hybrid_collection). Point IDs and payload
        mirror upsert_chunks so the same chunk is addressable the same way
        in either collection; embedding_version is tagged "hybrid-v1" to
        distinguish these points from the dense-only collection's.

        Callers control whether this runs at all (see
        settings.HYBRID_SEARCH_ENABLED) — this method itself always writes
        when called, it doesn't check the flag.
        """
        points = []

        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            point_id = self._generate_deterministic_id(
                chunk.get("source_version_id", ""),
                chunk.get("index", i),
                "hybrid-v1",
            )
            text = chunk.get("content") or chunk.get("text") or ""
            sparse_vector = encode_sparse(text)

            point = rest.PointStruct(
                id=point_id,
                vector={
                    DENSE_VECTOR_NAME: embedding,
                    SPARSE_VECTOR_NAME: self.to_qdrant_sparse_vector(sparse_vector),
                },
                payload={
                    "workspace_id": chunk.get("workspace_id", ""),
                    "series_id": chunk.get("series_id", ""),
                    "source_id": chunk.get("source_id", ""),
                    "source_version_id": chunk.get("source_version_id", ""),
                    "chunk_id": chunk.get("id", ""),
                    "chunk_index": chunk.get("index", i),
                    "title": chunk.get("title", ""),
                    "section_path": chunk.get("heading_path", []),
                    "language": chunk.get("language", "en"),
                    "source_type": chunk.get("source_type", ""),
                    "published_at": chunk.get("published_at", ""),
                    "content_hash": chunk.get("checksum", ""),
                    "embedding_version": "hybrid-v1",
                    "visibility": chunk.get("visibility", "series"),
                    "active": True,
                    "text_preview": text[:500],
                    "content": text[:2000],
                },
            )
            points.append(point)

        result = self.client.upsert(
            collection_name=collection_name,
            points=points,
        )

        logger.info("Upserted %d hybrid points to %s", len(points), collection_name)
        return result

    def _build_tenant_filter(
        self,
        workspace_id: str,
        series_id: Optional[str] = None,
        source_id: Optional[str] = None,
    ) -> rest.Filter:
        """Mandatory workspace/active filter, shared by search and
        hybrid_search so both enforce tenant isolation identically."""
        must_conditions = [
            rest.FieldCondition(
                key="workspace_id",
                match=rest.MatchValue(value=workspace_id),
            ),
            rest.FieldCondition(
                key="active",
                match=rest.MatchValue(value=True),
            ),
        ]

        if series_id:
            must_conditions.append(
                rest.FieldCondition(
                    key="series_id",
                    match=rest.MatchValue(value=series_id),
                )
            )

        if source_id:
            must_conditions.append(
                rest.FieldCondition(
                    key="source_id",
                    match=rest.MatchValue(value=source_id),
                )
            )

        return rest.Filter(must=must_conditions)

    def search(
        self,
        query_embedding: List[float],
        workspace_id: str,
        series_id: Optional[str] = None,
        source_id: Optional[str] = None,
        top_k: int = 20,
    ) -> List[Dict]:
        """Search for similar chunks with mandatory workspace filter."""
        search_result = self.client.search(
            collection_name=self.collection_name,
            query_vector=query_embedding,
            query_filter=self._build_tenant_filter(workspace_id, series_id, source_id),
            limit=top_k,
        )

        # Format results
        results = []
        for hit in search_result:
            results.append({
                "score": hit.score,
                "payload": hit.payload,
                "id": hit.id,
                "vector": hit.vector,
            })

        return results

    def hybrid_search(
        self,
        collection_name: str,
        query_embedding: List[float],
        query_text: str,
        workspace_id: str,
        series_id: Optional[str] = None,
        source_id: Optional[str] = None,
        top_k: int = 20,
        candidate_k: int = 40,
    ) -> List[Dict]:
        """Dense + sparse search against a hybrid collection, fused with
        Reciprocal Rank Fusion (see plan.md's Update 1 retrieval section).

        Runs both named-vector searches with the same mandatory tenant
        filter as `search`, fuses their rankings by point ID, then returns
        full point payloads in fused order. candidate_k controls how many
        candidates each individual search contributes before fusion — wider
        than top_k so RRF has enough overlap to work with.
        """
        query_filter = self._build_tenant_filter(workspace_id, series_id, source_id)

        dense_hits = self.client.search(
            collection_name=collection_name,
            query_vector=rest.NamedVector(name=DENSE_VECTOR_NAME, vector=query_embedding),
            query_filter=query_filter,
            limit=candidate_k,
        )
        sparse_vector = encode_sparse(query_text)
        sparse_hits = []
        if sparse_vector.indices:
            sparse_hits = self.client.search(
                collection_name=collection_name,
                query_vector=rest.NamedSparseVector(
                    name=SPARSE_VECTOR_NAME,
                    vector=self.to_qdrant_sparse_vector(sparse_vector),
                ),
                query_filter=query_filter,
                limit=candidate_k,
            )

        by_id = {str(hit.id): hit for hit in dense_hits}
        by_id.update({str(hit.id): hit for hit in sparse_hits})

        fused_ids = reciprocal_rank_fusion(
            [
                [str(hit.id) for hit in dense_hits],
                [str(hit.id) for hit in sparse_hits],
            ]
        )

        results = []
        for point_id in fused_ids[:top_k]:
            hit = by_id[point_id]
            results.append({
                "score": hit.score,
                "payload": hit.payload,
                "id": hit.id,
                "vector": hit.vector,
            })
        return results

    def delete_by_source_version(self, source_version_id: str) -> bool:
        """Delete points by source version ID."""
        result = self.client.delete(
            collection_name=self.collection_name,
            points_selector=rest.PointIdsList(
                points=self._list_chunk_ids(source_version_id)
            ),
        )

        logger.info("Deleted points for source version: %s", source_version_id)
        return result

    def delete_by_filter(self, workspace_id: str, source_version_id: str) -> bool:
        """Delete points by filter."""
        result = self.client.delete(
            collection_name=self.collection_name,
            points_selector=rest.FilterSelector(
                filter=rest.Filter(
                    must=[
                        rest.FieldCondition(
                            key="workspace_id",
                            match=rest.MatchValue(value=workspace_id),
                        ),
                        rest.FieldCondition(
                            key="source_version_id",
                            match=rest.MatchValue(value=source_version_id),
                        ),
                    ]
                )
            ),
        )

        logger.info(
            "Deleted points for workspace: %s, source version: %s",
            workspace_id,
            source_version_id,
        )
        return result

    def _generate_deterministic_id(
        self, source_version_id: str, chunk_index: int, embedding_version: str
    ) -> str:
        """Deterministic point ID, so re-ingesting a version overwrites its
        points instead of duplicating them. Qdrant only accepts unsigned
        ints or UUIDs as IDs, hence uuid5 rather than a raw hash digest."""
        raw = f"{source_version_id}:{chunk_index}:{embedding_version}"
        return str(uuid.uuid5(uuid.NAMESPACE_URL, raw))

    @staticmethod
    def to_qdrant_sparse_vector(vector: LocalSparseVector) -> rest.SparseVector:
        """Convert app.rag.sparse.SparseVector to the Qdrant client's type."""
        return rest.SparseVector(indices=vector.indices, values=vector.values)

    def _list_chunk_ids(self, source_version_id: str) -> List[str]:
        """List chunk IDs for a given source version."""
        scroll_result = self.client.scroll(
            collection_name=self.collection_name,
            scroll_filter=rest.Filter(
                must=[
                    rest.FieldCondition(
                        key="source_version_id",
                        match=rest.MatchValue(value=source_version_id),
                    ),
                ]
            ),
            limit=10000,
        )

        chunk_ids = [p.id for p in scroll_result[0]]
        return chunk_ids


# Singleton instance
qdrant_service = QdrantService()
