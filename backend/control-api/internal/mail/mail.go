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

func RenderIssueHTML(seriesTopic, seriesGoal string, content map[string]any, test bool) (subject string, htmlBody string) {
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
	writeLayoutEnd(&body)
	return subject, body.String()
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
	title string
	text  string
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
			title: firstString(block, "title"),
			text:  text,
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
	b.WriteString(`</td></tr></table></td></tr></table></body></html>`)
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
