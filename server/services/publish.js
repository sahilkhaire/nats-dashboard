/**
 * Message publishing + scheduled publish store (in-memory for the lifetime of the process).
 */

import { randomBytes } from 'crypto'
import { headers as natsHeaders } from 'nats'
import { getConn } from './nats.js'
import { setLongTimeout, clearLongTimeout } from '../utils/timer.js'

export const scheduledPublishes = new Map()

const MAX_FINISHED = 200

function toBytes(payload, encoding) {
  if (!payload) return new Uint8Array(0)
  if (encoding === 'base64') return new Uint8Array(Buffer.from(payload, 'base64'))
  return new TextEncoder().encode(String(payload))
}

export async function executePublish(natsServer, token, { stream, subject, payload, encoding, headers: headersArr, msgTtl, msgId }) {
  const nc = await getConn(natsServer, token)
  const js = nc.jetstream()

  const allHeaders = [...(headersArr || [])].filter((h) => h && String(h.key || '').trim())
  if (msgTtl) allHeaders.push({ key: 'Nats-TTL', value: msgTtl })

  const opts = {}
  if (allHeaders.length) {
    const hdr = natsHeaders()
    for (const { key, value } of allHeaders) hdr.append(String(key).trim(), String(value ?? ''))
    opts.headers = hdr
  }
  if (msgId) opts.msgID = String(msgId)
  if (stream) opts.expect = { streamName: stream }

  const ack = await js.publish(subject, toBytes(payload, encoding), opts)
  return { stream: ack.stream, seq: ack.seq, duplicate: ack.duplicate }
}

function pruneFinished() {
  const finished = [...scheduledPublishes.values()].filter((p) => p.status === 'delivered' || p.status === 'error')
  if (finished.length <= MAX_FINISHED) return
  finished
    .sort((a, b) => new Date(a.scheduleAt) - new Date(b.scheduleAt))
    .slice(0, finished.length - MAX_FINISHED)
    .forEach((p) => scheduledPublishes.delete(p.id))
}

export function schedulePublish({ scheduleAt, natsServer, token, serverKey, ...message }) {
  const targetMs = new Date(scheduleAt).getTime()
  const id       = randomBytes(8).toString('hex')

  const pub = {
    id,
    ...message,
    headers:   message.headers || [],
    msgTtl:    message.msgTtl || null,
    server:    natsServer,
    serverKey: serverKey || natsServer,
    token,
    scheduleAt: new Date(targetMs).toISOString(),
    createdAt: new Date().toISOString(),
    status:    'pending',
    result:    null,
    error:     null,
    timer:     null,
  }

  pub.timer = setLongTimeout(async () => {
    const p = scheduledPublishes.get(id)
    if (!p) return
    p.status = 'running'
    try {
      p.result = await executePublish(p.server, p.token, p)
      p.status = 'delivered'
    } catch (err) {
      p.error  = err.message
      p.status = 'error'
    }
    p.timer = null
    pruneFinished()
  }, targetMs - Date.now())

  scheduledPublishes.set(id, pub)
  return pub
}

export function cancelPublish(id) {
  const p = scheduledPublishes.get(id)
  if (!p) return false
  clearLongTimeout(p.timer)
  scheduledPublishes.delete(id)
  return true
}

export function serializePublish(p) {
  // eslint-disable-next-line no-unused-vars
  const { timer, token, server: _srv, serverKey: _key, ...rest } = p
  return rest
}
