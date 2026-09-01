// Package main - HTTP handlers for LLM provider configuration and management
package main

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"backend/control-api/internal/service"
)

// listLLMProvidersHandler returns all registered LLM providers
func listLLMProvidersHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		providers := []gin.H{
			{
				"id":            "openrouter",
				"name":          "OpenRouter",
				"description":   "Unified API gateway for 100+ models",
				"supports_chat": true,
				"supports_embed": true,
			},
			{
				"id":            "openai",
				"name":          "OpenAI",
				"description":   "OpenAI GPT models",
				"supports_chat": true,
				"supports_embed": true,
			},
			{
				"id":            "anthropic",
				"name":          "Anthropic",
				"description":   "Claude models",
				"supports_chat": true,
				"supports_embed": false,
			},
			{
				"id":            "gemini",
				"name":          "Google Gemini",
				"description":   "Google Gemini models",
				"supports_chat": true,
				"supports_embed": true,
			},
			{
				"id":            "local",
				"name":          "Local LLM",
				"description":   "Ollama, llama.cpp, and other local providers",
				"supports_chat": true,
				"supports_embed": true,
			},
			{
				"id":            "xai",
				"name":          "xAI",
				"description":   "xAI Grok models",
				"supports_chat": true,
				"supports_embed": false,
			},
			{
				"id":            "qwen",
				"name":          "Qwen",
				"description":   "Qwen models via DashScope",
				"supports_chat": true,
				"supports_embed": true,
			},
		}

		c.JSON(http.StatusOK, gin.H{"data": providers})
	}
}

// getLLMProviderModelsHandler lists models for a specific provider
func getLLMProviderModelsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		provider := c.Param("id")

		fallbackModels := map[string][]gin.H{
			"openrouter": {
				{"id": "poolside/laguna-s-2.1:free", "name": "Laguna S2.1 (Free)"},
				{"id": "meta-llama/llama-3-8b-instruct:free", "name": "Llama 3 8B (Free)"},
				{"id": "meta-llama/llama-3-70b-instruct:free", "name": "Llama 3 70B (Free)"},
			},
			"openai": {
				{"id": "gpt-4o-mini", "name": "GPT-4o Mini"},
				{"id": "gpt-4o", "name": "GPT-4o"},
				{"id": "gpt-4-turbo", "name": "GPT-4 Turbo"},
			},
			"anthropic": {
				{"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet"},
				{"id": "claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku"},
				{"id": "claude-3-opus-20240229", "name": "Claude 3 Opus"},
			},
			"gemini": {
				{"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash"},
				{"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro"},
			},
			"local": {
				{"id": "llama3", "name": "Llama 3"},
				{"id": "phi3", "name": "Phi-3"},
				{"id": "gemma2", "name": "Gemma 2"},
			},
			"xai": {
				{"id": "grok-2-128k", "name": "Grok 2 128K"},
				{"id": "grok-2-vision-128k", "name": "Grok 2 Vision 128K"},
			},
			"qwen": {
				{"id": "qwen-turbo", "name": "Qwen Turbo"},
				{"id": "qwen-plus", "name": "Qwen Plus"},
				{"id": "qwen-max", "name": "Qwen Max"},
			},
		}

		models := fallbackModels[provider]
		if models == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unknown provider: " + provider})
			return
		}

		c.JSON(http.StatusOK, gin.H{"provider": provider, "models": models})
	}
}

// getLLMProviderConfigHandler returns the workspace's current LLM configuration
func getLLMProviderConfigHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaceID := c.GetString("workspace_id")

		var wsConfig service.WorkspaceLLMConfig
		if err := db.Where("workspace_id = ?", workspaceID).First(&wsConfig).Error; err != nil {
			c.JSON(http.StatusOK, gin.H{
				"provider":         cfg.DefaultProvider,
				"default_model":    cfg.DefaultModel,
				"embedding_model":  cfg.EmbeddingModel,
				"provider_configs": gin.H{},
			})
			return
		}

		var configs map[string]interface{}
		if wsConfig.Configs != nil {
			json.Unmarshal(wsConfig.Configs, &configs)
		}

		c.JSON(http.StatusOK, gin.H{
			"provider":         wsConfig.DefaultProvider,
			"default_model":    wsConfig.DefaultModel,
			"embedding_model":  wsConfig.EmbeddingModel,
			"provider_configs": configs,
		})
	}
}

