import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
  const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL || 'http://localhost:8000'
  
  const url = new URL(req.url || '', 'http://localhost')
  const path = url.pathname.replace('/api/v1/', '')
  
  const targetUrl = path.startsWith('sources') || path.startsWith('retrieval') || path.startsWith('series')
    ? `${aiApiUrl}/v1/${path}`
    : `${backendUrl}/v1/${path}`
  
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1]
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    })
    
    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Proxy error' })
  }
}
