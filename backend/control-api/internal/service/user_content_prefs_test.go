package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseContentPreferencesEmpty(t *testing.T) {
	prefs := parseContentPreferences(nil)
	assert.Empty(t, prefs.CustomVoices)
	assert.Empty(t, prefs.CustomGoals)
}

func TestParseContentPreferencesValidJSON(t *testing.T) {
	raw := []byte(`{"custom_voices":[{"id":"v1","label":"Coach","value":"coach"}],"custom_goals":[{"id":"g1","label":"Labs","text":"Learn hands-on labs step by step."}]}`)
	prefs := parseContentPreferences(raw)
	assert.Len(t, prefs.CustomVoices, 1)
	assert.Equal(t, "Coach", prefs.CustomVoices[0].Label)
	assert.Len(t, prefs.CustomGoals, 1)
}

func TestParseContentPreferencesInvalidJSON(t *testing.T) {
	prefs := parseContentPreferences([]byte(`{not json`))
	assert.Empty(t, prefs.CustomVoices)
	assert.Empty(t, prefs.CustomGoals)
}

func TestEmptyContentPreferences(t *testing.T) {
	prefs := emptyContentPreferences()
	assert.NotNil(t, prefs.CustomVoices)
	assert.NotNil(t, prefs.CustomGoals)
	assert.Len(t, prefs.CustomVoices, 0)
}

func TestUpdateContentPreferencesValidationTooManyVoices(t *testing.T) {
	svc := &UserService{}
	voices := make([]CustomVoice, 31)
	for i := range voices {
		voices[i] = CustomVoice{Label: "V", Value: "v"}
	}
	_, err := svc.UpdateContentPreferences("user-1", ContentPreferences{CustomVoices: voices})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "too many custom voices")
}

func TestUpdateContentPreferencesValidationShortGoal(t *testing.T) {
	svc := &UserService{}
	_, err := svc.UpdateContentPreferences("user-1", ContentPreferences{
		CustomGoals: []CustomGoal{{Label: "X", Text: "short"}},
	})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "at least 10 characters")
}

func TestUpdateContentPreferencesValidationMissingVoiceLabel(t *testing.T) {
	svc := &UserService{}
	_, err := svc.UpdateContentPreferences("user-1", ContentPreferences{
		CustomVoices: []CustomVoice{{Label: "  ", Value: "x"}},
	})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "label is required")
}
