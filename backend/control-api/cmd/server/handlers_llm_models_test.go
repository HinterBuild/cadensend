package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCuratedProviderModelsOpenRouter(t *testing.T) {
	models := curatedProviderModels("openrouter")
	assert.NotEmpty(t, models)
	ids := map[string]bool{}
	for _, m := range models {
		ids[m.ID] = true
	}
	assert.True(t, ids["poolside/laguna-s-2.1:free"])
	assert.True(t, ids["meta-llama/llama-3.3-70b-instruct:free"])
}

func TestCuratedProviderModelsAnthropic(t *testing.T) {
	models := curatedProviderModels("anthropic")
	assert.GreaterOrEqual(t, len(models), 3)
	found := false
	for _, m := range models {
		if m.ID == "claude-sonnet-5" {
			found = true
		}
	}
	assert.True(t, found, "expected claude-sonnet-5 in anthropic fallbacks")
}

func TestCuratedProviderModelsUnknown(t *testing.T) {
	assert.Nil(t, curatedProviderModels("unknown"))
}

func TestIsOpenAIChatModel(t *testing.T) {
	assert.True(t, isOpenAIChatModel("gpt-4o"))
	assert.True(t, isOpenAIChatModel("o3-mini"))
	assert.True(t, isOpenAIChatModel("chatgpt-4o-latest"))
	assert.False(t, isOpenAIChatModel("text-embedding-3-small"))
	assert.False(t, isOpenAIChatModel("whisper-1"))
	assert.False(t, isOpenAIChatModel("dall-e-3"))
}

func TestProviderModelsToJSON(t *testing.T) {
	out := providerModelsToJSON([]providerModel{{ID: "m1", Name: "Model 1"}})
	assert.Len(t, out, 1)
	assert.Equal(t, "m1", out[0]["id"])
	assert.Equal(t, "Model 1", out[0]["name"])
}

func TestResolveProviderModelsAnthropicFallback(t *testing.T) {
	models := resolveProviderModels(nil, "", "anthropic")
	assert.NotNil(t, models)
	assert.GreaterOrEqual(t, len(models), 1)
}
