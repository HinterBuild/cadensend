package contentstructure

import "testing"

func TestAnalyzeFlagsConsecutiveDiagrams(t *testing.T) {
	content := map[string]any{
		"content_blocks": []any{
			map[string]any{
				"title": "Modes",
				"text":  "Intro paragraph with enough context for readers.\n\n```mermaid\nflowchart TD\n  A-->B\n```\n\n```mermaid\nflowchart TD\n  C-->D\n```",
			},
		},
	}
	checks := Analyze(content)
	found := false
	for _, check := range checks {
		if check.ID == "consecutive_diagrams_in_block" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected consecutive diagram check, got %#v", checks)
	}
}

func TestAnalyzeFlagsEmailOpeningWithCode(t *testing.T) {
	content := map[string]any{
		"content_blocks": []any{
			map[string]any{
				"text": "```bash\necho hello\n```\n\nNow we explain.",
			},
		},
	}
	checks := Analyze(content)
	found := false
	for _, check := range checks {
		if check.ID == "email_opens_with_technical" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected email opening check, got %#v", checks)
	}
}

func TestNormalizePrependsTitleBeforeLeadingFence(t *testing.T) {
	content := map[string]any{
		"content_blocks": []any{
			map[string]any{
				"title": "Launch modes",
				"text":  "```mermaid\nflowchart TD\n  A-->B\n```",
			},
		},
	}
	out := NormalizeContent(content)
	block := out["content_blocks"].([]any)[0].(map[string]any)
	text := block["text"].(string)
	if !startsWith(text, "## Launch modes") {
		t.Fatalf("expected title heading prepended, got %q", text)
	}
}

func startsWith(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}
