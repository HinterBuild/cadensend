package contentstructure

import (
	"regexp"
	"strings"
)

type Severity string

const (
	SeverityError   Severity = "error"
	SeverityWarning Severity = "warning"
	SeverityInfo    Severity = "info"
)

type Check struct {
	ID         string   `json:"id"`
	Severity   Severity `json:"severity"`
	Message    string   `json:"message"`
	Suggestion string   `json:"suggestion,omitempty"`
	BlockIndex *int     `json:"block_index,omitempty"`
}

type Input struct {
	ContentBlocks []map[string]any `json:"content_blocks"`
	VisualSpecs   []map[string]any `json:"visual_specs"`
}

type segmentKind string

const (
	segmentProse   segmentKind = "prose"
	segmentCode    segmentKind = "code"
	segmentDiagram segmentKind = "diagram"
	segmentTable   segmentKind = "table"
)

type segment struct {
	kind       segmentKind
	lang       string
	proseChars int
	blockIndex int
}

var fenceRE = regexp.MustCompile("(?s)```([a-zA-Z0-9_+-]*)\\s*\\n([\\s\\S]*?)```")

func Analyze(content map[string]any) []Check {
	input := Input{}
	if blocks, ok := content["content_blocks"].([]any); ok {
		for _, raw := range blocks {
			if block, ok := raw.(map[string]any); ok {
				input.ContentBlocks = append(input.ContentBlocks, block)
			}
		}
	}
	if specs, ok := content["visual_specs"].([]any); ok {
		for _, raw := range specs {
			if spec, ok := raw.(map[string]any); ok {
				input.VisualSpecs = append(input.VisualSpecs, spec)
			}
		}
	}
	return AnalyzeInput(input)
}

