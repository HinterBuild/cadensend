"""Core configuration for AI Engine"""

from pydantic_settings import BaseSettings
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
    
    # Generation settings
    MAX_REVISION_LOOPS: int = 2
    MAX_TOOL_CALLS: int = 10
    GENERATION_TIMEOUT_SECONDS: int = 300
    
    # Email settings
    EMAIL_PROVIDER: str = ""
    SMTP_FROM: str = ""
    SMTP_FROM_NAME: str = ""
    BREVO_API_KEY: Optional[str] = None
    BREVO_API_URL: str = ""
    
    # Environment
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # OpenTelemetry settings
    OTEL_ENDPOINT: Optional[str] = None
    OTEL_SERVICE_NAME: str = "cadensend-ai-engine"
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()