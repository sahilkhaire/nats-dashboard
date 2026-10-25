/**
 * KV and Object Store operations implemented with the nats.js client,
 * so they work wherever the dashboard runs (no `nats` CLI binary required).
 */

import { HttpError } from '../utils/http.js'
import { assertName } from './nats.js'

const KEY_RE = /^[-/_=.a-zA-Z0-9]+$/

export function assertKey(key) {
  if (typeof key !== 'string' || !key || key.startsWith('.') || key.endsWith('.') || !KEY_RE.test(key)) {
    throw new HttpError(400, 'Invalid key: use letters, digits and - / _ = . (not leading/trailing dots)')
  }
  return key
}

const nsToMs = (ns) => (Number.isFinite(ns) && ns > 0 ? Math.round(ns / 1e6) : 0)

function toBytes(value, encoding = 'utf8') {
  if (value == null) return new Uint8Array(0)
  if (encoding === 'base64') return new Uint8Array(Buffer.from(String(value), 'base64'))
  if (encoding === 'json') return new TextEncoder().encode(JSON.stringify(value))
  return new TextEncoder().encode(String(value))
}

export function encodeValue(bytes) {
  const buf = bytes ?? new Uint8Array(0)
  try {
    return { value: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'utf8', size: buf.length }
  } catch {
    return { value: Buffer.from(buf).toString('base64'), encoding: 'base64', size: buf.length }
  }
}

function serializeEntry(e, { withValue = true } = {}) {
  if (!e) return null
  const out = {
    key: e.key,
    revision: e.revision,
    created: e.created?.toISOString?.() ?? null,
    operation: e.operation,
    delta: e.delta ?? null,
  }
  if (withValue) Object.assign(out, encodeValue(e.value))
  return out
}

// ─── KV ──────────────────────────────────────────────────────────────────────

function serializeKvStatus(s) {
  const si = s.streamInfo || {}
  return {
    bucket: s.bucket,
    description: s.description || si.config?.description || '',
    values: s.values,
    history: s.history,
    ttlMs: nsToMs(s.ttl),
    size: s.size,
    storage: s.backingStore || si.config?.storage,
    replicas: s.replicas,
    maxValueSize: si.config?.max_msg_size ?? -1,
    maxBucketSize: si.config?.max_bytes ?? -1,
    compression: Boolean(s.compression),
    created: si.created ?? null,
    lastUpdate: si.state?.last_ts ?? null,
    sealed: Boolean(si.config?.sealed),
  }
}

async function bindKv(nc, bucket) {
  assertName(bucket, 'bucket name')
  try {
    return await nc.jetstream().views.kv(bucket, { bindOnly: true })
  } catch (err) {
    throw new HttpError(404, /not found/i.test(err.message) ? `KV bucket "${bucket}" not found` : err.message)
  }
}

export async function listKvBuckets(nc) {
  const jsm = await nc.jetstreamManager()
  const out = []
  for await (const s of jsm.streams.listKvs()) out.push(serializeKvStatus(s))
  return out.sort((a, b) => a.bucket.localeCompare(b.bucket))
}

export async function kvBucketInfo(nc, bucket) {
  const kv = await bindKv(nc, bucket)
  return serializeKvStatus(await kv.status())
}

export async function createKvBucket(nc, cfg = {}) {
  const bucket = assertName(cfg.bucket, 'bucket name')
  const jsm = await nc.jetstreamManager()
  try {
    await jsm.streams.info(`KV_${bucket}`)
    throw new HttpError(409, `KV bucket "${bucket}" already exists`)
  } catch (err) {
    if (err instanceof HttpError) throw err
  }
  const opts = {}
  if (cfg.description) opts.description = String(cfg.description)
  if (cfg.history != null) opts.history = Math.max(1, Math.min(64, Number(cfg.history)))
  if (cfg.ttlMs) opts.ttl = Number(cfg.ttlMs)
  if (cfg.maxValueSize != null && Number(cfg.maxValueSize) > 0) opts.maxValueSize = Number(cfg.maxValueSize)
  if (cfg.maxBucketSize != null && Number(cfg.maxBucketSize) > 0) opts.max_bytes = Number(cfg.maxBucketSize)
  if (cfg.replicas) opts.replicas = Number(cfg.replicas)
  if (cfg.storage) opts.storage = cfg.storage
  if (cfg.compression) opts.compression = true
  const kv = await nc.jetstream().views.kv(bucket, opts)
  return serializeKvStatus(await kv.status())
}

