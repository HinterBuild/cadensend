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
