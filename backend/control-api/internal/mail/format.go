package mail

import (
	"bytes"
	"compress/zlib"
	"encoding/base64"
	"fmt"
	"html"
	"regexp"
	"strings"
)

var fencePattern = regexp.MustCompile("(?s)```([a-zA-Z0-9_-]*)\\s*\\n(.*?)```")

func formatLessonHTML(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	var b strings.Builder
	last := 0
	for _, match := range fencePattern.FindAllStringSubmatchIndex(text, -1) {
		if match[0] > last {
			markdownToHTML(&b, text[last:match[0]])
		}
		lang := strings.ToLower(strings.TrimSpace(text[match[2]:match[3]]))
		code := strings.TrimRight(text[match[4]:match[5]], "\n")
		if lang == "mermaid" || lang == "d2" {
			b.WriteString(diagramHTML(lang, code, lang+" diagram"))
		} else {
			if lang == "" {
				lang = "code"
			}
			b.WriteString(codeBlockHTML(lang, code))
		}
		last = match[1]
	}
	if last < len(text) {
		markdownToHTML(&b, text[last:])
	}
	return b.String()
}

func markdownToHTML(b *strings.Builder, raw string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return
	}
	paragraphs := strings.Split(raw, "\n\n")
	for _, para := range paragraphs {
		para = strings.TrimSpace(para)
		if para == "" {
			continue
		}
		lines := strings.Split(para, "\n")
		if isList(lines) {
			writeList(b, lines)
			continue
		}
		joined := strings.Join(lines, " ")
		fmt.Fprintf(b, `<p style="color:#44403c;font-size:15px;line-height:1.65;margin:0 0 14px;">%s</p>`, inlineHTML(joined))
	}
}

func isList(lines []string) bool {
	if len(lines) == 0 {
		return false
	}
	hits := 0
	for _, line := range lines {
		if listItem(line) != "" {
			hits++
		}
	}
	return hits == len(lines)
}

func listItem(line string) string {
	trimmed := strings.TrimSpace(line)
	switch {
	case strings.HasPrefix(trimmed, "- "):
		return strings.TrimSpace(trimmed[2:])
	case strings.HasPrefix(trimmed, "* "):
		return strings.TrimSpace(trimmed[2:])
	}
	if len(trimmed) > 3 && trimmed[0] >= '1' && trimmed[0] <= '9' {
		dot := strings.Index(trimmed, ". ")
		if dot > 0 && dot < 4 {
			return strings.TrimSpace(trimmed[dot+2:])
		}
	}
	return ""
}

func writeList(b *strings.Builder, lines []string) {
	b.WriteString(`<ul style="color:#44403c;font-size:15px;line-height:1.6;margin:0 0 14px;padding-left:22px;">`)
	for _, line := range lines {
		item := listItem(line)
		if item == "" {
			continue
		}
		fmt.Fprintf(b, `<li style="margin:0 0 6px;">%s</li>`, inlineHTML(item))
	}
	b.WriteString(`</ul>`)
}

func inlineHTML(s string) string {
	escaped := html.EscapeString(s)
	escaped = regexp.MustCompile("`([^`]+)`").ReplaceAllString(escaped, `<code style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;background:#f5f0e8;border:1px solid #e7e0d6;border-radius:4px;padding:1px 5px;color:#1c1917;">$1</code>`)
	escaped = regexp.MustCompile(`\*\*([^*]+)\*\*`).ReplaceAllString(escaped, `<strong>$1</strong>`)
	return escaped
}

func codeBlockHTML(lang, code string) string {
	label := lang
	if label == "shell" || label == "sh" || label == "console" || label == "zsh" {
		label = "bash"
	}
	return fmt.Sprintf(
		`<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;border-collapse:separate;border:1px solid #292524;border-radius:8px;overflow:hidden;">`+
			`<tr><td style="background:#292524;color:#a8a29e;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:7px 12px;">%s</td></tr>`+
			`<tr><td style="background:#1c1917;padding:12px 14px;"><pre style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.55;color:#f5f5f4;white-space:pre-wrap;word-break:break-word;">%s</pre></td></tr>`+
			`</table>`,
		esc(label),
		esc(code),
	)
}

func diagramHTML(kind, source, alt string) string {
	src := krokiImageURL(kind, source)
	if src == "" {
		return codeBlockHTML(kind, source)
	}
	if strings.TrimSpace(alt) == "" {
		alt = kind + " diagram"
	}
	return fmt.Sprintf(
		`<div style="margin:16px 0;padding:12px;background:#ffffff;border:1px solid #e7e0d6;border-radius:12px;">`+
			`<p style="margin:0 0 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#78716c;">Diagram</p>`+
			`<img src="%s" alt="%s" width="552" style="display:block;width:100%%;max-width:552px;height:auto;border:0;" />`+
			`</div>`,
		esc(src),
		esc(alt),
	)
}

func krokiImageURL(kind, source string) string {
	source = strings.TrimSpace(source)
	if source == "" {
		return ""
	}
	if kind != "mermaid" && kind != "d2" {
		kind = "mermaid"
	}
	var buf bytes.Buffer
	zw, err := zlib.NewWriterLevel(&buf, zlib.BestCompression)
	if err != nil {
		return ""
	}
	if _, err := zw.Write([]byte(source)); err != nil {
		_ = zw.Close()
		return ""
	}
	if err := zw.Close(); err != nil {
		return ""
	}
	encoded := base64.URLEncoding.EncodeToString(buf.Bytes())
	return "https://kroki.io/" + kind + "/svg/" + encoded
}

func extractVisuals(content map[string]any) []map[string]any {
	raw, ok := content["visual_specs"].([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		spec, ok := item.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, spec)
	}
	return out
}

func writeVisuals(b *strings.Builder, specs []map[string]any) {
	for _, spec := range specs {
		kind := strings.ToLower(firstString(spec, "type"))
		code := firstString(spec, "content")
		alt := firstString(spec, "alt_text", "description")
		if code == "" {
			continue
		}
		if kind != "d2" {
			kind = "mermaid"
		}
		b.WriteString(diagramHTML(kind, code, alt))
	}
}
