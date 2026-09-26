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

it('forwards urlencoded form bodies unchanged (unsubscribe confirm)', async () => {
  const upstream = jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response('<html>ok</html>', { headers: { 'content-type': 'text/html' } }),
  );
  await POST(new NextRequest('http://localhost:3000/api/v1/webhooks/unsubscribe', {
    method: 'POST',
    headers: {
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'token=abc&email=a%40b.com',
  }));
  const init = upstream.mock.calls[0][1] as RequestInit;
  expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded');
  expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('token=abc&email=a%40b.com');
});

it('moves a login token into the cookie and strips it from the body', async () => {
  const token = 'header.' + Buffer.from(JSON.stringify({ exp: 9999999999, iat: 1 })).toString('base64') + '.sig';
  jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ token, user: { id: 'u1' } }));
  const response = await POST(new NextRequest('http://localhost:3000/api/v1/users/login', {
    method: 'POST',
    headers: { origin: 'http://localhost:3000', host: 'localhost:3000', 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.com', password: 'x' }),
  }));
  const data = await response.json();
  expect(data.token).toBeUndefined();
  expect(data.user.id).toBe('u1');
  expect(response.headers.get('set-cookie')).toContain(`cadensend_session=${token}`);
});

it('leaves a "token" field alone on non-auth routes', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ token: 'x'.repeat(40) }));
  const response = await GET(new NextRequest('http://localhost:3000/api/v1/series'));
  expect((await response.json()).token).toBe('x'.repeat(40));
  expect(response.headers.get('set-cookie')).toBeNull();
});
