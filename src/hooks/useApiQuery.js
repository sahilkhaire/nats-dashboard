import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfig } from '../context/ConfigContext'
import { apiRequest } from '../lib/api'

/**
 * Fetch a dashboard /api GET endpoint for the selected connection, with reload.
 * Pass `path = null` to skip. Responses of the shape { ok, data } are unwrapped.
 */
export function useApiQuery(path, query = {}, { refreshMs = 0 } = {}) {
  const { connection, paused } = useConfig()
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) })
  const queryKey = JSON.stringify(query)
  const seq = useRef(0)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!path || !connection) return
    const id = ++seq.current
    if (!silent) setState((s) => ({ ...s, loading: true }))
    try {
      const res = await apiRequest(connection, path, { query: JSON.parse(queryKey) })
      if (id === seq.current) setState({ data: res && 'data' in res && 'ok' in res ? res.data : res, error: null, loading: false })
    } catch (err) {
      if (id === seq.current) setState((s) => ({ ...s, error: err.message, loading: false }))
    }
  }, [path, queryKey, connection])

  useEffect(() => {
    setState({ data: null, error: null, loading: Boolean(path) })
    load()
  }, [load, path])

  useEffect(() => {
    if (!refreshMs || paused || !path) return undefined
    const t = setInterval(() => { if (!document.hidden) load({ silent: true }) }, refreshMs)
    return () => clearInterval(t)
  }, [refreshMs, paused, path, load])

  return { ...state, reload: load }
}
