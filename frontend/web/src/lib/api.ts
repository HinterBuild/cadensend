// Next.js API client for Cadensend frontend
// Uses Next.js API routes as a proxy to avoid CORS issues

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `/api/v1${endpoint}`;
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

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
    fetchApi('/users/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  loginWithMagicLink: (email: string) =>
    fetchApi('/users/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  getUser: (userId: string) =>
    fetchApi(`/users/${userId}`),
};

// API client for series management
export const seriesApi = {
  create: (brief: Record<string, unknown>) =>
    fetchApi('/series', {
      method: 'POST',
      body: JSON.stringify(brief),
    }),

  get: (id: string) =>
    fetchApi(`/series/${id}`),

  update: (id: string, updates: Record<string, unknown>) =>
    fetchApi(`/series/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  generatePlan: (id: string) =>
    fetchApi(`/series/${id}/plan`, {
      method: 'POST',
    }),

  getIssues: (id: string) =>
    fetchApi(`/series/${id}/issues`),

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
};

// API client for issue management
export const issueApi = {
  get: (id: string) =>
    fetchApi(`/issues/${id}`),

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
    fetchApi('/sources'),

  submitUrl: (url: string) =>
    fetchApi('/sources/urls', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  get: (id: string) =>
    fetchApi(`/sources/${id}`),

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
