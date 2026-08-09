"""Models for AI Engine"""

from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
import uuid
from .database import Base

def generate_uuid():
    return str(uuid.uuid4())

# RAG entities

class Source(Base):
    __tablename__ = "sources"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    workspace_id = Column(String, nullable=False, index=True)
    scope = Column(String, nullable=False)
    type = Column(String, nullable=False)
    url = Column(String)
    status = Column(String, nullable=False, default="pending")
    current_version_id = Column(String, ForeignKey("source_versions.id"))
    content_hash = Column(String)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    deleted_at = Column(DateTime, nullable=True)

class SourceVersion(Base):
    __tablename__ = "source_versions"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    source_id = Column(String, ForeignKey("sources.id"), nullable=False)
    content_hash = Column(String, nullable=False)
    object_key = Column(String, nullable=False)
    parser_version = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")
    error_code = Column(String)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

class SourceChunk(Base):
    __tablename__ = "source_chunks"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    source_version_id = Column(String, ForeignKey("source_versions.id"), nullable=False, index=True)
    index = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    token_count = Column(Integer, nullable=False)
    heading_path = Column(JSON)
    checksum = Column(String, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    deleted_at = Column(DateTime, nullable=True)

# RAG pipeline state

class IngestionRun(Base):
    __tablename__ = "ingestion_runs"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    source_version_id = Column(String, ForeignKey("source_versions.id"), nullable=False)
    pipeline_version = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")
    counts = Column(JSON)
    error_code = Column(String)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

class EmbeddingIndex(Base):
    __tablename__ = "embedding_indexes"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    model = Column(String, nullable=False)
    revision = Column(String)
    dimension = Column(Integer, nullable=False)
    collection = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

class RetrievalRun(Base):
    __tablename__ = "retrieval_runs"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    generation_run_id = Column(String, ForeignKey("generation_runs.id"), nullable=True)
    query = Column(Text, nullable=False)
    filter_json = Column(JSON)
    latency_ms = Column(Integer)
    result_ids = Column(JSON)
    created_at = Column(DateTime, default=func.now(), nullable=False)

class GenerationRun(Base):
    __tablename__ = "generation_runs"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    target_id = Column(String, nullable=False)
    target_type = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")
    model = Column(String, nullable=False)
    tokens_in = Column(Integer, default=0)
    tokens_out = Column(Integer, default=0)
    cost_usd = Column(Integer, default=0)
    prompt_version = Column(String)
    error_code = Column(String)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    completed_at = Column(DateTime, nullable=True)