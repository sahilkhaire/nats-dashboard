/**
 * Shared polling store.
 *
 * Every component that polls the same URL shares one request loop:
 *  - requests never overlap (the next one is scheduled after the previous finishes)
 *  - the effective interval is the fastest interval any subscriber asked for
 *  - polling pauses while the tab is hidden and refreshes when it becomes visible
 *  - the last result is cached briefly so navigating back renders instantly
 */

import { parseJsonResponse } from './api'

const CACHE_TTL_MS = 60_000
const EMPTY = Object.freeze({ data: null, error: null, lastFetch: null, prevFetch: null })

const entries = new Map()
let subscriberSeq = 0

function notify(entry) {
  for (const listener of entry.listeners.values()) listener(entry.state)
}

function activeInterval(entry) {
  let min = Infinity
  for (const sub of entry.subscribers.values()) {
    if (sub.enabled && sub.interval > 0) min = Math.min(min, sub.interval)
  }
  return min
}

function schedule(entry, delay) {
  clearTimeout(entry.timer)
  entry.timer = null
  const interval = activeInterval(entry)
  if (!Number.isFinite(interval)) return
  entry.timer = setTimeout(() => run(entry), delay ?? interval)
}

function emitNotification(level, title, message) {
  window.dispatchEvent(new CustomEvent('app-notify', {
    detail: { level, title, message, source: 'polling' },
  }))
}

async function run(entry) {
  clearTimeout(entry.timer)
  entry.timer = null
  if (!Number.isFinite(activeInterval(entry))) return
  if (typeof document !== 'undefined' && document.hidden) {
    entry.staleWhileHidden = true
    return
  }
  if (entry.inFlight) return

  entry.inFlight = true
  entry.controller = new AbortController()
  try {
    const res = await fetch(entry.url, {
      credentials: 'include',
      headers: entry.headers,
      signal: entry.controller.signal,
    })
    const json = await parseJsonResponse(res)
    entry.state = { data: json, error: null, lastFetch: Date.now(), prevFetch: entry.state.lastFetch }
    entry.lastErrorMessage = null
    if (json?._unavailable && json._note && entry.lastWarning !== json._note) {
      entry.lastWarning = json._note
      emitNotification('warning', 'Monitoring endpoint unavailable', json._note)
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      entry.inFlight = false
      return
    }
    const message = err?.message || 'Request failed'
    entry.state = { ...entry.state, error: message }
    if (entry.lastErrorMessage !== message) {
      entry.lastErrorMessage = message
      emitNotification('error', 'Polling failed', message)
    }
  }
  entry.inFlight = false
  notify(entry)
  if (entry.subscribers.size > 0) schedule(entry)
}

function getEntry(key, url, headers) {
  let entry = entries.get(key)
  if (!entry) {
    entry = {
      key,
      url,
      headers,
      state: EMPTY,
      subscribers: new Map(),
      listeners: new Map(),
      timer: null,
      evictTimer: null,
      inFlight: false,
      controller: null,
    }
    entries.set(key, entry)
  }
  clearTimeout(entry.evictTimer)
  entry.headers = headers
  return entry
}

export function peek(key) {
  return entries.get(key)?.state ?? EMPTY
}

export function subscribe(key, url, headers, { interval, enabled }, listener) {
  const entry = getEntry(key, url, headers)
  const id = ++subscriberSeq
  const wasActive = Number.isFinite(activeInterval(entry))
  entry.subscribers.set(id, { interval, enabled })
  entry.listeners.set(id, listener)

  if (enabled && !entry.inFlight) {
    const age = entry.state.lastFetch ? Date.now() - entry.state.lastFetch : Infinity
    if (age >= interval || entry.state.error) run(entry)
    else if (!wasActive || interval <= activeInterval(entry)) schedule(entry, interval - age)
  }

  return () => {
    entry.subscribers.delete(id)
    entry.listeners.delete(id)
    if (entry.subscribers.size === 0) {
      clearTimeout(entry.timer)
      entry.timer = null
      entry.controller?.abort()
      entry.inFlight = false
      entry.evictTimer = setTimeout(() => entries.delete(key), CACHE_TTL_MS)
    } else if (!Number.isFinite(activeInterval(entry))) {
      clearTimeout(entry.timer)
      entry.timer = null
    }
  }
}

export function refetch(key) {
  const entry = entries.get(key)
  if (!entry) return
  if (entry.inFlight) entry.controller?.abort()
  entry.inFlight = false
  run(entry)
}

/** Drop cached data for every URL (e.g. after switching servers). */
export function clearCache() {
  for (const [key, entry] of entries) {
    if (entry.subscribers.size === 0) entries.delete(key)
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return
    for (const entry of entries.values()) {
      if (entry.subscribers.size > 0 && (entry.staleWhileHidden || !entry.timer) && !entry.inFlight) {
        entry.staleWhileHidden = false
        run(entry)
      }
    }
  })
}

export { EMPTY as EMPTY_POLL_STATE }

/** Refresh every URL that currently has subscribers. */
export function refetchAll() {
  for (const entry of entries.values()) {
    if (entry.subscribers.size === 0) continue
    if (entry.inFlight) entry.controller?.abort()
    entry.inFlight = false
    run(entry)
  }
}