func AnalyzeInput(input Input) []Check {
	checks := []Check{}
	seen := map[string]bool{}
	allSegments := []segment{}

	for blockIndex, block := range input.ContentBlocks {
		text := asString(block["text"])
		segments := parseBlockSegments(text, blockIndex)
		allSegments = append(allSegments, segments...)
		if len(segments) == 0 {
			continue
		}

		first := segments[0]
		last := segments[len(segments)-1]
		if isTechnical(first.kind) {
			pushCheck(&checks, seen, Check{
				ID:         "block_opens_with_technical",
				Severity:   SeverityWarning,
				Message:    blockTechnicalMessage(blockIndex, first.kind, true),
				Suggestion: "Add a short intro sentence before diagrams and code so readers know why they matter.",
				BlockIndex: intPtr(blockIndex),
			})
		}
		if len(segments) > 1 && isTechnical(last.kind) {
			pushCheck(&checks, seen, Check{
				ID:         "block_ends_with_technical",
				Severity:   SeverityWarning,
				Message:    blockTechnicalMessage(blockIndex, last.kind, false),
				Suggestion: "Follow technical sections with a takeaway sentence or transition.",
				BlockIndex: intPtr(blockIndex),
			})
		}

		for i := 0; i < len(segments)-1; i++ {
			current := segments[i]
			next := segments[i+1]
			if current.kind == segmentDiagram && next.kind == segmentDiagram {
				pushCheck(&checks, seen, Check{
					ID:         "consecutive_diagrams_in_block",
					Severity:   SeverityError,
					Message:    "Block " + itoa(blockIndex+1) + " places two diagrams back-to-back.",
					Suggestion: "Separate diagrams with prose that explains each step before showing the next one.",
					BlockIndex: intPtr(blockIndex),
				})
			}
			if current.kind == segmentCode && next.kind == segmentCode {
				pushCheck(&checks, seen, Check{
					ID:         "consecutive_code_in_block",
					Severity:   SeverityWarning,
					Message:    "Block " + itoa(blockIndex+1) + " stacks code blocks without explanation between them.",
					Suggestion: "Explain what the first snippet does before showing another one.",
					BlockIndex: intPtr(blockIndex),
				})
			}
			if next.kind == segmentDiagram && current.kind == segmentProse && current.proseChars < 48 {
				pushCheck(&checks, seen, Check{
					ID:         "thin_context_before_diagram",
					Severity:   SeverityWarning,
					Message:    "Block " + itoa(blockIndex+1) + " has very little setup before a diagram.",
					Suggestion: "Add a sentence or two describing what the reader should look for in the diagram.",
					BlockIndex: intPtr(blockIndex),
				})
			}
		}

		for _, seg := range segments {
			if seg.kind == segmentCode && strings.TrimSpace(seg.lang) == "" {
				pushCheck(&checks, seen, Check{
					ID:         "code_missing_language",
					Severity:   SeverityInfo,
					Message:    "Block " + itoa(blockIndex+1) + " has a code fence without a language tag.",
					Suggestion: "Use ```bash, ```python, ```yaml, etc. so email clients render it cleanly.",
					BlockIndex: intPtr(blockIndex),
				})
			}
		}
	}

	if len(allSegments) > 0 {
		firstOverall := allSegments[0]
		lastOverall := allSegments[len(allSegments)-1]
		if isTechnical(firstOverall.kind) {
			pushCheck(&checks, seen, Check{
				ID:         "email_opens_with_technical",
				Severity:   SeverityError,
				Message:    "The email opens with a diagram or code block before any introduction.",
				Suggestion: "Start with a hook paragraph, then introduce visuals and snippets.",
			})
		}
		if isTechnical(lastOverall.kind) {
			pushCheck(&checks, seen, Check{
				ID:         "email_ends_with_technical",
				Severity:   SeverityWarning,
				Message:    "The email ends on a diagram or code block.",
				Suggestion: "Close with a summary, next step, or call to action after the last technical element.",
			})
		}

		diagramStreak := 0
		codeStreak := 0
		for _, seg := range allSegments {
			switch seg.kind {
			case segmentDiagram:
				diagramStreak++
				codeStreak = 0
			case segmentCode:
				codeStreak++
				diagramStreak = 0
			default:
				diagramStreak = 0
				codeStreak = 0
			}
			if diagramStreak >= 2 {
				pushCheck(&checks, seen, Check{
					ID:         "consecutive_diagrams",
					Severity:   SeverityError,
					Message:    "Multiple diagrams appear in a row across the email.",
					Suggestion: "Alternate diagrams with explanatory prose so each one lands clearly.",
					BlockIndex: intPtr(seg.blockIndex),
				})
				diagramStreak = 0
			}
			if codeStreak >= 3 {
				pushCheck(&checks, seen, Check{
					ID:         "consecutive_code_blocks",
					Severity:   SeverityWarning,
					Message:    "Three or more code blocks appear back-to-back.",
					Suggestion: "Break up long code sequences with commentary or partial snippets.",
					BlockIndex: intPtr(seg.blockIndex),
				})
				codeStreak = 0
			}
		}
	}

	if len(input.ContentBlocks) > 1 {
		for blockIndex, block := range input.ContentBlocks {
			text := asString(block["text"])
			if strings.Contains(text, "```") && strings.TrimSpace(asString(block["title"])) == "" {
				pushCheck(&checks, seen, Check{
					ID:         "missing_block_title",
					Severity:   SeverityInfo,
					Message:    "Block " + itoa(blockIndex+1) + " includes code or diagrams but has no title.",
					Suggestion: "Add a block title so readers know what each section covers.",
					BlockIndex: intPtr(blockIndex),
				})
			}
		}
	}

	inlineDiagrams := false
	for _, seg := range allSegments {
		if seg.kind == segmentDiagram {
			inlineDiagrams = true
			break
		}
	}
	visualCount := 0
	for _, spec := range input.VisualSpecs {
		if strings.TrimSpace(asString(spec["content"])) != "" {
			visualCount++
		}
	}
	if visualCount > 0 && inlineDiagrams {
		pushCheck(&checks, seen, Check{
			ID:         "mixed_diagram_placement",
			Severity:   SeverityInfo,
			Message:    "This issue uses both inline diagrams and detached visuals.",
			Suggestion: "Keep inline diagrams near the text they explain; reserve detached visuals for summary figures at the end.",
		})
	}
	if visualCount > 0 && len(input.ContentBlocks) > 0 {
		lastIndex := len(input.ContentBlocks) - 1
		lastSegments := parseBlockSegments(asString(input.ContentBlocks[lastIndex]["text"]), lastIndex)
		if len(lastSegments) > 0 {
			lastKind := lastSegments[len(lastSegments)-1].kind
			if isTechnical(lastKind) {
				pushCheck(&checks, seen, Check{
					ID:         "detached_visual_after_technical_end",
					Severity:   SeverityWarning,
					Message:    "Detached visuals will render after a body that already ends on code or a diagram.",
					Suggestion: "Add a short closing paragraph before detached visuals, or move the diagram inline.",
					BlockIndex: intPtr(lastIndex),
				})
			}
		}
	}

	return checks
}

