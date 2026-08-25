// Next.js API client for Cadensend frontend.
//
// Authentication is cookie-based: the browser sends no credentials itself;
// the Next.js proxy attaches the JWT from an httpOnly cookie and transparently
// refreshes sliding sessions. 401 responses mean "session expired".
import type { Issue, Series, Source, User, AnalyticsOverview, Recipient, IssueVersion, RetrievedChunk } from '@/types';

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `/api/v1${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = response.statusText;
    if (response.status === 401) {
      message = 'Your session has expired. Please sign in again.';
    } else {
      const errorData = await response.json().catch(() => ({}));
      if (errorData?.error) message = errorData.error;
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return response.text() as unknown as T;
  }
  return response.json();
}

// API client for authentication
export const authApi = {
  me: () =>
    fetchApi<{ data: User }>('/users/me'),

  login: (email: string, password: string) =>
    fetchApi<{ user: User }>('/users/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  loginWithMagicLink: (email: string) =>
    fetchApi('/users/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyMagicLink: (token: string) =>
    fetchApi<{ user: User }>('/users/magic-link/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  forgotPassword: (email: string) =>
    fetchApi<{ message: string }>('/users/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, newPassword: string) =>
    fetchApi<{ message: string }>('/users/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    }),

  getUser: (userId: string) =>
    fetchApi<{ data: User }>(`/users/${userId}`),

  updateUser: (userId: string, updates: { name?: string; timezone?: string; preferred_model?: string }) =>
    fetchApi<{ data: User }>(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  changePassword: (userId: string, currentPassword: string, newPassword: string) =>
    fetchApi<{ message: string }>(`/users/${userId}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),

  deleteAccount: (userId: string) =>
    fetchApi<{ message: string }>(`/users/${userId}`, {
      method: 'DELETE',
    }),

  revokeSessions: () =>
    fetchApi<{ message: string }>('/users/me/sessions/revoke', {
      method: 'POST',
    }),
};

// API client for series management
export const seriesApi = {
  create: (brief: Record<string, unknown>) =>
    fetchApi<{ data: Series; warning?: string }>('/series', {
      method: 'POST',
      body: JSON.stringify(brief),
    }),

  get: (id: string) =>
    fetchApi<{ data: Series }>(`/series/${id}`),

  update: (id: string, updates: Record<string, unknown>) =>
    fetchApi<{ data: Series }>(`/series/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  generatePlan: (id: string, model?: string) =>
    fetchApi<{ status: string; series_id: string; message?: string }>(`/series/${id}/plan`, {
      method: 'POST',
      body: JSON.stringify(model ? { model } : {}),
    }),

  getPlan: (id: string) =>
    fetchApi<{
      status: string;
      series_id: string;
      plan: Record<string, unknown> | null;
      error?: string;
    }>(`/series/${id}/plan`),

  getIssues: (id: string) =>
    fetchApi<{ data: Issue[] }>(`/series/${id}/issues`),

  createIssue: (id: string, payload: { objective: string; scheduled_at?: string; model?: string }) =>
    fetchApi<{ data: Issue }>(`/series/${id}/issues`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSources: (id: string) =>
    fetchApi<{ data: Source[] }>(`/series/${id}/sources`),

  activate: (id: string) =>
    fetchApi(`/series/${id}/activate`, {
      method: 'POST',
    }),

  pause: (id: string) =>
    fetchApi(`/series/${id}/pause`, {
      method: 'POST',
    }),

  resume: (id: string) =>
    fetchApi(`/series/${id}/resume`, {
      method: 'POST',
    }),

  delete: (id: string) =>
    fetchApi(`/series/${id}`, {
      method: 'DELETE',
    }),

  testSend: (id: string, payload?: { email?: string; module_index?: number }) =>
    fetchApi<{ email?: string }>(`/series/${id}/test-send`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),

  retrievalPreview: (id: string, query: string, topK?: number) =>
    fetchApi<{ results: RetrievedChunk[] }>(`/series/${id}/retrieval-preview`, {
      method: 'POST',
      body: JSON.stringify({ query, top_k: topK }),
    }),

  list: () =>
    fetchApi<{ series: Series[] }>('/series'),
};

// API client for issue management
export const issueApi = {
  get: (id: string) =>
    fetchApi<{ data: Issue }>(`/issues/${id}`),

  update: (id: string, updates: Record<string, unknown>) =>
    fetchApi<{ data: Issue }>(`/issues/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  generate: (id: string, brief?: Record<string, unknown>) =>
    fetchApi(`/issues/${id}/generate`, {
      method: 'POST',
      body: JSON.stringify(brief || {}),
    }),

  approve: (id: string, payload?: { scheduled_at?: string }) =>
    fetchApi<{ message: string; scheduled_at?: string }>(`/issues/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),

  reschedule: (id: string, scheduledAt: string) =>
    fetchApi<{ message: string }>(`/issues/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ scheduled_at: scheduledAt }),
    }),

  cancelSend: (id: string) =>
    fetchApi<{ message: string }>(`/issues/${id}/cancel-send`, {
      method: 'POST',
    }),

  cancelGeneration: (id: string) =>
    fetchApi<{ data: Issue; message: string }>(`/issues/${id}/cancel-generation`, {
      method: 'POST',
    }),

  versions: (id: string) =>
    fetchApi<{ data: IssueVersion[] }>(`/issues/${id}/versions`),

  restoreVersion: (id: string, version: number) =>
    fetchApi<{ data: Issue }>(`/issues/${id}/versions/${version}/restore`, {
      method: 'POST',
    }),

  previewHtmlUrl: (id: string) => `/api/v1/issues/${id}/preview-html`,

  testSend: (id: string, email?: string) =>
    fetchApi<{ email?: string }>(`/issues/${id}/test-send`, {
      method: 'POST',
      body: JSON.stringify(email ? { email } : {}),
    }),
};

