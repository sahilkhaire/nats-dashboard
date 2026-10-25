/**
 * KV bucket routes (see docs/kv-object-api-contract.md).
 */

import * as kvs from '../services/kv-object.js'
import { readJsonBody, getQuery, sendJson, route } from '../utils/http.js'

export function registerKvRoutes(router, { conn }) {
  const get = (path, handler) => router.get(path, route(async (req, res) => {
    const query = getQuery(req)
    const nc = await conn.connectFor(req, query)
    sendJson(res, 200, { ok: true, data: await handler({ req, query, nc }) })
  }))
  const post = (path, handler) => router.post(path, route(async (req, res) => {
    const body = await readJsonBody(req)
    const nc = await conn.connectFor(req, body)
    sendJson(res, 200, { ok: true, data: (await handler({ req, body, nc })) ?? null })
  }))

  get('/api/kv/buckets', ({ nc }) => kvs.listKvBuckets(nc))
  get('/api/kv/bucket/:bucket', ({ req, nc }) => kvs.kvBucketInfo(nc, req.params.bucket))
  post('/api/kv/bucket/create', ({ body, nc }) => kvs.createKvBucket(nc, body))
  post('/api/kv/bucket/delete', ({ body, nc }) => kvs.deleteKvBucket(nc, body.bucket))

  get('/api/kv/keys', ({ query, nc }) => kvs.listKvKeys(nc, query.bucket, query.filter))
  get('/api/kv/entries', ({ query, nc }) => kvs.listKvEntries(nc, query.bucket, query.filter))
  post('/api/kv/entry/get', ({ body, nc }) => kvs.getKvEntry(nc, body.bucket, body.key, body.revision))
  post('/api/kv/entry/put', ({ body, nc }) => kvs.putKvEntry(nc, body.bucket, body.key, body.value, body.encoding))
  post('/api/kv/entry/delete', ({ body, nc }) => kvs.deleteKvEntry(nc, body.bucket, body.key, false))
  post('/api/kv/entry/purge', ({ body, nc }) => kvs.deleteKvEntry(nc, body.bucket, body.key, true))
  post('/api/kv/entry/history', ({ body, nc }) => kvs.kvHistory(nc, body.bucket, body.key))

  // Server-sent events: one `data:` line per KV change
  router.get('/api/kv/watch', route(async (req, res) => {
    const query = getQuery(req)
    const nc = await conn.connectFor(req, query)
    const stop = await kvs.watchKv(nc, query.bucket, query.key, (entry) => {
      res.write(`data: ${JSON.stringify(entry)}\n\n`)
    })
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write(': connected\n\n')
    const ping = setInterval(() => res.write(': ping\n\n'), 15000)
    req.on('close', () => {
      clearInterval(ping)
      stop()
    })
  }, 'Watch failed'))
}
