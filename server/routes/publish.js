/**
 * Publish routes:
 *   POST   /api/stream/publish       — publish or schedule a message
 *   GET    /api/stream/publishes     — list scheduled publishes for a stream (on the current server)
 *   DELETE /api/stream/publish/:id   — cancel a scheduled publish
 */

import { executePublish, schedulePublish, scheduledPublishes, cancelPublish, serializePublish } from '../services/publish.js'
import { readJsonBody, getQuery, sendJson, route, HttpError } from '../utils/http.js'

export function registerPublishRoutes(router, { conn }) {
  router.post('/api/stream/publish', route(async (req, res) => {
    const body = await readJsonBody(req)
    const { stream, subject, payload = '', encoding, headers = [], scheduleAt, msgTtl, msgId } = body
    if (!subject || typeof subject !== 'string' || /\s/.test(subject.trim()) || /[*>]/.test(subject)) {
      throw new HttpError(400, 'A concrete subject is required (no spaces or wildcards)')
    }
    const message = { stream, subject: subject.trim(), payload, encoding, headers, msgTtl: msgTtl || null, msgId: msgId || null }
    const { natsUrl, token } = conn.resolve(req, body)

    if (scheduleAt) {
      const ts = new Date(scheduleAt).getTime()
      if (!Number.isFinite(ts)) throw new HttpError(400, 'scheduleAt must be a valid date')
      const pub = schedulePublish({ ...message, scheduleAt, natsServer: natsUrl, token, serverKey: natsUrl })
      sendJson(res, 201, { ok: true, scheduled: true, id: pub.id, scheduleAt: pub.scheduleAt })
      return
    }
    const result = await executePublish(natsUrl, token, message)
    sendJson(res, 200, { ok: true, scheduled: false, ...result })
  }, 'Publish failed'))

  router.get('/api/stream/publishes', route(async (req, res) => {
    const query = getQuery(req)
    const { natsUrl } = conn.resolve(req, query)
    const list = [...scheduledPublishes.values()]
      .filter((p) => p.serverKey === natsUrl && (!query.stream || p.stream === query.stream))
      .map(serializePublish)
    sendJson(res, 200, { publishes: list })
  }))

  router.delete('/api/stream/publish/:id', route(async (req, res) => {
    if (!cancelPublish(req.params.id)) throw new HttpError(404, 'Scheduled publish not found')
    sendJson(res, 200, { ok: true })
  }))
}
