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

var (
	fencePattern = regexp.MustCompile("(?s)```([a-zA-Z0-9_-]*)[ \t]*\n(.*?)```")
	headingLine  = regexp.MustCompile(`^(#{1,3})\s+(.+)$`)
	boldHeading  = regexp.MustCompile(`^\*\*(.+)\*\*$`)
	backtickRe   = regexp.MustCompile("`([^`]+)`")
	boldRe       = regexp.MustCompile(`\*\*([^*]+)\*\*`)
	callRe       = regexp.MustCompile(`\b[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*\([^)]{0,120}\)`)
	dottedRe     = regexp.MustCompile(`\b[A-Z][A-Za-z0-9]+(?:\.[A-Za-z_][\w]+)+`)
	cmpRe        = regexp.MustCompile(`\b[A-Za-z_][\w]*\s*(?:==|!=|>=|<=)\s*[A-Za-z0-9_().*+\-/ ]{1,40}`)
	camelRe      = regexp.MustCompile(`\b[a-z]+[A-Z][A-Za-z0-9]*\b`)
	slashNameRe  = regexp.MustCompile(`\b[A-Za-z_][\w]*/[A-Za-z_][\w]*\b`)
)

const codeChip = `<code style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;background-color:#1c1917;color:#fafaf9;border-radius:4px;padding:2px 6px;white-space:nowrap;">$1</code>`

func formatLessonHTML(text string, theme presentationTheme) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	var b strings.Builder
	last := 0
	for _, match := range fencePattern.FindAllStringSubmatchIndex(text, -1) {
		if match[0] > last {
			markdownToHTML(&b, text[last:match[0]], theme)
		}
		lang := strings.ToLower(strings.TrimSpace(text[match[2]:match[3]]))
		code := strings.TrimRight(text[match[4]:match[5]], "\n")
		if lang == "mermaid" || lang == "d2" {
			b.WriteString(diagramHTML(lang, code, lang+" diagram", theme))
		} else {
			if lang == "" {
				lang = guessLang(code)
			}
			b.WriteString(codeBlockHTML(lang, code, theme))
		}
		last = match[1]
	}
	if last < len(text) {
		markdownToHTML(&b, text[last:], theme)
	}
	return b.String()
}

func markdownToHTML(b *strings.Builder, raw string, theme presentationTheme) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return
	}
	lines := strings.Split(raw, "\n")
	i := 0
	for i < len(lines) {
		if strings.TrimSpace(lines[i]) == "" {
			i++
			continue
		}
		if title, ok := headingText(lines[i]); ok {
			fmt.Fprintf(b, `<h3 style="font-family:%s;font-size:16px;color:%s;margin:18px 0 8px;">%s</h3>`, theme.headingFont(), theme.Text, inlineHTML(title))
			i++
			continue
		}
		if isTableRow(lines[i]) {
			start := i
			for i < len(lines) && (isTableRow(lines[i]) || isTableSeparator(lines[i])) {
				i++
			}
			writeTable(b, lines[start:i], theme)
			continue
		}
		if listItem(lines[i]) != "" {
			start := i
			for i < len(lines) && listItem(lines[i]) != "" {
				i++
			}
			writeList(b, lines[start:i], theme)
			continue
		}
		if isIndented(lines[i]) || looksLikeCode(lines[i]) {
			start := i
			for i < len(lines) && (isIndented(lines[i]) || looksLikeCode(lines[i]) || keepCodeBlank(lines, i)) {
				i++
			}
			code := strings.TrimRight(dedent(lines[start:i]), "\n")
			if strings.TrimSpace(code) != "" {
				b.WriteString(codeBlockHTML(guessLang(code), code, theme))
			}
			continue
		}
		start := i
		for i < len(lines) && strings.TrimSpace(lines[i]) != "" && listItem(lines[i]) == "" && !looksLikeCode(lines[i]) && !isIndented(lines[i]) && !isTableRow(lines[i]) {
			if _, ok := headingText(lines[i]); ok {
				break
			}
			i++
		}
		joined := strings.Join(trimLines(lines[start:i]), " ")
		fmt.Fprintf(b, `<p style="color:%s;font-family:%s;font-size:15px;line-height:1.65;margin:0 0 14px;">%s</p>`, theme.Text, theme.bodyFont(), inlineHTML(joined))
	}
}

