"""Model service for AI Engine
Handles LLM interactions and model gateway integration
"""

from openai import OpenAI
from typing import Optional, List, Dict, Any
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate
import json
import time
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

class ModelService:
    """Service for handling LLM interactions via OpenRouter gateway"""
    
    def __init__(self):
        self.client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=settings.OPENROUTER_API_KEY,
        )
        self.default_model = settings.DEFAULT_MODEL
        self.embedding_model = OpenAIEmbeddings(
            model=settings.DEFAULT_MODEL,
            openai_api_base="https://openrouter.ai/api/v1",
            openai_api_key=settings.OPENROUTER_API_KEY,
            dimensions=settings.EMBEDDING_DIMENSION,
        )
        self.chat_model = ChatOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=settings.OPENROUTER_API_KEY,
            model=self.default_model,
            temperature=0.7,
            max_tokens=4000,
        )
    
    async def generate_response(self, 
                                messages: List[Dict[str, str]], 
                                model: Optional[str] = None,
                                temperature: float = 0.7,
                                max_tokens: int = 4000) -> str:
        """Generate a response from the LLM"""
        model = model or self.default_model
        start_time = time.time()
        
        try:
            response = self.client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            
            result = response.choices[0].message.content
            elapsed = time.time() - start_time
            logger.info(f"Generated response in {elapsed:.2f}s using {model}")
            return result
            
        except Exception as e:
            logger.error(f"Failed to generate response: {e}")
            raise
    
    async def generate_structured_output(self,
                                         messages: List[Dict[str, str]],
                                         schema: Dict[str, Any],
                                         model: Optional[str] = None,
                                         max_retries: int = 1) -> Dict[str, Any]:
        """Generate structured JSON output from the LLM"""
        model = model or self.default_model
        last_error = None
        
        for attempt in range(max_retries + 1):
            try:
                response = self.client.chat.completions.create(
                    model=model,
                    messages=messages + [{"role": "user", "content": f"Output valid JSON matching this schema: {json.dumps(schema)}"}],
                    temperature=0.1,
                    max_tokens=4000,
                    response_format={"type": "json_object"},
                )
                
                result = response.choices[0].message.content
                parsed = json.loads(result)
                logger.info(f"Generated structured output (attempt {attempt + 1})")
                return parsed
                
            except Exception as e:
                last_error = e
                logger.warning(f"Attempt {attempt + 1} failed: {e}")
                if attempt < max_retries:
                    continue
        
        raise last_error
    
    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Get embeddings for a list of texts"""
        try:
            embeddings = self.embedding_model.embed_documents(texts)
            logger.info(f"Generated {len(embeddings)} embeddings")
            return embeddings
        except Exception as e:
            logger.error(f"Failed to generate embeddings: {e}")
            raise
