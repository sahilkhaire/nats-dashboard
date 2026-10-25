/**
 * Resolves which NATS server (and credentials) a request should talk to.
 *
 * The UI sends:
 *   server — the monitoring URL (http://host:8222) or a NATS URL (nats://host:4222)
 *   nats   — optional explicit NATS protocol URL (from a NATS context)
 *   token  — optional token (also accepted as `Authorization: Bearer …`)
 *
 * The resolved `token` is either a token string or { user, pass } from a context.
 *
 * When the request omits them, configured defaults are used. Default / context
 * tokens are only ever sent to the host they were configured for.
 */

import { getConn, toNatsUrl } from './nats.js'

function hostOf(url) {
  try {
    return new URL(/^[a-z]+:\/\//i.test(url) ? url : `nats://${url}`).hostname
  } catch {
    return null
  }
}

export function createConnectionResolver({ defaults = {}, loadContexts = () => ({ contexts: [] }) }) {
  function resolve(req, params = {}) {
    const headerToken = req?.headers?.authorization?.replace(/^Bearer\s+/i, '') || null
    const explicitServer = params.server || null
    const server = explicitServer || defaults.monitoringUrl || defaults.natsUrl || ''
    let natsUrl = params.nats || null
    let token = params.token || headerToken || null

    const host = hostOf(server)

    // Match a configured context (dev: ~/.config/nats, prod: env) for its NATS URL / token.
    if (host && (!natsUrl || !token)) {
      let contexts = []
      try { contexts = loadContexts().contexts || [] } catch { /* ignore */ }
      const ctx = contexts.find((c) => c.monitoringUrl === server || c.url === server)
        || contexts.find((c) => hostOf(c.url) === host || hostOf(c.monitoringUrl) === host)
      if (ctx) {
        natsUrl ||= ctx.url
        token ||= ctx.token || (ctx.user ? { user: ctx.user, pass: ctx.password || '' } : null)
      }
    }

    if (!explicitServer) natsUrl ||= defaults.natsUrl || null
    if (!token && defaults.token && host && (host === hostOf(defaults.natsUrl) || host === hostOf(defaults.monitoringUrl))) {
      token = defaults.token
    }

    return {
      monitoringUrl: server,
      natsUrl: natsUrl || toNatsUrl(server),
      token,
    }
  }

  async function connectFor(req, params = {}) {
    const { natsUrl, token } = resolve(req, params)
    return getConn(natsUrl, token)
  }

  return { resolve, connectFor }
}
