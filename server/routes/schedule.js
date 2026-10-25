/**
 * Scheduled purge routes:
 *   GET    /api/stream/schedules        — list schedules for a stream (on the current server)
 *   POST   /api/stream/schedule         — create a schedule
 *   DELETE /api/stream/schedule/:id     — cancel / delete a schedule
 */

import { schedules, createSchedule, cancelSchedule, serializeSchedule } from '../services/schedule.js'
import { assertName } from '../services/nats.js'
import { readJsonBody, getQuery, sendJson, route, HttpError } from '../utils/http.js'

const MIN_INTERVAL_MS = 60_000

export function registerScheduleRoutes(router, { conn }) {
  router.get('/api/stream/schedules', route(async (req, res) => {
    const query = getQuery(req)
    const { natsUrl } = conn.resolve(req, query)
    const list = [...schedules.values()]
      .filter((s) => s.serverKey === natsUrl && (!query.stream || s.stream === query.stream))
      .map(serializeSchedule)
    sendJson(res, 200, { schedules: list })
  }))

  router.post('/api/stream/schedule', route(async (req, res) => {
    const body = await readJsonBody(req)
    const { type, runAt, intervalMs, intervalLabel, subject } = body
    const stream = assertName(body.stream, 'stream name')
    if (type !== 'once' && type !== 'recurring') throw new HttpError(400, 'type must be once|recurring')
    if (type === 'once') {
      const ts = new Date(runAt).getTime()
      if (!Number.isFinite(ts)) throw new HttpError(400, 'runAt must be a valid date')
      if (ts <= Date.now()) throw new HttpError(400, 'runAt must be in the future')
    }
    if (type === 'recurring' && (!Number.isFinite(Number(intervalMs)) || Number(intervalMs) < MIN_INTERVAL_MS)) {
      throw new HttpError(400, 'intervalMs is required and must be at least 60000 for recurring schedules')
    }
    const { natsUrl, token } = conn.resolve(req, body)
    const schedule = createSchedule({ stream, type, runAt, intervalMs, intervalLabel, subject, natsServer: natsUrl, token, serverKey: natsUrl })
    sendJson(res, 201, { ok: true, schedule: serializeSchedule(schedule) })
  }, 'Failed to create schedule'))

  router.delete('/api/stream/schedule/:id', route(async (req, res) => {
    if (!cancelSchedule(req.params.id)) throw new HttpError(404, 'Schedule not found')
    sendJson(res, 200, { ok: true })
  }))
}
