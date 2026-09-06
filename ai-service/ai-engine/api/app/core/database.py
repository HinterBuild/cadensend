"""Database module for AI Engine"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from contextlib import asynccontextmanager
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

_ASYNCPG_DROP = {"sslmode", "channel_binding"}


def sqlalchemy_async_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://") and "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return _strip_libpq_query(url)


def asyncpg_dsn(url: str | None = None) -> str:
    raw = (url or settings.DATABASE_URL).strip()
    parts = urlsplit(raw)
    scheme = parts.scheme.split("+", 1)[0] or "postgresql"
    if scheme not in {"postgres", "postgresql"}:
        scheme = "postgresql"
    kept = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k.lower() not in _ASYNCPG_DROP]
    return urlunsplit((scheme, parts.netloc, parts.path, urlencode(kept), parts.fragment))


def _strip_libpq_query(url: str) -> str:
    parts = urlsplit(url)
    kept = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k.lower() not in _ASYNCPG_DROP]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(kept), parts.fragment))


db_url = sqlalchemy_async_url(settings.DATABASE_URL)

engine = create_async_engine(
    db_url,
    echo=settings.DEBUG,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_pre_ping=True,
    pool_recycle=300,
)

# Create session
AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Base model
Base = declarative_base()

@asynccontextmanager
async def get_session() -> AsyncSession:
    """Get a database session"""
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    """Initialize database connections"""
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error("Failed to initialize database: %s", e)
        raise

async def close_db():
    """Close database connections"""
    await engine.dispose()
    logger.info("Database connections closed")