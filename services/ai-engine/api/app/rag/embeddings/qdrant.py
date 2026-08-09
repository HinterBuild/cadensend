"""Embeddings service for RAG pipeline
Handles embedding generation and Qdrant storage
"""

from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models as rest
from qdrant_client.http.models import Distance, VectorParams, PayloadSchemaType
import hashlib
import logging

logger = logging.getLogger(__name__)

class QdrantService:
    """Service for interacting with Qdrant vector database"""
    
    def __init__(self, qdrant_url: str = "http://localhost:6333", api_key: Optional[str] = None):
        self.client = QdrantClient(url=qdrant_url, api_key=api_key)
        self.collection_name = "newsletter_chunks_dense_v1"
    
    def ensure_collection(self, embedding_dim: int = 2048):
        """Create collection if it doesn't exist"""
        collections = self.client.get_collections()
        collection_names = [c.name for c in collections.collections]
        
        if self.collection_name not in collection_names:
            self.client.recreate_collection(
                collection_name=self.collection_name,
                vectors=VectorParams(
                    size=embedding_dim,
                    distance=Distance.COSINE,
                )
            )
            logger.info(f"Created collection: {self.collection_name}")
            
            # Create payload indexes
            self._create_payload_indexes()
        
        return True
    
    def _create_payload_indexes(self):
        """Create payload indexes for efficient filtering"""
        indexes = [
            ("workspace_id", "keyword"),
            ("series_id", "keyword"),
            ("source_id", "keyword"),
            ("source_version_id", "keyword"),
            ("chunk_id", "keyword"),
            ("active", "boolean"),
        ]
        
        for field, schema in indexes:
            try:
                self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name=field,
                    field_schema=rest.PayloadSchemaType.KEYWORD,
                )
                logger.info(f"Created payload index: {field}")
            except Exception as e:
                logger.warning(f"Failed to create payload index {field}: {e}")
    
    def upsert_chunks(self, chunks: List[Dict], embeddings: List[List[float]]):
        """Upsert chunks with embeddings to Qdrant"""
        points = []
        
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            # Generate deterministic point ID
            point_id = self._generate_deterministic_id(
                chunk.get('source_version_id', ''),
                chunk.get('index', i),
                'dense-v1'
            )
            
            point = rest.PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "workspace_id": chunk.get('workspace_id', ''),
                    "series_id": chunk.get('series_id', ''),
                    "source_id": chunk.get('source_id', ''),
                    "source_version_id": chunk.get('source_version_id', ''),
                    "chunk_id": chunk.get('id', ''),
                    "chunk_index": chunk.get('index', i),
                    "title": chunk.get('title', ''),
                    "section_path": chunk.get('heading_path', []),
                    "language": chunk.get('language', 'en'),
                    "source_type": chunk.get('source_type', ''),
                    "published_at": chunk.get('published_at', ''),
                    "content_hash": chunk.get('checksum', ''),
                    "embedding_version": "dense-v1",
                    "visibility": chunk.get('visibility', 'series'),
                    "active": True,
                }
            )
            points.append(point)
        
        result = self.client.upsert(
            collection_name=self.collection_name,
            points=points,
        )
        
        logger.info(f"Upserted {len(points)} points to Qdrant")
        return result
    
    def search(self, 
               query_embedding: List[float],
               workspace_id: str,
               series_id: Optional[str] = None,
               source_id: Optional[str] = None,
               top_k: int = 20) -> List[Dict]:
        """Search for similar chunks with mandatory workspace filter"""
        # Build mandatory filters
        must_conditions = [
            rest.FieldCondition(
                key="workspace_id",
                match=rest.MatchValue(workspace_id),
            ),
            rest.FieldCondition(
                key="active",
                match=rest.MatchValue(True),
            ),
        ]
        
        if series_id:
            must_conditions.append(rest.FieldCondition(
                key="series_id",
                match=rest.MatchValue(series_id),
            ))
        
        if source_id:
            must_conditions.append(rest.FieldCondition(
                key="source_id",
                match=rest.MatchValue(source_id),
            ))
        
        search_result = self.client.search(
            collection_name=self.collection_name,
            query_vector=query_embedding,
            query_filter=rest.Filter(must=must_conditions),
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
    
    def delete_by_source_version(self, source_version_id: str) -> bool:
        """Delete points by source version ID"""
        result = self.client.delete(
            collection_name=self.collection_name,
            points_selector=rest.PointIdsList(
                points=self._list_chunk_ids(source_version_id)
            ),
        )
        
        logger.info(f"Deleted points for source version: {source_version_id}")
        return True
    
    def delete_by_filter(self, workspace_id: str, source_version_id: str) -> bool:
        """Delete points by filter"""
        result = self.client.delete(
            collection_name=self.collection_name,
            points_selector=rest.FilterSelector(
                filter=rest.Filter(
                    must=[
                        rest.FieldCondition(
                            key="workspace_id",
                            match=rest.MatchValue(workspace_id),
                        ),
                        rest.FieldCondition(
                            key="source_version_id",
                            match=rest.MatchValue(source_version_id),
                        ),
                    ]
                )
            ),
        )
        
        logger.info(f"Deleted points for workspace: {workspace_id}, source version: {source_version_id}")
        return True
    
    def _generate_deterministic_id(self, source_version_id: str, chunk_index: int, embedding_version: str) -> str:
        """Generate a deterministic point ID"""
        raw = f"{source_version_id}:{chunk_index}:{embedding_version}"
        return hashlib.sha256(raw.encode()).hexdigest()
    
    def _list_chunk_ids(self, source_version_id: str) -> List[str]:
        """List chunk IDs for a given source version"""
        scroll_result = self.client.scroll(
            collection_name=self.collection_name,
            scroll_filter=rest.Filter(
                must=[
                    rest.FieldCondition(
                        key="source_version_id",
                        match=rest.MatchValue(source_version_id),
                    ),
                ]
            ),
            limit=10000,
        )
        
        chunk_ids = [p.id for p in scroll_result[0]]
        return chunk_ids

# Singleton instance
qdrant_service = QdrantService()