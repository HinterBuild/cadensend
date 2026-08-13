import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

export async function GET(request: NextRequest) {
  return proxyRequest(request)
}

export async function POST(request: NextRequest) {
  return proxyRequest(request)
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request)
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request)
}

async function proxyRequest(request: NextRequest) {
  const url = new URL(request.url)
  const path = url.pathname.replace('/api/v1/', '')
  const targetUrl = `${BACKEND_URL}/v1/${path}`

  const incomingContentType = request.headers.get('content-type') || ''
  const headers: Record<string, string> = {}

  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    headers['Authorization'] = authHeader
  }

  let body: BodyInit | undefined
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    if (incomingContentType.includes('multipart/form-data')) {
      headers['Content-Type'] = incomingContentType
      body = await request.arrayBuffer()
    } else {
      headers['Content-Type'] = 'application/json'
      const bodyJson = await request.json().catch(() => null)
      if (bodyJson) {
        body = JSON.stringify(bodyJson)
      }
    }
  }

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
  })

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return NextResponse.json(
      { error: response.statusText },
      { status: response.status }
    )
  }

  let data: any
  try {
    data = await response.json()
  } catch {
    data = { error: response.statusText }
  }

  return NextResponse.json(data, { status: response.status })
}
