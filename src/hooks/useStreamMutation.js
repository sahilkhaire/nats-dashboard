import { useMemo } from 'react'
import { useConfig } from '../context/ConfigContext'
import { apiRequest } from '../lib/api'

/**
 * JetStream management API bound to the selected connection.
 */
export function useStreamMutation() {
  const { connection } = useConfig()

  return useMemo(() => {
    const post = (path, body) => apiRequest(connection, path, { method: 'POST', body })
    const get = (path, query) => apiRequest(connection, path, { query })
    const del = (path) => apiRequest(connection, path, { method: 'DELETE' })

    return {
      // ── Streams ────────────────────────────────────────────────────────────
      createStream: (config) => post('/api/stream/create', { config }),
      deleteStream: (stream) => post('/api/stream/delete', { stream }),
      updateStream: (stream, config) => post('/api/stream/update', { stream, config }),
      purgeStream: (stream, subject, extra = {}) => post('/api/stream/purge', { stream, subject: subject || undefined, ...extra }),
      duplicateStream: (stream, target, config) => post('/api/stream/duplicate', { stream, target, config }),
      createMirrorStream: (stream, target, mirror, config) => post('/api/stream/mirror', { stream, target, mirror, config }),
      stepDownLeader: (stream) => post('/api/stream/step-down', { stream }),
      removeFollowers: (stream, peers) => post('/api/stream/remove-followers', { stream, peers }),
      sealStream: (stream) => post('/api/stream/seal', { stream }),
      deleteMessage: (stream, seq) => post('/api/stream/message/delete', { stream, seq }),
      getStreamCliConfig: (stream) => get('/api/stream/config-cli', { stream }),
      getStreamTerraformConfig: (stream) => get('/api/stream/config-terraform', { stream }),
      fetchMessages: (query) => get('/api/stream/messages', query),

      // ── Consumers ──────────────────────────────────────────────────────────
      createConsumer: (stream, config) => post('/api/consumer/create', { stream, config }),
      deleteConsumer: (stream, consumer) => post('/api/consumer/delete', { stream, consumer }),

      // ── Scheduled purges ───────────────────────────────────────────────────
      listSchedules: async (stream) => (await get('/api/stream/schedules', { stream })).schedules ?? [],
      createSchedule: (params) => post('/api/stream/schedule', params),
      deleteSchedule: (id) => del(`/api/stream/schedule/${encodeURIComponent(id)}`),

      // ── Publish ────────────────────────────────────────────────────────────
      /**
       * @param {{ stream, subject, payload?, encoding?, headers?: {key,value}[], msgTtl?, msgId?, scheduleAt? }} params
       */
      publishMessage: (params) => post('/api/stream/publish', params),
      listScheduledPublishes: async (stream) => (await get('/api/stream/publishes', { stream })).publishes ?? [],
      cancelScheduledPublish: (id) => del(`/api/stream/publish/${encodeURIComponent(id)}`),
    }
  }, [connection])
}
