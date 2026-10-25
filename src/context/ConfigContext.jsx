import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  getLastConnection,
  setLastConnection,
  loadSavedConnections,
  storeSavedConnections,
  newConnectionId,
  normalizeServerUrl,
} from '../hooks/useSavedConnections'
import { apiRequest, apiUrl, buildUrl, connectionParams } from '../lib/api'

const ConfigContext = createContext(null)

const POLL_KEY = 'nats-dashboard-poll-interval'
export const POLL_OPTIONS = [1000, 2000, 5000, 10000, 30000]

function loadPollInterval() {
  try {
    const v = Number(localStorage.getItem(POLL_KEY))
    return POLL_OPTIONS.includes(v) ? v : 2000
  } catch {
    return 2000
  }
}

function contextToConnection(ctx) {
  return {
    id: `ctx:${ctx.name}`,
    name: ctx.description || ctx.name,
    contextName: ctx.name,
    monitoringUrl: ctx.monitoringUrl || ctx.url,
    natsUrl: ctx.url || null,
    token: null,
    source: 'context',
  }
}

function envConnection() {
  const url = import.meta.env.VITE_NATS_URL
  if (!url) return null
  return { id: 'env', name: 'Default', monitoringUrl: url, natsUrl: null, token: null, source: 'env' }
}

export function ConfigProvider({ children }) {
  const [contextList, setContextList] = useState([])
  const [contextsLoaded, setContextsLoaded] = useState(false)
  const [saved, setSaved] = useState(loadSavedConnections)
  const [connection, setConnection] = useState(() => getLastConnection() || envConnection())
  const [pollInterval, setPollIntervalState] = useState(loadPollInterval)
  const [paused, setPaused] = useState(false)

  // Load NATS contexts (dev: ~/.config/nats, prod: env / synced json)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (const url of ['/api/nats-contexts', '/nats-contexts.json']) {
        try {
          const res = await fetch(url, { credentials: 'include' })
          if (res.status === 401) {
            window.dispatchEvent(new CustomEvent('auth-required'))
            break
          }
          if (!res.ok) continue
          const data = await res.json()
          if (cancelled) return
          const list = (data.contexts || []).map(contextToConnection)
          setContextList(list)
          // First visit: pick the current context automatically
          setConnection((prev) => {
            if (prev) return prev
            const current = list.find((c) => c.contextName === data.current) || list[0] || null
            if (current) setLastConnection(current)
            return current
          })
          break
        } catch {
          /* try next source */
        }
      }
      if (!cancelled) setContextsLoaded(true)
    })()
    return () => { cancelled = true }
  }, [])

  const selectConnection = useCallback((conn) => {
    setConnection(conn)
    setLastConnection(conn)
  }, [])

  const savedRef = useRef(saved)
  const commitSaved = useCallback((next) => {
    savedRef.current = next
    storeSavedConnections(next)
    setSaved(next)
  }, [])

  const addConnection = useCallback((input) => {
    const conn = {
      id: newConnectionId(),
      name: input.name?.trim() || normalizeServerUrl(input.monitoringUrl),
      monitoringUrl: normalizeServerUrl(input.monitoringUrl),
      natsUrl: input.natsUrl?.trim() ? normalizeServerUrl(input.natsUrl) : null,
      token: input.token?.trim() || null,
      source: 'saved',
    }
    commitSaved([...savedRef.current, conn])
    return conn
  }, [commitSaved])

  const updateConnection = useCallback((id, input) => {
    let updated = null
    const next = savedRef.current.map((c) => {
      if (c.id !== id) return c
      updated = {
        ...c,
        name: input.name?.trim() || c.name,
        monitoringUrl: normalizeServerUrl(input.monitoringUrl ?? c.monitoringUrl),
        natsUrl: input.natsUrl?.trim() ? normalizeServerUrl(input.natsUrl) : null,
        token: input.token?.trim() || null,
      }
      return updated
    })
    commitSaved(next)
    if (updated && connection?.id === id) selectConnection(updated)
    return updated
  }, [commitSaved, connection?.id, selectConnection])

  const removeConnection = useCallback((id) => {
    commitSaved(savedRef.current.filter((c) => c.id !== id))
    if (connection?.id === id) selectConnection(null)
  }, [commitSaved, connection?.id, selectConnection])

  const setPollInterval = useCallback((ms) => {
    setPollIntervalState(ms)
    try { localStorage.setItem(POLL_KEY, String(ms)) } catch { /* ignore */ }
  }, [])

  const connections = useMemo(() => [...contextList, ...saved], [contextList, saved])

  const value = useMemo(() => {
    const getNatsUrl = (path) => {
      const p = path.startsWith('/') ? path : `/${path}`
      return buildUrl('/api/nats-proxy', { ...connectionParams(connection), path: p })
    }
    return {
      connection,
      connections,
      contexts: contextList,
      savedConnections: saved,
      contextsLoaded,
      selectConnection,
      addConnection,
      updateConnection,
      removeConnection,
      pollInterval,
      setPollInterval,
      paused,
      setPaused,
      // Back-compat fields used across the app
      serverUrl: connection?.monitoringUrl || '',
      authToken: connection?.token || null,
      selectedContext: connection?.id || null,
      getNatsUrl,
      api: (path, opts) => apiRequest(connection, path, opts),
      apiUrl: (path, query) => apiUrl(connection, path, query),
    }
  }, [connection, connections, contextList, saved, contextsLoaded, selectConnection, addConnection, updateConnection, removeConnection, pollInterval, setPollInterval, paused])

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
}

export function useConfig() {
  const ctx = useContext(ConfigContext)
  if (!ctx) throw new Error('useConfig must be used within ConfigProvider')
  return ctx
}
