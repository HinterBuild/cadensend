// Package main - HTTP handlers for LLM provider configuration and management
package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"backend/control-api/internal/service"
)

var validLLMProviders = map[string]bool{
	"openrouter": true, "openai": true, "anthropic": true,
	"gemini": true, "local": true, "xai": true, "qwen": true,
}

func sanitizeLLMConfigsForResponse(configs map[string]interface{}) map[string]interface{} {
	if configs == nil {
		return map[string]interface{}{}
	}
	out := map[string]interface{}{}
	for k, v := range configs {
		if k == "api_key" {
			if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
				out["has_api_key"] = true
			}
			continue
		}
		if nested, ok := v.(map[string]interface{}); ok {
			clean := map[string]interface{}{}
			for nk, nv := range nested {
				if nk == "api_key" {
					if s, ok := nv.(string); ok && strings.TrimSpace(s) != "" {
						clean["has_api_key"] = true
					}
					continue
				}
				clean[nk] = nv
			}
			out[k] = clean
			continue
		}
		out[k] = v
	}
	return out
}

func mergeLLMConfigs(existing map[string]interface{}, incoming map[string]interface{}) map[string]interface{} {
	if existing == nil {
		existing = map[string]interface{}{}
	}
	for k, v := range incoming {
		if existingNested, ok := existing[k].(map[string]interface{}); ok {
			if newNested, ok := v.(map[string]interface{}); ok {
				for nk, nv := range newNested {
					existingNested[nk] = nv
				}
				existing[k] = existingNested
				continue
			}
		}
		existing[k] = v
	}
	return existing
}

func resolveWorkspaceLLM(db *gorm.DB, workspaceID string, requestedModel string) (provider string, model string) {
	provider = cfg.DefaultProvider
	model = cfg.DefaultModel
	if strings.TrimSpace(requestedModel) != "" {
		model = strings.TrimSpace(requestedModel)
	}

	var wsConfig service.WorkspaceLLMConfig
	if err := db.Where("workspace_id = ?", workspaceID).First(&wsConfig).Error; err != nil {
		return provider, model
	}
	if strings.TrimSpace(wsConfig.DefaultProvider) != "" {
		provider = wsConfig.DefaultProvider
	}
	if strings.TrimSpace(requestedModel) == "" && strings.TrimSpace(wsConfig.DefaultModel) != "" {
		model = wsConfig.DefaultModel
	}
	return provider, model
}

// listLLMProvidersHandler returns all registered LLM providers
func listLLMProvidersHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		providers := []gin.H{
			{
				"id":             "openrouter",
				"name":           "OpenRouter",
				"description":    "Unified API gateway for 100+ models",
				"supports_chat":  true,
				"supports_embed": true,
			},
			{
				"id":             "openai",
				"name":           "OpenAI",
				"description":    "OpenAI GPT models",
				"supports_chat":  true,
				"supports_embed": true,
			},
			{
				"id":             "anthropic",
				"name":           "Anthropic",
				"description":    "Claude models",
				"supports_chat":  true,
				"supports_embed": false,
			},
			{
				"id":             "gemini",
				"name":           "Google Gemini",
				"description":    "Google Gemini models",
				"supports_chat":  true,
				"supports_embed": true,
			},
			{
				"id":             "local",
				"name":           "Local LLM",
				"description":    "Ollama, llama.cpp, and other local providers",
				"supports_chat":  true,
				"supports_embed": true,
			},
			{
				"id":             "xai",
				"name":           "xAI",
				"description":    "xAI Grok models",
				"supports_chat":  true,
				"supports_embed": false,
			},
			{
				"id":             "qwen",
				"name":           "Qwen",
				"description":    "Qwen models via DashScope",
				"supports_chat":  true,
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
		if !validLLMProviders[provider] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unknown provider: " + provider})
			return
		}

		workspaceID := c.GetString("workspace_id")
		models := resolveProviderModels(db, workspaceID, provider)
		if models == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unknown provider: " + provider})
			return
		}

		c.JSON(http.StatusOK, gin.H{"data": models})
	}
}

