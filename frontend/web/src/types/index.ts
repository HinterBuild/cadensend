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
  created_by: string;
  created_at: string;
  updated_at: string;
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

export interface IssueContent {
  subject: string;
  preheader: string;
  content_blocks: ContentBlock[];
  visual_specs: VisualSpec[];
  citations: Citation[];
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
