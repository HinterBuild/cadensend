package analytics

import (
	"encoding/json"
	"regexp"
	"sort"
	"strings"
	"time"

	"backend/control-api/internal/service"
)

type NamedCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type Headline struct {
	SeriesTotal  int `json:"series_total"`
	SeriesActive int `json:"series_active"`
	IssuesSent   int `json:"issues_sent"`
	UniqueTopics int `json:"unique_topics"`
	Diagrams     int `json:"diagrams"`
	CodeBlocks   int `json:"code_blocks"`
	Citations    int `json:"citations"`
}

type Pipeline struct {
	PlannedModules int `json:"planned_modules"`
	IssuesTotal    int `json:"issues_total"`
	Generated      int `json:"generated"`
	Sent           int `json:"sent"`
	Failed         int `json:"failed"`
}

type Cadence struct {
	DueNext7Days      int `json:"due_next_7_days"`
	OverduePending    int `json:"overdue_pending"`
	StaleActiveSeries int `json:"stale_active_series"`
}

type PlanStats struct {
	Ready             int `json:"ready"`
	Generating        int `json:"generating"`
	Failed            int `json:"failed"`
	Empty             int `json:"empty"`
	PlaceholderTitles int `json:"placeholder_titles"`
}

type Coverage struct {
	SeriesID string  `json:"series_id"`
	Topic    string  `json:"topic"`
	Planned  int     `json:"planned"`
	Issued   int     `json:"issued"`
	Percent  float64 `json:"percent"`
}

type Improvement struct {
	Kind     string `json:"kind"`
	Title    string `json:"title"`
	Detail   string `json:"detail"`
	SeriesID string `json:"series_id,omitempty"`
}

type Suggestion struct {
	Topic  string `json:"topic"`
	Goal   string `json:"goal"`
	Level  string `json:"level"`
	Genre  string `json:"genre"`
	Reason string `json:"reason"`
}

type WeekBucket struct {
	WeekStart     string `json:"week_start"`
	SeriesCreated int    `json:"series_created"`
	IssuesCreated int    `json:"issues_created"`
	IssuesSent    int    `json:"issues_sent"`
}

type Overview struct {
	Headline         Headline       `json:"headline"`
	SeriesByStatus   []NamedCount   `json:"series_by_status"`
	IssuesByStatus   []NamedCount   `json:"issues_by_status"`
	Levels           []NamedCount   `json:"levels"`
	Genres           []NamedCount   `json:"genres"`
	Topics           []NamedCount   `json:"topics"`
	DiagramsByType   []NamedCount   `json:"diagrams_by_type"`
	SourcesByStatus  []NamedCount   `json:"sources_by_status"`
	Pipeline         Pipeline       `json:"pipeline"`
	Cadence          Cadence        `json:"cadence"`
	Plan             PlanStats      `json:"plan"`
	Activity         []WeekBucket   `json:"activity"`
	Coverage         []Coverage     `json:"coverage"`
	Improvements     []Improvement  `json:"improvements"`
	Suggestions      []Suggestion   `json:"suggestions"`
}

var fenceRE = regexp.MustCompile("(?m)^```([a-zA-Z0-9_+-]*)")
var placeholderTitleRE = regexp.MustCompile(`(?i)^module\s+\d+$`)

var genreKeywords = []struct {
	genre    string
	keywords []string
}{
	{"programming", []string{"python", "javascript", "typescript", "golang", "go ", "rust", "java", "kotlin", "code", "coding", "software", "kubernetes", "docker", "git", "api", "backend", "frontend", "react", "linux", "sql", "database"}},
	{"data-ai", []string{"machine learning", "deep learning", "llm", "ai ", "data science", "analytics", "pandas", "ml ", "neural", "embedding", "rag"}},
	{"writing", []string{"writing", "copywriting", "communication", "storytelling", "essay", "newsletter"}},
	{"career", []string{"career", "interview", "resume", "leadership", "management", "product manager", "job"}},
	{"language", []string{"spanish", "french", "german", "language", "vocabulary", "grammar", "esl"}},
	{"product-design", []string{"ux", "ui ", "design", "figma", "product design", "prototype"}},
	{"science", []string{"physics", "chemistry", "biology", "math", "calculus", "statistics"}},
	{"health", []string{"health", "fitness", "nutrition", "wellness", "habit"}},
}

func ClassifyGenre(topic, goal string) string {
	blob := strings.ToLower(topic + " " + goal)
	for _, g := range genreKeywords {
		for _, kw := range g.keywords {
			if strings.Contains(blob, kw) {
				return g.genre
			}
		}
	}
	return "other"
}

