import { NextRequest, NextResponse } from 'next/server'

// Server-side only proxy between the browser and the Go control API.
//
// Security model:
// - The JWT lives in an httpOnly cookie and is injected as an Authorization
//   header here; it is never readable by client JavaScript.
// - The token value returned by auth endpoints (login, magic-link verify,
//   password change, refresh) is moved into the cookie and stripped from the
//   JSON body before it reaches the browser.
// - State-changing requests must carry a same-origin Origin header (CSRF
//   defense alongside SameSite=Lax). GETs skip the check because the cookie
//   is SameSite=Lax and GET handlers have no side effects.
// - Active sessions slide: once a token is past half its lifetime, the proxy
//   silently refreshes it via the backend.
// - Logout only clears the cookie. The JWT itself stays valid until expiry;
//   "revoke sessions" (token_version bump) is the server-side kill switch.

const BACKEND_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8080'

const SESSION_COOKIE = 'cadensend_session'
// Used only when a token carries no exp claim.
const FALLBACK_TTL_SECONDS = 24 * 60 * 60

// Responses from these routes may carry a fresh token that must move into
// the cookie.
const AUTH_ROUTES = [
  { method: 'POST', pattern: /^users\/login$/ },
  { method: 'POST', pattern: /^users\/magic-link\/verify$/ },
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

function tokenTimes(token: string): { exp: number; iat: number } | null {
  try {
    const part = token.split('.')[1]
    const payload = JSON.parse(
      Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    )
    if (typeof payload?.exp !== 'number' || typeof payload?.iat !== 'number') return null
    return { exp: payload.exp * 1000, iat: payload.iat * 1000 }
  } catch {
    return null
  }
}

function sameOriginStateChange(request: NextRequest): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true
  const origin = request.headers.get('origin') || ''
  // Browsers send Origin on unsafe methods; its absence implies a non-browser
  // client, which has no business going through this cookie-based proxy.
  if (!origin) return false
  try {
    // Compared against Host, so a reverse proxy in front of this app must
    // preserve the original Host header.
    return new URL(origin).host === request.headers.get('host')
  } catch {
    return false
  }
}

async function maybeRefreshSession(token: string): Promise<string | null> {
  const times = tokenTimes(token)
  if (!times) return null
  const halfLife = (times.exp - times.iat) / 2
  if (times.exp - Date.now() > halfLife) return null

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
  // Match the cookie's lifetime to the token's so neither outlives the other.
  const times = tokenTimes(token)
  const maxAge = times
    ? Math.max(0, Math.floor((times.exp - Date.now()) / 1000))
    : FALLBACK_TTL_SECONDS
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
}

function isAuthRoute(path: string, method: string): boolean {
  return AUTH_ROUTES.some(route => route.method === method && route.pattern.test(path))
}

function tokenFromBody(body: unknown): string | null {
  if (body && typeof body === 'object' && 'token' in body) {
    const token = (body as { token: unknown }).token
    // Real JWTs are far longer; this rejects placeholder/empty values.
    if (typeof token === 'string' && token.length > 20) return token
  }
  return null
}

async function buildBody(
  request: NextRequest,
  headers: Record<string, string>,
): Promise<BodyInit | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined
  const contentType = request.headers.get('content-type') || ''

  // JSON (or no content type, which every client in this app treats as JSON)
  // is re-serialized so a malformed body becomes a clean '{}'.
  if (!contentType || contentType.includes('application/json')) {
    headers['Content-Type'] = 'application/json'
    const parsed = await request.json().catch(() => null)
    return parsed === null || parsed === undefined ? '{}' : JSON.stringify(parsed)
  }

  // Everything else (multipart uploads, the urlencoded unsubscribe form) is
  // forwarded byte-for-byte with its original content type.
  headers['Content-Type'] = contentType
  return request.arrayBuffer()
}

async function proxyRequest(request: NextRequest) {
  if (!sameOriginStateChange(request)) {
    return NextResponse.json({ error: 'cross-state requests are not allowed' }, { status: 403 })
  }

  const url = new URL(request.url)
  const path = url.pathname.replace('/api/v1/', '')
  if (path === 'users/logout' && request.method === 'POST') {
    return NextResponse.json({ message: 'Signed out' }, { headers: { 'set-cookie': clearSessionCookie(), 'cache-control': 'no-store' } })
  }

  const targetUrl = `${BACKEND_URL}/v1/${path}${url.search}`
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value || ''

  const headers: Record<string, string> = {}
  const requestId = request.headers.get('x-request-id') || ''
  if (requestId) headers['X-Request-ID'] = requestId
  // Forward any platform-provided client address (Vercel/nginx set XFF) so
  // backend rate limits are per-user rather than per-proxy. Never fabricated:
  // without an upstream edge the backend falls back to its peer address and
  // additionally keys auth limits by submitted email.
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) headers['X-Forwarded-For'] = forwarded

  const body = await buildBody(request, headers)

  const refreshedToken = sessionToken ? await maybeRefreshSession(sessionToken) : null
  const activeToken = refreshedToken || sessionToken
  if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`

  let response: Response
  try {
    response = await fetch(targetUrl, { method: request.method, headers, body })
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

  let data: unknown
  try {
    data = await response.json()
  } catch {
    data = { error: response.statusText }
  }

  // Move freshly issued tokens into the httpOnly cookie before the browser
  // ever sees the JSON. Only auth routes carry a session token in the body,
  // so other responses keep any unrelated "token" field intact.
  let newToken: string | null = null
  if (isAuthRoute(path, request.method)) {
    newToken = tokenFromBody(data)
    if (newToken) delete (data as { token?: unknown }).token
  }
  if (!newToken && refreshedToken && response.ok) newToken = refreshedToken

  const headersInit: Record<string, string> = {}
  if (newToken) {
    headersInit['set-cookie'] = sessionCookie(newToken)
  } else if (response.status === 401 && path !== 'users/login' && !path.startsWith('webhooks/')) {
    // A 401 from a protected endpoint means the session is no longer valid;
    // clear the cookie so the next navigation lands on login cleanly. Login
    // 401s mean bad credentials, and webhooks are public, so neither should
    // sign the user out.
    headersInit['set-cookie'] = clearSessionCookie()
  }

  return NextResponse.json(data, { status: response.status, headers: headersInit })
}
