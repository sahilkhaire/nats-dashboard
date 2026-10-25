/**
 * Production HTTP server for NATS Dashboard.
 * Serves static files from dist/ and exposes /api/* endpoints.
 *
 * Environment variables:
 *   NATS_URL            — NATS server URL (e.g. nats://host:4222) [required]
 *   NATS_MONITORING_URL — HTTP monitoring URL (e.g. http://host:8222). If unset, derived from NATS_URL.
 *   NATS_TOKEN          — Auth token [required if server uses token auth]
 *   NATS_NAME           — Context name shown in the UI (default: docker)
 *   NATS_DESCRIPTION    — Human-readable label (default: Docker NATS Server)
 *   PORT                — HTTP port (default: 3000)
 *   DASHBOARD_USERNAME  — Login username (enables auth when set)
 *   DASHBOARD_PASSWORD  — Login password (required when DASHBOARD_USERNAME is set)
 *   SECURE_COOKIES      — "true" to mark the session cookie Secure (when served over HTTPS)
 */

import { createServer }   from 'http'
import { readFileSync }   from 'fs'
import { fileURLToPath }  from 'url'
import { join }           from 'path'

import { createApiHandler }    from './app.js'
import { createStaticHandler } from './middleware/static.js'
import { toMonitoringUrl }     from './services/nats.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const PORT                = parseInt(process.env.PORT || '3000', 10)
const NATS_URL            = process.env.NATS_URL            || ''
const NATS_MONITORING_URL = process.env.NATS_MONITORING_URL || ''
const NATS_TOKEN          = process.env.NATS_TOKEN          || null
const NATS_NAME           = process.env.NATS_NAME           || 'docker'
const NATS_DESCRIPTION    = process.env.NATS_DESCRIPTION    || 'Docker NATS Server'

const DIST_DIR = join(__dirname, '..', 'dist')

let version = null
try { version = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version } catch { /* ignore */ }

const monitoringUrl = NATS_MONITORING_URL || toMonitoringUrl(NATS_URL) || NATS_URL

function loadContexts() {
  if (!NATS_URL) return { contexts: [], current: null }
  return {
    contexts: [{
      name:          NATS_NAME,
      description:   NATS_DESCRIPTION,
      url:           NATS_URL,
      monitoringUrl,
      token:         NATS_TOKEN,
    }],
    current: NATS_NAME,
  }
}

const handleApi = createApiHandler({
  loadContexts,
  defaults: { natsUrl: NATS_URL, monitoringUrl, token: NATS_TOKEN },
  username: process.env.DASHBOARD_USERNAME || '',
  password: process.env.DASHBOARD_PASSWORD || '',
  secureCookies: process.env.SECURE_COOKIES === 'true',
  version,
})

const serveStatic = createStaticHandler(DIST_DIR)

const server = createServer(async (req, res) => {
  try {
    if (await handleApi(req, res)) return
    const pathname = new URL(req.url || '/', 'http://localhost').pathname
    if (!serveStatic(pathname, res)) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/plain')
      res.end('Not Found')
    }
  } catch (err) {
    console.error('Unhandled request error:', err)
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Internal server error' }))
    } else {
      res.end()
    }
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`NATS Dashboard ${version ? `v${version} ` : ''}listening on http://0.0.0.0:${PORT}`)
  if (process.env.DASHBOARD_USERNAME && process.env.DASHBOARD_PASSWORD) console.log('Login protection enabled (DASHBOARD_USERNAME/DASHBOARD_PASSWORD)')
  if (!NATS_URL) console.warn('NATS_URL not set — add a connection from the dashboard UI, or set NATS_URL/NATS_TOKEN.')
})
