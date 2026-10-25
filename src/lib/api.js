/**
 * Small fetch wrapper for the dashboard's own /api endpoints.
 * Adds the selected connection, parses JSON and throws readable errors.
 */

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

export function connectionParams(conn) {
  if (!conn) return {}
  const params = {}
  if (conn.monitoringUrl) params.server = conn.monitoringUrl
  if (conn.natsUrl) params.nats = conn.natsUrl
  return params
}

function authHeaders(conn) {
  return conn?.token ? { Authorization: `Bearer ${conn.token}` } : {}
}

export function buildUrl(path, query = {}) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
  }
  const qs = params.toString()
  if (!qs) return path
  return `${path}${path.includes('?') ? '&' : '?'}${qs}`
}

export async function parseJsonResponse(res) {
  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (res.status === 401 && data?.authenticated === false) {
    window.dispatchEvent(new CustomEvent('auth-required'))
  }
  if (!res.ok) {
    const message = data?.error || data?.validationError
      || (text && !text.startsWith('<') ? text.slice(0, 300) : `Request failed (HTTP ${res.status})`)
    throw new ApiError(message, res.status, data)
  }
  if (data === null && text) throw new ApiError('Unexpected (non-JSON) response from server', res.status)
  return data
}

/**
 * @param {object|null} conn — the selected connection
 * @param {string} path — /api/...
 * @param {{ method?: string, body?: object, query?: object, signal?: AbortSignal }} opts
 */
export async function apiRequest(conn, path, { method = 'GET', body, query, signal } = {}) {
  const base = connectionParams(conn)
  const init = {
    method,
    credentials: 'include',
    headers: { ...authHeaders(conn) },
    signal,
  }
  let url
  if (method === 'GET' || method === 'DELETE') {
    url = buildUrl(path, { ...base, ...(query || {}) })
  } else {
    url = buildUrl(path, query)
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify({ ...base, ...(body || {}) })
  }
  const res = await fetch(url, init)
  return parseJsonResponse(res)
}

/** URL usable by EventSource / <a download> — the token has to travel as a query param here. */
export function apiUrl(conn, path, query = {}) {
  return buildUrl(path, { ...connectionParams(conn), ...(conn?.token ? { token: conn.token } : {}), ...query })
}
