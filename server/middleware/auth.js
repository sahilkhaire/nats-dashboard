/**
 * Session-based authentication for the dashboard API.
 * Enabled when DASHBOARD_USERNAME and DASHBOARD_PASSWORD are both set.
 */

import { randomBytes, timingSafeEqual, createHash } from 'crypto'

const SESSION_COOKIE  = 'nats-dashboard-session'
const SESSION_MAX_AGE = 86400 // 24 hours
const MAX_FAILED_ATTEMPTS = 10
const LOCKOUT_MS = 60_000

function safeEqual(a, b) {
  // Hash first so lengths always match and timing does not leak length.
  const ha = createHash('sha256').update(String(a ?? '')).digest()
  const hb = createHash('sha256').update(String(b ?? '')).digest()
  return timingSafeEqual(ha, hb)
}

export function createAuthMiddleware({ username, password, secureCookies = false }) {
  const AUTH_ENABLED = !!(username && password)
  const sessions = new Map()
  const failures = new Map() // ip -> { count, until }

  function getSessionId(req) {
    const cookie = req.headers.cookie || ''
    const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`))
    return m ? m[1] : null
  }

  function isAuthenticated(req) {
    if (!AUTH_ENABLED) return true
    const sid = getSessionId(req)
    if (!sid) return false
    const s = sessions.get(sid)
    if (!s || s.exp < Date.now()) {
      if (s) sessions.delete(sid)
      return false
    }
    return true
  }

  function checkCredentials(req, user, pass) {
    const ip = req.socket?.remoteAddress || 'unknown'
    const f = failures.get(ip)
    if (f && f.until > Date.now()) return { ok: false, locked: true }
    const ok = safeEqual(user, username) & safeEqual(pass, password)
    if (ok) {
      failures.delete(ip)
      return { ok: true }
    }
    const count = (f?.count ?? 0) + 1
    failures.set(ip, count >= MAX_FAILED_ATTEMPTS
      ? { count: 0, until: Date.now() + LOCKOUT_MS }
      : { count, until: 0 })
    return { ok: false }
  }

  function createSession() {
    const now = Date.now()
    for (const [id, s] of sessions) if (s.exp < now) sessions.delete(id)
    const sid = randomBytes(24).toString('hex')
    sessions.set(sid, { exp: now + SESSION_MAX_AGE * 1000 })
    return sid
  }

  function destroySession(req) {
    const sid = getSessionId(req)
    if (sid) sessions.delete(sid)
  }

  const cookieAttrs = `Path=/; HttpOnly; SameSite=Strict${secureCookies ? '; Secure' : ''}`

  function setSessionCookie(res, sid) {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${sid}; ${cookieAttrs}; Max-Age=${SESSION_MAX_AGE}`)
  }

  function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; ${cookieAttrs}; Max-Age=0`)
  }

  return { AUTH_ENABLED, isAuthenticated, checkCredentials, createSession, destroySession, setSessionCookie, clearSessionCookie }
}