func NormalizeContent(content map[string]any) map[string]any {
	blocksRaw, ok := content["content_blocks"].([]any)
	if !ok {
		return content
	}
	blocks := make([]any, 0, len(blocksRaw))
	for _, raw := range blocksRaw {
		block, ok := raw.(map[string]any)
		if !ok {
			blocks = append(blocks, raw)
			continue
		}
		text := strings.TrimLeft(asString(block["text"]), " \t")
		title := strings.TrimSpace(asString(block["title"]))
		if title != "" && strings.HasPrefix(text, "```") && !strings.HasPrefix(text, "## "+title) {
			text = "## " + title + "\n\n" + text
		}
		updated := map[string]any{}
		for k, v := range block {
			updated[k] = v
		}
		updated["text"] = text
		blocks = append(blocks, updated)
	}
	out := map[string]any{}
	for k, v := range content {
		out[k] = v
	}
	out["content_blocks"] = blocks
	return out
}

func parseBlockSegments(text string, blockIndex int) []segment {
	source := strings.ReplaceAll(text, "\r\n", "\n")
	source = strings.TrimSpace(source)
	if source == "" {
		return nil
	}

	var segments []segment
	lastIndex := 0
	matches := fenceRE.FindAllStringSubmatchIndex(source, -1)
	for _, match := range matches {
		if len(match) < 4 {
			continue
		}
		prose := strings.TrimSpace(source[lastIndex:match[0]])
		if prose != "" {
			kind := segmentProse
			if isTableBlock(prose) {
				kind = segmentTable
			}
			segments = append(segments, segment{kind: kind, proseChars: len(prose), blockIndex: blockIndex})
		}
		lang := source[match[2]:match[3]]
		kind := classifyFence(lang)
		segments = append(segments, segment{kind: kind, lang: lang, blockIndex: blockIndex})
		lastIndex = match[1]
	}
	tail := strings.TrimSpace(source[lastIndex:])
	if tail != "" {
		kind := segmentProse
		if isTableBlock(tail) {
			kind = segmentTable
		}
		segments = append(segments, segment{kind: kind, proseChars: len(tail), blockIndex: blockIndex})
	}
	if len(segments) == 0 {
		segments = append(segments, segment{kind: segmentProse, proseChars: len(source), blockIndex: blockIndex})
	}
	return segments
}

func classifyFence(lang string) segmentKind {
	switch strings.ToLower(strings.TrimSpace(lang)) {
	case "mermaid", "d2":
		return segmentDiagram
	default:
		return segmentCode
	}
}

func isTableBlock(text string) bool {
	lines := strings.Split(text, "\n")
	nonEmpty := 0
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		nonEmpty++
		if !strings.HasPrefix(trimmed, "|") || !strings.Contains(trimmed[1:], "|") {
			return false
		}
	}
	return nonEmpty >= 2
}

func isTechnical(kind segmentKind) bool {
	return kind == segmentCode || kind == segmentDiagram
}

func blockTechnicalMessage(blockIndex int, kind segmentKind, opening bool) string {
	label := "code block"
	if kind == segmentDiagram {
		label = "diagram"
	}
	if opening {
		return "Block " + itoa(blockIndex+1) + " opens with a " + label + "."
	}
	return "Block " + itoa(blockIndex+1) + " ends with a " + label + "."
}

func pushCheck(checks *[]Check, seen map[string]bool, check Check) {
	key := check.ID
	if check.BlockIndex != nil {
		key += ":" + itoa(*check.BlockIndex)
	} else {
		key += ":all"
	}
	if seen[key] {
		return
	}
	seen[key] = true
	*checks = append(*checks, check)
}

func asString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func intPtr(v int) *int {
	return &v
}

func itoa(v int) string {
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	buf := make([]byte, 0, 12)
	for v > 0 {
		buf = append([]byte{byte('0' + v%10)}, buf...)
		v /= 10
	}
	if neg {
		buf = append([]byte{'-'}, buf...)
	}
	return string(buf)
}
