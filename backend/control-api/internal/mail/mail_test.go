package mail

import (
	"strings"
	"testing"
)

func TestFormatLessonHTMLRendersCodeAndMermaid(t *testing.T) {
	src := "Use this command:\n\n```bash\nkubectl get pods\n```\n\nFlow:\n\n```mermaid\nflowchart TD\n  A[Deployment] --> B[ReplicaSet]\n```\n"
	html := formatLessonHTML(src)
	if !strings.Contains(html, "<pre") {
		t.Fatalf("expected code pre block, got %s", html)
	}
	if !strings.Contains(html, "kubectl get pods") {
		t.Fatalf("expected bash command in block, got %s", html)
	}
	if !strings.Contains(html, "kroki.io/mermaid/svg/") {
		t.Fatalf("expected mermaid image, got %s", html)
	}
	if strings.Contains(html, "```") {
		t.Fatalf("raw fences should not remain: %s", html)
	}
}

func TestFormatLessonHTMLInlineCodeAndList(t *testing.T) {
	src := "Create a `Deployment`.\n\n- Keep replicas running\n- Roll forward safely"
	html := formatLessonHTML(src)
	if !strings.Contains(html, "<code") {
		t.Fatalf("expected inline code, got %s", html)
	}
	if !strings.Contains(html, "<ul") || !strings.Contains(html, "<li") {
		t.Fatalf("expected list, got %s", html)
	}
}

func TestFormatLessonHTMLUnfencedCodeAndCalls(t *testing.T) {
	src := "Use setPosition(x, y) and keep balance >= 0.\n\nclass Money {\n  private int cents;\n}\n"
	html := formatLessonHTML(src)
	if !strings.Contains(html, "<code") {
		t.Fatalf("expected inline code chips, got %s", html)
	}
	if !strings.Contains(html, "setPosition(x, y)") {
		t.Fatalf("expected method call, got %s", html)
	}
	if !strings.Contains(html, "<pre") || !strings.Contains(html, "class Money") {
		t.Fatalf("expected unfenced class as code block, got %s", html)
	}
}
func TestRenderIssueHTMLIncludesVisualSpecs(t *testing.T) {
	_, body := RenderIssueHTML("Kubernetes", "learn deploys", map[string]any{
		"subject":   "Deployments",
		"preheader": "Keep pods alive",
		"content_blocks": []any{
			map[string]any{"title": "Why Deployments?", "text": "A bare Pod is fragile."},
		},
		"visual_specs": []any{
			map[string]any{
				"type":     "mermaid",
				"content":  "flowchart LR\n  D[Deployment] --> R[ReplicaSet] --> P[Pods]",
				"alt_text": "Deployment owns ReplicaSet owns Pods",
			},
		},
	}, true)
	if !strings.Contains(body, "kroki.io/mermaid/svg/") {
		t.Fatalf("expected diagram image in email, got %s", body)
	}
	if !strings.Contains(body, "Why Deployments?") {
		t.Fatalf("expected heading, got %s", body)
	}
}
