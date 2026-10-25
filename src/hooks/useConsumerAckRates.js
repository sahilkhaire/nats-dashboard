import { useRef } from 'react'

/** Stable id for maps — LIST payloads sometimes omit top-level `name`. */
export function consumerRowKey(c) {
  const n = c?.name ?? c?.config?.durable_name ?? c?.config?.name
  return n != null && String(n) !== '' ? String(n) : null
}

function seqScalar(obj) {
  if (!obj) return null
  const v = obj.stream_seq ?? obj.consumer_seq
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function formatAckRate(n) {
  if (n == null || Number.isNaN(n)) return '—'
  if (n === 0) return '0 msg/s'
  if (n >= 100) return `${Math.round(n).toLocaleString()} msg/s`
  if (n >= 10) return `${n.toFixed(1)} msg/s`
  return `${n.toFixed(2)} msg/s`
}

/** Key used in the rate maps: "stream/consumer" when the row carries its stream. */
export function consumerRateKey(c) {
  const name = consumerRowKey(c)
  if (!name) return null
  return c?.stream ? `${c.stream}/${name}` : name
}

export const DEFAULT_RATE_WINDOW_MS = 30_000

/** Window stores survive page navigation (keyed per connection). */
const stores = new Map()

const EMPTY = Object.freeze({
  inRatesByName: new Map(),
  outRatesByName: new Map(),
  combinedInRate: null,
  combinedOutRate: null,
  windowMs: DEFAULT_RATE_WINDOW_MS,
  spanMs: 0,
})

function windowRate(samples, field) {
  // Use the oldest and newest sample in the window that both carry the counter.
  let first = null
  let last = null
  for (const s of samples) {
    if (s[field] == null) continue
    if (!first) first = s
    last = s
  }
  if (!first || !last || last.t <= first.t) return null
  return Math.max(0, (last[field] - first[field]) / ((last.t - first.t) / 1000))
}

/**
 * Sliding-window delivery (incoming) and acknowledgement (outgoing) rates per consumer.
 *
 * Every poll adds a sample { t, delivered, ackFloor } per consumer. Samples older than
 * `windowMs` are evicted (keeping one just outside the window so slow polls still yield
 * a rate). The rate is the counter delta across the window divided by its real duration:
 *
 *   rate = (seq_newest - seq_oldest) / (t_newest - t_oldest)
 *
 * This smooths bursty traffic, reports a true 0 for idle consumers once two samples exist,
 * and resets cleanly when a counter goes backwards (consumer recreated).
 *
 * @param {object[]} consumers — consumer_detail rows (with optional `stream`)
 * @param {number} lastFetch — timestamp of the poll that produced `consumers`
 * @param {string} cacheKey — scope for the stored window (e.g. connection id + stream)
 * @param {{ windowMs?: number }} [options]
 */
export function useConsumerAckRates(consumers, lastFetch, cacheKey, { windowMs = DEFAULT_RATE_WINDOW_MS } = {}) {
  const localRef = useRef(null)
  const key = cacheKey ?? null
  if (key === null && !localRef.current) localRef.current = { processedAt: null, samples: new Map(), result: EMPTY }
  const st = key !== null
    ? (stores.get(key) ?? (stores.set(key, { processedAt: null, samples: new Map(), result: EMPTY }), stores.get(key)))
    : localRef.current

  if (lastFetch == null || !consumers) return st.result
  if (st.processedAt != null && lastFetch <= st.processedAt) return st.result

  const inRatesByName = new Map()
  const outRatesByName = new Map()
  const nextSamples = new Map()
  let sumIn = 0
  let sumOut = 0
  let anyIn = false
  let anyOut = false
  let spanMs = 0

  for (const c of consumers) {
    const id = consumerRateKey(c)
    if (!id) continue
    const delivered = seqScalar(c.delivered)
    const ackFloor = seqScalar(c.ack_floor)
    let samples = st.samples.get(id) ?? []

    const prev = samples[samples.length - 1]
    if (prev && ((delivered != null && prev.delivered != null && delivered < prev.delivered)
      || (ackFloor != null && prev.ackFloor != null && ackFloor < prev.ackFloor))) {
      samples = [] // counters went backwards: consumer was recreated
    }
    samples = [...samples, { t: lastFetch, delivered, ackFloor }]

    // Evict samples older than the window, keeping one boundary sample.
    const cutoff = lastFetch - windowMs
    while (samples.length > 2 && samples[1].t <= cutoff) samples.shift()
    nextSamples.set(id, samples)

    const inRate = windowRate(samples, 'delivered')
    const outRate = windowRate(samples, 'ackFloor')
    inRatesByName.set(id, inRate)
    outRatesByName.set(id, outRate)
    if (inRate != null) { sumIn += inRate; anyIn = true }
    if (outRate != null) { sumOut += outRate; anyOut = true }
    if (samples.length > 1) spanMs = Math.max(spanMs, samples[samples.length - 1].t - samples[0].t)
  }

  const result = {
    inRatesByName,
    outRatesByName,
    combinedInRate: anyIn ? sumIn : null,
    combinedOutRate: anyOut ? sumOut : null,
    windowMs,
    spanMs,
  }
  const next = { processedAt: lastFetch, samples: nextSamples, result }
  if (key !== null) stores.set(key, next)
  else localRef.current = next
  return result
}
