"""Retrieval pipeline for RAG
Handles dense retrieval with mandatory tenant filters
"""

from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models as rest
import logging

logger = logging.getLogger(__name__)

class RetrievalService:
    """Service for retrieval with mandatory tenant isolation"""
    
    def __init__(self, qdrant_url: str = "http://localhost:6333", api_key: Optional[str] = None):
        self.client = QdrantClient(url=qdrant_url, api_key=api_key)
        self.collection_name = "newsletter_chunks_dense_v1"
    
    def retrieve(self, 
                 query_embedding: List[float],
                 workspace_id: str,
                 series_id: Optional[str] = None,
                 source_id: Optional[str] = None,
                 top_k: int = 20,
                 score_threshold: Optional[float] = 0.0) -> List[Dict]:
        """
        Retrieve relevant chunks with mandatory workspace filter.
        Security: Every query MUST include workspace_id filter.
        """
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
        
        # Add optional filters
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
        
        # Perform search
        search_result = self.client.search(
            collection_name=self.collection_name,
            query_vector=query_embedding,
            query_filter=rest.Filter(
                must=must_conditions,
                must_not=[
                    rest.FieldCondition(
                        key="workspace_id",
                        match=rest.MatchExcept([workspace_id]),
                    ),
                ]
            ),
            limit=top_k,
            score_threshold=score_threshold,
            with_payload=True,
            with_vectors=False,
        )
        
        # Format and deduplicate results
        results = self._format_results(search_result)
        deduplicated = self._deduplicate_and_diversify(results, top_k)
        
        logger.info(f"Retrieved {len(deduplicated)} results for workspace {workspace_id}")
        return deduplicated
    
    def retrieve_preview(self,
                         query_embedding: List[float],
                         workspace_id: str,
                         series_id: str,
                         top_k: int = 10) -> List[Dict]:
        """Preview retrieval results for debugging"""
        results = self.retrieve(query_embedding, workspace_id, series_id, top_k=top_k)
        
        # Add redacted previews
        preview_results = []
        for result in results:
            preview = {
                "score": result["score"],
                "source_id": result.get("payload", {}).get("source_id", ""),
                "chunk_id": result.get("payload", {}).get("chunk_id", ""),
                "heading_path": result.get("payload", {}).get("section_path", []),
                "preview": self._redact_text(result.get("payload", {}).get("text_preview", "")),
            }
            preview_results.append(preview)
        
        return preview_results
    
    def _format_results(self, search_result) -> List[Dict]:
        """Format Qdrant search results"""
        results = []
        for hit in search_result:
            chunk = {
                "id": hit.id,
                "score": hit.score,
                "payload": hit.payload,
                "vector": hit.vector,
                "source_id": hit.payload.get("source_id", "") if hit.payload else "",
                "chunk_id": hit.payload.get("chunk_id", "") if hit.payload else "",
                "section_path": hit.payload.get("section_path", []) if hit.payload else [],
            }
            results.append(chunk)
        return results
    
    def _deduplicate_and_diversify(self, results: List[Dict], top_k: int) -> List[Dict]:
        """Deduplicate and diversify search results"""
        seen_chunks = set()
        seen_sources = set()
        diversified = []
        
        for result in results:
            chunk_id = result.get("chunk_id", "")
            source_id = result.get("source_id", "")
            
            # Skip duplicates
            if chunk_id in seen_chunks:
                continue
            seen_chunks.add(chunk_id)
            
            # Prefer source diversity when scores are comparable
            if source_id in seen_sources and len(seen_sources) < 3:
                continue
            seen_sources.add(source_id)
            
            diversified.append(result)
            
            if len(diversified) >= top_k:
                break
        
        return diversified
    
    def _redact_text(self, text: str, max_len: int = 100) -> str:
        """Redact sensitive text for logging"""
        if len(text) > max_len:
            return text[:max_len] + "..."
        return text

# Singleton instance
retrieval_service = RetrievalService()