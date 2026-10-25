import { runNatsCommand, validateAndParseNatsCommand } from '../services/cli.js'
import { readJsonBody, sendJson, route } from '../utils/http.js'

const CONNECTION_FLAGS = ['--server', '-s', '--context', '--creds', '--nkey', '--user', '--password', '--token']

/**
 * Point the CLI at the connection selected in the UI unless the user passed
 * their own connection flags.
 */
function withSelectedConnection(args, { natsUrl, token }) {
  const hasOwn = args.some((a) => CONNECTION_FLAGS.some((f) => a === f || a.startsWith(`${f}=`)))
  if (hasOwn || !natsUrl) return { args, env: undefined }
  const env = { NATS_URL: natsUrl, NATS_CONTEXT: '' }
  if (typeof token === 'string') env.NATS_TOKEN = token
  else if (token?.user) Object.assign(env, { NATS_USER: token.user, NATS_PASSWORD: token.pass || '' })
  return { args: [...args, '--server', natsUrl], env }
}

export function registerCliRoutes(router, { conn }) {
  router.post('/api/cli/nats', route(async (req, res) => {
    const body = await readJsonBody(req)
    const validation = validateAndParseNatsCommand(body?.command)
    if (!validation.valid) {
      sendJson(res, 400, { ok: false, validationError: validation.error })
      return
    }
    const { natsUrl, token } = conn.resolve(req, body)
    const { args, env } = withSelectedConnection(validation.args, { natsUrl, token })
    const result = await runNatsCommand(args, { env })
    sendJson(res, 200, { ...result, server: natsUrl || null })
  }, 'Failed to run command'))
}