export async function deleteKvBucket(nc, bucket) {
  const kv = await bindKv(nc, bucket)
  await kv.destroy()
}

export async function listKvKeys(nc, bucket, filter) {
  const kv = await bindKv(nc, bucket)
  const keys = []
  const iter = await kv.keys(filter || undefined)
  for await (const k of iter) {
    keys.push(k)
    if (keys.length >= 10000) break
  }
  return keys.sort()
}

/** Keys with their latest entry metadata (revision, operation, created, size). */
export async function listKvEntries(nc, bucket, filter) {
  const kv = await bindKv(nc, bucket)
  const status = await kv.status()
  if (!status.values) return []

  const byKey = new Map()
  const iter = await kv.watch({ key: filter || '>', include: '', headers_only: true })
  const guard = setTimeout(() => iter.stop(), 8000)
  try {
    for await (const e of iter) {
      if (e.operation === 'PUT') {
        byKey.set(e.key, { ...serializeEntry(e, { withValue: false }), size: e.length ?? 0 })
      } else {
        byKey.delete(e.key)
      }
      // delta = messages still pending in the initial snapshot
      if (!e.delta || byKey.size >= 10000) break
    }
  } finally {
    clearTimeout(guard)
    iter.stop()
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))
}

export async function getKvEntry(nc, bucket, key, revision) {
  const kv = await bindKv(nc, bucket)
  const e = await kv.get(assertKey(key), revision ? { revision: Number(revision) } : undefined)
  if (!e) throw new HttpError(404, `Key "${key}" not found`)
  return serializeEntry(e)
}

export async function putKvEntry(nc, bucket, key, value, encoding) {
  const kv = await bindKv(nc, bucket)
  const revision = await kv.put(assertKey(key), toBytes(value, encoding))
  return { key, revision }
}

export async function deleteKvEntry(nc, bucket, key, purge = false) {
  const kv = await bindKv(nc, bucket)
  if (purge) await kv.purge(assertKey(key))
  else await kv.delete(assertKey(key))
}

export async function kvHistory(nc, bucket, key) {
  const kv = await bindKv(nc, bucket)
  const iter = await kv.history({ key: assertKey(key) })
  const out = []
  for await (const e of iter) out.push(serializeEntry(e))
  return out.reverse()
}

export async function watchKv(nc, bucket, key, onEntry) {
  const kv = await bindKv(nc, bucket)
  const iter = await kv.watch({ key: key || '>', include: 'updates' })
  ;(async () => {
    for await (const e of iter) onEntry(serializeEntry(e))
  })().catch(() => {})
  return () => iter.stop()
}

// ─── Object store ───────────────────────────────────────────────────────────

function serializeObjStatus(s) {
  const si = s.streamInfo || {}
  return {
    bucket: s.bucket,
    description: s.description || '',
    ttlMs: nsToMs(s.ttl),
    storage: s.storage,
    replicas: s.replicas,
    sealed: Boolean(s.sealed),
    size: s.size,
    compression: Boolean(s.compression),
    created: si.created ?? null,
    lastUpdate: si.state?.last_ts ?? null,
  }
}

function serializeObjInfo(o) {
  return {
    name: o.name,
    description: o.description || '',
    size: o.size,
    chunks: o.chunks,
    digest: o.digest,
    mtime: o.mtime,
    revision: o.revision,
    deleted: Boolean(o.deleted),
    link: o.options?.link || null,
    headers: o.headers ? Object.fromEntries([...o.headers.keys()].map((k) => [k, o.headers.get(k)])) : {},
    metadata: o.metadata || {},
  }
}

