/**
 * Scheduled purge store — persists in-memory across requests for the lifetime
 * of the server process.
 */

import { randomBytes } from 'crypto'
import { getConn, jsApi } from './nats.js'
import { setLongTimeout, clearLongTimeout } from '../utils/timer.js'

export const schedules = new Map()

function newScheduleId() {
  return randomBytes(8).toString('hex')
}

async function executePurge(streamName, subject, natsServer, token) {
  const nc = await getConn(natsServer, token)
  const body = subject ? { filter: subject } : {}
  return jsApi(nc, `$JS.API.STREAM.PURGE.${streamName}`, body, 'Purge failed')
}

export function armSchedule(schedule) {
  const target = new Date(schedule.nextRun).getTime()

  const fire = async () => {
    const s = schedules.get(schedule.id)
    if (!s) return
    s.status = 'running'
    try {
      const resp = await executePurge(s.stream, s.subject, s.server, s.token)
      s.lastPurged = resp?.purged ?? 0
      s.error = null
    } catch (err) {
      s.error = err.message
    }
    s.lastRun = new Date().toISOString()
    if (!schedules.has(s.id)) return
    if (s.type === 'once') {
      s.status = s.error ? 'error' : 'done'
      s.timer = null
    } else {
      s.status = 'active'
      s.nextRun = new Date(Date.now() + s.intervalMs).toISOString()
      s.timer = setLongTimeout(fire, s.intervalMs)
    }
  }

  schedule.timer = setLongTimeout(fire, target - Date.now())
}

export function createSchedule({ stream, type, runAt, intervalMs, intervalLabel, subject, natsServer, token, serverKey }) {
  const id      = newScheduleId()
  const nextRun = type === 'once'
    ? new Date(runAt).toISOString()
    : new Date(Date.now() + Number(intervalMs)).toISOString()

  const schedule = {
    id,
    stream,
    type,
    runAt:          type === 'once'      ? nextRun              : null,
    intervalMs:     type === 'recurring' ? Number(intervalMs)   : null,
    intervalLabel:  type === 'recurring' ? (intervalLabel || `${Math.round(Number(intervalMs) / 60000)}m`) : null,
    subject:        subject || null,
    server:         natsServer,
    serverKey:      serverKey || natsServer,
    token,
    createdAt:      new Date().toISOString(),
    lastRun:        null,
    lastPurged:     null,
    nextRun,
    status:         'active',
    error:          null,
    timer:          null,
  }

  schedules.set(id, schedule)
  armSchedule(schedule)
  return schedule
}

export function cancelSchedule(id) {
  const s = schedules.get(id)
  if (!s) return false
  clearLongTimeout(s.timer)
  schedules.delete(id)
  return true
}

export function serializeSchedule(s) {
  // eslint-disable-next-line no-unused-vars
  const { timer, token, server: _srv, serverKey: _key, ...rest } = s
  return rest
}
