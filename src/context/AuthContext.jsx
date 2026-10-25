import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(null)
  const [authEnabled, setAuthEnabled] = useState(false)
  const [version, setVersion] = useState(null)
  const [loading, setLoading] = useState(true)

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      setAuthenticated(data.authenticated === true)
      setAuthEnabled(data.authEnabled === true)
      setVersion(data.version || null)
    } catch {
      // Static hosting without the API server: let the app render and surface errors per page.
      setAuthenticated(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { checkAuth() }, [checkAuth])

  useEffect(() => {
    const onAuthRequired = () => setAuthenticated(false)
    window.addEventListener('auth-required', onAuthRequired)
    return () => window.removeEventListener('auth-required', onAuthRequired)
  }, [])

  const login = useCallback(async (username, password) => {
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setAuthenticated(true)
        return { ok: true }
      }
      return { ok: false, error: data.error || `Login failed (HTTP ${res.status})` }
    } catch (err) {
      return { ok: false, error: err.message || 'Network error' }
    }
  }, [])

  const logout = useCallback(async () => {
    try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }) } catch { /* ignore */ }
    setAuthenticated(false)
  }, [])

  const value = useMemo(
    () => ({ authenticated, authEnabled, version, loading, login, logout, checkAuth }),
    [authenticated, authEnabled, version, loading, login, logout, checkAuth],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
