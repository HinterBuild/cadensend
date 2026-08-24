"""Ingestion worker for RAG pipeline.
Handles source ingestion, chunking, and embedding.
"""

from dataclasses import dataclass
from typing import Optional, List, Dict, Any
import asyncio
import hashlib
import json
import logging
import uuid
import aiohttp
from bs4 import BeautifulSoup
from xml.etree import ElementTree

try:
	from markitdown import MarkItDown
except ImportError:
	MarkItDown = None

from app.core.config import settings
from app.core.database import asyncpg_dsn
from app.services.model_service import ModelService
from app.rag.chunking.text_splitter import chunking_service
from app.rag.embeddings.qdrant import qdrant_service

logger = logging.getLogger(__name__)

# Source version status constants (mirrors contracts)
STATUS_PENDING = "pending"
STATUS_FETCHING = "fetching"
STATUS_PARSING = "parsing"
STATUS_CHUNKING = "chunking"
STATUS_EMBEDDING = "embedding"
STATUS_INDEXING = "indexing"
STATUS_READY = "ready"
STATUS_FAILED = "failed"

SUPPORTED_EXTENSIONS: Dict[str, str] = {
	".pdf": "pdf",
	".docx": "docx",
	".pptx": "pptx",
	".xlsx": "xlsx",
	".html": "html",
	".htm": "html",
	".txt": "text",
	".md": "markdown",
	".json": "json",
	".csv": "csv",
}

MARKITDOWN_SUPPORTED = {"pdf", "docx", "pptx", "xlsx", "html", "text", "markdown"}

# Namespaces seen in real-world Atom feeds.
_ATOM_NS = {
	"atom": "http://www.w3.org/2005/Atom",
}


@dataclass
class SourceRecord:
	"""Represents a source record in the ingestion pipeline."""
	id: str
	workspace_id: str
	series_id: Optional[str]
	identifier: str
	type: str


@dataclass
class SourceVersion:
	"""Represents a source version record."""
	id: str
	source_id: str
	status: str


