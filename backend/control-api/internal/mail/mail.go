package mail

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"strings"
	"time"
)

type Config struct {
	APIURL   string
	APIKey   string
	From     string
	FromName string
}

type Message struct {
	To      string
	Subject string
	HTML    string
}

func Send(cfg Config, msg Message) error {
	apiKey := strings.TrimSpace(cfg.APIKey)
	if apiKey == "" {
		return fmt.Errorf("BREVO_API_KEY is not set")
	}
	from := strings.TrimSpace(cfg.From)
	if from == "" {
		return fmt.Errorf("SMTP_FROM is not set")
	}
	apiURL := strings.TrimSpace(cfg.APIURL)
	if apiURL == "" {
		return fmt.Errorf("BREVO_API_URL is not set")
	}
	fromName := strings.TrimSpace(cfg.FromName)
	if fromName == "" {
		fromName = from
	}

	payload := map[string]any{
		"sender": map[string]string{
			"name":  fromName,
			"email": from,
		},
		"to": []map[string]string{
			{"email": msg.To},
		},
		"subject":     msg.Subject,
		"htmlContent": msg.HTML,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, apiURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("api-key", apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("email send failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	return nil
}

// SourceRef resolves a source_id into a display label for citations.
type SourceRef struct {
	Label string
	URL   string
}

func RenderIssueHTML(seriesTopic, seriesGoal string, content map[string]any, test bool, opts ...any) (subject string, htmlBody string) {
	unsubscribeURL := firstStringOption(opts)
	sourceRefs := sourceRefsOption(opts)

	subject = firstString(content, "subject", "title")
	if subject == "" {
		subject = seriesTopic
	}
	preheader := firstString(content, "preheader", "summary")
	blocks := extractBlocks(content)

	kind := "Issue"
	if test {
		kind = "Issue preview"
	}

	var body strings.Builder
	writeLayoutStart(&body, seriesTopic, kind, test)
	if preheader != "" {
		fmt.Fprintf(&body, `<p style="color:#57534e;font-size:15px;margin:0 0 20px;">%s</p>`, esc(preheader))
	}
	if len(blocks) == 0 {
		fmt.Fprintf(&body, `<p style="color:#1c1917;">%s</p>`, esc(seriesGoal))
	}
	for _, block := range blocks {
		if block.title != "" {
			fmt.Fprintf(&body, `<h2 style="font-family:Georgia,serif;font-size:18px;color:#1c1917;margin:24px 0 8px;">%s</h2>`, esc(block.title))
		}
		body.WriteString(formatLessonHTML(block.text))
		writeCitations(&body, block.citations, sourceRefs)
	}
	inBody := false
	for _, block := range blocks {
		lower := strings.ToLower(block.text)
		if strings.Contains(lower, "```mermaid") || strings.Contains(lower, "```d2") {
			inBody = true
			break
		}
	}
	if !inBody {
		writeVisuals(&body, extractVisuals(content))
	}
	writeLayoutEndOpts(&body, unsubscribeURL)
	return subject, body.String()
}

func firstStringOption(opts []any) string {
	for _, o := range opts {
		if s, ok := o.(string); ok && s != "" {
			return s
		}
	}
	return ""
}

func sourceRefsOption(opts []any) map[string]SourceRef {
	for _, o := range opts {
		if m, ok := o.(map[string]SourceRef); ok {
			return m
		}
	}
	return nil
}

// writeCitations renders a compact grounded-sources footer for a content
// block when the generation pipeline attached citations to it.
func writeCitations(b *strings.Builder, citations []citation, refs map[string]SourceRef) {
	if len(citations) == 0 {
		return
	}
	b.WriteString(`<div style="border-top:1px dashed #d6cdc0;margin-top:14px;padding-top:10px;">`)
	b.WriteString(`<p style="margin:0 0 6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#78716c;">Sources</p>`)
	b.WriteString(`<ul style="margin:0;padding-left:18px;color:#57534e;font-size:12px;line-height:1.55;">`)
	for _, cit := range citations {
		label := cit.SourceID
		url := ""
		if ref, ok := refs[cit.SourceID]; ok {
			if ref.Label != "" {
				label = ref.Label
			}
			url = ref.URL
		}
		snippet := strings.TrimSpace(cit.Text)
		if len(snippet) > 160 {
			snippet = snippet[:157] + "..."
		}
		content := esc(label)
		if url != "" {
			content = fmt.Sprintf(`<a href="%s" style="color:#57534e;" target="_blank" rel="noopener">%s</a>`, esc(url), esc(label))
		}
		if snippet != "" {
			content += " — " + esc("“" + snippet + "”")
		}
		fmt.Fprintf(b, `<li style="margin:0 0 4px;">%s</li>`, content)
	}
	b.WriteString(`</ul></div>`)
}

func RenderPlanModuleHTML(seriesTopic, seriesGoal, level string, index int, module map[string]any) (subject string, htmlBody string) {
	title := firstString(module, "title")
	if title == "" {
		title = fmt.Sprintf("Module %d", index+1)
	}
	summary := firstString(module, "summary")
	objectives := stringList(module["learning_objectives"])
	subject = fmt.Sprintf("%s — %s", title, seriesTopic)

	var body strings.Builder
	writeLayoutStart(&body, seriesTopic, "Curriculum preview", true)
	fmt.Fprintf(&body, `<p style="color:#78716c;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 8px;">Module %d</p>`, index+1)
	fmt.Fprintf(&body, `<h2 style="font-family:Georgia,serif;font-size:22px;color:#1c1917;margin:0 0 12px;">%s</h2>`, esc(title))
	if summary != "" {
		fmt.Fprintf(&body, `<p style="color:#44403c;font-size:15px;line-height:1.6;">%s</p>`, esc(summary))
	} else if seriesGoal != "" {
		fmt.Fprintf(&body, `<p style="color:#44403c;font-size:15px;line-height:1.6;">Goal: %s</p>`, esc(seriesGoal))
	}
	if level != "" {
		fmt.Fprintf(&body, `<p style="color:#78716c;font-size:13px;">Level: %s</p>`, esc(level))
	}
	if len(objectives) > 0 {
		body.WriteString(`<p style="font-weight:600;color:#1c1917;margin:20px 0 8px;">What you will learn</p><ul style="color:#44403c;padding-left:20px;">`)
		for _, obj := range objectives {
			fmt.Fprintf(&body, `<li style="margin:0 0 6px;">%s</li>`, esc(obj))
		}
		body.WriteString(`</ul>`)
	}
	body.WriteString(`<p style="margin-top:24px;color:#78716c;font-size:13px;">This is a plan preview. Generated issues will include the full lesson body and citations.</p>`)
	writeLayoutEnd(&body)
	return subject, body.String()
}

type contentBlock struct {
	title      string
	text       string
	citations  []citation
}

type citation struct {
	SourceID string
	Text     string
}

func extractBlocks(content map[string]any) []contentBlock {
	raw, ok := content["content_blocks"].([]any)
	if !ok {
		return nil
	}
	out := make([]contentBlock, 0, len(raw))
	for _, item := range raw {
		block, ok := item.(map[string]any)
		if !ok {
			continue
		}
		text := firstString(block, "text", "content", "markdown")
		if text == "" {
			continue
		}
		out = append(out, contentBlock{
			title:     firstString(block, "title"),
			text:      text,
			citations: extractCitations(block["citations"]),
		})
	}
	return out
}

func extractCitations(raw any) []citation {
	list, ok := raw.([]any)
	if !ok {
		return nil
	}
	out := make([]citation, 0, len(list))
	for _, item := range list {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		sourceID := firstString(m, "source_id")
		if sourceID == "" {
			continue
		}
		out = append(out, citation{
			SourceID: sourceID,
			Text:     firstString(m, "text", "quote", "snippet"),
		})
	}
	return out
}

func writeLayoutStart(b *strings.Builder, seriesTopic, kind string, test bool) {
	b.WriteString(`<!DOCTYPE html><html><body style="margin:0;background:#f5f0e8;padding:24px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">`)
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">`)
	b.WriteString(`<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fffaf3;border:1px solid #e7e0d6;border-radius:16px;overflow:hidden;">`)
	fmt.Fprintf(b, `<tr><td style="background:#1c1917;color:#fafaf9;padding:16px 24px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;">%s</td></tr>`, esc(kind))
	fmt.Fprintf(b, `<tr><td style="padding:28px 28px 8px;font-family:Georgia,serif;font-size:13px;color:#78716c;">%s</td></tr>`, esc(seriesTopic))
	b.WriteString(`<tr><td style="padding:0 28px 28px;">`)
	if test {
		b.WriteString(`<div style="background:#fef3c7;color:#92400e;font-size:12px;padding:8px 12px;border-radius:8px;margin:0 0 20px;">TEST EMAIL — content preview only, not a subscriber send</div>`)
	}
}

func writeLayoutEnd(b *strings.Builder) {
	writeLayoutEndOpts(b, "")
}

// writeLayoutEndOpts closes the layout and appends a footer. When
// unsubscribeURL is non-empty (real subscriber sends) it renders the
// legally required one-click unsubscribe link.
func writeLayoutEndOpts(b *strings.Builder, unsubscribeURL string) {
	if unsubscribeURL != "" {
		fmt.Fprintf(
			b,
			`<div style="border-top:1px solid #e7e0d6;margin-top:24px;padding-top:14px;font-size:12px;color:#78716c;">`+
				`You are receiving this because you subscribed to this series on Cadensend. `+
				`<a href="%s" style="color:#78716c;" target="_blank" rel="noopener">Unsubscribe</a></div>`,
			esc(unsubscribeURL),
		)
	}
	b.WriteString(`</td></tr></table></td></tr></table></body></html>`)
}

// RenderNotificationHTML renders a simple transactional email (password
// resets, alerts). actionURL is rendered as a prominent button.
func RenderNotificationHTML(title, body, buttonText, actionURL string) (string, string) {
	var b strings.Builder
	b.WriteString(`<!DOCTYPE html><html><body style="margin:0;background:#f5f0e8;padding:24px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">`)
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">`)
	b.WriteString(`<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fffaf3;border:1px solid #e7e0d6;border-radius:16px;overflow:hidden;">`)
	b.WriteString(`<tr><td style="background:#1c1917;color:#fafaf9;padding:16px 24px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;">Cadensend</td></tr>`)
	b.WriteString(`<tr><td style="padding:28px;">`)
	fmt.Fprintf(&b, `<h2 style="font-family:Georgia,serif;font-size:22px;color:#1c1917;margin:0 0 14px;">%s</h2>`, esc(title))
	fmt.Fprintf(&b, `<p style="color:#44403c;font-size:15px;line-height:1.65;margin:0 0 20px;">%s</p>`, esc(body))
	if buttonText != "" && actionURL != "" {
		fmt.Fprintf(&b,
			`<a href="%s" style="display:inline-block;background:#1c1917;color:#fafaf9;text-decoration:none;font-size:14px;padding:11px 22px;border-radius:8px;" target="_blank" rel="noopener">%s</a>`,
			esc(actionURL), esc(buttonText))
		fmt.Fprintf(&b, `<p style="color:#78716c;font-size:12px;margin:18px 0 0;word-break:break-all;">Or paste this link into your browser: %s</p>`, esc(actionURL))
	}
	b.WriteString(`</td></tr></table></td></tr></table></body></html>`)
	return title, b.String()
}

func firstString(m map[string]any, keys ...string) string {
	for _, key := range keys {
		if v, ok := m[key]; ok {
			if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
				return strings.TrimSpace(s)
			}
		}
	}
	return ""
}

func stringList(v any) []string {
	switch items := v.(type) {
	case []any:
		out := make([]string, 0, len(items))
		for _, item := range items {
			if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
				out = append(out, strings.TrimSpace(s))
			}
		}
		return out
	case []string:
		return items
	default:
		return nil
	}
}

func esc(s string) string {
	return html.EscapeString(s)
}

func nlToBr(s string) string {
	return strings.ReplaceAll(s, "\n", "<br>")
}
