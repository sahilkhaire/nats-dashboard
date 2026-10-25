/**
 * Object store routes (see docs/kv-object-api-contract.md).
 */

import * as oss from '../services/kv-object.js'
import { readJsonBody, getQuery, sendJson, route } from '../utils/http.js'

function contentDisposition(name) {
  const base = String(name).split('/').pop() || 'download'
  const ascii = base.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(base)}`
}

export function registerObjectRoutes(router, { conn }) {
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

  get('/api/object/buckets', ({ nc }) => oss.listObjectBuckets(nc))
  get('/api/object/bucket/:bucket', ({ req, nc }) => oss.objectBucketInfo(nc, req.params.bucket))
  post('/api/object/bucket/create', ({ body, nc }) => oss.createObjectBucket(nc, body))
  post('/api/object/bucket/delete', ({ body, nc }) => oss.deleteObjectBucket(nc, body.bucket))
  post('/api/object/bucket/seal', ({ body, nc }) => oss.sealObjectBucket(nc, body.bucket))

  get('/api/object/list', ({ query, nc }) => oss.listObjects(nc, query.bucket))
  post('/api/object/info', ({ body, nc }) => oss.objectInfo(nc, body.bucket, body.name))
  post('/api/object/put', ({ body, nc }) => oss.putObject(nc, body.bucket, body))
  post('/api/object/delete', ({ body, nc }) => oss.deleteObject(nc, body.bucket, body.name))
  post('/api/object/link', ({ body, nc }) => oss.linkObject(nc, body.bucket, body.name, body.targetBucket, body.targetName))

  // JSON preview (base64 + utf8 when decodable)
  post('/api/object/get', async ({ body, nc }) => {
    const { info, data } = await oss.getObjectBytes(nc, body.bucket, body.name)
    const preview = data.length <= 1024 * 1024 ? oss.encodeValue(data) : null
    return { info, preview }
  })

  // Raw download
  router.get('/api/object/download', route(async (req, res) => {
    const query = getQuery(req)
    const nc = await conn.connectFor(req, query)
    const { data } = await oss.getObjectBytes(nc, query.bucket, query.name)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Length', data.length)
    res.setHeader('Content-Disposition', contentDisposition(query.name))
    res.end(Buffer.from(data))
  }, 'Download failed'))
}