func BuildOverview(now time.Time, series []service.Series, issues []service.Issue, sources []service.Source) Overview {
	issuesBySeries := map[string][]service.Issue{}
	for _, issue := range issues {
		issuesBySeries[issue.SeriesID] = append(issuesBySeries[issue.SeriesID], issue)
	}

	seriesStatus := map[string]int{}
	issueStatus := map[string]int{}
	levels := map[string]int{}
	genres := map[string]int{}
	topics := map[string]int{}
	diagrams := map[string]int{}
	sourceStatus := map[string]int{}
	genreSet := map[string]bool{}

	headline := Headline{}
	pipeline := Pipeline{IssuesTotal: len(issues)}
	plan := PlanStats{}
	cadence := Cadence{}
	var coverage []Coverage
	var improvements []Improvement

	headline.SeriesTotal = len(series)
	uniqueTopics := map[string]struct{}{}

	weekStart := func(t time.Time) time.Time {
		t = t.UTC()
		weekday := int(t.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, -(weekday - 1))
	}
	activity := map[string]*WeekBucket{}
	ensureWeek := func(t time.Time) *WeekBucket {
		key := weekStart(t).Format("2006-01-02")
		if activity[key] == nil {
			activity[key] = &WeekBucket{WeekStart: key}
		}
		return activity[key]
	}

	for i := 7; i >= 0; i-- {
		ws := weekStart(now).AddDate(0, 0, -7*i).Format("2006-01-02")
		activity[ws] = &WeekBucket{WeekStart: ws}
	}

	for _, src := range sources {
		label := strings.TrimSpace(src.Status)
		if label == "" {
			label = "unknown"
		}
		sourceStatus[label]++
		if src.Status == "failed" {
			improvements = append(improvements, Improvement{
				Kind:     "source_failed",
				Title:    "Source failed to ingest",
				Detail:   firstNonEmpty(src.URL, src.ID),
				SeriesID: src.SeriesID,
			})
		}
	}

	for _, s := range series {
		status := strings.TrimSpace(s.Status)
		if status == "" {
			status = "unknown"
		}
		seriesStatus[status]++
		if status == "active" {
			headline.SeriesActive++
		}

		level := strings.TrimSpace(strings.ToLower(s.Level))
		if level == "" {
			level = "unspecified"
		}
		levels[level]++

		topic := strings.TrimSpace(s.Topic)
		if topic != "" {
			topics[topic]++
			uniqueTopics[strings.ToLower(topic)] = struct{}{}
		}

		genre := ClassifyGenre(s.Topic, s.Goal)
		genres[genre]++
		genreSet[genre] = true

		ensureWeek(s.CreatedAt).SeriesCreated++

		modules := planModules(s.PlanJSON)
		pipeline.PlannedModules += len(modules)
		for _, title := range moduleTitles(modules) {
			if placeholderTitleRE.MatchString(strings.TrimSpace(title)) {
				plan.PlaceholderTitles++
			}
		}

		switch s.PlanStatus {
		case "ready":
			plan.Ready++
		case "generating":
			plan.Generating++
		case "failed":
			plan.Failed++
			improvements = append(improvements, Improvement{
				Kind:     "plan_failed",
				Title:    "Plan generation failed",
				Detail:   s.Topic,
				SeriesID: s.ID,
			})
		default:
			if len(modules) == 0 {
				plan.Empty++
				improvements = append(improvements, Improvement{
					Kind:     "plan_empty",
					Title:    "Series has no curriculum plan",
					Detail:   s.Topic,
					SeriesID: s.ID,
				})
			}
		}

		seriesIssues := issuesBySeries[s.ID]
		issuedCount := 0
		latest := s.CreatedAt
		diagramCount := 0
		for _, issue := range seriesIssues {
			issuedCount++
			if issue.UpdatedAt.After(latest) {
				latest = issue.UpdatedAt
			}
			stats := inspectContent(issue.ContentJSON)
			headline.Diagrams += stats.diagrams
			headline.CodeBlocks += stats.codeBlocks
			headline.Citations += stats.citations
			diagramCount += stats.diagrams
			for k, v := range stats.byType {
				diagrams[k] += v
			}
		}

		if len(modules) > 0 {
			pct := 0.0
			if len(modules) > 0 {
				pct = float64(issuedCount) / float64(len(modules)) * 100
				if pct > 100 {
					pct = 100
				}
			}
			coverage = append(coverage, Coverage{
				SeriesID: s.ID,
				Topic:    s.Topic,
				Planned:  len(modules),
				Issued:   issuedCount,
				Percent:  pct,
			})
		}

		if status == "active" && now.Sub(latest) > 14*24*time.Hour {
			cadence.StaleActiveSeries++
			improvements = append(improvements, Improvement{
				Kind:     "stale_series",
				Title:    "Active series has gone quiet",
				Detail:   s.Topic + " has had no issue activity in 14 days",
				SeriesID: s.ID,
			})
		}

		if issuedCount > 0 && diagramCount == 0 {
			improvements = append(improvements, Improvement{
				Kind:     "no_diagrams",
				Title:    "No diagrams in generated issues",
				Detail:   s.Topic,
				SeriesID: s.ID,
			})
		}
	}

	horizon := now.Add(7 * 24 * time.Hour)
	for _, issue := range issues {
		st := strings.TrimSpace(issue.Status)
		if st == "" {
			st = "unknown"
		}
		issueStatus[st]++
		ensureWeek(issue.CreatedAt).IssuesCreated++
		if st == "sent" {
			headline.IssuesSent++
			pipeline.Sent++
			ensureWeek(issue.UpdatedAt).IssuesSent++
		}
		if st == "ready" || st == "approved" || st == "sent" {
			pipeline.Generated++
		}
		if st == "failed" {
			pipeline.Failed++
			improvements = append(improvements, Improvement{
				Kind:     "issue_failed",
				Title:    "Issue generation failed",
				Detail:   firstNonEmpty(issue.Objective, issue.ID),
				SeriesID: issue.SeriesID,
			})
		}
		if issue.ScheduledAt != nil {
			if (st == "pending" || st == "ready" || st == "approved") && issue.ScheduledAt.After(now) && !issue.ScheduledAt.After(horizon) {
				cadence.DueNext7Days++
			}
			if (st == "pending" || st == "ready" || st == "approved") && issue.ScheduledAt.Before(now) {
				cadence.OverduePending++
			}
		}
	}

	headline.UniqueTopics = len(uniqueTopics)

	sort.Slice(coverage, func(i, j int) bool {
		return coverage[i].Percent < coverage[j].Percent
	})
	if len(coverage) > 8 {
		coverage = coverage[:8]
	}
	if len(improvements) > 12 {
		improvements = improvements[:12]
	}

	weeks := make([]WeekBucket, 0, len(activity))
	for _, b := range activity {
		weeks = append(weeks, *b)
	}
	sort.Slice(weeks, func(i, j int) bool { return weeks[i].WeekStart < weeks[j].WeekStart })

	return Overview{
		Headline:        headline,
		SeriesByStatus:  sortedCounts(seriesStatus),
		IssuesByStatus:  sortedCounts(issueStatus),
		Levels:          sortedCounts(levels),
		Genres:          sortedCounts(genres),
		Topics:          sortedCounts(topics),
		DiagramsByType:  sortedCounts(diagrams),
		SourcesByStatus: sortedCounts(sourceStatus),
		Pipeline:        pipeline,
		Cadence:         cadence,
		Plan:            plan,
		Activity:        weeks,
		Coverage:        nonNil(coverage),
		Improvements:    nonNil(improvements),
		Suggestions:     nonNil(buildSuggestions(series, genreSet)),
	}
}

