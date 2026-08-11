import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

  const url = new URL(req.url || '', 'http://localhost')
  const path = url.pathname.replace('/api/v1/', '')

  const targetUrl = `${backendUrl}/v1/${path}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
  })

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    res.status(response.status).json({ error: response.statusText })
    return
  }

  let data: any
  try {
    data = await response.json()
  } catch {
    data = { error: response.statusText }
  }

  res.status(response.status).json(data)
}
