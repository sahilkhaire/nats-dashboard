/**
 * Nanosecond duration helpers.
 *
 * Formatting is lossless (90 minutes → "1h30m", not "2h") so values that are
 * edited and saved back keep their exact value.
 */

const UNITS = [
  ['d', 86400e9],
  ['h', 3600e9],
  ['m', 60e9],
  ['s', 1e9],
  ['ms', 1e6],
  ['us', 1e3],
  ['ns', 1],
]

/** 5400e9 → "1h30m"; 0/undefined → "0" */
export function nsToDuration(ns) {
  const n = Number(ns)
  if (!Number.isFinite(n) || n <= 0) return '0'
  let rest = Math.round(n)
  let out = ''
  for (const [unit, size] of UNITS) {
    const count = Math.floor(rest / size)
    if (count > 0) {
      out += `${count}${unit}`
      rest -= count * size
    }
  }
  return out || '0'
}

/** Short, rounded, human label ("~2h") for display-only contexts. */
export function nsToHuman(ns) {
  const n = Number(ns)
  if (!Number.isFinite(n) || n <= 0) return '—'
  const [unit, size] = UNITS.find(([, s]) => n >= s) ?? UNITS[UNITS.length - 1]
  const v = n / size
  return `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}`
}

/**
 * Parse "24h", "7d", "1h30m", "500ms", "1.5h" (also bare seconds "30") into nanoseconds.
 * Returns null for invalid input, 0 for "", "0" or "none".
 */
export function parseDurationToNs(s) {
  if (s == null) return 0
  const str = String(s).trim().toLowerCase()
  if (str === '' || str === '0' || str === 'none' || str === 'unlimited') return 0
  if (/^\d+(\.\d+)?$/.test(str)) return Math.round(Number(str) * 1e9)
  const re = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h|d|w|y)/g
  const mult = { ns: 1, us: 1e3, 'µs': 1e3, ms: 1e6, s: 1e9, m: 60e9, h: 3600e9, d: 86400e9, w: 604800e9, y: 31536000e9 }
  let total = 0
  let consumed = 0
  let match
  while ((match = re.exec(str)) !== null) {
    total += Number(match[1]) * mult[match[2]]
    consumed += match[0].length
  }
  if (consumed !== str.replace(/\s+/g, '').length || consumed === 0) return null
  return Math.round(total)
}

/** "3m ago" / "in 5s" relative label for a Date / ISO string / ms timestamp. */
export function timeAgo(value, now = Date.now()) {
  if (!value) return '—'
  const t = typeof value === 'number' ? value : new Date(value).getTime()
  if (!Number.isFinite(t) || t <= 0) return '—'
  const diff = now - t
  const abs = Math.abs(diff)
  const fmt = (n, u) => (diff >= 0 ? `${n}${u} ago` : `in ${n}${u}`)
  if (abs < 5000) return diff >= 0 ? 'just now' : 'in a moment'
  if (abs < 60e3) return fmt(Math.round(abs / 1e3), 's')
  if (abs < 3600e3) return fmt(Math.round(abs / 60e3), 'm')
  if (abs < 86400e3) return fmt(Math.round(abs / 3600e3), 'h')
  return fmt(Math.round(abs / 86400e3), 'd')
}

/** Value for <input type="datetime-local"> in the user's local timezone. */
export function toDateTimeLocal(date) {
  const d = date instanceof Date ? date : new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Format a date safely; returns '—' for missing / zero dates (e.g. Go's 0001-01-01). */
export function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (!Number.isFinite(d.getTime()) || d.getFullYear() < 1971) return '—'
  return d.toLocaleString()
}
