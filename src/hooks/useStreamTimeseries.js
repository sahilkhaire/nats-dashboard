import { useRef } from 'react'

const DEFAULT_MAX_POINTS = 120

/** History survives page navigation: one store per cache key (e.g. per connection). */
const sharedStores = new Map()
function emptyState() {
  return { processedAt: null, prevByName: new Map(), seriesByName: new Map() }
}

/**
 * Maintains bounded, per-stream rolling timeseries computed from successive /jsz snapshots.
 *
 * Ingress is derived from `last_seq` (messages appended), not `messages`, so streams
 * sitting at their limits — where old messages are discarded as new ones arrive —
 * still report traffic.
 *
 * The computation is keyed on `lastFetch`, so re-renders (and React StrictMode's
 * double render) never insert extra samples or zero-length intervals.
 *
 * Point shape: { ts, msgsPerSec, bytesPerSec, backlogPending, ackPending, redeliveredDelta, messages }
 *
 * @returns {Map<string, Array<object>>}
 */
export function useStreamTimeseries(streams, lastFetch, options = {}) {
  const maxPoints = Math.max(10, options.maxPoints ?? DEFAULT_MAX_POINTS)
  const localRef = useRef(null)
  const { cacheKey } = options
  const stateRef = cacheKey
    ? {
      get current() { return sharedStores.get(cacheKey) ?? emptyState() },
      set current(v) { sharedStores.set(cacheKey, v) },
    }
    : localRef
  if (!cacheKey && localRef.current === null) localRef.current = emptyState()
  const state = stateRef.current

  if (lastFetch == null || !streams) return state.seriesByName
  if (state.processedAt === lastFetch) return state.seriesByName

  // Ignore out-of-order samples (another component already processed a newer poll)
  if (state.processedAt != null && lastFetch < state.processedAt) return state.seriesByName
  const prevAt = state.processedAt
  const elapsed = prevAt != null ? (lastFetch - prevAt) / 1000 : 0
  const nextPrevByName = new Map()
  const nextSeriesByName = new Map()

  for (const stream of streams) {
    const name = stream.name
    const messages = stream.state?.messages ?? 0
    const bytes = stream.state?.bytes ?? 0
    const lastSeq = stream.state?.last_seq ?? 0
    const consumers = stream.consumer_detail ?? []

    let backlogPending = 0
    let ackPending = 0
    let redeliveredTotal = 0
    for (const consumer of consumers) {
      backlogPending += consumer.num_pending ?? 0
      ackPending += consumer.num_ack_pending ?? 0
      redeliveredTotal += consumer.num_redelivered ?? 0
    }

    const prev = state.prevByName.get(name)
    let msgsPerSec = 0
    let bytesPerSec = 0
    let redeliveredDelta = 0
    if (prev && elapsed > 0) {
      // Sequence resets (stream recreated / purged with seq) count as zero traffic.
      const seqDelta = Math.max(0, lastSeq - prev.lastSeq)
      const avgSize = messages > 0 ? bytes / messages : 0
      const byteDelta = Math.max(0, bytes - prev.bytes)
      msgsPerSec = seqDelta / elapsed
      bytesPerSec = Math.max(byteDelta, seqDelta * avgSize) / elapsed
      redeliveredDelta = Math.max(0, redeliveredTotal - prev.redeliveredTotal)
    }

    const point = { ts: lastFetch, msgsPerSec, bytesPerSec, backlogPending, ackPending, redeliveredDelta, messages }
    const prior = state.seriesByName.get(name) ?? []
    const merged = prev ? [...prior, point] : [point]
    nextSeriesByName.set(name, merged.length > maxPoints ? merged.slice(merged.length - maxPoints) : merged)
    nextPrevByName.set(name, { lastSeq, bytes, redeliveredTotal })
  }

  stateRef.current = { processedAt: lastFetch, prevByName: nextPrevByName, seriesByName: nextSeriesByName }
  return nextSeriesByName
}

/** Latest rate sample per stream: Map<name, { msgsPerSec, bytesPerSec }> (null until two samples exist). */
export function latestRates(seriesByName) {
  const out = new Map()
  for (const [name, points] of seriesByName) {
    out.set(name, points.length > 1 ? points[points.length - 1] : null)
  }
  return out
}
