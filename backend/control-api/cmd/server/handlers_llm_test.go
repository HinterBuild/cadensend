package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestListLLMProvidersHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("returns all registered providers", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v1/llm-providers", nil)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = req
		c.Set("workspace_id", "test-workspace")

		// Use a nil db - handler doesn't actually use db for this endpoint
		handler := listLLMProvidersHandler(nil)
		handler(c)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		assert.NoError(t, err)

		data := resp["data"].([]interface{})
		assert.GreaterOrEqual(t, len(data), 7)

		// Check that we have the expected providers
		providers := make(map[string]bool)
		for _, p := range data {
			pMap := p.(map[string]interface{})
			providers[pMap["id"].(string)] = true
		}
		assert.True(t, providers["openrouter"])
		assert.True(t, providers["openai"])
		assert.True(t, providers["anthropic"])
		assert.True(t, providers["gemini"])
		assert.True(t, providers["local"])
		assert.True(t, providers["xai"])
		assert.True(t, providers["qwen"])
	})

	t.Run("openrouter has chat and embed support", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v1/llm-providers", nil)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = req
		c.Set("workspace_id", "test-workspace")

		handler := listLLMProvidersHandler(nil)
		handler(c)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)
		data := resp["data"].([]interface{})

		for _, p := range data {
			pMap := p.(map[string]interface{})
			if pMap["id"].(string) == "openrouter" {
				assert.True(t, pMap["supports_chat"].(bool))
				assert.True(t, pMap["supports_embed"].(bool))
				return
			}
		}
		t.Error("OpenRouter provider not found")
	})

	t.Run("anthropic does not support embedding", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v1/llm-providers", nil)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = req
		c.Set("workspace_id", "test-workspace")

		handler := listLLMProvidersHandler(nil)
		handler(c)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)
		data := resp["data"].([]interface{})

		for _, p := range data {
			pMap := p.(map[string]interface{})
			if pMap["id"].(string) == "anthropic" {
				assert.True(t, pMap["supports_chat"].(bool))
				assert.False(t, pMap["supports_embed"].(bool))
				return
			}
		}
		t.Error("Anthropic provider not found")
	})
}

func TestGetProviderModelsHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("returns fallback models for openrouter", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v1/llm-providers/openrouter/models", nil)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = req
		c.Params = gin.Params{gin.Param{Key: "id", Value: "openrouter"}}
		c.Set("workspace_id", "test-workspace")

		handler := getLLMProviderModelsHandler(nil)
		handler(c)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)
		data := resp["data"].([]interface{})
		assert.GreaterOrEqual(t, len(data), 1)
	})

	t.Run("returns fallback models for openai", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v1/llm-providers/openai/models", nil)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = req
		c.Params = gin.Params{gin.Param{Key: "id", Value: "openai"}}
		c.Set("workspace_id", "test-workspace")

		handler := getLLMProviderModelsHandler(nil)
		handler(c)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)
		data := resp["data"].([]interface{})
		assert.GreaterOrEqual(t, len(data), 1)
	})

	t.Run("returns 400 for unknown provider", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v1/llm-providers/unknown/models", nil)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = req
		c.Params = gin.Params{gin.Param{Key: "id", Value: "unknown"}}
		c.Set("workspace_id", "test-workspace")

		handler := getLLMProviderModelsHandler(nil)
		handler(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestValidateLLMProviderHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("local provider always valid without key", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/v1/llm-providers/local/validate", nil)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = req
		c.Params = gin.Params{gin.Param{Key: "provider", Value: "local"}}
		c.Set("workspace_id", "test-workspace")

		handler := validateLLMProviderHandler(nil)
		handler(c)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)
		assert.True(t, resp["valid"].(bool))
	})
}

func TestGetLLMProviderConfigHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Skip("This test requires a database connection")

	t.Run("returns default config when no workspace config", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v1/llm-providers/config", nil)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = req
		c.Set("workspace_id", "test-workspace")

		handler := getLLMProviderConfigHandler(nil)
		handler(c)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)
		// Should fall back to default provider
		assert.Equal(t, "openrouter", resp["provider"])
	})
}