type contentStats struct {
	diagrams   int
	codeBlocks int
	citations  int
	byType     map[string]int
}

func inspectContent(raw *string) contentStats {
	stats := contentStats{byType: map[string]int{}}
	body := parseJSONMap(raw)

	if specs, ok := body["visual_specs"].([]any); ok {
		for _, spec := range specs {
			m, ok := spec.(map[string]any)
			if !ok {
				continue
			}
			kind := strings.ToLower(strings.TrimSpace(asString(m["type"])))
			if kind == "" {
				kind = "diagram"
			}
			stats.diagrams++
			stats.byType[kind]++
		}
	}
	if cites, ok := body["citations"].([]any); ok {
		stats.citations += len(cites)
	}

	var texts []string
	if blocks, ok := body["content_blocks"].([]any); ok {
		for _, block := range blocks {
			m, ok := block.(map[string]any)
			if !ok {
				continue
			}
			texts = append(texts, asString(m["text"]))
			if inner, ok := m["citations"].([]any); ok {
				stats.citations += len(inner)
			}
		}
	}
	texts = append(texts, asString(body["html"]), asString(body["body"]), asString(body["content"]))
	joined := strings.Join(texts, "\n")
	matches := fenceRE.FindAllStringSubmatch(joined, -1)
	for _, m := range matches {
		lang := strings.ToLower(strings.TrimSpace(m[1]))
		stats.codeBlocks++
		if lang == "mermaid" || lang == "d2" {
			stats.diagrams++
			stats.byType[lang]++
		}
	}
	return stats
}

