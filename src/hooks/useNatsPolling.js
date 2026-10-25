import { useMemo } from 'react'
import { useConfig } from '../context/ConfigContext'
import { usePolling } from './usePolling'

/**
 * Polls a NATS monitoring endpoint (/varz, /jsz, …) through the dashboard proxy
 * for the selected connection.
 *
 * @param {string} path — monitoring path, e.g. "/jsz?streams=true"
 * @param {number} [interval] — ms; defaults to the global refresh interval
 * @param {{ enabled?: boolean, multiplier?: number }} [options]
 */
export function useNatsPolling(path, interval, options = {}) {
  const { connection, getNatsUrl, pollInterval, paused } = useConfig()
  const { enabled = true, multiplier = 1 } = options
  const url = connection ? getNatsUrl(path) : null
  const headers = useMemo(
    () => (connection?.token ? { Authorization: `Bearer ${connection.token}` } : undefined),
    [connection?.token],
  )
  const effectiveInterval = (interval ?? pollInterval) * multiplier
  return usePolling(url, effectiveInterval, { enabled: enabled && !paused, headers })
}
