/**
 * setTimeout silently fires immediately for delays above 2^31-1 ms (~24.8 days).
 * These helpers chain shorter timers so far-future schedules fire on time.
 */

const MAX_DELAY = 2 ** 31 - 1

export function setLongTimeout(fn, delayMs) {
  const handle = { id: null, cancelled: false }
  const target = Date.now() + Math.max(0, delayMs)
  const arm = () => {
    if (handle.cancelled) return
    const remaining = target - Date.now()
    if (remaining <= 0) {
      fn()
      return
    }
    handle.id = setTimeout(arm, Math.min(remaining, MAX_DELAY))
  }
  arm()
  return handle
}

export function clearLongTimeout(handle) {
  if (!handle) return
  handle.cancelled = true
  if (handle.id) clearTimeout(handle.id)
}
