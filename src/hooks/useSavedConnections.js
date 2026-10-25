const STORAGE_KEY = 'nats-dashboard-connections'
const LAST_CONNECTION_KEY = 'nats-dashboard-last-connection'

/**
 * Normalizes a server URL typed by the user.
 *  - trims, drops trailing slashes
 *  - bare "host:port" becomes http:// when it looks like the monitoring port, nats:// otherwise
 */
export function normalizeServerUrl(url) {
  if (!url || typeof url !== 'string') return ''
  let u = url.trim().replace(/\/+$/, '')
  if (!u) return ''
  if (!/^[a-z]+:\/\//i.test(u)) {
    u = /:8222$/.test(u) ? `http://${u}` : `nats://${u}`
  }
  return u
}

/** Back-compat alias. */
export const normalizeMonitoringUrl = normalizeServerUrl

export function loadSavedConnections() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list)
      ? list.filter((c) => c && c.monitoringUrl).map((c) => ({ ...c, source: 'saved' }))
      : []
  } catch {
    return []
  }
}

export function storeSavedConnections(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.map(({ source, ...c }) => c)))
  } catch {
    /* ignore */
  }
}

export function newConnectionId() {
  return `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function getLastConnection() {
  try {
    const raw = localStorage.getItem(LAST_CONNECTION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setLastConnection(conn) {
  try {
    if (conn) localStorage.setItem(LAST_CONNECTION_KEY, JSON.stringify(conn))
    else localStorage.removeItem(LAST_CONNECTION_KEY)
  } catch {
    /* ignore */
  }
}
