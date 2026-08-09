"""Ingestion worker for RAG pipeline
Handles source ingestion, chunking, and embedding
"""

from typing import Optional, List, Dict, Any
import asyncio
import logging
import time
import json
import hashlib
import uuid
import aiohttp
from bs4 import BeautifulSoup
from markitdown import MarkItDown

from app.core.config import settings
from app.services.model_service import ModelService
from app.schemas.rag import IngestionRun, IngestionCounts

logger = logging.getLogger(__name__)

# File extension to parser mapping
SUPPORTED_EXTENSIONS = {
    '.pdf': 'pdf',
    '.docx': 'docx',
    '.pptx': 'pptx',
    '.xlsx': 'xlsx',
    '.html': 'html',
    '.htm': 'html',
    '.txt': 'text',
    '.md': 'markdown',
    '.json': 'json',
    '.csv': 'csv',
}

class IngestionWorker:
    """Worker for RAG ingestion pipeline"""
    
    def __init__(self, model_service: ModelService = None):
        self.model_service = model_service or ModelService()
        self.running = False
        self._markitdown = MarkItDown()
        
    async def start(self):
        """Start the ingestion worker"""
        self.running = True
        logger.info("Ingestion worker started")
        
        while self.running:
            await asyncio.sleep(5)
            
    async def stop(self):
        """Stop the ingestion worker"""
        self.running = False
        logger.info("Ingestion worker stopped")
    
    async def process_url_source(self, url: str, workspace_id: str, series_id: Optional[str] = None) -> Dict[str, Any]:
        """Process a URL source for ingestion"""
        try:
            logger.info(f"Processing URL source: {url}")
            
            # Create source record
            source = await self._create_source_record(url, workspace_id, series_id, "website")
            version = await self._create_source_version(source.id)
            
            # Update version status
            await self._update_source_version_status(version.id, "fetching")
            
            # Fetch content
            content = await self._fetch_url(url)
            
            # Parse content
            await self._update_source_version_status(version.id, "parsing")
            parsed_text = self._parse_html(content)
            
            # Chunk content
            await self._update_source_version_status(version.id, "chunking")
            chunks = chunking_service.chunk_document(parsed_text)
            
            # Add metadata
            for chunk in chunks:
                chunk['workspace_id'] = workspace_id
                chunk['series_id'] = series_id
                chunk['source_id'] = source.id
                chunk['source_version_id'] = version.id
                chunk['source_type'] = "website"
                chunk['visibility'] = "series" if series_id else "workspace"
            
            # Generate embeddings
            await self._update_source_version_status(version.id, "embedding")
            texts = [chunk['content'] for chunk in chunks]
            embeddings = self.model_service.get_embeddings(texts)
            
            # Index in Qdrant
            await self._update_source_version_status(version.id, "indexing")
            qdrant_service.upsert_chunks(chunks, embeddings)
            
            # Update source status
            await self._update_source_version_status(version.id, "ready")
            await self._update_source_status(source.id, "ready")
            
            return {
                "source_id": source.id,
                "version_id": version.id,
                "total_chunks": len(chunks),
                "status": "complete"
            }
            
        except Exception as e:
            logger.error(f"URL ingestion failed: {e}")
            raise
    
    async def process_file_source(self, content: bytes, filename: str, workspace_id: str, series_id: Optional[str] = None) -> Dict[str, Any]:
        """Process a file source for ingestion"""
        try:
            ext = '.' + filename.split('.')[-1].lower()
            parser_type = SUPPORTED_EXTENSIONS.get(ext, 'text')
            
            logger.info(f"Processing file source: {filename} (type: {parser_type})")
            
            # Create source record
            source = await self._create_source_record(filename, workspace_id, series_id, parser_type)
            version = await self._create_source_version(source.id)
            
            # Update version status
            await self._update_source_version_status(version.id, "fetching")
            
            # Parse based on extension
            await self._update_source_version_status(version.id, "parsing")
            parsed_text = self._parse_file(content, parser_type, filename)
            
            # Chunk content
            await self._update_source_version_status(version.id, "chunking")
            chunks = chunking_service.chunk_document(parsed_text)
            
            # Add metadata
            for chunk in chunks:
                chunk['workspace_id'] = workspace_id
                chunk['series_id'] = series_id
                chunk['source_id'] = source.id
                chunk['source_version_id'] = version.id
                chunk['source_type'] = parser_type
                chunk['visibility'] = "series" if series_id else "workspace"
            
            # Generate embeddings
            await self._update_source_version_status(version.id, "embedding")
            texts = [chunk['content'] for chunk in chunks]
            embeddings = self.model_service.get_embeddings(texts)
            
            # Index in Qdrant
            await self._update_source_version_status(version.id, "indexing")
            qdrant_service.upsert_chunks(chunks, embeddings)
            
            # Update source status
            await self._update_source_version_status(version.id, "ready")
            await self._update_source_status(source.id, "ready")
            
            return {
                "source_id": source.id,
                "version_id": version.id,
                "total_chunks": len(chunks),
                "status": "complete"
            }
            
        except Exception as e:
            logger.error(f"File ingestion failed: {e}")
            raise
    
    async def _fetch_url(self, url: str) -> str:
        """Fetch content from a URL"""
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=60)) as response:
                content = await response.text()
                return content
    
    def _parse_html(self, html: str) -> str:
        """Parse HTML content and extract text"""
        soup = BeautifulSoup(html, 'html.parser')
        
        # Remove script and style elements
        for element in soup(["script", "style", "nav", "footer", "header"]):
            element.decompose()
        
        # Get text
        text = soup.get_text(separator="\n")
        
        # Extract metadata
        title = soup.title.string if soup.title else ""
        meta_description = ""
        meta_tag = soup.find("meta", attrs={"name": "description"})
        if meta_tag:
            meta_description = meta_tag.get("content", "")
        
        # Combine with title and description
        result = f"{title}\n\n{meta_description}\n\n{text}".strip()
        return result
    
    def _parse_file(self, content: bytes, parser_type: str, filename: str) -> str:
        """Parse file content based on type"""
        try:
            if parser_type in ['pdf', 'docx', 'pptx', 'xlsx', 'html', 'text', 'markdown']:
                return self._markitdown.convert(filename, content=content).text
            else:
                return content.decode('utf-8', errors='replace')
        except Exception as e:
            logger.warning(f"MarkItDown parsing failed, falling back to text: {e}")
            try:
                return content.decode('utf-8', errors='replace')
            except:
                return str(content)
    
    async def _create_source_record(self, identifier: str, workspace_id: str, series_id: Optional[str], source_type: str) -> Any:
        """Create a source record in the database"""
        # This would create a source record in the database
        # For now, return a mock object
        return type('Source', (), {
            'id': str(uuid.uuid4()),
            'workspace_id': workspace_id,
            'series_id': series_id,
            'identifier': identifier,
            'type': source_type,
        })()
    
    async def _create_source_version(self, source_id: str) -> Any:
        """Create a source version record"""
        return type('SourceVersion', (), {
            'id': str(uuid.uuid4()),
            'source_id': source_id,
            'status': 'pending',
        })()
    
    async def _update_source_version_status(self, version_id: str, status: str):
        """Update source version status"""
        logger.info(f"Source version {version_id} status: {status}")
    
    async def _update_source_status(self, source_id: str, status: str):
        """Update source status"""
        logger.info(f"Source {source_id} status: {status}")

# Import dependencies at module level for singleton access
from app.rag.chunking.text_splitter import chunking_service
from app.rag.embeddings.qdrant import qdrant_service

# Singleton instance
ingestion_worker = None

def get_ingestion_worker():
    global ingestion_worker
    if ingestion_worker is None:
        model_svc = ModelService()
        ingestion_worker = IngestionWorker(model_svc)
    return ingestion_worker
