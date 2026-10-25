/**
 * The dashboard API, shared by the production server (server/index.js) and the
 * Vite dev server (vite-plugin-nats-context.js) so both behave identically.
 *
 * createApiHandler() returns `(req, res) => Promise<boolean>`; it resolves to
 * false when the request is not an /api route so the caller can fall through.
 */

import { createAuthMiddleware }      from './middleware/auth.js'
import { createConnectionResolver }  from './services/connection.js'
import { readJsonBody, sendJson }    from './utils/http.js'
import { registerProxyRoutes }       from './routes/proxy.js'
import { registerStreamRoutes }      from './routes/stream.js'
import { registerScheduleRoutes }    from './routes/schedule.js'
import { registerPublishRoutes }     from './routes/publish.js'
import { registerCliRoutes }         from './routes/cli.js'
import { registerKvRoutes }          from './routes/kv.js'
import { registerObjectRoutes }      from './routes/object.js'

export function createApiHandler({
  loadContexts = () => ({ contexts: [], current: null }),
  defaults = {},
  username = '',
  password = '',
  secureCookies = false,
  version = null,
} = {}) {
  const auth = createAuthMiddleware({ username, password, secureCookies })
  const conn = createConnectionResolver({ defaults, loadContexts })

  const routes = []
  const add = (method) => (path, handler) => {
    const names = [...path.matchAll(/:(\w+)/g)].map((m) => m[1])
    const pattern = new RegExp(`^${path.replace(/:(\w+)/g, '([^/?]+)')}$`)
    routes.push({ method, pattern, names, handler })
  }
  const router = { get: add('GET'), post: add('POST'), delete: add('DELETE') }

  registerProxyRoutes(router,    { conn, loadContexts })
  registerStreamRoutes(router,   { conn })
  registerScheduleRoutes(router, { conn })
  registerPublishRoutes(router,  { conn })
  registerCliRoutes(router,      { conn })
  registerKvRoutes(router,       { conn })
  registerObjectRoutes(router,   { conn })

  return async function handleApi(req, res) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const pathname = url.pathname
    const method = req.method
    if (!pathname.startsWith('/api/')) return false

    // ── Auth endpoints (unauthenticated) ──────────────────────────────────────
    if (pathname === '/api/auth/me' && method === 'GET') {
      sendJson(res, 200, { authenticated: auth.isAuthenticated(req), authEnabled: auth.AUTH_ENABLED, version })
      return true
    }

    if (pathname === '/api/login' && method === 'POST') {
      if (!auth.AUTH_ENABLED) { sendJson(res, 200, { ok: true }); return true }
      try {
        const body = await readJsonBody(req, 16 * 1024)
        const result = auth.checkCredentials(req, body.username, body.password)
        if (result.ok) {
          auth.setSessionCookie(res, auth.createSession())
          sendJson(res, 200, { ok: true })
        } else {
          sendJson(res, result.locked ? 429 : 401, {
            error: result.locked ? 'Too many failed attempts. Try again in a minute.' : 'Invalid username or password',
          })
        }
      } catch (err) {
        sendJson(res, 400, { error: err.message || 'Bad request' })
      }
      return true
    }

    if (pathname === '/api/logout' && method === 'POST') {
      auth.destroySession(req)
      auth.clearSessionCookie(res)
      sendJson(res, 200, { ok: true })
      return true
    }

    // ── Auth guard for all other API routes ───────────────────────────────────
    if (!auth.isAuthenticated(req)) {
      sendJson(res, 401, { error: 'Unauthorized', authenticated: false })
      return true
    }

    // ── Dispatch ──────────────────────────────────────────────────────────────
    for (const r of routes) {
      if (r.method !== method) continue
      const match = pathname.match(r.pattern)
      if (!match) continue
      req.params = {}
      r.names.forEach((name, i) => { req.params[name] = decodeURIComponent(match[i + 1]) })
      await r.handler(req, res)
      return true
    }

    sendJson(res, 404, { error: `No API route for ${method} ${pathname}` })
    return true
  }
}
