/**
 * Type definitions for Cadensend frontend
 * These types mirror the backend contracts
 */

// User types
export interface User {
  id: string;
  email: string;
  name: string;
  timezone: string;
  status: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  email_verified: boolean;
  preferred_model?: string;
}

export interface Workspace {
  id: string;
  name: string;
  plan: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Series types
export interface SeriesBrief {
  topic: string;
  goal: string;
  level: string;
  timezone: string;
  start_date: string;
  duration: string;
  cadence: string;
  send_days: string;
  send_time: string;
  language: string;
  citation_req: string;
  visuals: VisualPrefs;
  delivery_prefs: DeliveryPrefs;
  source_prefs: SourcePrefs;
}

export interface SeriesPlan {
  id: string;
  series_id: string;
  version: number;
  curriculum: Curriculum;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Curriculum {
  objective: string;
  outline: string[];
  prerequisites: string[];
  total_modules: number;
  created_at: string;
  updated_at: string;
}

export interface Series {
  id: string;
  workspace_id: string;
  slug: string;
  topic: string;
  goal: string;
  level: string;
  timezone: string;
  status: string;
  plan_status?: string;
  plan_json?: string | Record<string, unknown> | null;
  plan_error?: string;
  skill_id?: string;
  workflow_mode?: string;
  cadence?: string;
  start_date?: string;
  send_time?: string;
  send_days?: string;
  manual_approval?: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ExtractedBrief {
  topic: string;
  goal: string;
  level: string;
  tone: string;
  length: string;
  cadence: string;
  key_points: string[];
  must_include: string[];
  must_avoid: string[];
  suggested_titles: string[];
  suggested_series_outcome: string;
  ambiguities: string[];
  confidence: number;
  source_type: string;
}

// Issue types
export interface Issue {
  id: string;
  series_id: string;
  sequence_no: number;
  objective: string;
  scheduled_at: string;
  status: string;
  content_json?: string | Record<string, unknown> | null;
  generate_error?: string;
  locked: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type EmailStylePreset = 'classic' | 'editorial' | 'digest' | 'minimal';
export type FontPair = 'classic' | 'modern' | 'newsroom' | 'technical';
export type DiagramTheme = 'neutral' | 'forest' | 'dark';
export type DiagramStyle = 'card' | 'outline' | 'shadow';

export interface IssuePresentation {
  style_preset: EmailStylePreset;
  font_pair: FontPair;
  diagram_theme: DiagramTheme;
  diagram_style: DiagramStyle;
  accent_color: string;
  background_color: string;
  surface_color: string;
  text_color: string;
  muted_color: string;
  border_color: string;
}

export interface ContentCheck {
  id: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
  block_index?: number;
}

export interface IssueContent {
  subject: string;
  preheader: string;
  content_blocks: ContentBlock[];
  visual_specs: VisualSpec[];
  citations: Citation[];
  presentation?: IssuePresentation;
}

export interface ContentBlock {
  id: string;
  type: string;
  title?: string;
  text: string;
  citations: Citation[];
}

export interface Citation {
  block_id: string;
  source_id: string;
  chunk_id: string;
  locator: string;
}

export interface VisualSpec {
  id: string;
  type: string;
  content: string;
  alt_text: string;
  width: number;
  height: number;
  format: string;
  generated_at: string;
  storage_key: string;
}

// Source types
export type InjectionFinding = {
  pattern_id: string;
  category: string;
  count: number;
  snippet?: string;
  severity?: string;
};

export interface Source {
  id: string;
  workspace_id: string;
  scope: string;
  type: string;
  url?: string;
  series_id?: string;
  status: string;
  ingest_error?: string;
  current_version_id: string;
  content_hash?: string;
  duplicate_of?: string;
  chunk_count?: number;
  injection_status?: 'clean' | 'flagged';
  injection_findings?: InjectionFinding[];
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface SourceVersion {
  id: string;
  source_id: string;
  content_hash: string;
  object_key: string;
  parser_version: string;
  status: string;
  error_code?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SourceChunk {
  id: string;
  source_version_id: string;
  index: number;
  text: string;
  token_count: number;
  heading_path: string[];
  checksum: string;
  created_by: string;
  created_at: string;
}

// Recipient (audience) types
export interface Recipient {
  id: string;
  workspace_id: string;
  email: string;
  verified: boolean;
  suppressed: boolean;
  suppression_reason?: string;
  verified_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface IssueVersionSummary {
  version: number;
  subject: string;
  preheader: string;
  checksum?: string;
  block_count?: number;
  word_count?: number;
  is_current?: boolean;
  created_by: string;
  created_at: string;
}

export interface IssueVersionDetail extends IssueVersionSummary {
  content_json?: string | Record<string, unknown> | null;
}

export type IssueVersion = IssueVersionSummary;

export interface RetrievedChunk {
  score: number;
  source_id: string;
  chunk_id?: string;
  heading_path?: string[];
  preview: string;
}

// Delivery types
export interface Delivery {
  id: string;
  issue_id: string;
  recipient_id: string;
  provider_id: string;
  status: string;
  idempotency_key: string;
  external_event_id?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  delivered_at?: string;
}

// Schedule types
export interface Schedule {
  id: string;
  issue_id?: string;
  job_type: string;
  run_at: string;
  status: string;
  attempts: number;
  max_attempts: number;
  claimed_at?: string;
  started_at?: string;
  completed_at?: string;
  error_code?: string;
  error_msg?: string;
}

// Operation types
export interface Operation {
  id: string;
  target: string;
  status: string;
  model: string;
  tokens: {
    input: number;
    output: number;
  };
  cost: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  error_code?: string;
}

// Preferences
export interface VisualPrefs {
  diagram: string;
  chart?: string;
  infographic?: string;
  alt_text: string;
  brand_colors: string[];
}

export interface DeliveryPrefs {
  verify_recipient: boolean;
  manual_approval: boolean;
}

export interface SourcePrefs {
  url?: string;
  files: string[];
  freshness: string;
}

// API Response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface AnalyticsHeadline {
  series_total: number;
  series_active: number;
  issues_sent: number;
  unique_topics: number;
  diagrams: number;
  code_blocks: number;
  citations: number;
}

export interface AnalyticsPipeline {
  planned_modules: number;
  issues_total: number;
  generated: number;
  sent: number;
  failed: number;
}

export interface AnalyticsCadence {
  due_next_7_days: number;
  overdue_pending: number;
  stale_active_series: number;
}

export interface AnalyticsPlan {
  ready: number;
  generating: number;
  failed: number;
  empty: number;
  placeholder_titles: number;
}

export interface AnalyticsCoverage {
  series_id: string;
  topic: string;
  planned: number;
  issued: number;
  percent: number;
}

export interface AnalyticsImprovement {
  kind: string;
  title: string;
  detail: string;
  series_id?: string;
}

export interface AnalyticsSuggestion {
  topic: string;
  goal: string;
  level: string;
  genre: string;
  reason: string;
}

export interface AnalyticsWeek {
  week_start: string;
  series_created: number;
  issues_created: number;
  issues_sent: number;
}

export interface AnalyticsOverview {
  headline: AnalyticsHeadline;
  series_by_status: NamedCount[];
  issues_by_status: NamedCount[];
  levels: NamedCount[];
  genres: NamedCount[];
  topics: NamedCount[];
  diagrams_by_type: NamedCount[];
  sources_by_status: NamedCount[];
  pipeline: AnalyticsPipeline;
  cadence: AnalyticsCadence;
  plan: AnalyticsPlan;
  activity: AnalyticsWeek[];
  coverage: AnalyticsCoverage[];
  improvements: AnalyticsImprovement[];
  suggestions: AnalyticsSuggestion[];
}

export interface PlatformCatalogItem {
  id: string;
  kind: 'skill' | 'connector' | 'workflow' | 'insight' | 'editorial';
  name: string;
  description: string;
  category: string;
  metadata?: Record<string, unknown>;
}

export interface PlatformSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  sections?: string[];
  cadence?: string;
  multi_issue?: boolean;
}

export interface PlatformConnector {
  id: string;
  name: string;
  description: string;
  category: string;
  auth: string;
  sync: string;
  domain?: string;
  logo_url?: string;
  configured?: boolean;
}

export interface PlatformWorkflow {
  id: string;
  name: string;
  description: string;
  category: string;
  metadata?: Record<string, unknown>;
}

export interface PlatformInsight {
  insight_type: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
  detail: string;
  score: number | null;
  payload?: Record<string, unknown>;
}

export interface EvaluationResult {
  passed: boolean;
  overall_score: number;
  scores: Record<string, number>;
  word_count: number;
  section_count: number;
}

export interface StudioOutlineSection {
  id: string;
  title: string;
  order: number;
  text?: string;
}

export interface StudioComposeResult {
  issue: {
    subject: string;
    preheader: string;
    markdown: string;
    content_blocks: Array<{ id: string; title: string; type: string; text: string }>;
  };
  subject_variants: Array<{ id: string; label: string; text: string }>;
  preheader: { text: string; length: number };
  hook: { text: string; panel: string };
  closer: { text: string; panel: string };
  model_comparisons: Array<{ model: string; draft: string }>;
  prompt_blocks: Record<string, Array<{ id: string; label: string; template: string }>>;
  analysis: {
    banned_phrases: string[];
    terminology_suggestions: Array<{ from: string; to: string }>;
    reading_level: { grade: number; label: string; words: number; sentences: number };
  };
  html: string;
  plain_text: string;
  system_overlay?: string;
}

export interface StudioMeta {
  prompt_blocks: Record<string, Array<{ id: string; label: string; template: string }>>;
  personas: Array<{ id: string; label: string; hint: string }>;
  brand_voices: Array<{ id: string; label: string; overlay: string }>;
  emoji_presets: string[];
}
