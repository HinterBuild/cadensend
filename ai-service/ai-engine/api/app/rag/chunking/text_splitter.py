"""Text chunking service for RAG pipeline.
Handles structure-aware chunking of documents.
"""

from typing import List, Dict, Any, Optional
import hashlib
import re
from markdown import markdown as md_to_html
from bs4 import BeautifulSoup
import logging

logger = logging.getLogger(__name__)


class ChunkingConfig:
	"""Configuration for chunking."""
	def __init__(
		self,
		target_tokens: int = 500,
		overlap_tokens: int = 80,
		chunker_version: str = "v1",
	):
		self.target_tokens = target_tokens
		self.overlap_tokens = overlap_tokens
		self.chunker_version = chunker_version


class TextSplitter:
	"""Structure-aware text splitter that respects document boundaries."""

	def __init__(self, config: ChunkingConfig):
		self.config = config

	def chunk_document(self, text: str) -> List[Dict[str, Any]]:
		"""Chunk a document into structure-aware chunks.

		Detects whether the text is markdown, code, or plain text
		and delegates to the appropriate chunking strategy.
		"""
		stripped = text.strip()

		if stripped.startswith("#") or "markdown" in stripped.lower():
			chunks = self._chunk_markdown(stripped)
		elif stripped.startswith("function") or "{" in stripped:
			chunks = self._chunk_code(stripped)
		else:
			chunks = self._chunk_text(stripped)

		# Assign indices and checksums
		for i, chunk in enumerate(chunks):
			chunk["index"] = i
			chunk["checksum"] = self._generate_checksum(chunk["content"])
			chunk["token_count"] = self._count_tokens(chunk["content"])

		return chunks

	def _chunk_markdown(self, text: str, heading_path: Optional[List[str]] = None) -> List[Dict[str, Any]]:
		"""Chunk markdown text, respecting heading hierarchy."""
		if heading_path is None:
			heading_path = []

		chunks: List[Dict[str, Any]] = []
		lines = text.split("\n")
		current_lines: List[str] = []
		current_heading_path = list(heading_path)

		for line in lines:
			if line.startswith("#"):
				if current_lines:
					chunks.append(self._make_chunk(current_lines, current_heading_path))
					current_lines = []

				level = len(line) - len(line.lstrip("#"))
				heading_text = line.lstrip("# ").strip()

				if level <= len(current_heading_path):
					current_heading_path = current_heading_path[: level - 1]
				current_heading_path.append(heading_text)

			if line.strip():
				current_lines.append(line)

		if current_lines:
			chunks.append(self._make_chunk(current_lines, current_heading_path))

		return chunks

	def _chunk_code(self, text: str) -> List[Dict[str, Any]]:
		"""Chunk code text by token count."""
		chunks: List[Dict[str, Any]] = []
		lines = text.split("\n")
		current_lines: List[str] = []

		for line in lines:
			if line.strip():
				current_lines.append(line)

				if self._count_tokens("\n".join(current_lines)) >= self.config.target_tokens:
					chunks.append(self._make_chunk(current_lines, []))
					current_lines = []

		if current_lines:
			chunks.append(self._make_chunk(current_lines, []))

		return chunks

	def _chunk_text(self, text: str) -> List[Dict[str, Any]]:
		"""Chunk plain text by sentence boundaries."""
		chunks: List[Dict[str, Any]] = []
		sentences = re.split(r"(?<=[.!?])\s+", text)
		current_lines: List[str] = []
		current_tokens = 0

		for sentence in sentences:
			sentence_tokens = self._count_tokens(sentence)

			if current_tokens + sentence_tokens >= self.config.target_tokens and current_lines:
				chunks.append(self._make_chunk(current_lines, []))
				current_lines = []
				current_tokens = 0

			current_lines.append(sentence)
			current_tokens += sentence_tokens

		if current_lines:
			chunks.append(self._make_chunk(current_lines, []))

		return chunks

	def _make_chunk(self, lines: List[str], heading_path: List[str]) -> Dict[str, Any]:
		"""Build a chunk dict from collected lines."""
		return {
			"content": "\n".join(lines),
			"heading_path": list(heading_path),
		}

	def _count_tokens(self, text: str) -> int:
		"""Estimate token count using a simple heuristic: ~4 characters per token."""
		return len(text) // 4 + 1

	def _generate_checksum(self, content: str) -> str:
		"""Generate a SHA-256 checksum for content."""
		return hashlib.sha256(content.encode()).hexdigest()


# Default singleton instance
chunking_service = TextSplitter(ChunkingConfig())
