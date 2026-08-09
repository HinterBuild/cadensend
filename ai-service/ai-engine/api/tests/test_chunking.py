"""Tests for text chunking service"""

import pytest
from app.rag.chunking.text_splitter import TextSplitter, ChunkingConfig

def test_chunk_markdown():
    """Test chunking of markdown content"""
    splitter = TextSplitter(ChunkingConfig(target_tokens=100, overlap_tokens=20))
    text = "# Introduction\n\nThis is the first section.\n## Subsection\n\nMore content here."
    chunks = splitter.chunk_document(text)
    
    assert len(chunks) > 0
    assert all('content' in chunk for chunk in chunks)
    assert all('index' in chunk for chunk in chunks)
    assert all('checksum' in chunk for chunk in chunks)
    assert all('token_count' in chunk for chunk in chunks)

def test_chunk_plain_text():
    """Test chunking of plain text"""
    splitter = TextSplitter(ChunkingConfig(target_tokens=50, overlap_tokens=10))
    text = "This is a sentence. This is another sentence. And a third one. " * 10
    chunks = splitter.chunk_document(text)
    
    assert len(chunks) > 0
    assert all('content' in chunk for chunk in chunks)

def test_chunk_code():
    """Test chunking of code content"""
    splitter = TextSplitter(ChunkingConfig(target_tokens=50, overlap_tokens=10))
    text = "function foo() {\n  return 'bar';\n}\n\nfunction baz() {\n  return 'qux';\n}"
    chunks = splitter.chunk_document(text)
    
    assert len(chunks) > 0
    assert all('content' in chunk for chunk in chunks)

def test_checksum_generation():
    """Test that checksums are generated"""
    splitter = TextSplitter(ChunkingConfig(target_tokens=100, overlap_tokens=20))
    text = "# Test\n\nHello world."
    chunks = splitter.chunk_document(text)
    
    checksums = [chunk['checksum'] for chunk in chunks]
    assert all(len(c) == 64 for c in checksums)  # SHA-256 hex

def test_token_count():
    """Test that token counts are reasonable"""
    splitter = TextSplitter(ChunkingConfig(target_tokens=100, overlap_tokens=20))
    text = "# Test\n\n" + "word " * 200
    chunks = splitter.chunk_document(text)
    
    assert len(chunks) > 0
    assert all(chunk['token_count'] > 0 for chunk in chunks)

def test_heading_path_preserved():
    """Test that heading paths are preserved"""
    splitter = TextSplitter(ChunkingConfig(target_tokens=100, overlap_tokens=20))
    text = "# Main Title\n\nContent\n## Subsection\n\nMore content"
    chunks = splitter.chunk_document(text)
    
    # At least one chunk should have the heading path
    assert any(len(chunk['heading_path']) > 0 for chunk in chunks)
