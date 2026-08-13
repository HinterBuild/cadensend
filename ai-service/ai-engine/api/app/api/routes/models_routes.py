"""OpenRouter model catalog."""

from fastapi import APIRouter
import logging

from app.services.model_service import ModelService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/models")


@router.get("")
async def list_models():
    """List OpenRouter chat models. Default is the ENV DEFAULT_MODEL."""
    try:
        return ModelService().list_chat_models()
    except Exception as e:
        logger.error("Failed to list models: %s", e)
        from app.core.config import settings
        return {
            "default_model": settings.DEFAULT_MODEL,
            "embedding_model": settings.EMBEDDING_MODEL,
            "models": [
                {
                    "id": settings.DEFAULT_MODEL,
                    "name": f"Default ({settings.DEFAULT_MODEL})",
                    "is_default": True,
                }
            ],
        }
