package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"backend/control-api/internal/service"
)

type providerModel struct {
	ID   string
	Name string
}

func curatedProviderModels(provider string) []providerModel {
	switch provider {
	case "openrouter":
		return []providerModel{
			{ID: "poolside/laguna-s-2.1:free", Name: "Laguna S2.1 (Free)"},
			{ID: "meta-llama/llama-3.3-70b-instruct:free", Name: "Llama 3.3 70B (Free)"},
			{ID: "qwen/qwen3-next-80b-a3b-instruct:free", Name: "Qwen3 Next 80B (Free)"},
			{ID: "openai/gpt-oss-120b:free", Name: "GPT OSS 120B (Free)"},
			{ID: "google/gemma-4-31b-it:free", Name: "Gemma 4 31B (Free)"},
		}
	case "openai":
		return []providerModel{
			{ID: "gpt-5.6-luna", Name: "GPT-5.6 Luna"},
			{ID: "gpt-5.6-luna-pro", Name: "GPT-5.6 Luna Pro"},
			{ID: "gpt-6-astra", Name: "GPT-6 Astra"},
			{ID: "gpt-4o", Name: "GPT-4o"},
			{ID: "gpt-4o-mini", Name: "GPT-4o Mini"},
			{ID: "o3", Name: "o3"},
			{ID: "o3-mini", Name: "o3 Mini"},
		}
	case "anthropic":
		return []providerModel{
			{ID: "claude-opus-5", Name: "Claude Opus 5"},
			{ID: "claude-sonnet-5", Name: "Claude Sonnet 5"},
			{ID: "claude-fable-5.1", Name: "Claude Fable 5.1"},
			{ID: "claude-haiku-4-20250514", Name: "Claude Haiku 4"},
		}
	case "gemini":
		return []providerModel{
			{ID: "gemini-3.8-flash", Name: "Gemini 3.8 Flash"},
			{ID: "gemini-3.7-flash", Name: "Gemini 3.7 Flash"},
			{ID: "gemini-3.5-flash-lite", Name: "Gemini 3.5 Flash Lite"},
			{ID: "gemini-2.5-pro", Name: "Gemini 2.5 Pro"},
		}
	case "local":
		return []providerModel{
			{ID: "llama3.3", Name: "Llama 3.3"},
			{ID: "llama4", Name: "Llama 4"},
			{ID: "qwen3", Name: "Qwen 3"},
			{ID: "gemma3", Name: "Gemma 3"},
		}
	case "xai":
		return []providerModel{
			{ID: "grok-4.6", Name: "Grok 4.6"},
			{ID: "grok-4.5", Name: "Grok 4.5"},
			{ID: "grok-4.20", Name: "Grok 4.20"},
			{ID: "grok-4.3", Name: "Grok 4.3"},
		}
	case "qwen":
		return []providerModel{
			{ID: "qwen3.8-max", Name: "Qwen3.8 Max"},
			{ID: "qwen3.8-flash", Name: "Qwen3.8 Flash"},
			{ID: "qwen3.7-plus", Name: "Qwen3.7 Plus"},
			{ID: "qwen3.7-max", Name: "Qwen3.7 Max"},
		}
	default:
		return nil
	}
}

func providerModelsToJSON(models []providerModel) []gin.H {
	out := make([]gin.H, 0, len(models))
	for _, m := range models {
		out = append(out, gin.H{"id": m.ID, "name": m.Name})
	}
	return out
}

func getWorkspaceLLMCredentials(db *gorm.DB, workspaceID string, provider string) (apiKey string, baseURL string) {
	if db == nil || workspaceID == "" {
		return "", ""
	}
	var wsConfig service.WorkspaceLLMConfig
	if err := db.Where("workspace_id = ?", workspaceID).First(&wsConfig).Error; err != nil {
		return "", ""
	}
	var configs map[string]interface{}
	if wsConfig.Configs != nil {
		json.Unmarshal(wsConfig.Configs, &configs)
	}
	if nested, ok := configs[provider].(map[string]interface{}); ok {
		if k, ok := nested["api_key"].(string); ok {
			apiKey = strings.TrimSpace(k)
		}
		if u, ok := nested["base_url"].(string); ok {
			baseURL = strings.TrimSpace(u)
		}
	}
	if provider == "openrouter" && apiKey == "" {
		if k, ok := configs["api_key"].(string); ok {
			apiKey = strings.TrimSpace(k)
		}
	}
	return apiKey, baseURL
}

