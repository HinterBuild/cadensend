"""Pydantic schemas for AI Engine"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

# Source schemas
class SourceBase(BaseModel):
    url: Optional[str] = None
    type: str
    scope: str = "workspace"

class SourceCreate(SourceBase):
    pass

class Source(SourceBase):
    id: str
    workspace_id: str
    status: str
    current_version_id: Optional[str]
    content_hash: Optional[str]
    created_by: str
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime]

class SourceVersionBase(BaseModel):
    source_id: str
    content_hash: str
    object_key: str
    parser_version: str

class SourceVersion(SourceVersionBase):
    id: str
    status: str
    error_code: Optional[str]
    created_at: datetime
    updated_at: datetime

class SourceChunkBase(BaseModel):
    source_version_id: str
    index: int
    text: str
    token_count: int
    heading_path: List[str] = []

class SourceChunk(SourceChunkBase):
    id: str
    created_at: datetime
    checksum: str

# Ingestion schemas
class IngestionRunBase(BaseModel):
    source_version_id: str
    pipeline_version: str

class IngestionRun(IngestionRunBase):
    id: str
    status: str
    counts: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]

class IngestionCounts(BaseModel):
    fetched: int = 0
    parsed: int = 0
    chunked: int = 0
    embedded: int = 0
    indexed: int = 0

# Retrieval schemas
class RetrievalRunBase(BaseModel):
    query: str
    filter_json: Optional[Dict[str, Any]]

class RetrievalRun(RetrievalRunBase):
    id: str
    latency_ms: Optional[int]
    result_ids: Optional[List[str]]
    created_at: datetime

# Generation schemas
class GenerationRunBase(BaseModel):
    target_id: str
    target_type: str
    model: str

class GenerationRun(GenerationRunBase):
    id: str
    status: str
    tokens_in: int
    tokens_out: int
    cost_usd: float
    created_at: datetime
    completed_at: Optional[datetime]

# Issue schemas
class ContentBlock(BaseModel):
    type: str
    title: Optional[str]
    text: str
    citations: List[Dict[str, Any]] = []

class Citation(BaseModel):
    source_id: str
    chunk_id: str
    locator: str

class VisualSpec(BaseModel):
    type: str
    content: str
    alt_text: str

class IssueContent(BaseModel):
    subject: str
    preheader: str
    content_blocks: List[ContentBlock]
    visual_specs: List[VisualSpec] = []
    citations: List[Citation] = []
