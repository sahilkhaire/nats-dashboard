/**
 * NATS connection pool and low-level request helpers.
 * All server-side NATS communication flows through this module.
 */

import { connect, StringCodec } from 'nats'
import { parseQuery, HttpError } from '../utils/http.js'

const sc = StringCodec()
const pool = new Map()
const pending = new Map()

const CONNECT_TIMEOUT_MS = 5000

/**
 * Convert any server URL the UI may hold into a NATS protocol URL.
 * HTTP monitoring URLs (http://host:8222) map to the default client port on the same host.
 */
export function toNatsUrl(url) {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (/^(nats|tls|ws|wss):\/\//i.test(trimmed)) return trimmed
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed)
      return `nats://${u.hostname}:4222`
    } catch {
      return null
    }
  }
  // bare host[:port]
  return `nats://${trimmed}`
}

/** Convert a NATS protocol URL into the conventional HTTP monitoring URL. */
export function toMonitoringUrl(natsUrl) {
  if (!natsUrl || typeof natsUrl !== 'string') return null
  if (/^https?:\/\//i.test(natsUrl)) return natsUrl
  try {
    const u = new URL(natsUrl)
    return `http://${u.hostname}:8222`
  } catch {
    return null
  }
}

/**
 * @param {string} natsUrl
 * @param {string|{token?:string,user?:string,pass?:string}|null} credentials — a token string or a credentials object
 */
export async function getConn(natsUrl, credentials) {
  const url = toNatsUrl(natsUrl)
  if (!url) throw new HttpError(400, 'Missing NATS server URL')

  const creds = typeof credentials === 'string' ? { token: credentials } : (credentials || {})
  const key = `${url}::${creds.token || ''}::${creds.user || ''}::${creds.pass || ''}`
  const existing = pool.get(key)
  if (existing && !existing.isClosed()) return existing
  if (pending.has(key)) return pending.get(key)

  const opts = {
    servers: url,
    name: 'nats-dashboard',
    reconnect: true,
    reconnectTimeWait: 2000,
    maxReconnectAttempts: 10,
    timeout: CONNECT_TIMEOUT_MS,
  }
  if (creds.token) opts.token = creds.token
  if (creds.user) {
    opts.user = creds.user
    opts.pass = creds.pass || ''
  }

  const promise = connect(opts)
    .then((nc) => {
      pool.set(key, nc)
      nc.closed().then(() => {
        if (pool.get(key) === nc) pool.delete(key)
      })
      return nc
    })
    .finally(() => pending.delete(key))

  pending.set(key, promise)
  return promise
}

export async function natsRequest(nc, subject, data = {}, timeout = 10000) {
  const msg = await nc.request(subject, sc.encode(JSON.stringify(data)), { timeout })
  return JSON.parse(sc.decode(msg.data))
}

/** Run a JetStream API request and throw a readable error on API failure. */
export async function jsApi(nc, subject, data = {}, fallback = 'JetStream API error') {
  const resp = await natsRequest(nc, subject, data)
  if (resp?.error) {
    const status = resp.error.code === 404 ? 404 : resp.error.code === 400 ? 400 : 502
    throw new HttpError(status, resp.error.description || fallback)
  }
  return resp
}

/**
 * JetStream asset names (streams, consumers, buckets) become NATS subject tokens,
 * so they must not contain whitespace, '.', '*', '>' or path separators.
 */
const NAME_RE = /^[^\s.*>/\\\0]+$/

export function assertName(value, label = 'name') {
  if (typeof value !== 'string' || !value || value.length > 255 || !NAME_RE.test(value)) {
    throw new HttpError(400, `Invalid ${label}: must be non-empty and cannot contain spaces, '.', '*', '>' or path separators`)
  }
  return value
}

// ─── Monitoring handlers (NATS protocol fallback) ─────────────────────────────

async function handleVarz(nc) {
  const info = nc.info || {}
  return {
    server_id: info.server_id,
    server_name: info.server_name || info.name,
    version: info.version,
    go: info.go,
    host: info.host,
    port: info.port,
    auth_required: info.auth_required,
    tls_required: info.tls_required,
    max_payload: info.max_payload,
    max_connections: null,
    jetstream: info.jetstream,
    cluster: info.cluster ? { name: info.cluster } : undefined,
    uptime: null,
    connections: null,
    slow_consumers: null,
    subscriptions: null,
    in_msgs: null,
    out_msgs: null,
    in_bytes: null,
    out_bytes: null,
    cpu: null,
    mem: null,
    now: new Date().toISOString(),
    _via: 'nats_protocol',
  }
}

async function handleHealthz(nc) {
  if (nc.isClosed()) return { status: 'unavailable' }
  try {
    await nc.flush()
    return { status: 'ok' }
  } catch {
    return { status: 'unavailable' }
  }
}

async function listAll(nc, subject, key) {
  const out = []
  let offset = 0
  for (;;) {
    const resp = await natsRequest(nc, subject, { offset })
    if (resp.error) throw new Error(resp.error.description || 'JetStream API error')
    const page = resp[key] || []
    out.push(...page)
    offset += page.length
    if (!page.length || offset >= (resp.total ?? 0)) break
  }
  return out
}

async function handleJsz(nc, options = {}) {
  const apiInfo = await natsRequest(nc, '$JS.API.INFO')
  if (apiInfo.error) throw new Error(apiInfo.error.description || 'JetStream API error')

  const result = {
    server_id: nc.info?.server_id,
    now: new Date().toISOString(),
    domain: apiInfo.domain,
    config: {
      max_memory: apiInfo.limits?.max_memory,
      max_storage: apiInfo.limits?.max_store,
    },
    memory: apiInfo.memory,
    storage: apiInfo.storage,
    reserved_memory: apiInfo.reserved_memory,
    reserved_storage: apiInfo.reserved_storage,
    accounts: 1,
    ha_assets: apiInfo.ha_assets,
    api: apiInfo.api,
    total_streams: apiInfo.streams,
    total_consumers: apiInfo.consumers,
    total_messages: apiInfo.messages,
    total_message_bytes: apiInfo.bytes,
    _via: 'nats_protocol',
  }

  if (options.streams || options.accounts) {
    const streams = await listAll(nc, '$JS.API.STREAM.LIST', 'streams')
    let totalMessages = 0
    let totalBytes = 0

    const streamDetails = await Promise.all(
      streams.map(async (s) => {
        totalMessages += s.state?.messages ?? 0
        totalBytes += s.state?.bytes ?? 0
        const detail = {
          name: s.config.name,
          created: s.created,
          config: s.config,
          state: s.state,
          cluster: s.cluster,
          consumer_count: s.state?.consumer_count || 0,
        }
        if (options.consumers) {
          try {
            detail.consumer_detail = await listAll(nc, `$JS.API.CONSUMER.LIST.${s.config.name}`, 'consumers')
          } catch {
            detail.consumer_detail = []
          }
        }
        return detail
      })
    )
    result.total_messages ??= totalMessages
    result.total_message_bytes ??= totalBytes
    result.account_details = [{ name: 'default', stream_detail: streamDetails }]
  }
  return result
}

export const NOT_AVAILABLE = (endpoint) => ({
  _via: 'nats_protocol',
  _note: `/${endpoint} requires the HTTP monitoring port (8222). Add the connection with an http:// monitoring URL to see it.`,
  _unavailable: true,
})

export async function handlePath(nc, path) {
  const endpoint = path.split('?')[0].replace(/^\//, '')
  const options = parseQuery(path)
  switch (endpoint) {
    case 'varz':     return handleVarz(nc)
    case 'healthz':  return handleHealthz(nc)
    case 'jsz':      return handleJsz(nc, {
      accounts: options.accounts === 'true',
      streams:  options.streams  === 'true',
      consumers: options.consumers === 'true',
    })
    case 'connz':
    case 'routez':
    case 'gatewayz':
    case 'leafz':
    case 'subsz':
    case 'accountz':
    case 'accstatz':
      return NOT_AVAILABLE(endpoint)
    default: throw new HttpError(404, `Unknown endpoint: ${endpoint}`)
  }
}