// getLLMProviderConfigHandler returns the workspace's current LLM configuration
func getLLMProviderConfigHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaceID := c.GetString("workspace_id")

		var wsConfig service.WorkspaceLLMConfig
		if err := db.Where("workspace_id = ?", workspaceID).First(&wsConfig).Error; err != nil {
			c.JSON(http.StatusOK, gin.H{
				"data": gin.H{
					"provider":        cfg.DefaultProvider,
					"default_model":   cfg.DefaultModel,
					"embedding_model": cfg.EmbeddingModel,
					"configs":         gin.H{},
				},
			})
			return
		}

		var configs map[string]interface{}
		if wsConfig.Configs != nil {
			json.Unmarshal(wsConfig.Configs, &configs)
		}

		c.JSON(http.StatusOK, gin.H{
			"data": gin.H{
				"provider":        wsConfig.DefaultProvider,
				"default_model":   wsConfig.DefaultModel,
				"embedding_model": wsConfig.EmbeddingModel,
				"configs":         sanitizeLLMConfigsForResponse(configs),
			},
		})
	}
}

// updateLLMProviderConfigHandler updates the workspace's LLM provider configuration
func updateLLMProviderConfigHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaceID := c.GetString("workspace_id")

		var req struct {
			Provider       string                 `json:"provider"`
			DefaultModel   string                 `json:"default_model"`
			EmbeddingModel string                 `json:"embedding_model"`
			Configs        map[string]interface{} `json:"configs"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var existing service.WorkspaceLLMConfig
		found := db.Where("workspace_id = ?", workspaceID).First(&existing).Error == nil

		provider := strings.TrimSpace(req.Provider)
		if provider == "" && found {
			provider = existing.DefaultProvider
		}
		if provider == "" {
			provider = cfg.DefaultProvider
		}
		if !validLLMProviders[provider] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported provider: " + provider})
			return
		}

		defaultModel := strings.TrimSpace(req.DefaultModel)
		if defaultModel == "" && found {
			defaultModel = existing.DefaultModel
		}
		if defaultModel == "" {
			defaultModel = cfg.DefaultModel
		}

		embeddingModel := strings.TrimSpace(req.EmbeddingModel)
		if embeddingModel == "" && found {
			embeddingModel = existing.EmbeddingModel
		}
		if embeddingModel == "" {
			embeddingModel = cfg.EmbeddingModel
		}

		mergedConfigs := map[string]interface{}{}
		if found && existing.Configs != nil {
			json.Unmarshal(existing.Configs, &mergedConfigs)
		}
		if req.Configs != nil {
			mergedConfigs = mergeLLMConfigs(mergedConfigs, req.Configs)
		}
		configsBytes, _ := json.Marshal(mergedConfigs)

		now := time.Now()
		wsConfig := service.WorkspaceLLMConfig{
			WorkspaceID:     workspaceID,
			DefaultProvider: provider,
			DefaultModel:    defaultModel,
			EmbeddingModel:  embeddingModel,
			Configs:         configsBytes,
			UpdatedAt:       now,
		}
		if !found {
			wsConfig.CreatedAt = now
		}

		if err := db.Where("workspace_id = ?", workspaceID).
			Assign(map[string]interface{}{
				"default_provider": provider,
				"default_model":    defaultModel,
				"embedding_model": embeddingModel,
				"configs":          configsBytes,
				"updated_at":       now,
			}).
			FirstOrCreate(&wsConfig).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message":         "LLM provider config updated",
			"data": gin.H{
				"provider":        provider,
				"default_model":   defaultModel,
				"embedding_model": embeddingModel,
			},
		})
	}
}

// validateLLMProviderHandler validates that the API key for a provider works
func validateLLMProviderHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		provider := c.Param("provider")

		var req struct {
			ApiKey  string `json:"api_key"`
			BaseURL string `json:"base_url"`
		}
		c.ShouldBindJSON(&req)

		if !validLLMProviders[provider] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported provider: " + provider})
			return
		}

		if provider == "local" {
			c.JSON(http.StatusOK, gin.H{"valid": true, "provider": provider, "note": "local provider requires no API key"})
			return
		}

		if req.ApiKey == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "api_key is required for " + provider})
			return
		}

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
				"x-api-key":         req.ApiKey,
				"anthropic-version": "2023-06-01",
				"Content-Type":      "application/json",
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
			Provider     string  `json:"provider"`
			Model        string  `json:"model"`
			InputTokens  int     `json:"input_tokens"`
			OutputTokens int     `json:"output_tokens"`
			TotalCost    float64 `json:"total_cost"`
			CallCount    int     `json:"call_count"`
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
