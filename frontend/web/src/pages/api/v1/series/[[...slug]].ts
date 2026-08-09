import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
  
  let path = req.url || ''
  if (path.startsWith('/')) path = path.substring(1)
  
  // Remove method suffix (nextjs appends like /series/[id] is just /series/[id])
  // We need to handle dynamic segments
  const cleanPath = req.query.id ? path.replace('/' + req.query.id, '/' + req.query.id) : path
  
  const targetUrl = `${backendUrl}/v1/${path.replace('[id]', req.query.id as string || '')}`
  
  const token = req.cookies.token
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
  })
  
  const data = await response.json()
  res.status(response.status).json(data)
}
