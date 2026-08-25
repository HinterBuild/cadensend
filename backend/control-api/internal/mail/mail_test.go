package mail

import (
	"strings"
	"testing"
)

func TestFormatLessonHTMLRendersCodeAndMermaid(t *testing.T) {
	src := "Use this command:\n\n```bash\nkubectl get pods\n```\n\nFlow:\n\n```mermaid\nflowchart TD\n  A[Deployment] --> B[ReplicaSet]\n```\n"
	html := formatLessonHTML(src, defaultPresentationTheme())
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
	html := formatLessonHTML(src, defaultPresentationTheme())
	if !strings.Contains(html, "<code") {
		t.Fatalf("expected inline code, got %s", html)
	}
	if !strings.Contains(html, "<ul") || !strings.Contains(html, "<li") {
		t.Fatalf("expected list, got %s", html)
	}
}

func TestFormatLessonHTMLUnfencedCodeAndCalls(t *testing.T) {
	src := "Use setPosition(x, y) and keep balance >= 0.\n\nclass Money {\n  private int cents;\n}\n"
	html := formatLessonHTML(src, defaultPresentationTheme())
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

func TestRenderIssueHTMLRendersCitations(t *testing.T) {
	content := map[string]any{
		"subject":   "Grounded issue",
		"preheader": "with sources",
		"content_blocks": []any{
			map[string]any{
				"title": "Body",
				"text":  "Deployments manage ReplicaSets.",
				"citations": []any{
					map[string]any{"source_id": "src-1", "text": "A Deployment provides declarative updates for Pods."},
				},
			},
		},
	}
	refs := map[string]SourceRef{
		"src-1": {Label: "https://kubernetes.io/docs/deployments", URL: "https://kubernetes.io/docs/deployments"},
	}
	subject, body := RenderIssueHTML("K8s course", "learn deploys", content, false, refs, "")
	if subject != "Grounded issue" {
		t.Fatalf("unexpected subject %q", subject)
	}
	if !strings.Contains(body, ">Sources<") {
		t.Fatalf("expected citations footer, got %s", body)
	}
	if !strings.Contains(body, `href="https://kubernetes.io/docs/deployments"`) {
		t.Fatalf("expected citation link, got %s", body)
	}
	if !strings.Contains(body, "declarative updates") {
		t.Fatalf("expected citation snippet, got %s", body)
	}
}

func TestRenderIssueHTMLSubscriberGetsUnsubscribeFooter(t *testing.T) {
	content := map[string]any{
		"subject":        "Hello",
		"content_blocks": []any{map[string]any{"text": "Hi there."}},
	}
	_, real := RenderIssueHTML("Topic", "goal", content, false, nil, "https://app.example.com/unsub")
	if !strings.Contains(real, "https://app.example.com/unsub") || !strings.Contains(real, "Unsubscribe") {
		t.Fatalf("expected unsubscribe link on a subscriber send, got %s", real)
	}
	if strings.Contains(real, "TEST EMAIL") {
		t.Fatalf("subscriber send must not carry the test banner: %s", real)
	}

	_, test := RenderIssueHTML("Topic", "goal", content, true, nil, "")
	if strings.Contains(test, "Unsubscribe</a>") && !strings.Contains(test, "TEST EMAIL") {
		t.Fatalf("test render should keep the test banner and no forced unsub: %s", test)
	}
}

func TestCitationsWithoutRefsStillRenderSnippet(t *testing.T) {
	content := map[string]any{
		"subject": "S",
		"content_blocks": []any{
			map[string]any{
				"text": "Body text.",
				"citations": []any{
					map[string]any{"source_id": "abc123", "text": "quoted fact"},
				},
			},
		},
	}
	_, body := RenderIssueHTML("T", "g", content, true)
	if !strings.Contains(body, "abc123") || !strings.Contains(body, "quoted fact") {
		t.Fatalf("expected fallback citation rendering, got %s", body)
	}
}

func TestRenderIssueHTMLAppliesPresentationSettings(t *testing.T) {
	themedSource := themedDiagramSource("mermaid", "flowchart LR\n  A --> B", presentationTheme{DiagramTheme: "dark"})
	if !strings.Contains(themedSource, "theme': 'dark'") {
		t.Fatalf("expected dark mermaid init directive, got %s", themedSource)
	}

	_, body := RenderIssueHTML("Topic", "goal", map[string]any{
		"subject":   "Styled issue",
		"preheader": "Styled preview",
		"presentation": map[string]any{
			"style_preset":     "digest",
			"font_pair":        "technical",
			"diagram_theme":    "dark",
			"diagram_style":    "shadow",
			"accent_color":     "#123456",
			"background_color": "#f0f4ff",
		},
		"content_blocks": []any{
			map[string]any{"title": "Body", "text": "```mermaid\nflowchart LR\n  A --> B\n```"},
		},
	}, true)
	if !strings.Contains(body, "background:#f0f4ff") {
		t.Fatalf("expected custom background color, got %s", body)
	}
	if !strings.Contains(body, "background:#123456") {
		t.Fatalf("expected custom accent color, got %s", body)
	}
	if !strings.Contains(body, "box-shadow:0 16px 40px") {
		t.Fatalf("expected shadow diagram styling, got %s", body)
	}
}
