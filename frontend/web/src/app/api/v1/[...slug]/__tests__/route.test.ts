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