func httpGetJSON(url string, headers map[string]string) (map[string]interface{}, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: 12 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func fetchOpenRouterModels(apiKey string) []providerModel {
	headers := map[string]string{
		"HTTP-Referer": "https://cadensend.app",
		"X-Title":      "Cadensend",
	}
	if apiKey != "" {
		headers["Authorization"] = "Bearer " + apiKey
	}
	payload, err := httpGetJSON("https://openrouter.ai/api/v1/models", headers)
	if err != nil {
		return nil
	}
	data, ok := payload["data"].([]interface{})
	if !ok {
		return nil
	}
	models := make([]providerModel, 0, len(data))
	for _, item := range data {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		id, _ := m["id"].(string)
		if id == "" || strings.Contains(strings.ToLower(id), "embed") {
			continue
		}
		name, _ := m["name"].(string)
		if name == "" {
			name = id
		}
		models = append(models, providerModel{ID: id, Name: name})
	}
	sort.Slice(models, func(i, j int) bool {
		iFree := strings.HasSuffix(models[i].ID, ":free")
		jFree := strings.HasSuffix(models[j].ID, ":free")
		if iFree != jFree {
			return iFree
		}
		return models[i].ID < models[j].ID
	})
	return models
}

func fetchOpenAIModels(apiKey, baseURL string) []providerModel {
	if apiKey == "" {
		return nil
	}
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	baseURL = strings.TrimRight(baseURL, "/")
	payload, err := httpGetJSON(baseURL+"/models", map[string]string{
		"Authorization": "Bearer " + apiKey,
	})
	if err != nil {
		return nil
	}
	data, ok := payload["data"].([]interface{})
	if !ok {
		return nil
	}
	models := make([]providerModel, 0)
	for _, item := range data {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		id, _ := m["id"].(string)
		if id == "" || !isOpenAIChatModel(id) {
			continue
		}
		models = append(models, providerModel{ID: id, Name: id})
	}
	sort.Slice(models, func(i, j int) bool { return models[i].ID > models[j].ID })
	return models
}

func isOpenAIChatModel(id string) bool {
	lower := strings.ToLower(id)
	if strings.Contains(lower, "embed") || strings.Contains(lower, "whisper") ||
		strings.Contains(lower, "tts") || strings.Contains(lower, "dall-e") ||
		strings.Contains(lower, "moderation") || strings.Contains(lower, "realtime") {
		return false
	}
	return strings.HasPrefix(lower, "gpt-") || strings.HasPrefix(lower, "o") ||
		strings.HasPrefix(lower, "chatgpt-")
}

func fetchGeminiModels(apiKey string) []providerModel {
	if apiKey == "" {
		return nil
	}
	payload, err := httpGetJSON("https://generativelanguage.googleapis.com/v1/models?key="+apiKey, nil)
	if err != nil {
		return nil
	}
	data, ok := payload["models"].([]interface{})
	if !ok {
		return nil
	}
	models := make([]providerModel, 0)
	for _, item := range data {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		fullName, _ := m["name"].(string)
		id := strings.TrimPrefix(fullName, "models/")
		if id == "" || !strings.Contains(strings.ToLower(id), "gemini") {
			continue
		}
		methods, _ := m["supportedGenerationMethods"].([]interface{})
		supportsGenerate := false
		for _, method := range methods {
			if method == "generateContent" {
				supportsGenerate = true
				break
			}
		}
		if !supportsGenerate {
			continue
		}
		display, _ := m["displayName"].(string)
		if display == "" {
			display = id
		}
		models = append(models, providerModel{ID: id, Name: display})
	}
	sort.Slice(models, func(i, j int) bool { return models[i].ID > models[j].ID })
	return models
}

func fetchOpenAICompatibleModels(endpoint string, apiKey string) []providerModel {
	if apiKey == "" {
		return nil
	}
	payload, err := httpGetJSON(endpoint, map[string]string{
		"Authorization": "Bearer " + apiKey,
	})
	if err != nil {
		return nil
	}
	data, ok := payload["data"].([]interface{})
	if !ok {
		return nil
	}
	models := make([]providerModel, 0, len(data))
	for _, item := range data {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		id, _ := m["id"].(string)
		if id == "" {
			continue
		}
		name, _ := m["name"].(string)
		if name == "" {
			name = id
		}
		models = append(models, providerModel{ID: id, Name: name})
	}
	sort.Slice(models, func(i, j int) bool { return models[i].ID > models[j].ID })
	return models
}

func fetchLocalModels(baseURL string) []providerModel {
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}
	baseURL = strings.TrimRight(baseURL, "/")
	baseURL = strings.TrimSuffix(baseURL, "/v1")
	reqURL := baseURL + "/api/tags"
	payload, err := httpGetJSON(reqURL, nil)
	if err != nil {
		return nil
	}
	data, ok := payload["models"].([]interface{})
	if !ok {
		return nil
	}
	models := make([]providerModel, 0, len(data))
	for _, item := range data {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		name, _ := m["name"].(string)
		if name == "" {
			continue
		}
		models = append(models, providerModel{ID: name, Name: name})
	}
	sort.Slice(models, func(i, j int) bool { return models[i].ID < models[j].ID })
	return models
}

func resolveProviderModels(db *gorm.DB, workspaceID string, provider string) []gin.H {
	apiKey, baseURL := getWorkspaceLLMCredentials(db, workspaceID, provider)
	var live []providerModel

	switch provider {
	case "openrouter":
		live = fetchOpenRouterModels(apiKey)
	case "openai":
		live = fetchOpenAIModels(apiKey, baseURL)
	case "gemini":
		live = fetchGeminiModels(apiKey)
	case "xai":
		live = fetchOpenAICompatibleModels("https://api.x.ai/v1/models", apiKey)
	case "qwen":
		live = fetchOpenAICompatibleModels("https://dashscope.aliyuncs.com/compatible-mode/v1/models", apiKey)
	case "local":
		live = fetchLocalModels(baseURL)
	case "anthropic":
		// Anthropic has no public models list API — curated list only.
		live = nil
	}

	if len(live) > 0 {
		return providerModelsToJSON(live)
	}
	curated := curatedProviderModels(provider)
	if curated == nil {
		return nil
	}
	return providerModelsToJSON(curated)
}
