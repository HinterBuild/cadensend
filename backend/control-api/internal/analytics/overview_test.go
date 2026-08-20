package analytics

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"backend/control-api/internal/service"
)

func ptr(s string) *string { return &s }

func TestClassifyGenre(t *testing.T) {
	if got := ClassifyGenre("Intro to Kubernetes", "learn docker"); got != "programming" {
		t.Fatalf("got %s", got)
	}
	if got := ClassifyGenre("Gardening", "grow tomatoes"); got != "other" {
		t.Fatalf("got %s", got)
	}
}

func TestBuildOverviewCountsDiagramsAndSuggestions(t *testing.T) {
	now := time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)
	payload, err := json.Marshal(map[string]any{
		"visual_specs": []map[string]string{{"type": "mermaid", "content": "graph TD"}},
		"citations":    []map[string]string{{"source_id": "s1"}},
		"content_blocks": []map[string]string{{
			"text": "```python\nprint(1)\n```\n```mermaid\nflowchart LR\n```",
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	content := string(payload)
	series := []service.Series{
		{
			ID:         "ser-1",
			Topic:      "Intro to Python",
			Goal:       "Learn to code",
			Level:      "beginner",
			Status:     "active",
			PlanStatus: "ready",
			PlanJSON:   ptr(`{"modules":[{"title":"Variables"},{"title":"Module 2"}]}`),
			CreatedAt:  now.AddDate(0, 0, -3),
		},
	}
	issues := []service.Issue{
		{
			ID:          "iss-1",
			SeriesID:    "ser-1",
			Status:      "sent",
			Objective:   "Variables",
			ContentJSON: &content,
			CreatedAt:   now.AddDate(0, 0, -2),
			UpdatedAt:   now.AddDate(0, 0, -1),
		},
		{
			ID:        "iss-2",
			SeriesID:  "ser-1",
			Status:    "failed",
			Objective: "Functions",
			CreatedAt: now,
			UpdatedAt: now,
		},
	}
	sources := []service.Source{
		{ID: "src-1", Status: "ready", URL: "https://example.com"},
		{ID: "src-2", Status: "failed", URL: "https://bad.example", SeriesID: "ser-1"},
	}

	out := BuildOverview(now, series, issues, sources)
	if out.Headline.SeriesTotal != 1 || out.Headline.SeriesActive != 1 {
		t.Fatalf("series headline %+v", out.Headline)
	}
	if out.Headline.IssuesSent != 1 {
		t.Fatalf("sent=%d", out.Headline.IssuesSent)
	}
	if out.Headline.Diagrams < 2 {
		t.Fatalf("diagrams=%d", out.Headline.Diagrams)
	}
	if out.Headline.CodeBlocks < 2 {
		t.Fatalf("code blocks=%d", out.Headline.CodeBlocks)
	}
	if out.Pipeline.Failed != 1 {
		t.Fatalf("failed=%d", out.Pipeline.Failed)
	}
	if out.Plan.PlaceholderTitles != 1 {
		t.Fatalf("placeholders=%d", out.Plan.PlaceholderTitles)
	}
	if len(out.Genres) == 0 || out.Genres[0].Name != "programming" {
		t.Fatalf("genres=%+v", out.Genres)
	}
	if len(out.Suggestions) == 0 {
		t.Fatal("expected suggestions")
	}
	foundFailedSource := false
	foundFailedIssue := false
	for _, item := range out.Improvements {
		if item.Kind == "source_failed" {
			foundFailedSource = true
		}
		if item.Kind == "issue_failed" {
			foundFailedIssue = true
		}
	}
	if !foundFailedSource || !foundFailedIssue {
		t.Fatalf("improvements=%+v", out.Improvements)
	}
}

func TestBuildOverviewEmptyWorkspace(t *testing.T) {
	out := BuildOverview(time.Now().UTC(), nil, nil, nil)
	if out.Headline.SeriesTotal != 0 {
		t.Fatalf("expected empty headline")
	}
	if len(out.Suggestions) < 3 {
		t.Fatalf("expected starter suggestions, got %d", len(out.Suggestions))
	}
	if len(out.Activity) != 8 {
		t.Fatalf("expected 8 week buckets, got %d", len(out.Activity))
	}
	raw, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), ":null") {
		t.Fatalf("nil slices must encode as []: %s", raw)
	}
}
