/**
 * Vite development-server plugin for NATS Dashboard.
 *
 * Mounts the exact same /api/* handler as server/index.js, but:
 *  - Loads NATS contexts from ~/.config/nats/ instead of env vars
 *  - Runs inside the Vite dev server process
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

import { createApiHandler } from './server/app.js'
import { toMonitoringUrl }  from './server/services/nats.js'

function loadNatsContexts() {
  const home       = process.env.HOME || process.env.USERPROFILE
  const configDir  = process.env.XDG_CONFIG_HOME
    ? join(process.env.XDG_CONFIG_HOME, 'nats')
    : join(home, '.config', 'nats')
  const contextDir = join(configDir, 'context')

  if (!existsSync(contextDir)) return { contexts: [], current: null }

  let current = null
  const contextTxt = join(configDir, 'context.txt')
  if (existsSync(contextTxt)) current = readFileSync(contextTxt, 'utf8').trim()

  const contexts = []
  for (const file of readdirSync(contextDir).filter(f => f.endsWith('.json'))) {
    const name = file.replace('.json', '')
    try {
      const ctx = JSON.parse(readFileSync(join(contextDir, file), 'utf8'))
      if (!ctx.url) continue
      contexts.push({
        name,
        description:   ctx.description || name,
        url:           ctx.url.split(',')[0].trim(),
        // Prefer an explicit monitoring_url field; otherwise derive from the NATS URL
        monitoringUrl: ctx.monitoring_url || toMonitoringUrl(ctx.url.split(',')[0].trim()) || ctx.url,
        token:         ctx.token || null,
        user:          ctx.user || null,
        password:      ctx.password || null,
      })
    } catch { /* skip malformed context */ }
  }
  return { contexts, current }
}

export function natsContextPlugin() {
  return {
    name: 'nats-context',
    configureServer(server) {
      let version = null
      try { version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version } catch { /* ignore */ }
      const handleApi = createApiHandler({
        loadContexts: loadNatsContexts,
        version,
        username: process.env.DASHBOARD_USERNAME || '',
        password: process.env.DASHBOARD_PASSWORD || '',
      })

      server.middlewares.use(async (req, res, next) => {
        try {
          if (!(await handleApi(req, res))) next()
        } catch (err) {
          next(err)
        }
      })
    },
  }
}
