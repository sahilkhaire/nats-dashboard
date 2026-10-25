/**
 * Shared HTTP utility helpers used by the API layer (production server and Vite dev server).
 */

const MAX_BODY_BYTES = 25 * 1024 * 1024 // object uploads arrive as base64 JSON

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

export function readJsonBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let body = ''
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new HttpError(413, 'Request body too large'))
        req.destroy()
        return
      }
      body += c
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new HttpError(400, 'Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

export function parseQuery(path) {
  const [, qs = ''] = path.split('?')
  return Object.fromEntries(new URLSearchParams(qs))
}

export function getQuery(req) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  return Object.fromEntries(url.searchParams)
}

export function sendJson(res, status, payload) {
  if (res.headersSent) {
    res.end()
    return
  }
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

/** Map an arbitrary thrown error to a JSON error response. */
export function sendError(res, err, fallback = 'Request failed') {
  const status = err instanceof HttpError ? err.status : 502
  const message = describeNatsError(err) || fallback
  sendJson(res, status, { ok: false, error: message, ...(err?.extra || {}) })
}

/** Turn nats.js / JetStream errors into something a human can act on. */
export function describeNatsError(err) {
  if (!err) return ''
  const code = String(err.code || '')
  const msg = err.message || ''
  if (msg === 'TIMEOUT' || code === 'TIMEOUT') return 'NATS request timed out. Check the server URL, credentials and that JetStream is enabled.'
  if (code === '503' || msg === '503') return 'No responders: JetStream may be disabled on this server or account.'
  if (code === 'CONNECTION_REFUSED' || /ECONNREFUSED/.test(msg)) return `Connection refused: ${msg}`
  if (code === 'AUTHORIZATION_VIOLATION' || /Authorization Violation/i.test(msg)) return 'Authorization violation: check the token or credentials for this connection.'
  if (code === 'PERMISSIONS_VIOLATION') return `Permission denied: ${msg}`
  return msg
}

/**
 * Wrap a route handler so every error ends in a JSON response.
 */
export function route(handler, fallback) {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (err) {
      sendError(res, err, fallback)
    }
  }
}
