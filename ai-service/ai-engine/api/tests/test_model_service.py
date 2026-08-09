"""Tests for model service"""

import pytest
from unittest.mock import Mock, patch

class TestModelService:
    def test_get_embeddings_returns_list(self):
        """Test that embeddings are returned as a list"""
        from app.services.model_service import ModelService
        
        with patch('app.services.model_service.OpenAIEmbeddings') as mock_emb:
            mock_instance = Mock()
            mock_instance.embed_documents.return_value = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]
            mock_emb.return_value = mock_instance
            
            service = ModelService.__new__(ModelService)
            service.embedding_model = mock_instance
            
            embeddings = service.get_embeddings(["text one", "text two"])
            assert len(embeddings) == 2
            assert len(embeddings[0]) == 3

    def test_generate_response_returns_string(self):
        """Test that response generation returns a string"""
        from app.services.model_service import ModelService
        
        with patch('app.services.model_service.OpenAI') as mock_client:
            mock_instance = Mock()
            mock_response = Mock()
            mock_response.choices = [Mock(message=Mock(content="Generated response"))]
            mock_instance.chat.completions.create.return_value = mock_response
            mock_client.return_value = mock_instance
            
            service = ModelService.__new__(ModelService)
            service.client = mock_instance
            service.default_model = "test-model"
            
            response = service.generate_response([{"role": "user", "content": "test"}])
            assert response == "Generated response"

    def test_structured_output_parses_json(self):
        """Test that structured output is parsed as JSON"""
        from app.services.model_service import ModelService
        
        with patch('app.services.model_service.OpenAI') as mock_client:
            mock_instance = Mock()
            mock_response = Mock()
            mock_response.choices = [Mock(message=Mock(content='{"key": "value"}'))]
            mock_instance.chat.completions.create.return_value = mock_response
            mock_client.return_value = mock_instance
            
            service = ModelService.__new__(ModelService)
            service.client = mock_instance
            service.default_model = "test-model"
            
            result = service.generate_structured_output(
                [{"role": "user", "content": "test"}],
                {"key": "string"}
            )
            assert result == {"key": "value"}
