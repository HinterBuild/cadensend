"""Tests for model service."""

import os
from unittest.mock import Mock

import pytest

from app.services.model_service import ModelService


class TestModelService:
    def test_init_does_not_require_openai_api_key(self, monkeypatch):
        """Worker startup must not depend on OPENAI_API_KEY."""
        monkeypatch.setattr("app.services.model_service.settings.OPENROUTER_API_KEY", "")
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        os.environ.pop("OPENAI_API_KEY", None)

        service = ModelService()
        assert service.default_model == "poolside/laguna-s-2.1:free"
        assert service.embedding_model_name == "nvidia/nemotron-3-embed-1b:free"

    def test_resolve_model_falls_back_to_env_default(self):
        service = ModelService.__new__(ModelService)
        service.default_model = "poolside/laguna-s-2.1:free"

        assert service.resolve_model(None) == "poolside/laguna-s-2.1:free"
        assert service.resolve_model("") == "poolside/laguna-s-2.1:free"
        assert service.resolve_model("  ") == "poolside/laguna-s-2.1:free"
        assert service.resolve_model("custom/model:free") == "custom/model:free"

    def test_get_embeddings_uses_openrouter_client(self):
        service = ModelService.__new__(ModelService)
        service.embedding_model_name = "nvidia/nemotron-3-embed-1b:free"
        mock_client = Mock()
        mock_client.embeddings.create.return_value = Mock(
            data=[
                Mock(index=1, embedding=[0.4, 0.5, 0.6]),
                Mock(index=0, embedding=[0.1, 0.2, 0.3]),
            ]
        )
        service.client = mock_client

        embeddings = service.get_embeddings(["text one", "text two"])

        mock_client.embeddings.create.assert_called_once_with(
            model="nvidia/nemotron-3-embed-1b:free",
            input=["text one", "text two"],
            encoding_format="float",
        )
        assert embeddings == [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]

    @pytest.mark.asyncio
    async def test_generate_response_returns_string(self):
        service = ModelService.__new__(ModelService)
        service.default_model = "poolside/laguna-s-2.1:free"
        mock_client = Mock()
        mock_response = Mock()
        mock_response.choices = [Mock(message=Mock(content="Generated response"))]
        mock_client.chat.completions.create.return_value = mock_response
        service.client = mock_client

        response = await service.generate_response([{"role": "user", "content": "test"}])
        assert response == "Generated response"
        mock_client.chat.completions.create.assert_called_once()
        assert mock_client.chat.completions.create.call_args.kwargs["model"] == "poolside/laguna-s-2.1:free"

    @pytest.mark.asyncio
    async def test_structured_output_parses_json(self):
        service = ModelService.__new__(ModelService)
        service.default_model = "poolside/laguna-s-2.1:free"
        mock_client = Mock()
        mock_response = Mock()
        mock_response.choices = [Mock(message=Mock(content='{"key": "value"}'))]
        mock_client.chat.completions.create.return_value = mock_response
        service.client = mock_client

        result = await service.generate_structured_output(
            [{"role": "user", "content": "test"}],
            {"key": "string"},
        )
        assert result == {"key": "value"}
