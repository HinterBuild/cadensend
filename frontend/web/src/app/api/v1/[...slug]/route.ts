import { NextRequest, NextResponse } from 'next/server'

// Server-side only proxy between the browser and the Go control API.
//
// Security model:
// - The JWT lives in an httpOnly cookie and is injected as an Authorization
//   header here; it is never readable by client JavaScript.
// - The token value returned by auth endpoints (login, magic-link verify,
//   password change/reset, refresh) is moved into the cookie and stripped
//   from the JSON body before it reaches the browser.
// - State-changing requests must present a same-origin Origin/Referer header
//   (CSRF defense alongside SameSite=Lax).
// - Active sessions slide: when a request carries a token that is more than
//   halfway to expiry, the proxy silently refreshes it via the backend.

const BACKEND_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8080'

const SESSION_COOKIE = 'cadensend_session'
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // matches ACCESS_TOKEN_EXPIRE_MINUTES default
const REFRESH_AFTER_MS = TOKEN_TTL_MS / 2

const AUTH_ROUTES = [
  { method: 'POST', pattern: /^users\/login$/ },
  { method: 'POST', pattern: /^users\/magic-link\/verify$/ },
  { method: 'POST', pattern: /^users\/reset-password$/ },
  { method: 'PATCH', pattern: /^users\/[^/]+\/password$/ },
  { method: 'POST', pattern: /^users\/me\/session\/refresh$/ },
  { method: 'POST', pattern: /^users\/me\/sessions\/revoke$/ },
]

export async function GET(request: NextRequest) {
  return proxyRequest(request)
}

export async function POST(request: NextRequest) {
  return proxyRequest(request)
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request)
}

export async function PUT(request: NextRequest) {
  return proxyRequest(request)
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request)
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1]
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

function sameOriginStateChange(request: NextRequest): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true
  const origin = request.headers.get('origin') || ''
  if (!origin) {
    // Browsers always send Origin on cross-origin and most same-origin
    // unsafe methods; absence implies a non-browser client.
    return false
  }
  try {
    return new URL(origin).host === request.headers.get('host')
  } catch {
    return false
  }
}

async function maybeRefreshSession(token: string): Promise<string | null> {
  const payload = decodeJwtPayload(token)
  const exp = typeof payload?.exp === 'number' ? (payload.exp as number) * 1000 : null
  const iat = typeof payload?.iat === 'number' ? (payload.iat as number) * 1000 : null
  if (!exp || !iat) return null
  if (exp - Date.now() > REFRESH_AFTER_MS) return null
  if (Date.now() - iat < 60 * 1000) return null // don't churn on bursts

  try {
    const response = await fetch(`${BACKEND_URL}/v1/users/me/session/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!response.ok) return null
    const data = await response.json()
    return typeof data.token === 'string' && data.token ? data.token : null
  } catch {
    return null
  }
}

function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TOKEN_TTL_MS / 1000}${secure}`
}

function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
}

function extractToken(path: string, method: string, body: any, responseHeaders: Headers): string | null {
  for (const route of AUTH_ROUTES) {
    if (route.method === method && route.pattern.test(path)) {
      if (typeof body?.token === 'string' && body.token.length > 20) return body.token
      break
    }
  }
  const renewed = responseHeaders.get('X-Renewed-Token')
  return renewed && renewed.length > 20 ? renewed : null
}

async function proxyRequest(request: NextRequest) {
  if (!sameOriginStateChange(request)) {
    return NextResponse.json({ error: 'cross-state requests are not allowed' }, { status: 403 })
  }

  const url = new URL(request.url)
  const path = url.pathname.replace('/api/v1/', '')
  const targetUrl = `${BACKEND_URL}/v1/${path}`

  let sessionToken = request.cookies.get(SESSION_COOKIE)?.value || ''

  // Legacy clients may still send a bearer header directly.
  if (!sessionToken) {
    const legacy = request.headers.get('authorization')
    if (legacy?.startsWith('Bearer ')) sessionToken = legacy.slice(7)
  }

  const incomingContentType = request.headers.get('content-type') || ''
  const headers: Record<string, string> = {}
  const requestId = request.headers.get('x-request-id') || ''
  if (requestId) headers['X-Request-ID'] = requestId
  // Forward any platform-provided client address (Vercel/nginx set XFF) so
  // backend rate limits are per-user rather than per-proxy. Never fabricated:
  // without an upstream edge the backend falls back to its peer address and
  // additionally keys auth limits by submitted email.
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) headers['X-Forwarded-For'] = forwarded

  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`
  }

  let body: BodyInit | undefined
  let parsedBody: any = null
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    if (incomingContentType.includes('multipart/form-data')) {
      headers['Content-Type'] = incomingContentType
      body = await request.arrayBuffer()
    } else {
      headers['Content-Type'] = 'application/json'
      parsedBody = await request.json().catch(() => null)
      if (parsedBody !== null && parsedBody !== undefined) {
        body = JSON.stringify(parsedBody)
      } else {
        body = '{}'
      }
    }
  }

  let response: Response
  let refreshedToken: string | null = null
  if (sessionToken) {
    refreshedToken = await maybeRefreshSession(sessionToken)
    if (refreshedToken) {
      headers['Authorization'] = `Bearer ${refreshedToken}`
    }
  }
  try {
    response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
    })
  } catch {
    return NextResponse.json({ error: 'backend unavailable' }, { status: 502 })
  }

  const contentType = response.headers.get('content-type') || ''

  // Pass through non-JSON payloads untouched (HTML previews, unsubscribe pages).
  if (!contentType.includes('application/json')) {
    const passthrough = new NextResponse(response.body, { status: response.status })
    passthrough.headers.set('content-type', contentType || 'text/plain')
    if (refreshedToken) passthrough.headers.append('set-cookie', sessionCookie(refreshedToken))
    return passthrough
  }

  let data: any
  try {
    data = await response.json()
  } catch {
    data = { error: response.statusText }
  }

  // Move freshly issued tokens into the httpOnly cookie before the browser
  // ever sees the JSON.
  const newToken = extractToken(path, request.method, data, response.headers) ||
    (refreshedToken && response.ok ? refreshedToken : null)
  if (newToken && data && typeof data === 'object' && 'token' in data) {
    delete data.token
  }

  const headersInit: Record<string, string> = {}
  if (newToken) {
    headersInit['set-cookie'] = sessionCookie(newToken)
  } else if (response.status === 401 && path !== 'users/login' && !path.startsWith('webhooks/')) {
    // A 401 from a protected endpoint means the session is no longer valid;
    // clear the cookie so the next navigation lands on login cleanly.
    headersInit['set-cookie'] = clearSessionCookie()
  }

  return NextResponse.json(data, { status: response.status, headers: headersInit })
}
