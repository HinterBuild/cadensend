/** @jest-environment node */
import { NextRequest } from 'next/server';
import { GET, POST } from '../route';

afterEach(() => jest.restoreAllMocks());

it('preserves query parameters when proxying filters and verification links', async () => {
  const upstream = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ data: [] }));
  const response = await GET(new NextRequest('http://localhost:3000/api/v1/runs?kind=plan&status=failed'));
  expect(response.status).toBe(200);
  expect(upstream.mock.calls[0][0]).toBe('http://localhost:8080/v1/runs?kind=plan&status=failed');
});

it('clears the httpOnly session cookie without depending on backend availability', async () => {
  const upstream = jest.spyOn(global, 'fetch');
  const response = await POST(new NextRequest('http://localhost:3000/api/v1/users/logout', {
    method: 'POST', headers: { origin: 'http://localhost:3000', host: 'localhost:3000', cookie: 'cadensend_session=demo' },
  }));
  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toContain('cadensend_session=;');
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  expect(upstream).not.toHaveBeenCalled();
});

it('rejects a cross-origin sign-out request', async () => {
  const response = await POST(new NextRequest('http://localhost:3000/api/v1/users/logout', {
    method: 'POST', headers: { origin: 'https://other.example.com', host: 'localhost:3000' },
  }));
  expect(response.status).toBe(403);
  expect(response.headers.get('set-cookie')).toBeNull();
});

it('forwards X-Forwarded-For to the backend for rate limiting', async () => {
  const upstream = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ data: [] }));
  await GET(new NextRequest('http://localhost:3000/api/v1/series', {
    headers: {
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
      'x-forwarded-for': '203.0.113.44',
    },
  }));
  const init = upstream.mock.calls[0][1] as RequestInit;
  expect((init.headers as Record<string, string>)['X-Forwarded-For']).toBe('203.0.113.44');
});

it('clears the session cookie when a protected route returns 401', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const response = await GET(new NextRequest('http://localhost:3000/api/v1/series', {
    headers: {
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
      cookie: 'cadensend_session=eyJhbGciOiJub25lIn0.eyJleHAiOjk5OTk5OTk5OTl9.',
    },
  }));
  expect(response.status).toBe(401);
  expect(response.headers.get('set-cookie')).toContain('cadensend_session=;');
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
});
