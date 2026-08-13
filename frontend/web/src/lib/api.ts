// Next.js API client for Cadensend frontend
// Uses Next.js API routes as a proxy to avoid CORS issues
import type { Issue, Series, Source, User } from '@/types';

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `/api/v1${endpoint}`;
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || response.statusText);
  }

  return response.json();
}

// API client for authentication
export const authApi = {
  login: (email: string, password: string) =>
    fetchApi<{ token: string; user: User }>('/users/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  loginWithMagicLink: (email: string) =>
    fetchApi('/users/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyMagicLink: (token: string) =>
    fetchApi<{ token: string; user: User }>('/users/magic-link/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
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
};

// API client for series management
export const seriesApi = {
  create: (brief: Record<string, unknown>) =>
    fetchApi('/series', {
      method: 'POST',
      body: JSON.stringify(brief),
    }),

  get: (id: string) =>
    fetchApi<{ data: Series }>(`/series/${id}`),

  update: (id: string, updates: Record<string, unknown>) =>
    fetchApi(`/series/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  generatePlan: (id: string, model?: string) =>
    fetchApi(`/series/${id}/plan`, {
      method: 'POST',
      body: JSON.stringify(model ? { model } : {}),
    }),

  getIssues: (id: string) =>
    fetchApi<{ data: Issue[] }>(`/series/${id}/issues`),

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

  testSend: () =>
    fetchApi('/series/test-send', {
      method: 'POST',
    }),

  list: () =>
    fetchApi<{ series: Series[] }>('/series'),
};

// API client for issue management
export const issueApi = {
  get: (id: string) =>
    fetchApi<{ data: Issue }>(`/issues/${id}`),

  update: (id: string, updates: Record<string, unknown>) =>
    fetchApi(`/issues/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  generate: (id: string, brief?: Record<string, unknown>) =>
    fetchApi(`/issues/${id}/generate`, {
      method: 'POST',
      body: JSON.stringify(brief || {}),
    }),

  approve: (id: string) =>
    fetchApi(`/issues/${id}/approve`, {
      method: 'POST',
    }),

  testSend: (id: string, email: string) =>
    fetchApi(`/issues/${id}/test-send`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
};

// API client for source management
export const sourceApi = {
  list: () =>
    fetchApi<{ data: Source[] }>('/sources'),

  submitUrl: (url: string, type: string = 'url', scope: string = 'workspace') =>
    fetchApi('/sources/urls', {
      method: 'POST',
      body: JSON.stringify({ url, type, scope }),
    }),

  get: (id: string) =>
    fetchApi<{ data: Source }>(`/sources/${id}`),

  preview: (id: string) =>
    fetchApi(`/sources/${id}/preview`),

  reindex: (id: string) =>
    fetchApi(`/sources/${id}/reindex`, {
      method: 'POST',
    }),

  delete: (id: string) =>
    fetchApi(`/sources/${id}`, {
      method: 'DELETE',
    }),

  retrievalPreview: (seriesId: string, query: string) =>
    fetchApi(`/retrieval/preview/${seriesId}`, {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),
};

// API client for operations
export const operationsApi = {
  get: (id: string) =>
    fetchApi(`/operations/${id}`),
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
};
