"""Core configuration for AI Engine"""

from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import Optional, List
import os

class Settings(BaseSettings):
    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    RELOAD: bool = True
    LOG_LEVEL: str = "info"
    
    # Database settings
    DATABASE_URL: str = "postgresql+asyncpg://localhost:5432/cadensend"
    
    # Qdrant settings
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_API_KEY: Optional[str] = None
    QDRANT_COLLECTION_NAME: str = "newsletter_chunks_dense_v1"
    
    # MinIO settings
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = ""
    MINIO_SECRET_KEY: str = ""
    MINIO_BUCKET_NAME: str = "cadensend"
    MINIO_SECURE: bool = False
    
    # OpenRouter settings — the only LLM provider
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    
    # Multi-LLM Provider settings
    DEFAULT_PROVIDER: str = "openrouter"
    DEFAULT_TEMPERATURE: float = 0.7
    DEFAULT_MAX_TOKENS: int = 4000
    
    # OpenAI settings
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: Optional[str] = None
    
    # Anthropic settings
    ANTHROPIC_API_KEY: str = ""
    
    # Google Gemini settings
    GOOGLE_API_KEY: str = ""
    
    # xAI Grok settings
    XAI_API_KEY: str = ""
    
    # Qwen settings
    QWEN_API_KEY: str = ""
    
    # Local LLM settings
    LOCAL_BASE_URL: str = "http://localhost:11434"
    
    # Bootstrap defaults when workspace has no saved provider/model yet.
    # Model pickers load live catalogs from provider APIs — these are not the source of truth.
    DEFAULT_MODEL: str = "poolside/laguna-s-2.1:free"
    EMBEDDING_MODEL: str = "nvidia/nemotron-3-embed-1b:free"
    
    # Redis settings
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # JWT settings
    JWT_SECRET: str = "secret-key"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    
    # Embedding settings
    EMBEDDING_BATCH_SIZE: int = 20
    EMBEDDING_DIMENSION: int = 2048
    
    # RAG settings
    CHUNK_SIZE: int = 500
    CHUNK_OVERLAP: int = 80
    TOP_K_RETRIEVAL: int = 20
    MAX_TOOL_TOP_K: int = 8
    MAX_QUERY_CHARS: int = 500
    MAX_TOOL_RESULT_CHARS: int = 8000
    COVERAGE_MIN_SCORE: float = 0.25
    ISSUE_HISTORY_LIMIT: int = 8
    AGENT_SOURCE_LIST_LIMIT: int = 20

    # Generation settings
    MAX_REVISION_LOOPS: int = 2
    MAX_TOOL_CALLS: int = 10
    GENERATION_TIMEOUT_SECONDS: int = 300
    OPENROUTER_MIN_INTERVAL_SECONDS: float = 3.5
    OPENROUTER_429_MAX_RETRIES: int = 8
    OPENROUTER_429_MAX_WAIT_SECONDS: int = 90
    OPENROUTER_TIMEOUT_SECONDS: float = 120.0
    ISSUE_JOB_GAP_SECONDS: float = 20.0
    
    # Email settings
    EMAIL_PROVIDER: str = ""
    SMTP_FROM: str = ""
    SMTP_FROM_NAME: str = ""
    BREVO_API_KEY: Optional[str] = None
    BREVO_API_URL: str = ""
    
    # Environment
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    INTERNAL_API_TOKEN: str = "dev-internal-token-change-in-production"
    CONTROL_API_URL: str = "http://localhost:8080"

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, v):
        if isinstance(v, str):
            return v.lower() in ("true", "1", "yes", "debug")
        return bool(v)

    # OpenTelemetry settings
    OTEL_ENDPOINT: Optional[str] = None
    OTEL_SERVICE_NAME: str = "cadensend-ai-engine"

    model_config = {
        "env_file": ".env",
        "case_sensitive": True,
    }

settings = Settings()