class IngestionWorker:
	"""Worker for RAG ingestion pipeline."""

	def __init__(self, model_service: Optional[ModelService] = None):
		self.model_service = model_service or ModelService()
		self.running = False
		self._markitdown = MarkItDown() if MarkItDown is not None else None

	async def start(self):
		"""Start the ingestion worker background loop."""
		self.running = True
		logger.info("Ingestion worker started")
		while self.running:
			await asyncio.sleep(5)

	async def stop(self):
		"""Stop the ingestion worker."""
		self.running = False
		logger.info("Ingestion worker stopped")

	async def process_url_source(
		self, url: str, workspace_id: str, series_id: Optional[str] = None, source_id: Optional[str] = None
	) -> Dict[str, Any]:
		"""Process a URL source for ingestion. RSS/Atom feeds are expanded
		into the text of their recent entries before chunking."""
		logger.info("Processing URL source: %s", url)
		source = await self._create_source_record(url, workspace_id, series_id, "website", source_id)
		await self._update_source_status(source.id, STATUS_FETCHING)
		raw_text = await self._fetch_url(url)
		if self._looks_like_feed(raw_text):
			logger.info("Detected RSS/Atom feed at %s", url)
			parsed_text = self._parse_feed(raw_text)
		else:
			parsed_text = self._parse_html(raw_text)
		return await self._process_source_content(source, workspace_id, series_id, "website", parsed_text)

	async def process_file_source(
		self, content: bytes, filename: str, workspace_id: str, series_id: Optional[str] = None, source_id: Optional[str] = None
	) -> Dict[str, Any]:
		"""Process a file source for ingestion."""
		ext = "." + filename.split(".")[-1].lower()
		parser_type = SUPPORTED_EXTENSIONS.get(ext, "text")
		logger.info("Processing file source: %s (type: %s)", filename, parser_type)
		source = await self._create_source_record(filename, workspace_id, series_id, parser_type, source_id)
		await self._update_source_status(source.id, STATUS_PARSING)
		parsed_text = self._parse_file(content, parser_type, filename)
		return await self._process_source_content(source, workspace_id, series_id, parser_type, parsed_text)

	async def _process_source_content(
		self,
		source: SourceRecord,
		workspace_id: str,
		series_id: Optional[str],
		source_type: str,
		parsed_text: str,
	) -> Dict[str, Any]:
		"""Shared pipeline for chunking, embedding, and indexing parsed content.

		Extracted from process_url_source and process_file_source to avoid
		duplicated logic across both entry points.
		"""
		try:
			version = await self._create_source_version(source.id)
			await self._update_source_version_status(version.id, STATUS_FETCHING)
			await self._update_source_version_status(version.id, STATUS_PARSING)

			content_hash = self._content_hash(parsed_text)

			# Duplicate detection: identical content already ingested into
			# this workspace skips re-embedding entirely.
			duplicate_of = await self._find_duplicate(workspace_id, source.id, content_hash)
			if duplicate_of:
				logger.info(
					"Source %s duplicates %s (hash %s); skipping index",
					source.id, duplicate_of, content_hash[:12],
				)
				await self._finalize_source(
					source.id,
					version.id,
					status=STATUS_READY,
					content_hash=content_hash,
					chunk_count=0,
					duplicate_of=duplicate_of,
				)
				return {
					"source_id": source.id,
					"version_id": version.id,
					"total_chunks": 0,
					"duplicate_of": duplicate_of,
					"status": "complete",
				}

			await self._update_source_version_status(version.id, STATUS_CHUNKING)
			await self._update_source_status(source.id, STATUS_CHUNKING)
			chunks = chunking_service.chunk_document(parsed_text)
			self._annotate_chunks(chunks, workspace_id, series_id, source.id, version.id, source_type)

			await self._update_source_version_status(version.id, STATUS_EMBEDDING)
			await self._update_source_status(source.id, STATUS_EMBEDDING)
			texts = [chunk["content"] for chunk in chunks]
			embeddings: list = []
			batch_size = max(int(settings.EMBEDDING_BATCH_SIZE or 20), 1)
			for start in range(0, len(texts), batch_size):
				embeddings.extend(self.model_service.get_embeddings(texts[start:start + batch_size]))

			await self._update_source_version_status(version.id, STATUS_INDEXING)
			await self._update_source_status(source.id, STATUS_INDEXING)
			qdrant_service.upsert_chunks(chunks, embeddings)

			await self._finalize_source(
				source.id,
				version.id,
				status=STATUS_READY,
				content_hash=content_hash,
				chunk_count=len(chunks),
			)
			await self._update_source_version_status(version.id, STATUS_READY)

			return {
				"source_id": source.id,
				"version_id": version.id,
				"total_chunks": len(chunks),
				"status": "complete",
			}

		except Exception as e:
			logger.error("Source ingestion failed for %s: %s", source.identifier, e)
			await self._update_source_status(source.id, STATUS_FAILED, str(e))
			raise

	def _content_hash(self, text: str) -> str:
		"""SHA-256 of whitespace-normalized text for duplicate detection."""
		normalized = " ".join((text or "").split()).lower()
		return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

	async def _find_duplicate(
		self, workspace_id: str, source_id: str, content_hash: str
	) -> Optional[str]:
		"""Return the id of an earlier ready source with identical content."""
		if not content_hash or not workspace_id:
			return None
		import asyncpg

		conn = await asyncpg.connect(asyncpg_dsn())
		try:
			row = await conn.fetchrow(
				"""
				SELECT id FROM sources
				WHERE workspace_id = $1::uuid
				  AND content_hash = $2
				  AND id <> $3::uuid
				  AND deleted_at IS NULL
				  AND duplicate_of IS NULL
				ORDER BY created_at ASC
				LIMIT 1
				""",
				workspace_id,
				content_hash,
				source_id,
			)
		finally:
			await conn.close()
		return str(row["id"]) if row else None

	async def _finalize_source(
		self,
		source_id: str,
		version_id: str,
		status: str,
		content_hash: str = "",
		chunk_count: int = 0,
		duplicate_of: Optional[str] = None,
	):
		"""Persist terminal ingestion state including hash/chunk metadata."""
		import asyncpg

		conn = await asyncpg.connect(asyncpg_dsn())
		try:
			await conn.execute(
				"""
				UPDATE sources
				SET status = $2,
				    ingest_error = '',
				    current_version_id = $3::uuid,
				    content_hash = $4,
				    chunk_count = $5,
				    duplicate_of = $6::uuid,
				    updated_at = NOW()
				WHERE id = $1::uuid
				""",
				source_id,
				status,
				version_id,
				content_hash,
				chunk_count,
				duplicate_of,
			)
		finally:
			await conn.close()

	def _annotate_chunks(
		self,
		chunks: List[Dict[str, Any]],
		workspace_id: str,
		series_id: Optional[str],
		source_id: str,
		source_version_id: str,
		source_type: str,
	):
		"""Annotate chunk dicts with pipeline metadata in place."""
		visibility = "series" if series_id else "workspace"
		for chunk in chunks:
			chunk["workspace_id"] = workspace_id
			chunk["series_id"] = series_id
			chunk["source_id"] = source_id
			chunk["source_version_id"] = source_version_id
			chunk["source_type"] = source_type
			chunk["visibility"] = visibility

	async def _fetch_url(self, url: str) -> str:
		"""Fetch content from a URL."""
		async with aiohttp.ClientSession() as session:
			async with session.get(url, timeout=aiohttp.ClientTimeout(total=60)) as response:
				return await response.text()

	@staticmethod
	def _looks_like_feed(raw: str) -> bool:
		head = (raw or "").lstrip()[:512].lower()
		return "<rss" in head or "<feed" in head or head.startswith("<?xml")

	@staticmethod
	def _strip_tags(fragment: str) -> str:
		"""RSS summaries often embed HTML; reduce them to text."""
		if not fragment:
			return ""
		return BeautifulSoup(fragment, "html.parser").get_text(separator=" ").strip()

	def _parse_feed(self, raw: str, max_entries: int = 30) -> str:
		"""Flatten an RSS 2.0 or Atom feed into one document of recent entries."""
		try:
			root = ElementTree.fromstring(raw)
		except ElementTree.ParseError as exc:
			logger.warning("Feed parse failed; falling back to HTML extraction: %s", exc)
			return self._parse_html(raw)

		feed_title = ""
		lines: List[str] = []
		if root.tag == "rss":
			channel = root.find("channel")
			if channel is None:
				return self._parse_html(raw)
			feed_title = self._strip_tags(channel.findtext("title") or "")
			for item in channel.findall("item")[:max_entries]:
				title = self._strip_tags(item.findtext("title") or "")
				link = (item.findtext("link") or "").strip()
				# Prefer the full-content element over the short summary.
				summary = self._strip_tags(
					item.findtext("{http://purl.org/rss/1.0/modules/content/}encoded")
					or item.findtext("description")
					or ""
				)
				lines.append(self._format_entry(title, link, summary))
		else:
			# Atom
			feed_title = self._strip_tags(
				root.findtext("atom:title", namespaces=_ATOM_NS) or ""
			)
			for entry in root.findall("atom:entry", _ATOM_NS)[:max_entries]:
				title = self._strip_tags(
					entry.findtext("atom:title", namespaces=_ATOM_NS) or ""
				)
				link_el = entry.find("atom:link", _ATOM_NS)
				link = (link_el.get("href") or "") if link_el is not None else ""
				summary = self._strip_tags(
					entry.findtext("atom:summary", namespaces=_ATOM_NS)
					or entry.findtext("atom:content", namespaces=_ATOM_NS)
					or ""
				)
				lines.append(self._format_entry(title, link, summary))

		if not lines:
			return self._parse_html(raw)
		header = f"{feed_title}\n\n" if feed_title else ""
		return (header + "\n\n".join(lines)).strip()

	@staticmethod
	def _format_entry(title: str, link: str, summary: str) -> str:
		parts = []
		if title:
			parts.append(title)
		if link:
			parts.append(f"({link})")
		head = " ".join(parts)
		return f"{head}\n{summary}" if head and summary else (head or summary)

	def _parse_html(self, html: str) -> str:
		"""Parse HTML content and extract text."""
		soup = BeautifulSoup(html, "html.parser")
		for element in soup(["script", "style", "nav", "footer", "header"]):
			element.decompose()
		text = soup.get_text(separator="\n")
		title = soup.title.string if soup.title else ""
		meta_description = ""
		meta_tag = soup.find("meta", attrs={"name": "description"})
		if meta_tag:
			meta_description = meta_tag.get("content", "")
		return f"{title}\n\n{meta_description}\n\n{text}".strip()

	def _parse_file(self, content: bytes, parser_type: str, filename: str) -> str:
		"""Parse file content based on type."""
		try:
			if parser_type in MARKITDOWN_SUPPORTED and self._markitdown is not None:
				result = self._markitdown.convert(filename, content=content)
				return getattr(result, "text_content", getattr(result, "text", ""))
			return content.decode("utf-8", errors="replace")
		except Exception as e:
			logger.warning("MarkItDown parsing failed, falling back to text: %s", e)
			return content.decode("utf-8", errors="replace")

	async def _create_source_record(
		self, identifier: str, workspace_id: str, series_id: Optional[str], source_type: str, source_id: Optional[str] = None
	) -> SourceRecord:
		"""Create a source record."""
		return SourceRecord(
			id=source_id or str(uuid.uuid4()),
			workspace_id=workspace_id,
			series_id=series_id,
			identifier=identifier,
			type=source_type,
		)

	async def _create_source_version(self, source_id: str) -> SourceVersion:
		"""Create a source version record."""
		return SourceVersion(
			id=str(uuid.uuid4()),
			source_id=source_id,
			status=STATUS_PENDING,
		)

	async def _update_source_version_status(self, version_id: str, status: str):
		"""Update source version status."""
		logger.info("Source version %s status: %s", version_id, status)

	async def _update_source_status(self, source_id: str, status: str, error: str = ""):
		"""Update source status in Postgres so the UI can poll progress."""
		logger.info("Source %s status: %s", source_id, status)
		if not source_id:
			return
		dsn = asyncpg_dsn()
		try:
			import asyncpg

			conn = await asyncpg.connect(dsn)
			try:
				await conn.execute(
					"""
					UPDATE sources
					SET status = $1,
					    ingest_error = $2,
					    updated_at = NOW()
					WHERE id = $3::uuid
					""",
					status,
					error,
					source_id,
				)
			finally:
				await conn.close()
		except Exception as persist_error:
			logger.error("Failed to persist source status: %s", persist_error)


def get_ingestion_worker() -> IngestionWorker:
	"""Get or create the singleton ingestion worker."""
	return IngestionWorker()