func headingText(line string) (string, bool) {
	trimmed := strings.TrimSpace(line)
	if m := headingLine.FindStringSubmatch(trimmed); m != nil {
		return m[2], true
	}
	if m := boldHeading.FindStringSubmatch(trimmed); m != nil && !strings.Contains(m[1], ".") {
		return m[1], true
	}
	return "", false
}

func keepCodeBlank(lines []string, i int) bool {
	if strings.TrimSpace(lines[i]) != "" {
		return false
	}
	return i+1 < len(lines) && (looksLikeCode(lines[i+1]) || isIndented(lines[i+1]))
}

func isIndented(line string) bool {
	if line == "" {
		return false
	}
	return strings.HasPrefix(line, "    ") || strings.HasPrefix(line, "\t")
}

func looksLikeCode(line string) bool {
	t := strings.TrimSpace(line)
	if t == "" || listItem(line) != "" {
		return false
	}
	if isIndented(line) {
		return true
	}
	lower := strings.ToLower(t)
	starters := []string{
		"class ", "def ", "public ", "private ", "protected ", "static ",
		"function ", "const ", "let ", "var ", "import ", "package ",
		"return ", "kubectl ", "apiversion:", "kind:", "interface ",
		"enum ", "struct ", "typedef ", "fn ", "pub ", "using ",
	}
	for _, s := range starters {
		if strings.HasPrefix(lower, s) {
			return true
		}
	}
	if strings.HasPrefix(t, "{") || strings.HasPrefix(t, "}") || strings.HasPrefix(t, "@") {
		return true
	}
	if strings.HasSuffix(t, "{") || strings.HasSuffix(t, "};") || strings.HasSuffix(t, ";") {
		return strings.ContainsAny(t, "(){}=<>")
	}
	if strings.Count(t, "(") >= 1 && strings.Count(t, ")") >= 1 && (strings.Contains(t, "{") || strings.HasSuffix(t, ";") || strings.Contains(t, " = ")) {
		return true
	}
	return false
}

func guessLang(code string) string {
	lower := strings.ToLower(code)
	switch {
	case strings.Contains(lower, "kubectl ") || strings.Contains(lower, "#!/bin"):
		return "bash"
	case strings.Contains(lower, "apiversion:") || strings.Contains(lower, "kind:"):
		return "yaml"
	case strings.Contains(lower, "def ") || strings.Contains(lower, "self."):
		return "python"
	case strings.Contains(lower, "func ") || strings.Contains(lower, "package "):
		return "go"
	case strings.Contains(lower, "public ") || strings.Contains(lower, "class ") || strings.Contains(lower, "system.out"):
		return "java"
	case strings.Contains(lower, "const ") || strings.Contains(lower, "function ") || strings.Contains(lower, "=>"):
		return "javascript"
	default:
		return "code"
	}
}

func dedent(lines []string) string {
	min := -1
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		n := 0
		for _, r := range line {
			if r == ' ' {
				n++
			} else if r == '\t' {
				n += 4
			} else {
				break
			}
		}
		if min < 0 || n < min {
			min = n
		}
	}
	if min <= 0 {
		return strings.Join(lines, "\n")
	}
	out := make([]string, len(lines))
	for i, line := range lines {
		cut := 0
		seen := 0
		for _, r := range line {
			if seen >= min {
				break
			}
			if r == ' ' {
				seen++
				cut++
			} else if r == '\t' {
				seen += 4
				cut++
			} else {
				break
			}
		}
		if cut > len(line) {
			cut = len(line)
		}
		out[i] = line[cut:]
	}
	return strings.Join(out, "\n")
}

