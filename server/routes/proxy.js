/**
 * NATS proxy and context routes:
 *   GET /api/nats-contexts  — returns available NATS contexts (tokens are never sent to the browser)
 *   GET /api/nats-proxy     — proxies monitoring endpoint calls:
 *       • http(s):// server  → direct HTTP fetch to the monitoring port (all endpoints work)
 *       • nats://    server  → NATS protocol fallback (jsz/varz/healthz only)
 */

import { getConn, handlePath } from '../services/nats.js'
import { getQuery, sendJson, route, HttpError } from '../utils/http.js'

const ALLOWED_ENDPOINTS = new Set(['varz', 'connz', 'routez', 'gatewayz', 'leafz', 'subsz', 'accountz', 'accstatz', 'jsz', 'healthz'])

async function fetchFromMonitoringHttp(monitoringBase, path) {
  const base = monitoringBase.replace(/\/$/, '')
  const target = `${base}${path}`
  let resp
  try {
    resp = await fetch(target, { signal: AbortSignal.timeout(10000) })
  } catch (err) {
    const reason = err?.cause?.code || err?.name || err?.message
    throw new HttpError(502, `Cannot reach monitoring endpoint ${base} (${reason})`, { hint: 'PORT_BLOCKED' })
  }
  // /healthz returns 503 with a JSON body when unhealthy — surface the body instead of failing.
  const text = await resp.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(502, `HTTP ${resp.status} from monitoring endpoint`)
  }
}

export function publicContexts(loadContexts) {
  const { contexts = [], current = null } = loadContexts()
  return {
    current,
    contexts: contexts.map(({ token, user, password, ...rest }) => ({ ...rest, hasCredentials: Boolean(token || user) })),
  }
}

export function registerProxyRoutes(router, { conn, loadContexts }) {
  router.get('/api/nats-contexts', route(async (_req, res) => {
    sendJson(res, 200, publicContexts(loadContexts))
  }))

  router.get('/api/nats-proxy', route(async (req, res) => {
    const query = getQuery(req)
    const rawPath = query.path || '/varz'
    const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
    const endpoint = path.split('?')[0].replace(/^\//, '')
    if (!ALLOWED_ENDPOINTS.has(endpoint)) throw new HttpError(400, `Unsupported monitoring endpoint: /${endpoint}`)

    const { monitoringUrl, natsUrl, token } = conn.resolve(req, query)
    if (!monitoringUrl && !natsUrl) throw new HttpError(400, 'No server selected. Add a connection first.')

    if (/^https?:\/\//i.test(monitoringUrl)) {
      sendJson(res, 200, await fetchFromMonitoringHttp(monitoringUrl, path))
      return
    }

    const nc = await getConn(natsUrl, token)
    sendJson(res, 200, await handlePath(nc, path))
  }, 'NATS query failed'))
}