// updateLLMProviderConfigHandler updates the workspace's LLM provider configuration
func updateLLMProviderConfigHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaceID := c.GetString("workspace_id")

		var req struct {
			Provider        string                 `json:"provider"`
			DefaultModel    string                 `json:"default_model"`
			EmbeddingModel  string                 `json:"embedding_model"`
			Configs         map[string]interface{} `json:"configs"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate provider is supported
		validProviders := map[string]bool{
			"openrouter": true, "openai": true, "anthropic": true,
			"gemini": true, "local": true, "xai": true, "qwen": true,
		}
		if !validProviders[req.Provider] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported provider: " + req.Provider})
			return
		}

		models := map[string]interface{}{
			"default_model": req.DefaultModel,
			"embedding_model": req.EmbeddingModel,
		}
		configsBytes, _ := json.Marshal(req.Configs)

		wsConfig := service.WorkspaceLLMConfig{
			WorkspaceID:    workspaceID,
			DefaultProvider: req.Provider,
			DefaultModel:    req.DefaultModel,
			EmbeddingModel:  req.EmbeddingModel,
			Configs:         configsBytes,
		}

		// Upsert the workspace config
		if err := db.Where("workspace_id = ?", workspaceID).
			Assign(models).
			FirstOrCreate(&wsConfig).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message":          "LLM provider config updated",
			"provider":         req.Provider,
			"default_model":    req.DefaultModel,
			"embedding_model":  req.EmbeddingModel,
		})
	}
}

// validateLLMProviderHandler validates that the API key for a provider works
func validateLLMProviderHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		provider := c.Param("provider")

		var req struct {
			ApiKey   string `json:"api_key"`
			BaseURL  string `json:"base_url"`
		}
		c.ShouldBindJSON(&req)

		validProviders := map[string]bool{
			"openrouter": true, "openai": true, "anthropic": true,
			"gemini": true, "local": true, "xai": true, "qwen": true,
		}
		if !validProviders[provider] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported provider: " + provider})
			return
		}

		if provider == "local" {
			// Local provider: check if base URL is reachable
			baseUrl := req.BaseURL
			if baseUrl == "" {
				c.JSON(http.StatusOK, gin.H{"valid": true, "provider": provider, "note": "local provider requires no API key"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"valid": true, "provider": provider})
			return
		}

		if req.ApiKey == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "api_key is required for " + provider})
			return
		}

		// Make a simple API call to validate the key
		var endpoint string
		var headers map[string]string

		switch provider {
		case "openrouter":
			endpoint = "https://openrouter.ai/api/v1/models"
			headers = map[string]string{
				"Authorization": "Bearer " + req.ApiKey,
				"HTTP-Referer":  "https://cadensend.app",
			}
		case "openai":
			baseUrl := req.BaseURL
			if baseUrl == "" {
				baseUrl = "https://api.openai.com/v1"
			}
			endpoint = baseUrl + "/models"
			headers = map[string]string{
				"Authorization": "Bearer " + req.ApiKey,
			}
		case "anthropic":
			endpoint = "https://api.anthropic.com/v1/messages"
			headers = map[string]string{
				"x-api-key":           req.ApiKey,
				"anthropic-version":   "2023-06-01",
				"Content-Type":        "application/json",
			}
		case "gemini":
			endpoint = "https://generativelanguage.googleapis.com/v1/models?key=" + req.ApiKey
		case "xai":
			endpoint = "https://api.x.ai/v1/models"
			headers = map[string]string{
				"Authorization": "Bearer " + req.ApiKey,
			}
		case "qwen":
			endpoint = "https://dashscope.aliyuncs.com/compatible-mode/v1/models"
			headers = map[string]string{
				"Authorization": "Bearer " + req.ApiKey,
			}
		}

		httpReq, _ := http.NewRequest(http.MethodGet, endpoint, nil)
		if httpReq == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create request"})
			return
		}

		for k, v := range headers {
			httpReq.Header.Set(k, v)
		}

		resp, err := http.DefaultClient.Do(httpReq)
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"valid": false, "error": "failed to reach provider"})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			c.JSON(http.StatusOK, gin.H{"valid": true, "provider": provider})
		} else {
			c.JSON(http.StatusOK, gin.H{"valid": false, "provider": provider, "status_code": resp.StatusCode})
		}
	}
}

// getLLMUsageHandler returns usage statistics for LLM calls
func getLLMUsageHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaceID := c.GetString("workspace_id")

		var results []struct {
			Provider      string  `json:"provider"`
			Model         string  `json:"model"`
			InputTokens   int     `json:"input_tokens"`
			OutputTokens  int     `json:"output_tokens"`
			TotalCost     float64 `json:"total_cost"`
			CallCount     int     `json:"call_count"`
		}

		err := db.Model(&service.LLMUsage{}).
			Select("provider, model, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, SUM(cost_estimate) as total_cost, COUNT(*) as call_count").
			Where("workspace_id = ?", workspaceID).
			Group("provider, model").
			Scan(&results).Error

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"data": results})
	}
}