// API client for source management
export const sourceApi = {
  list: () =>
    fetchApi<{ data: Source[] }>('/sources'),

  submitUrl: (
    url: string,
    type: string = 'url',
    scope: string = 'workspace',
    seriesId?: string
  ) =>
    fetchApi<{ data: Source }>('/sources/urls', {
      method: 'POST',
      body: JSON.stringify({ url, type, scope, series_id: seriesId }),
    }),

  upload: (file: File, scope: string = 'workspace', seriesId?: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('scope', scope);
    if (seriesId) {
      form.append('series_id', seriesId);
    }
    return fetchApi<{ data: Source }>('/sources/uploads', {
      method: 'POST',
      body: form,
    });
  },

  get: (id: string) =>
    fetchApi<{ data: Source }>(`/sources/${id}`),

  preview: (id: string) =>
    fetchApi<{ data: { source_id: string; total: number; chunks: Array<{ chunk_index: number; title?: string; heading_path: string[]; preview: string }> } }>(`/sources/${id}/preview`, {
      method: 'POST',
    }),

  chunks: (id: string) =>
    fetchApi<{ data: { source_id: string; total: number; chunks: Array<{ chunk_index: number; heading_path: string[]; preview: string }> } }>(`/sources/${id}/chunks`, {
      method: 'POST',
    }),

  reindex: (id: string) =>
    fetchApi(`/sources/${id}/reindex`, {
      method: 'POST',
    }),

  delete: (id: string) =>
    fetchApi(`/sources/${id}`, {
      method: 'DELETE',
    }),
};

// API client for recipient (audience) management
export const recipientApi = {
  list: () =>
    fetchApi<{ data: Recipient[] }>('/recipients'),

  create: (email: string) =>
    fetchApi<{ data: Recipient; warning?: string }>('/recipients', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  remove: (id: string) =>
    fetchApi<{ message: string }>(`/recipients/${id}`, {
      method: 'DELETE',
    }),

  resendVerification: (id: string) =>
    fetchApi<{ message: string }>(`/recipients/${id}/resend-verification`, {
      method: 'POST',
    }),

  setSuppressed: (id: string, suppressed: boolean) =>
    fetchApi<{ message: string }>(`/recipients/${id}/suppression`, {
      method: 'PATCH',
      body: JSON.stringify({ suppressed }),
    }),
};

export type OpenRouterModel = {
  id: string;
  name: string;
  is_default?: boolean;
};

export const modelsApi = {
  list: () =>
    fetchApi<{ default_model: string; models: OpenRouterModel[] }>('/models'),
};

export const analyticsApi = {
  overview: () => fetchApi<{ data: AnalyticsOverview }>('/analytics/overview'),
};

export type RunItem = {
  id: string;
  kind: string;
  status: string;
  title: string;
  detail: string;
  error?: string;
  series_id?: string;
  issue_id?: string;
  source_id?: string;
  href?: string;
  can_retry: boolean;
  tokens_in?: number;
  tokens_out?: number;
  model?: string;
  created_at: string;
  updated_at: string;
};

export type RunSummary = {
  queued: number;
  running: number;
  failed: number;
  completed: number;
};

export const runsApi = {
  list: (filters?: { kind?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (filters?.kind) params.set('kind', filters.kind);
    if (filters?.status) params.set('status', filters.status);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return fetchApi<{ data: RunItem[]; summary: RunSummary }>(`/runs${suffix}`);
  },
};