func planModules(raw *string) []any {
	plan := parseJSONMap(raw)
	modules, _ := plan["modules"].([]any)
	return modules
}

func moduleTitles(modules []any) []string {
	var titles []string
	for _, raw := range modules {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		titles = append(titles, asString(m["title"]))
	}
	return titles
}

func buildSuggestions(series []service.Series, genres map[string]bool) []Suggestion {
	seen := map[string]bool{}
	var out []Suggestion
	add := func(s Suggestion) {
		key := strings.ToLower(s.Topic)
		if seen[key] || s.Topic == "" {
			return
		}
		seen[key] = true
		out = append(out, s)
	}

	for _, s := range series {
		level := strings.ToLower(strings.TrimSpace(s.Level))
		if level == "beginner" {
			next := "intermediate " + s.Topic
			add(Suggestion{
				Topic:  next,
				Goal:   "Go deeper on " + s.Topic + " after the beginner series.",
				Level:  "intermediate",
				Genre:  ClassifyGenre(s.Topic, s.Goal),
				Reason: "You already have a beginner series on this topic.",
			})
		}
	}

	if genres["programming"] && !hasTopicContaining(series, "test") {
		add(Suggestion{
			Topic:  "Testing and debugging",
			Goal:   "Write tests and debug production-like failures.",
			Level:  "intermediate",
			Genre:  "programming",
			Reason: "Your catalog is code-heavy but has no testing series.",
		})
	}
	if genres["programming"] && !genres["writing"] {
		add(Suggestion{
			Topic:  "Technical writing for engineers",
			Goal:   "Turn code knowledge into clear emails and docs.",
			Level:  "beginner",
			Genre:  "writing",
			Reason: "You teach code; a writing series would complement it.",
		})
	}
	if genres["data-ai"] && !hasTopicContaining(series, "eval") {
		add(Suggestion{
			Topic:  "Evaluating LLM apps",
			Goal:   "Measure quality, cost, and failure modes of AI products.",
			Level:  "intermediate",
			Genre:  "data-ai",
			Reason: "You cover AI topics without an evaluation series.",
		})
	}
	if len(series) > 0 && len(genres) == 1 && genres["other"] {
		add(Suggestion{
			Topic:  "Foundations of the topic you care about most",
			Goal:   "A structured beginner path with weekly practice.",
			Level:  "beginner",
			Genre:  "other",
			Reason: "Start a second series so learners can branch.",
		})
	}
	if len(series) == 0 {
		add(Suggestion{
			Topic:  "Intro to a skill you use every week",
			Goal:   "Teach one practical skill in short emails.",
			Level:  "beginner",
			Genre:  "other",
			Reason: "No series yet — start with something you already know.",
		})
		add(Suggestion{
			Topic:  "A 4-week crash course",
			Goal:   "Cover one tool end to end with diagrams and exercises.",
			Level:  "beginner",
			Genre:  "programming",
			Reason: "Crash courses are easy to plan and send.",
		})
		add(Suggestion{
			Topic:  "Career notes from the field",
			Goal:   "Share interview, writing, and judgment lessons.",
			Level:  "intermediate",
			Genre:  "career",
			Reason: "Career series pair well with technical ones later.",
		})
	}

	if len(out) > 5 {
		out = out[:5]
	}
	return out
}

func hasTopicContaining(series []service.Series, needle string) bool {
	needle = strings.ToLower(needle)
	for _, s := range series {
		if strings.Contains(strings.ToLower(s.Topic+" "+s.Goal), needle) {
			return true
		}
	}
	return false
}

func sortedCounts(m map[string]int) []NamedCount {
	out := make([]NamedCount, 0, len(m))
	for k, v := range m {
		out = append(out, NamedCount{Name: k, Count: v})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count == out[j].Count {
			return out[i].Name < out[j].Name
		}
		return out[i].Count > out[j].Count
	})
	return out
}

func nonNil[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}

func parseJSONMap(raw *string) map[string]any {
	if raw == nil || strings.TrimSpace(*raw) == "" || *raw == "null" {
		return map[string]any{}
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(*raw), &out); err != nil {
		return map[string]any{}
	}
	return out
}

func asString(v any) string {
	s, _ := v.(string)
	return s
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