func trimLines(lines []string) []string {
	out := make([]string, len(lines))
	for i, line := range lines {
		out[i] = strings.TrimSpace(line)
	}
	return out
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

func writeList(b *strings.Builder, lines []string, theme presentationTheme) {
	fmt.Fprintf(b, `<ul style="color:%s;font-family:%s;font-size:15px;line-height:1.6;margin:0 0 14px;padding-left:22px;">`, theme.Text, theme.bodyFont())
	for _, line := range lines {
		item := listItem(line)
		if item == "" {
			continue
		}
		fmt.Fprintf(b, `<li style="margin:0 0 6px;">%s</li>`, inlineHTML(item))
	}
	b.WriteString(`</ul>`)
}

func isTableRow(line string) bool {
	trimmed := strings.TrimSpace(line)
	return strings.HasPrefix(trimmed, "|") && strings.Count(trimmed, "|") >= 2
}

func isTableSeparator(line string) bool {
	trimmed := strings.TrimSpace(line)
	if !strings.Contains(trimmed, "|") {
		return false
	}
	trimmed = strings.Trim(trimmed, "|")
	for _, cell := range strings.Split(trimmed, "|") {
		cell = strings.TrimSpace(cell)
		if cell == "" {
			continue
		}
		for _, r := range cell {
			if r != '-' && r != ':' && r != ' ' {
				return false
			}
		}
	}
	return true
}

func parseTableCells(line string) []string {
	trimmed := strings.TrimSpace(line)
	trimmed = strings.TrimPrefix(trimmed, "|")
	trimmed = strings.TrimSuffix(trimmed, "|")
	parts := strings.Split(trimmed, "|")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		out = append(out, strings.TrimSpace(part))
	}
	return out
}

func writeTable(b *strings.Builder, lines []string, theme presentationTheme) {
	rows := make([][]string, 0, len(lines))
	for _, line := range lines {
		if isTableSeparator(line) {
			continue
		}
		if cells := parseTableCells(line); len(cells) > 0 {
			rows = append(rows, cells)
		}
	}
	if len(rows) == 0 {
		return
	}
	header := rows[0]
	body := rows[1:]
	fmt.Fprintf(
		b,
		`<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;border-collapse:collapse;border:1px solid %s;font-family:%s;font-size:14px;">`,
		theme.Border,
		theme.bodyFont(),
	)
	fmt.Fprintf(b, `<thead><tr style="background:%s;">`, theme.Surface)
	for _, cell := range header {
		fmt.Fprintf(b, `<th style="border:1px solid %s;padding:8px 10px;text-align:left;color:%s;font-weight:600;">%s</th>`, theme.Border, theme.Text, inlineHTML(cell))
	}
	b.WriteString(`</tr></thead><tbody>`)
	for _, row := range body {
		b.WriteString(`<tr>`)
		for col := 0; col < len(header); col++ {
			val := ""
			if col < len(row) {
				val = row[col]
			}
			fmt.Fprintf(b, `<td style="border:1px solid %s;padding:8px 10px;color:%s;vertical-align:top;">%s</td>`, theme.Border, theme.Text, inlineHTML(val))
		}
		b.WriteString(`</tr>`)
	}
	b.WriteString(`</tbody></table>`)
}

func inlineHTML(s string) string {
	s = backtickRe.ReplaceAllString(s, "\x00$1\x00")
	escaped := html.EscapeString(s)
	escaped = strings.ReplaceAll(escaped, "\x00", "`")
	escaped = backtickRe.ReplaceAllString(escaped, strings.ReplaceAll(codeChip, "$1", "$1"))
	escaped = wrapUncoded(escaped, callRe)
	escaped = wrapUncoded(escaped, dottedRe)
	escaped = wrapUncoded(escaped, cmpRe)
	escaped = wrapUncoded(escaped, camelRe)
	escaped = wrapUncoded(escaped, slashNameRe)
	escaped = boldRe.ReplaceAllString(escaped, `<strong>$1</strong>`)
	return escaped
}

func wrapUncoded(s string, re *regexp.Regexp) string {
	var b strings.Builder
	last := 0
	for _, loc := range re.FindAllStringIndex(s, -1) {
		if insideCode(s, loc[0]) {
			continue
		}
		b.WriteString(s[last:loc[0]])
		b.WriteString(`<code style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;background-color:#1c1917;color:#fafaf9;border-radius:4px;padding:2px 6px;">`)
		b.WriteString(s[loc[0]:loc[1]])
		b.WriteString(`</code>`)
		last = loc[1]
	}
	b.WriteString(s[last:])
	return b.String()
}

func insideCode(s string, idx int) bool {
	open := strings.LastIndex(s[:idx], "<code")
	if open < 0 {
		return false
	}
	close := strings.LastIndex(s[:idx], "</code>")
	return close < open
}

