"""Text chunking service for RAG pipeline
Handles structure-aware chunking of documents
"""

from typing import List, Dict, Any, Optional
import re
from markdown import markdown as md_to_html
from bs4 import BeautifulSoup
import logging

logger = logging.getLogger(__name__)

class Chunk:
    """Represents a single text chunk with metadata"""
    def __init__(self, 
                 id: str,
                 content: str,
                 token_count: int,
                 heading_path: List[str],
                 checksum: str,
                 source_version_id: str,
                 index: int):
        self.id = id
        self.content = content
        self.token_count = token_count
        self.heading_path = heading_path
        self.checksum = checksum
        self.source_version_id = source_version_id
        self.index = index

class ChunkingConfig:
    """Configuration for chunking"""
    def __init__(self,
                 target_tokens: int = 500,
                 overlap_tokens: int = 80,
                 chunker_version: str = "v1"):
        self.target_tokens = target_tokens
        self.overlap_tokens = overlap_tokens
        self.chunker_version = chunker_version

class TextSplitter:
    """Structure-aware text splitter"""
    
    def __init__(self, config: ChunkingConfig):
        self.config = config
    
    def chunk_document(self, text: str) -> List[Dict[str, Any]]:
        """Chunk a document into structure-aware chunks"""
        chunks = []
        
        # Detect document format
        if text.strip().startswith('#') or 'markdown' in text.lower():
            chunks = self._chunk_markdown(text, chunks)
        elif text.strip().startswith('function') or '{' in text:
            chunks = self._chunk_code(text, chunks)
        else:
            chunks = self._chunk_text(text, chunks)
        
        # Assign indices and checksums
        indexed_chunks = []
        for i, chunk in enumerate(chunks):
            chunk['index'] = i
            chunk['checksum'] = self._generate_checksum(chunk['content'])
            chunk['token_count'] = self._count_tokens(chunk['content'])
            indexed_chunks.append(chunk)
        
        return indexed_chunks
    
    def _chunk_markdown(self, text: str, chunks: List[Dict], heading_path: List[str] = None) -> List[Dict]:
        """Chunk markdown text"""
        if heading_path is None:
            heading_path = []
        
        lines = text.split('\n')
        current_chunk = []
        current_heading_path = list(heading_path)
        
        for line in lines:
            if line.startswith('#'):
                # New heading
                level = len(line) - len(line.lstrip('#'))
                heading_text = line.lstrip('# ').strip()
                
                if current_chunk:
                    chunks.append({
                        'content': '\n'.join(current_chunk),
                        'heading_path': list(current_heading_path),
                    })
                    current_chunk = []
                
                # Update heading path
                if level <= len(current_heading_path):
                    current_heading_path = current_heading_path[:level-1]
                current_heading_path.append(heading_text)
            
            if line.strip():
                current_chunk.append(line)
        
        if current_chunk:
            chunks.append({
                'content': '\n'.join(current_chunk),
                'heading_path': list(current_heading_path),
            })
        
        return chunks
    
    def _chunk_code(self, text: str, chunks: List[Dict]) -> List[Dict]:
        """Chunk code text"""
        lines = text.split('\n')
        current_chunk = []
        
        for line in lines:
            if line.strip():
                current_chunk.append(line)
                
                # If chunk is too large, split
                if self._count_tokens('\n'.join(current_chunk)) >= self.config.target_tokens:
                    chunks.append({'content': '\n'.join(current_chunk), 'heading_path': []})
                    current_chunk = []
        
        if current_chunk:
            chunks.append({'content': '\n'.join(current_chunk), 'heading_path': []})
        
        return chunks
    
    def _chunk_text(self, text: str, chunks: List[Dict]) -> List[Dict]:
        """Chunk plain text"""
        # Split into sentences
        sentences = re.split(r'(?<=[.!?])\s+', text)
        current_chunk = []
        current_tokens = 0
        
        for sentence in sentences:
            sentence_tokens = self._count_tokens(sentence)
            
            if current_tokens + sentence_tokens >= self.config.target_tokens and current_chunk:
                chunks.append({'content': ' '.join(current_chunk), 'heading_path': []})
                current_chunk = []
                current_tokens = 0
            
            current_chunk.append(sentence)
            current_tokens += sentence_tokens
        
        if current_chunk:
            chunks.append({'content': ' '.join(current_chunk), 'heading_path': []})
        
        return chunks
    
    def _count_tokens(self, text: str) -> int:
        """Estimate token count"""
        # Simple heuristic: ~4 characters per token
        return len(text) // 4 + 1
    
    def _generate_checksum(self, content: str) -> str:
        """Generate a checksum for content"""
        import hashlib
        return hashlib.sha256(content.encode()).hexdigest()

# Singleton instance
chunking_service = TextSplitter(ChunkingConfig())