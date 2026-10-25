import { useCallback, useEffect, useMemo, useState } from 'react'
import { peek, subscribe, refetch as refetchKey, EMPTY_POLL_STATE } from '../lib/poller'

/**
 * Poll a JSON URL. Components polling the same URL share one request loop (see lib/poller).
 *
 * @returns {{ data, error, lastFetch, prevFetch, loading, refetch }}
 */
export function usePolling(url, interval, options = {}) {
  const { enabled = true, headers } = options
  const authHeader = headers?.Authorization || ''
  const key = url ? `${url}::${authHeader}` : null
  const stableHeaders = useMemo(() => (authHeader ? { Authorization: authHeader } : undefined), [authHeader])

  const [state, setState] = useState(() => (key ? peek(key) : EMPTY_POLL_STATE))

  useEffect(() => {
    if (!key) {
      setState(EMPTY_POLL_STATE)
      return undefined
    }
    // Show cached data for this URL (or nothing) immediately — never another URL's data.
    setState(peek(key))
    return subscribe(key, url, stableHeaders, { interval, enabled }, setState)
  }, [key, url, stableHeaders, interval, enabled])

  const refetch = useCallback(() => {
    if (key) refetchKey(key)
  }, [key])

  return { ...state, refetch }
}