func codeBlockLabel(lang, code string) string {
	label := strings.ToLower(strings.TrimSpace(lang))
	switch label {
	case "shell", "sh", "console", "zsh":
		return "bash"
	case "code", "text", "plaintext", "":
		label = guessLang(code)
		if label == "code" {
			lower := strings.ToLower(code)
			if strings.Contains(lower, "subject:") || strings.HasPrefix(strings.TrimSpace(lower), "hi ") {
				return "template"
			}
			return ""
		}
		return label
	default:
		return label
	}
}

func codeBlockHTML(lang, code string, theme presentationTheme) string {
	label := codeBlockLabel(lang, code)
	pre := fmt.Sprintf(
		`<pre style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.55;color:#fafaf9;white-space:pre-wrap;word-break:break-word;">%s</pre>`,
		esc(code),
	)
	if label == "" {
		return fmt.Sprintf(
			`<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;border-collapse:separate;border:1px solid %s;border-radius:8px;overflow:hidden;">`+
				`<tr><td style="background:#1c1917;padding:14px 16px;">%s</td></tr>`+
				`</table>`,
			theme.Border,
			pre,
		)
	}
	return fmt.Sprintf(
		`<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;border-collapse:separate;border:1px solid %s;border-radius:8px;overflow:hidden;">`+
			`<tr><td style="background:#0c0a09;color:#a8a29e;font-family:%s;font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:8px 12px;">%s</td></tr>`+
			`<tr><td style="background:#1c1917;padding:14px 16px;">%s</td></tr>`+
			`</table>`,
		theme.Border,
		theme.bodyFont(),
		esc(label),
		pre,
	)
}

func looksLikeDiagramSource(kind, source string) bool {
	source = strings.TrimSpace(source)
	if source == "" {
		return false
	}
	if kind == "d2" {
		return strings.Contains(source, "->") || strings.Contains(source, ":")
	}
	lower := strings.ToLower(source)
	prefixes := []string{
		"flowchart", "graph ", "graph\n", "graph\t", "graph{", "graph;",
		"sequencediagram", "classdiagram", "statediagram", "erdiagram",
		"gantt", "pie ", "mindmap", "timeline", "gitgraph", "c4context",
	}
	for _, prefix := range prefixes {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	return strings.Contains(source, "-->") || strings.Contains(source, "---")
}

func diagramDescriptionHTML(text string, theme presentationTheme) string {
	return fmt.Sprintf(
		`<div style="%s">`+
			`<p style="margin:0 0 6px;font-family:%s;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:%s;">Diagram</p>`+
			`<p style="margin:0;font-family:%s;font-size:14px;line-height:1.55;color:%s;">%s</p>`+
			`</div>`,
		theme.diagramContainerStyle(),
		theme.bodyFont(),
		theme.Muted,
		theme.bodyFont(),
		theme.Text,
		inlineHTML(strings.TrimSpace(text)),
	)
}

func diagramHTML(kind, source, alt string, theme presentationTheme) string {
	source = strings.TrimSpace(source)
	if source == "" {
		if strings.TrimSpace(alt) != "" {
			return diagramDescriptionHTML(alt, theme)
		}
		return ""
	}
	if !looksLikeDiagramSource(kind, source) {
		text := source
		if strings.TrimSpace(alt) != "" && !strings.Contains(strings.ToLower(source), strings.ToLower(alt)) {
			text = alt
		}
		return diagramDescriptionHTML(text, theme)
	}
	src := krokiImageURL(kind, themedDiagramSource(kind, source, theme))
	if src == "" {
		if strings.TrimSpace(alt) != "" {
			return diagramDescriptionHTML(alt+"\n\n"+source, theme)
		}
		return codeBlockHTML(kind, source, theme)
	}
	if strings.TrimSpace(alt) == "" {
		alt = kind + " diagram"
	}
	return fmt.Sprintf(
		`<div style="%s">`+
			`<p style="margin:0 0 8px;font-family:%s;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:%s;">Diagram</p>`+
			`<img src="%s" alt="%s" width="552" style="display:block;width:100%%;max-width:552px;height:auto;border:0;" />`+
			`</div>`,
		theme.diagramContainerStyle(),
		theme.bodyFont(),
		theme.Muted,
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

func writeVisuals(b *strings.Builder, specs []map[string]any, theme presentationTheme) {
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
		b.WriteString(diagramHTML(kind, code, alt, theme))
	}
}
