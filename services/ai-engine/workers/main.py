# AI Engine Worker - for background processing
# This worker handles source ingestion and issue generation tasks

import asyncio
import logging
import os
import json
import time
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.services.model_service import ModelService
from app.rag.chunking.text_splitter import chunking_service
from app.rag.embeddings.qdrant import qdrant_service
from app.visuals.visual_service import visual_service

logging.basicConfig(level=settings.LOG_LEVEL.upper())
logger = logging.getLogger(__name__)

class AIWorker:
    """Worker for AI background tasks including ingestion and generation"""
    
    def __init__(self):
        self.db_engine = create_async_engine(settings.DATABASE_URL)
        self.db_session = sessionmaker(
            self.db_engine, class_=AsyncSession, expire_on_commit=False
        )
        self.model_service = ModelService()
        self.running = False
        
    async def start(self):
        """Start the AI worker"""
        self.running = True
        logger.info("AI Worker started")
        
        # Ensure Qdrant collection exists
        qdrant_service.ensure_collection(settings.EMBEDDING_DIMENSION)
        
        while self.running:
            # Check for pending tasks
            await self._check_ingestion_tasks()
            await self._check_generation_tasks()
            await asyncio.sleep(1)
            
    async def stop(self):
        """Stop the AI worker"""
        self.running = False
        await self.db_engine.dispose()
        logger.info("AI Worker stopped")
        
    async def _check_ingestion_tasks(self):
        """Check for pending ingestion tasks"""
        # This would normally check a message queue or database
        # For now, we just poll
        pass
        
    async def _check_generation_tasks(self):
        """Check for pending generation tasks"""
        # This would normally check a message queue or database
        pass
        
    async def process_ingestion(self, source_id: str):
        """Process a source ingestion run"""
        async with self.db_session() as db:
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
            source = await db.get(Source, source_id)
            if not source:
                raise ValueError(f"Source not found: {source_id}")
            
            content = await self._fetch_source(source)
            
            # Update status to parsing
            ingestion_run.status = "parsing"
            await db.commit()
            
            # Parse content
            parsed_text = self._parse_content(source.type, content)
            
            # Update status to chunking
            ingestion_run.status = "chunking"
            await db.commit()
            
            # Chunk content
            chunks = chunking_service.chunk_document(parsed_text)
            
            # Save chunks
            for chunk_data in chunks:
                chunk = SourceChunk(
                    source_version_id=source_id,
                    index=chunk_data['index'],
                    text=chunk_data['content'],
                    token_count=chunk_data['token_count'],
                    heading_path=chunk_data.get('heading_path', []),
                    checksum=chunk_data.get('checksum', ''),
                    created_by=source.created_by,
                )
                db.add(chunk)
            
            # Update status to embedding
            ingestion_run.status = "embedding"
            await db.commit()
            
            # Generate embeddings
            texts = [chunk['content'] for chunk in chunks]
            embeddings = self.model_service.get_embeddings(texts)
            
            # Update status to indexing
            ingestion_run.status = "indexing"
            await db.commit()
            
            # Upsert chunks in Qdrant
            await qdrant_service.upsert_chunks(chunks, embeddings)
            
            # Update status to ready
            ingestion_run.status = "ready"
            ingestion_run.completed_at = time.time()
            await db.commit()
            
            logger.info(f"Source ingestion completed: {source_id}")
            
if __name__ == "__main__":
    worker = AIWorker()
    asyncio.run(worker.start())