async function bindOs(nc, bucket) {
  assertName(bucket, 'bucket name')
  const jsm = await nc.jetstreamManager()
  try {
    await jsm.streams.info(`OBJ_${bucket}`)
  } catch {
    throw new HttpError(404, `Object store "${bucket}" not found`)
  }
  return nc.jetstream().views.os(bucket)
}

export async function listObjectBuckets(nc) {
  const jsm = await nc.jetstreamManager()
  const out = []
  for await (const s of jsm.streams.listObjectStores()) out.push(serializeObjStatus(s))
  return out.sort((a, b) => a.bucket.localeCompare(b.bucket))
}

export async function createObjectBucket(nc, cfg = {}) {
  const bucket = assertName(cfg.bucket, 'bucket name')
  const jsm = await nc.jetstreamManager()
  try {
    await jsm.streams.info(`OBJ_${bucket}`)
    throw new HttpError(409, `Object store "${bucket}" already exists`)
  } catch (err) {
    if (err instanceof HttpError) throw err
  }
  const opts = {}
  if (cfg.description) opts.description = String(cfg.description)
  if (cfg.ttlMs) opts.ttl = Number(cfg.ttlMs) * 1e6
  if (cfg.maxBucketSize != null && Number(cfg.maxBucketSize) > 0) opts.max_bytes = Number(cfg.maxBucketSize)
  if (cfg.replicas) opts.replicas = Number(cfg.replicas)
  if (cfg.storage) opts.storage = cfg.storage
  if (cfg.compression) opts.compression = true
  const os = await nc.jetstream().views.os(bucket, opts)
  return serializeObjStatus(await os.status())
}

export async function deleteObjectBucket(nc, bucket) {
  const os = await bindOs(nc, bucket)
  await os.destroy()
}

export async function sealObjectBucket(nc, bucket) {
  const os = await bindOs(nc, bucket)
  return serializeObjStatus(await os.seal())
}

export async function objectBucketInfo(nc, bucket) {
  const os = await bindOs(nc, bucket)
  return serializeObjStatus(await os.status())
}

export async function listObjects(nc, bucket) {
  const os = await bindOs(nc, bucket)
  const list = await os.list()
  return list.map(serializeObjInfo).sort((a, b) => a.name.localeCompare(b.name))
}

export async function objectInfo(nc, bucket, name) {
  const os = await bindOs(nc, bucket)
  const info = await os.info(String(name))
  if (!info) throw new HttpError(404, `Object "${name}" not found`)
  return serializeObjInfo(info)
}

export async function getObjectBytes(nc, bucket, name) {
  const os = await bindOs(nc, bucket)
  const info = await os.info(String(name))
  if (!info || info.deleted) throw new HttpError(404, `Object "${name}" not found`)
  const data = await os.getBlob(String(name))
  return { info: serializeObjInfo(info), data: data ?? new Uint8Array(0) }
}

export async function putObject(nc, bucket, { name, content, encoding = 'utf8', description }) {
  if (!name || typeof name !== 'string') throw new HttpError(400, 'Object name is required')
  const os = await bindOs(nc, bucket)
  const meta = { name }
  if (description) meta.description = String(description)
  const info = await os.putBlob(meta, toBytes(content, encoding))
  return serializeObjInfo(info)
}

export async function deleteObject(nc, bucket, name) {
  const os = await bindOs(nc, bucket)
  await os.delete(String(name))
}

export async function linkObject(nc, bucket, name, targetBucket, targetName) {
  const source = await bindOs(nc, bucket)
  const target = await bindOs(nc, targetBucket)
  const info = await source.info(String(name))
  if (!info) throw new HttpError(404, `Object "${name}" not found`)
  return serializeObjInfo(await target.link(String(targetName || name), info))
}
