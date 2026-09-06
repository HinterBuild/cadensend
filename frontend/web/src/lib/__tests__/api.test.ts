/**
 * Unit tests for API client error handling.
 */

import { authApi } from '@/lib/api';

describe('authApi', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('login posts credentials and returns user payload', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ user: { id: 'u1', email: 'a@b.com' } }),
    });

    const res = await authApi.login('a@b.com', 'secret');
    expect(res.user.email).toBe('a@b.com');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/users/login',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('surfaces 401 as session expired message', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: { get: () => 'application/json' },
      json: async () => ({}),
    });

    await expect(authApi.me()).rejects.toThrow('Your session has expired');
  });

  it('uses API error body when present', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'invalid email' }),
    });

    await expect(authApi.login('bad', 'x')).rejects.toThrow('invalid email');
  });
});
