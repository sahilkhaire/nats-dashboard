const SIZES = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

export function formatBytes(bytes) {
  if (bytes === undefined || bytes === null || Number.isNaN(Number(bytes))) return '—'
  const n = Number(bytes)
  if (n === 0) return '0 B'
  if (n < 0) return '—'
  const i = Math.min(SIZES.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  const v = n / 1024 ** i
  return `${parseFloat(v.toFixed(v >= 100 || i === 0 ? 0 : 1))} ${SIZES[i]}`
}

export function formatBytesRate(bytesPerSec) {
  if (bytesPerSec == null || !Number.isFinite(bytesPerSec)) return '—'
  return `${formatBytes(bytesPerSec)}/s`
}

/** 1234567 → "1.2M" */
export function formatCompact(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n))
}

export function formatNumber(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return Number(n).toLocaleString()
}

export function formatRate(n, unit = 'msg/s') {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n === 0) return `0 ${unit}`
  if (n >= 1000) return `${formatCompact(n)} ${unit}`
  return `${n >= 10 ? n.toFixed(0) : n >= 1 ? n.toFixed(1) : n.toFixed(2)} ${unit}`
}

/** "unlimited" for -1/0 limits used throughout JetStream configs. */
export function formatLimit(n, formatter = formatNumber) {
  if (n == null || Number(n) <= 0) return 'Unlimited'
  return formatter(n)
}
