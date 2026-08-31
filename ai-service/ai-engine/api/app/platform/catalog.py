"""Unified platform catalog — all 100 builtin capabilities."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal

CatalogKind = Literal["skill", "connector", "workflow", "insight", "editorial"]


@dataclass(frozen=True)
class CatalogItem:
    id: str
    kind: CatalogKind
    name: str
    description: str
    category: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Skills (1–20): content-generation templates
# ---------------------------------------------------------------------------

SKILLS: List[CatalogItem] = [
    CatalogItem(
        "daily_brief",
        "skill",
        "Daily Brief",
        "Turn overnight sources into a short morning newsletter.",
        "briefing",
        {
            "sections": ["headline", "top_signals", "quick_takes", "watchlist"],
            "cadence": "daily",
            "max_sections": 4,
            "tone": "concise, morning-friendly",
            "prompt": (
                "Write a morning brief from sources ingested in the last 24 hours. "
                "Lead with the single most important signal. Keep total length under 600 words. "
                "Use short paragraphs and bullet clusters. End with a one-line watchlist."
            ),
        },
    ),
    CatalogItem(
        "weekly_digest",
        "skill",
        "Weekly Digest",
        "Cluster the week's content into 5–7 thematic sections automatically.",
        "digest",
        {
            "sections": ["intro", "theme_1", "theme_2", "theme_3", "theme_4", "theme_5", "wrap"],
            "cadence": "weekly",
            "section_count": "5-7",
            "prompt": (
                "Cluster this week's sources into 5–7 thematic sections. "
                "Each section needs a sharp headline, 2–3 annotated bullets, and a bridging sentence to the next theme."
            ),
        },
    ),
    CatalogItem(
        "founder_letter",
        "skill",
        "Founder Letter",
        "Rewrite raw updates into a personal, narrative-style email.",
        "narrative",
        {
            "sections": ["opening", "story", "lesson", "forward_look", "sign_off"],
            "tone": "first-person, reflective",
            "prompt": (
                "Transform raw founder updates into a personal letter. "
                "Open with a human moment, weave wins and setbacks into narrative, "
                "extract one lesson, and close with a sincere forward look."
            ),
        },
    ),
    CatalogItem(
        "product_changelog",
        "skill",
        "Product Changelog",
        "Convert shipped features into release-note-friendly newsletter copy.",
        "product",
        {
            "sections": ["summary", "shipped", "improved", "fixed", "coming_soon"],
            "tone": "clear, user-facing",
            "prompt": (
                "Turn shipped work into release notes. Group by Shipped, Improved, Fixed. "
                "Each item: what changed, who benefits, and one example. Avoid internal jargon."
            ),
        },
    ),
    CatalogItem(
        "learning_course",
        "skill",
        "Learning Course",
        "Turn one topic into a multi-issue educational series.",
        "education",
        {
            "sections": ["objective", "concept", "example", "exercise", "summary"],
            "multi_issue": True,
            "prompt": (
                "Design a progressive lesson for this module. "
                "State the objective, teach one core concept, show a worked example, "
                "assign a short exercise, and recap with check-for-understanding questions."
            ),
        },
    ),
    CatalogItem(
        "research_roundup",
        "skill",
        "Research Roundup",
        "Extract findings, caveats, and implications from papers.",
        "research",
        {
            "sections": ["finding", "method", "caveat", "implication", "further_reading"],
            "prompt": (
                "Summarize research papers: state the finding plainly, note methodology limits, "
                "list caveats, explain practical implications, and link further reading."
            ),
        },
    ),
    CatalogItem(
        "community_recap",
        "skill",
        "Community Recap",
        "Summarize Discord, forum, and discussion highlights.",
        "community",
        {
            "sections": ["highlight_threads", "top_questions", "sentiment", "shoutouts"],
            "prompt": (
                "Recap community discussions. Surface top threads, recurring questions, "
                "overall sentiment, and member shoutouts. Quote lightly and attribute."
            ),
        },
    ),
    CatalogItem(
        "customer_insight",
        "skill",
        "Customer Insight",
        "Turn support conversations into pattern-based takeaways.",
        "support",
        {
            "sections": ["patterns", "friction_points", "feature_requests", "actions"],
            "prompt": (
                "Analyze support themes. Group by pattern, name friction points, "
                "list feature requests with frequency, and recommend product actions."
            ),
        },
    ),
    CatalogItem(
        "sales_follow_up",
        "skill",
        "Sales Follow-Up",
        "Turn call notes into a tailored recap email.",
        "sales",
        {
            "sections": ["recap", "value_props", "next_steps", "resources"],
            "tone": "consultative",
            "prompt": (
                "Draft a post-call recap. Mirror the prospect's goals, restate agreed value, "
                "list concrete next steps with owners, and attach relevant resources."
            ),
        },
    ),
    CatalogItem(
        "market_pulse",
        "skill",
        "Market Pulse",
        "Assemble competitor moves, trends, and notable signals.",
        "market",
        {
            "sections": ["macro", "competitor_moves", "trends", "signals", "outlook"],
            "prompt": (
                "Build a market pulse issue. Cover macro context, competitor moves with sources, "
                "emerging trends, weak signals worth watching, and a short outlook."
            ),
        },
    ),
    CatalogItem(
        "podcast_to_newsletter",
        "skill",
        "Podcast-to-Newsletter",
        "Convert transcripts into readable editorial sections.",
        "repurpose",
        {
            "sections": ["hook", "key_moments", "quotes", "takeaways", "listen_link"],
            "source_type": "transcript",
            "prompt": (
                "Convert a podcast transcript into editorial sections. "
                "Lead with a hook, timestamp key moments, pull 2–3 quotable lines, "
                "list actionable takeaways, and link the episode."
            ),
        },
    ),
    CatalogItem(
        "video_to_newsletter",
        "skill",
        "Video-to-Newsletter",
        "Turn YouTube transcripts into lesson-driven summaries.",
        "repurpose",
        {
            "sections": ["lesson_overview", "steps", "diagram", "practice", "watch_link"],
            "source_type": "video_transcript",
            "prompt": (
                "Turn a video transcript into a lesson. Overview the goal, break into numbered steps, "
                "include a mermaid diagram when helpful, add a practice prompt, link the video."
            ),
        },
    ),
    CatalogItem(
        "event_recap",
        "skill",
        "Event Recap",
        "Turn conference notes into a 'what mattered' issue.",
        "events",
        {
            "sections": ["headline", "sessions", "announcements", "networking", "resources"],
            "prompt": (
                "Write an event recap focused on what mattered. "
                "Headline the theme, summarize standout sessions, list announcements, "
                "note networking highlights, and collect resource links."
            ),
        },
    ),
    CatalogItem(
        "case_study",
        "skill",
        "Case Study",
        "Transform one success story into a full persuasive newsletter.",
        "marketing",
        {
            "sections": ["challenge", "approach", "results", "proof", "cta"],
            "prompt": (
                "Expand a success story into a case study newsletter. "
                "Challenge → approach → quantified results → proof points → clear CTA."
            ),
        },
    ),
    CatalogItem(
        "opinion_essay",
        "skill",
        "Opinion Essay",
        "Draft a strong point-of-view issue from a thesis statement.",
        "editorial",
        {
            "sections": ["thesis", "argument", "counterpoint", "evidence", "conclusion"],
            "prompt": (
                "Write a point-of-view essay from the given thesis. "
                "Build a logical argument, acknowledge a counterpoint fairly, "
                "cite evidence, and land a memorable conclusion."
            ),
        },
    ),
    CatalogItem(
        "curated_links",
        "skill",
        "Curated Links",
        "Generate annotations for each link instead of generic summaries.",
        "curation",
        {
            "sections": ["intro", "link_annotations", "pattern_note"],
            "prompt": (
                "Curate links with editorial annotations—not generic summaries. "
                "For each link: why it matters, who should read it, and one sharp insight."
            ),
        },
    ),
    CatalogItem(
        "internal_team_update",
        "skill",
        "Internal Team Update",
        "Format ops, blockers, and wins for staff emails.",
        "internal",
        {
            "sections": ["wins", "in_progress", "blockers", "asks", "shoutouts"],
            "prompt": (
                "Format an internal team update. Wins first, then in-progress work, "
                "blockers with owners, explicit asks, and team shoutouts."
            ),
        },
    ),
    CatalogItem(
        "investor_update",
        "skill",
        "Investor Update",
        "Output metrics, narrative, risks, and asks in one structure.",
        "investor",
        {
            "sections": ["highlights", "metrics", "narrative", "risks", "asks"],
            "prompt": (
                "Write an investor update: highlights, key metrics with deltas, "
                "narrative on progress, honest risks, and specific asks."
            ),
        },
    ),
    CatalogItem(
        "hiring_newsletter",
        "skill",
        "Hiring Newsletter",
        "Package open roles, culture, and team momentum into one email.",
        "hiring",
        {
            "sections": ["why_join", "open_roles", "culture", "team_wins", "apply"],
            "prompt": (
                "Create a hiring newsletter. Why join now, open roles with requirements, "
                "culture signals, recent team wins, and a clear apply CTA."
            ),
        },
    ),
    CatalogItem(
        "re_engagement",
        "skill",
        "Re-Engagement",
        "Rewrite old content into a fresh issue for inactive readers.",
        "retention",
        {
            "sections": ["hook", "whats_new", "refreshed_content", "cta"],
            "refresh_mode": True,
            "prompt": (
                "Re-engage inactive readers. Open with what's new since they left, "
                "refresh the best prior content with updated context, and end with a low-friction CTA."
            ),
        },
    ),
]

# ---------------------------------------------------------------------------
# Connectors (21–40): unified MCP-style integrations
# ---------------------------------------------------------------------------

CONNECTORS: List[CatalogItem] = [
    CatalogItem("linear", "connector", "Linear", "Pull completed issues into a team newsletter.", "project", {"auth": "oauth", "scopes": ["read"], "sync": "issues", "domain": "linear.app"}),
    CatalogItem("clickup", "connector", "ClickUp", "Summarize tasks by sprint, owner, and status.", "project", {"auth": "oauth", "sync": "tasks", "domain": "clickup.com"}),
    CatalogItem("github", "connector", "GitHub", "Turn PRs, releases, and discussions into issue drafts.", "dev", {"auth": "oauth", "sync": "prs,releases,discussions", "domain": "github.com"}),
    CatalogItem("jira", "connector", "Jira", "Convert sprint outcomes into internal status emails.", "project", {"auth": "oauth", "sync": "sprints", "domain": "atlassian.com"}),
    CatalogItem("notion", "connector", "Notion", "Ingest page databases as structured editorial inputs.", "docs", {"auth": "oauth", "sync": "databases,pages", "domain": "notion.so"}),
    CatalogItem("google_drive", "connector", "Google Drive", "Watch selected folders for new source material.", "storage", {"auth": "oauth", "sync": "folder_watch", "domain": "drive.google.com"}),
    CatalogItem("dropbox", "connector", "Dropbox", "Sync research documents into the source library.", "storage", {"auth": "oauth", "sync": "files", "domain": "dropbox.com"}),
    CatalogItem("airtable", "connector", "Airtable", "Use editorial calendars and source tables as generation inputs.", "data", {"auth": "api_key", "sync": "tables", "domain": "airtable.com"}),
    CatalogItem("gmail", "connector", "Gmail", "Convert labeled threads into source packs.", "email", {"auth": "oauth", "sync": "labeled_threads", "domain": "gmail.com"}),
    CatalogItem("slack", "connector", "Slack", "Summarize channel activity into recurring briefings.", "chat", {"auth": "oauth", "sync": "channels", "domain": "slack.com"}),
    CatalogItem("discord", "connector", "Discord", "Extract community sentiment and top questions.", "chat", {"auth": "bot_token", "sync": "channels", "domain": "discord.com"}),
    CatalogItem("trello", "connector", "Trello", "Turn board movement into weekly progress updates.", "project", {"auth": "oauth", "sync": "boards", "domain": "trello.com"}),
    CatalogItem("asana", "connector", "Asana", "Build project newsletters from milestone changes.", "project", {"auth": "oauth", "sync": "projects", "domain": "asana.com"}),
    CatalogItem("figma", "connector", "Figma", "Turn design review notes into product-update copy.", "design", {"auth": "oauth", "sync": "comments", "domain": "figma.com"}),
    CatalogItem("google_calendar", "connector", "Google Calendar", "Create event-preview or event-recap newsletters.", "calendar", {"auth": "oauth", "sync": "events", "domain": "calendar.google.com"}),
    CatalogItem("crm", "connector", "CRM", "Include pipeline or customer trend commentary.", "sales", {"auth": "api_key", "sync": "deals,contacts", "domain": "hubspot.com"}),
    CatalogItem("analytics", "connector", "Analytics", "Turn KPI deltas into narrative updates.", "analytics", {"auth": "api_key", "sync": "metrics", "domain": "analytics.google.com"}),
    CatalogItem("rss_aggregator", "connector", "RSS Aggregator", "Bundle multiple feeds into one digest job.", "feeds", {"auth": "none", "sync": "feeds", "domain": "feedly.com"}),
    CatalogItem("cms", "connector", "CMS", "Publish approved issues as blog posts automatically.", "publish", {"auth": "api_key", "sync": "publish", "domain": "wordpress.com"}),
    CatalogItem("email_provider", "connector", "Email Provider", "Draft, send, and measure in one workflow run.", "publish", {"auth": "api_key", "sync": "send,metrics", "domain": "brevo.com"}),
]

# ---------------------------------------------------------------------------
# Insights (41–60)
# ---------------------------------------------------------------------------

INSIGHTS: List[CatalogItem] = [
    CatalogItem("topic_saturation", "insight", "Topic Saturation", "Warn when the same subject appears too often.", "quality", {"metric": "topic_frequency"}),
    CatalogItem("source_diversity", "insight", "Source Diversity", "Measure whether one or many sources shaped an issue.", "quality", {"metric": "unique_sources"}),
    CatalogItem("citation_reliability", "insight", "Citation Reliability", "Score how grounded each section is.", "quality", {"metric": "citation_ratio"}),
    CatalogItem("freshness", "insight", "Freshness", "Highlight when the source set is too old.", "quality", {"metric": "source_age_days"}),
    CatalogItem("tone_drift", "insight", "Tone Drift", "Detect when recent issues no longer match brand voice.", "voice", {"metric": "tone_similarity"}),
    CatalogItem("readability", "insight", "Readability", "Estimate whether copy fits the intended audience level.", "quality", {"metric": "flesch_kincaid"}),
    CatalogItem("novelty", "insight", "Novelty", "Flag sections that repeat earlier issues too closely.", "quality", {"metric": "text_overlap"}),
    CatalogItem("coverage_gap", "insight", "Coverage Gap", "Show important subtopics not yet addressed.", "planning", {"metric": "outline_coverage"}),
    CatalogItem("audience_fatigue", "insight", "Audience Fatigue", "Spot overlong or overly frequent issues.", "engagement", {"metric": "length_cadence"}),
    CatalogItem("cta_strength", "insight", "CTA Strength", "Evaluate whether the issue has a clear next action.", "engagement", {"metric": "cta_presence"}),
    CatalogItem("engagement_delta", "insight", "Engagement Delta", "Explain what changed between high- and low-performing issues.", "engagement", {"metric": "delivery_delta"}),
    CatalogItem("approval_bottleneck", "insight", "Approval Bottleneck", "Identify where human review slows throughput.", "ops", {"metric": "approval_latency"}),
    CatalogItem("generation_cost", "insight", "Generation Cost", "Show which models or workflows are most expensive.", "ops", {"metric": "token_cost"}),
    CatalogItem("model_quality", "insight", "Model Quality", "Compare provider performance by newsletter type.", "ops", {"metric": "success_rate"}),
    CatalogItem("cadence_health", "insight", "Cadence Health", "Check whether the current schedule is realistic.", "planning", {"metric": "schedule_slippage"}),
    CatalogItem("section_balance", "insight", "Section Balance", "Spot issues with weak intros or bloated middles.", "structure", {"metric": "section_word_ratio"}),
    CatalogItem("narrative_flow", "insight", "Narrative Flow", "Check whether ideas build logically across sections.", "structure", {"metric": "transition_score"}),
    CatalogItem("claim_risk", "insight", "Claim Risk", "Flag assertions likely to need manual verification.", "compliance", {"metric": "unsupported_claims"}),
    CatalogItem("subscriber_signal", "insight", "Subscriber Signal", "Group replies, clicks, and unsubscribes into themes.", "engagement", {"metric": "event_themes"}),
    CatalogItem("series_progress", "insight", "Series Progress", "Show whether a multi-issue course advances coherently.", "planning", {"metric": "curriculum_progress"}),
]

# ---------------------------------------------------------------------------
# Workflows (61–80): agent modes and multi-agent pipelines
# ---------------------------------------------------------------------------

WORKFLOWS: List[CatalogItem] = [
    CatalogItem("researcher_writer_editor", "workflow", "Researcher → Writer → Editor", "Multi-agent pipeline instead of one generator pass.", "pipeline", {"agents": ["researcher", "writer", "editor"]}),
    CatalogItem("judge", "workflow", "Judge Agent", "Score candidate drafts and select the strongest one.", "agent", {"role": "judge"}),
    CatalogItem("fact_check", "workflow", "Fact-Check Agent", "Verify claims against retrieved context before approval.", "agent", {"role": "fact_check"}),
    CatalogItem("voice", "workflow", "Voice Agent", "Rewrite output to match a saved brand persona.", "agent", {"role": "voice"}),
    CatalogItem("compliance", "workflow", "Compliance Agent", "Legal, medical, or finance-safe newsletter review.", "agent", {"role": "compliance"}),
    CatalogItem("structure", "workflow", "Structure Agent", "Choose the best format before drafting begins.", "agent", {"role": "structure"}),
    CatalogItem("hook", "workflow", "Hook Agent", "Specialize in subject lines and opening paragraphs.", "agent", {"role": "hook"}),
    CatalogItem("closer", "workflow", "Closer Agent", "Write stronger endings and CTA sections.", "agent", {"role": "closer"}),
    CatalogItem("repurposing", "workflow", "Repurposing Agent", "Convert one issue into blog, social, and landing-page variants.", "agent", {"role": "repurposing"}),
    CatalogItem("critic", "workflow", "Critic Agent", "Challenge weak claims, vague phrasing, and filler sentences.", "agent", {"role": "critic"}),
    CatalogItem("planner", "workflow", "Planner Agent", "Choose which sources deserve inclusion before writing starts.", "agent", {"role": "planner"}),
    CatalogItem("memory", "workflow", "Memory Agent", "Inject long-term audience and brand context into every run.", "agent", {"role": "memory"}),
    CatalogItem("personalization", "workflow", "Personalization Agent", "Swap intros or examples for audience segments.", "agent", {"role": "personalization"}),
    CatalogItem("recovery", "workflow", "Recovery Agent", "Attempt a fallback workflow when generation quality is poor.", "agent", {"role": "recovery"}),
    CatalogItem("debate", "workflow", "Debate Mode", "Two models argue over the framing before drafting.", "mode", {"models": 2}),
    CatalogItem("comparison", "workflow", "Comparison Mode", "Merge multiple model outputs into one issue.", "mode", {"models": "multi"}),
    CatalogItem("question_driven", "workflow", "Question-Driven Mode", "Write a newsletter as an answer to a reader problem.", "mode", {"input": "reader_question"}),
    CatalogItem("source_first", "workflow", "Source-First Mode", "Only allow output supported by ingested evidence.", "mode", {"grounding": "strict"}),
    CatalogItem("angle_explorer", "workflow", "Angle Explorer Mode", "Propose five editorial directions before writing.", "mode", {"angles": 5}),
    CatalogItem("series_continuity", "workflow", "Series Continuity Mode", "Ensure each issue references prior lessons intelligently.", "mode", {"continuity": True}),
]

# ---------------------------------------------------------------------------
# Editorial / UX (81–100)
# ---------------------------------------------------------------------------

EDITORIAL: List[CatalogItem] = [
    CatalogItem("workflow_builder", "editorial", "Visual Workflow Builder", "Compose newsletter pipelines without code.", "ux", {"ui": "canvas"}),
    CatalogItem("prompt_blocks", "editorial", "Prompt Blocks", "Reusable UI components for intros, transitions, and conclusions.", "ux", {"ui": "blocks"}),
    CatalogItem("outline_board", "editorial", "Issue Outline Board", "Rearrange sections before generation.", "ux", {"ui": "kanban"}),
    CatalogItem("citation_cards", "editorial", "Inline Citation Cards", "Inspect evidence without leaving the draft.", "ux", {"ui": "inline"}),
    CatalogItem("paragraph_regen", "editorial", "Paragraph Regeneration", "Regenerate only one paragraph instead of the whole issue.", "ux", {"ui": "inline"}),
    CatalogItem("collab_comments", "editorial", "Collaborative Comments", "Comment on draft sections for editors and contributors.", "ux", {"ui": "comments"}),
    CatalogItem("approval_gates", "editorial", "Approval Gates", "Role-based gates: writer, editor, publisher, owner.", "ux", {"ui": "gates"}),
    CatalogItem("style_guide_panel", "editorial", "Style Guide Panel", "Banned phrases, preferred terms, and tone rules.", "ux", {"ui": "panel"}),
    CatalogItem("draft_diff", "editorial", "Draft Diff Viewer", "Side-by-side comparison of revisions.", "ux", {"ui": "diff"}),
    CatalogItem("prompt_history", "editorial", "Prompt History Explorer", "Learn why a run produced its output.", "ux", {"ui": "timeline"}),
    CatalogItem("run_replay", "editorial", "Run Replay", "Re-execute old workflows with new models or prompts.", "ux", {"ui": "replay"}),
    CatalogItem("demo_workspaces", "editorial", "Synthetic Demo Workspaces", "Safe fake data for open-source contributors.", "ux", {"ui": "demo"}),
    CatalogItem("template_gallery", "editorial", "Workflow Template Gallery", "Fork and remix public workflow templates.", "ux", {"ui": "gallery"}),
    CatalogItem("contributor_badges", "editorial", "Contributor Badges", "Badges for published skills, connectors, and templates.", "ux", {"ui": "badges"}),
    CatalogItem("scoring_rubric", "editorial", "Scoring Rubric UI", "Rate usefulness, clarity, and originality.", "ux", {"ui": "rubric"}),
    CatalogItem("benchmark_datasets", "editorial", "Benchmark Datasets", "Compare newsletter generation changes.", "ux", {"ui": "benchmark"}),
    CatalogItem("evaluation_harness", "editorial", "Evaluation Harness", "Auto-check grounding, repetition, structure, and tone.", "ux", {"ui": "harness"}),
    CatalogItem("newsletter_sandbox", "editorial", "Newsletter Sandbox", "Test prompts and tools before real sends.", "ux", {"ui": "sandbox"}),
    CatalogItem("local_first", "editorial", "Local-First Mode", "Run with self-hosted models and connectors.", "ux", {"ui": "local"}),
    CatalogItem("plugin_packaging", "editorial", "Plugin Packaging Standard", "Installable community newsletter capability modules.", "ux", {"ui": "plugins"}),
]

ALL_CATALOG: List[CatalogItem] = SKILLS + CONNECTORS + INSIGHTS + WORKFLOWS + EDITORIAL


def get_catalog_item(item_id: str) -> CatalogItem | None:
    for item in ALL_CATALOG:
        if item.id == item_id:
            return item
    return None


def list_by_kind(kind: CatalogKind) -> List[CatalogItem]:
    return [item for item in ALL_CATALOG if item.kind == kind]


def catalog_to_dict(item: CatalogItem) -> Dict[str, Any]:
    return {
        "id": item.id,
        "kind": item.kind,
        "name": item.name,
        "description": item.description,
        "category": item.category,
        "metadata": item.metadata,
    }
