"""Ingestion worker for RAG pipeline
Handles source ingestion, chunking, and embedding
"""

from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
import logging
import uuid
import time

from app.core.config import settings
from app.services.model_service import ModelService
from app.models.rag import IngestionRun, SourceVersion, SourceChunk
from app.rag.chunking.text_splitter import chunking_service
from app.rag.embeddings.qdrant import qdrant_service

logger = logging.getLogger(__name__)

class IngestionWorker:
    """Worker for RAG ingestion pipeline"""
    
    def __init__(self, model_service: ModelService):
        self.model_service = model_service
        self.running = False
    
    async def start(self):
        """Start the ingestion worker background process"""
        self.running = True
        logger.info("Ingestion worker started")
        
        while self.running:
            # Check for pending ingestion runs
            # This would normally poll a message queue or database
            await self._process_pending_ingestions()
            await asyncio.sleep(5)
    
    async def stop(self):
        """Stop the ingestion worker"""
        self.running = False
        logger.info("Ingestion worker stopped")
    
    async def process_source_ingestion(self, source_id: str, db: AsyncSession):
        """Process a source ingestion run"""
        try:
            # Create ingestion run
            ingestion_run = IngestionRun(
                source_version_id=source_id,
                pipeline_version="v1",
                status="pending",
            )
            db.add(ingestion_run)
            await db.commit()
            await db.refresh(ingestion_run)
            
            # Update status to fetching
            ingestion_run.status = "fetching"
            await db.commit()
            
            # Fetch source content
            content = await self._fetch_source(source_id, db)
            
            # Update status to parsing
            ingestion_run.status = "parsing"
            await db.commit()
            
            # Parse content
            parsed_text = self._parse_content(content)
            
            # Update status to chunking
            ingestion_run.status = "chunking"
            await db.commit()
            
            # Chunk content
            chunks = chunking_service.chunk_document(parsed_text)
            
            # Update status to embedding
            ingestion_run.status = "embedding"
            await db.commit()
            
            # Generate embeddings
            embeddings = self.model_service.get_embeddings([chunk["content"] for chunk in chunks])
            
            # Update status to indexing
            ingestion_run.status = "indexing"
            await db.commit()
            
            # Index chunks in Qdrant
            await qdrant_service.upsert_chunks(chunks, embeddings)
            
            # Update status to ready
            ingestion_run.status = "ready"
            ingestion_run.completed_at = time.time()
            await db.commit()
            
            logger.info(f"Source ingestion completed: {source_id}")
            
        except Exception as e:
            ingestion_run.status = "failed"
            ingestion_run.error_code = "INGESTION_FAILED"
            await db.commit()
            logger.error(f"Source ingestion failed: {e}")
            raise
