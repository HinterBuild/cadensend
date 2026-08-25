package mail

import (
	"fmt"
	"regexp"
	"strings"
)

type presentationTheme struct {
	StylePreset  string
	FontPair     string
	DiagramTheme string
	DiagramStyle string
	AccentColor  string
	Background   string
	Surface      string
	Text         string
	Muted        string
	Border       string
}

var hexColorPattern = regexp.MustCompile(`^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`)

func defaultPresentationTheme() presentationTheme {
	return presetPresentationTheme("classic")
}

func presetPresentationTheme(preset string) presentationTheme {
	switch strings.ToLower(strings.TrimSpace(preset)) {
	case "editorial":
		return presentationTheme{
			StylePreset:  "editorial",
			FontPair:     "newsroom",
			DiagramTheme: "neutral",
			DiagramStyle: "outline",
			AccentColor:  "#7c2d12",
			Background:   "#f7f1eb",
			Surface:      "#fffdfa",
			Text:         "#1f2937",
			Muted:        "#6b7280",
			Border:       "#eaded3",
		}
	case "digest":
		return presentationTheme{
			StylePreset:  "digest",
			FontPair:     "modern",
			DiagramTheme: "forest",
			DiagramStyle: "shadow",
			AccentColor:  "#0f4c81",
			Background:   "#eef6ff",
			Surface:      "#ffffff",
			Text:         "#102a43",
			Muted:        "#486581",
			Border:       "#cbddee",
		}
	case "minimal":
		return presentationTheme{
			StylePreset:  "minimal",
			FontPair:     "technical",
			DiagramTheme: "dark",
			DiagramStyle: "outline",
			AccentColor:  "#111827",
			Background:   "#f4f4f5",
			Surface:      "#ffffff",
			Text:         "#111827",
			Muted:        "#6b7280",
			Border:       "#e5e7eb",
		}
	default:
		return presentationTheme{
			StylePreset:  "classic",
			FontPair:     "classic",
			DiagramTheme: "neutral",
			DiagramStyle: "card",
			AccentColor:  "#1c1917",
			Background:   "#f5f0e8",
			Surface:      "#fffaf3",
			Text:         "#1c1917",
			Muted:        "#78716c",
			Border:       "#e7e0d6",
		}
	}
}

func extractPresentation(content map[string]any) presentationTheme {
	theme := defaultPresentationTheme()
	raw, ok := content["presentation"].(map[string]any)
	if !ok {
		return theme
	}

	if preset := strings.ToLower(firstString(raw, "style_preset")); preset != "" {
		theme = presetPresentationTheme(preset)
	}

	switch pair := strings.ToLower(firstString(raw, "font_pair")); pair {
	case "modern", "newsroom", "technical", "classic":
		theme.FontPair = pair
	}
	switch diagramTheme := strings.ToLower(firstString(raw, "diagram_theme")); diagramTheme {
	case "forest", "dark", "neutral":
		theme.DiagramTheme = diagramTheme
	}
	switch diagramStyle := strings.ToLower(firstString(raw, "diagram_style")); diagramStyle {
	case "outline", "shadow", "card":
		theme.DiagramStyle = diagramStyle
	}

	theme.AccentColor = sanitizeThemeColor(firstString(raw, "accent_color"), theme.AccentColor)
	theme.Background = sanitizeThemeColor(firstString(raw, "background_color"), theme.Background)
	theme.Surface = sanitizeThemeColor(firstString(raw, "surface_color"), theme.Surface)
	theme.Text = sanitizeThemeColor(firstString(raw, "text_color"), theme.Text)
	theme.Muted = sanitizeThemeColor(firstString(raw, "muted_color"), theme.Muted)
	theme.Border = sanitizeThemeColor(firstString(raw, "border_color"), theme.Border)

	return theme
}

func sanitizeThemeColor(value, fallback string) string {
	trimmed := strings.TrimSpace(value)
	if !hexColorPattern.MatchString(trimmed) {
		return fallback
	}
	if len(trimmed) == 4 {
		return fmt.Sprintf("#%c%c%c%c%c%c",
			trimmed[1], trimmed[1],
			trimmed[2], trimmed[2],
			trimmed[3], trimmed[3],
		)
	}
	return strings.ToLower(trimmed)
}

func (t presentationTheme) bodyFont() string {
	switch t.FontPair {
	case "modern":
		return `-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif`
	case "newsroom":
		return `'Trebuchet MS','Segoe UI',sans-serif`
	case "technical":
		return `'IBM Plex Sans','Segoe UI',sans-serif`
	default:
		return `-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif`
	}
}

func (t presentationTheme) headingFont() string {
	switch t.FontPair {
	case "modern":
		return `'Segoe UI','Helvetica Neue',Arial,sans-serif`
	case "newsroom":
		return `Georgia,Cambria,'Times New Roman',serif`
	case "technical":
		return `'Avenir Next','Segoe UI',sans-serif`
	default:
		return `Georgia,'Times New Roman',serif`
	}
}

func (t presentationTheme) accentTextColor() string {
	return contrastTextColor(t.AccentColor)
}

func (t presentationTheme) diagramContainerStyle() string {
	switch t.DiagramStyle {
	case "outline":
		return fmt.Sprintf("margin:16px 0;padding:12px;background:%s;border:2px solid %s;border-radius:12px;", t.Surface, t.Border)
	case "shadow":
		return fmt.Sprintf("margin:16px 0;padding:12px;background:%s;border:1px solid %s;border-radius:16px;box-shadow:0 16px 40px rgba(15,23,42,.10);", t.Surface, t.Border)
	default:
		return fmt.Sprintf("margin:16px 0;padding:12px;background:%s;border:1px solid %s;border-radius:12px;", t.Surface, t.Border)
	}
}

func contrastTextColor(hex string) string {
	r, g, b := parseHexColor(hex)
	yiq := ((r * 299) + (g * 587) + (b * 114)) / 1000
	if yiq >= 150 {
		return "#111827"
	}
	return "#ffffff"
}

func parseHexColor(hex string) (int, int, int) {
	normalized := strings.TrimPrefix(sanitizeThemeColor(hex, "#111111"), "#")
	if len(normalized) != 6 {
		return 17, 24, 39
	}
	var r, g, b int
	_, _ = fmt.Sscanf(normalized, "%02x%02x%02x", &r, &g, &b)
	return r, g, b
}

func themedDiagramSource(kind, source string, theme presentationTheme) string {
	if kind != "mermaid" || theme.DiagramTheme == "" || theme.DiagramTheme == "neutral" {
		return source
	}
	if strings.Contains(source, "%%{init:") {
		return source
	}
	return fmt.Sprintf("%%%%{init: {'theme': '%s'}}%%%%\n%s", theme.DiagramTheme, source)
}
