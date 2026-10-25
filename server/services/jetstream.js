/**
 * JetStream message-fetching service.
 * Creates an ephemeral, ack-less pull consumer, fetches messages, then cleans up.
 */

import { natsRequest, jsApi } from './nats.js'

const FETCH_EXPIRES_MS = 3000
const MAX_TAIL_SCAN = 5000

function decodePayload(m) {
  const bytes = m.data ?? new Uint8Array(0)
  const size = bytes.length
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { data: text, encoding: 'utf8', size }
  } catch {
    return { data: Buffer.from(bytes).toString('base64'), encoding: 'base64', size }
  }
}

function readTimestamp(m) {
  try {
    const tsHdr = m.headers?.get('Nats-Time-Stamp')
    if (tsHdr) return new Date(tsHdr).toISOString()
    const tsNs = m.info?.timestampNanos
    if (tsNs != null) {
      const ms = typeof tsNs === 'bigint' ? Number(tsNs / 1000000n) : Math.floor(Number(tsNs) / 1e6)
      return new Date(ms).toISOString()
    }
  } catch { /* ignore */ }
  return null
}

function readHeaders(m) {
  const hdrs = {}
  try {
    if (m.headers) {
      for (const k of m.headers.keys()) hdrs[k] = m.headers.values(k).join(', ')
    }
  } catch { /* ignore */ }
  return hdrs
}

async function createEphemeral(nc, streamName, config) {
  return jsApi(
    nc,
    `$JS.API.CONSUMER.CREATE.${streamName}`,
    {
      stream_name: streamName,
      config: { ack_policy: 'none', mem_storage: true, inactive_threshold: 30 * 1e9, num_replicas: 1, ...config },
    },
    'Failed to create consumer',
  )
}

function deleteEphemeral(nc, streamName, consumerName) {
  natsRequest(nc, `$JS.API.CONSUMER.DELETE.${streamName}.${consumerName}`, {}).catch(() => {})
}

/**
 * Find a start sequence such that the window [start, lastSeq] contains at least `limit`
 * messages matching `filter` (or reaches the start of the stream). Returns an open consumer.
 */
async function createTailConsumer(nc, streamName, filter, limit, firstSeq, lastSeq) {
  let window = Math.max(limit * 4, 100)
  for (;;) {
    const start = Math.max(firstSeq, lastSeq - window + 1)
    const resp = await createEphemeral(nc, streamName, {
      filter_subject: filter,
      deliver_policy: 'by_start_sequence',
      opt_start_seq: start,
    })
    if ((resp.num_pending ?? 0) >= limit || start === firstSeq) return resp
    deleteEphemeral(nc, streamName, resp.name)
    window *= 8
  }
}

export async function fetchStreamMessages(nc, streamName, opts = {}) {
  const { limit = 50, startSeq, afterSeq, startTime, subject } = opts
  const filter = subject && subject.trim() ? subject.trim() : undefined

  const streamInfo = await jsApi(nc, `$JS.API.STREAM.INFO.${streamName}`, {}, 'Stream not found')
  const state = streamInfo.state || {}
  const firstSeq = state.first_seq || 1
  const lastSeq  = state.last_seq  || 0

  if (lastSeq === 0 || (state.messages ?? 0) === 0) return { messages: [], firstSeq, lastSeq, hasMore: false }

  const afterSeqNum = afterSeq != null ? Number(afterSeq) : null
  const startSeqNum = startSeq != null ? Number(startSeq) : null

  let createResp
  let tail = false
  if (afterSeqNum != null) {
    if (afterSeqNum + 1 > lastSeq) return { messages: [], firstSeq, lastSeq, hasMore: false }
    createResp = await createEphemeral(nc, streamName, {
      filter_subject: filter,
      deliver_policy: 'by_start_sequence',
      opt_start_seq: Math.max(firstSeq, afterSeqNum + 1),
    })
  } else if (startSeqNum != null) {
    if (startSeqNum > lastSeq) return { messages: [], firstSeq, lastSeq, hasMore: false }
    createResp = await createEphemeral(nc, streamName, {
      filter_subject: filter,
      deliver_policy: 'by_start_sequence',
      opt_start_seq: Math.max(firstSeq, startSeqNum, 1),
    })
  } else if (startTime) {
    createResp = await createEphemeral(nc, streamName, {
      filter_subject: filter,
      deliver_policy: 'by_start_time',
      opt_start_time: new Date(startTime).toISOString(),
    })
  } else if (filter) {
    tail = true
    createResp = await createTailConsumer(nc, streamName, filter, limit, firstSeq, lastSeq)
  } else {
    createResp = await createEphemeral(nc, streamName, {
      deliver_policy: 'by_start_sequence',
      opt_start_seq: Math.max(firstSeq, lastSeq - limit + 1),
    })
  }

  const consumerName = createResp.name
  const available = createResp.num_pending ?? 0
  const toFetch = tail ? Math.min(available, MAX_TAIL_SCAN) : Math.min(limit, available)

  let messages = []
  try {
    if (toFetch > 0) {
      const consumer = await nc.jetstream().consumers.get(streamName, consumerName)
      const msgs = await consumer.fetch({ max_messages: toFetch, expires: FETCH_EXPIRES_MS })
      for await (const m of msgs) {
        messages.push({
          seq: m.seq,
          subject: m.subject,
          ...decodePayload(m),
          headers: readHeaders(m),
          time: readTimestamp(m),
        })
        if (messages.length >= toFetch) break
      }
    }
  } finally {
    deleteEphemeral(nc, streamName, consumerName)
  }

  if (tail) {
    if (messages.length > limit) messages = messages.slice(-limit)
    return { messages, firstSeq, lastSeq, hasMore: false }
  }
  return { messages, firstSeq, lastSeq, hasMore: available > messages.length }
}
