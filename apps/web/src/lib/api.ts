// Next.js API client for Cadensend frontend
// This client provides typed wrappers around the API endpoints

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
const AI_API_URL = process.env.NEXT_PUBLIC_AI_API_URL || 'http://localhost:8000';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

/**
 * Base fetch wrapper for making API requests
 */
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BACKEND_URL}${endpoint}`;
  const token = localStorage.getItem('token');
  
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

/**
 * API client for authentication
 */
export const authApi = {
  login: (email: string, password: string) =>
    fetchApi('/v1/users/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  
  sendMagicLink: (email: string) =>
    fetchApi('/v1/users/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  
  verifyMagicLink: (token: string) =>
    fetchApi(`/v1/users/verify-email?token=${token}`, {
      method: 'POST',
    }),
  
  getUser: (userId: string) =>
    fetchApi(`/v1/users/${userId}`),
};

/**
 * API client for series management
 */
export const seriesApi = {
  create: (brief: Record<string, unknown>) =>
    fetchApi('/v1/series', {
      method: 'POST',
      body: JSON.stringify(brief),
    }),
  
  get: (id: string) =>
    fetchApi(`/v1/series/${id}`),
  
  update: (id: string, updates: Record<string, unknown>) =>
    fetchApi(`/v1/series/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  
  generatePlan: (id: string) =>
    fetchApi(`/v1/series/${id}/plan`, {
      method: 'POST',
    }),
  
  getIssues: (id: string) =>
    fetchApi(`/v1/series/${id}/issues`),
  
  activate: (id: string) =>
    fetchApi(`/v1/series/${id}/activate`, {
      method: 'POST',
    }),
  
  pause: (id: string) =>
    fetchApi(`/v1/series/${id}/pause`, {
      method: 'POST',
    }),
  
  resume: (id: string) =>
    fetchApi(`/v1/series/${id}/resume`, {
      method: 'POST',
    }),
  
  testSend: () =>
    fetchApi('/v1/series/test-send', {
      method: 'POST',
    }),
};

/**
 * API client for issue management
 */
export const issueApi = {
  get: (id: string) =>
    fetchApi(`/v1/issues/${id}`),
  
  update: (id: string, updates: Record<string, unknown>) =>
    fetchApi(`/v1/issues/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  
  generate: (id: string) =>
    fetchApi(`/v1/issues/${id}/generate`, {
      method: 'POST',
    }),
  
  approve: (id: string) =>
    fetchApi(`/v1/issues/${id}/approve`, {
      method: 'POST',
    }),
  
  testSend: (id: string) =>
    fetchApi(`/v1/issues/${id}/test-send`, {
      method: 'POST',
    }),
};

/**
 * API client for source management
 */
export const sourceApi = {
  list: () =>
    fetchApi('/v1/sources'),
  
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetchApi('/v1/sources/uploads', {
      method: 'POST',
      body: formData,
    });
  },
  
  submitUrl: (url: string) =>
    fetchApi('/v1/sources/urls', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  
  get: (id: string) =>
    fetchApi(`/v1/sources/${id}`),
  
  preview: (id: string) =>
    fetchApi(`/v1/sources/${id}/preview`),
  
  reindex: (id: string) =>
    fetchApi(`/v1/sources/${id}/reindex`, {
      method: 'POST',
    }),
  
  delete: (id: string) =>
    fetchApi(`/v1/sources/${id}`, {
      method: 'DELETE',
    }),
  
  retrievalPreview: (seriesId: string, query: string) =>
    fetchApi(`/v1/retrieval/preview/${seriesId}`, {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),
};

/**
 * API client for operations monitoring
 */
export const operationsApi = {
  get: (id: string) =>
    fetchApi(`/v1/operations/${id}`),
};
