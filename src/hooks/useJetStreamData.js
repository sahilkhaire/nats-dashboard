import { useMemo } from 'react'
import { useNatsPolling } from './useNatsPolling'

export const JSZ_FULL_PATH = '/jsz?accounts=true&streams=true&consumers=true&config=true'

/** KV buckets and object stores are backed by streams named KV_* / OBJ_*. */
export function streamKind(name = '') {
  if (name.startsWith('KV_')) return 'kv'
  if (name.startsWith('OBJ_')) return 'object'
  return 'stream'
}

/**
 * One shared /jsz poll (streams + consumers) flattened for the Streams, Stream detail
 * and Consumers pages. All callers share a single request loop.
 */
export function useJetStreamData(options = {}) {
  const poll = useNatsPolling(JSZ_FULL_PATH, undefined, options)
  const { data } = poll

  const { streams, consumers } = useMemo(() => {
    const streamList = []
    const consumerList = []
    for (const acc of data?.account_details ?? []) {
      for (const sd of acc.stream_detail ?? []) {
        const stream = { ...sd, account: acc.name, kind: streamKind(sd.name) }
        streamList.push(stream)
        for (const c of sd.consumer_detail ?? []) {
          consumerList.push({ ...c, stream: sd.name, account: acc.name })
        }
      }
    }
    return { streams: streamList, consumers: consumerList }
  }, [data])

  return { ...poll, streams, consumers }
}
