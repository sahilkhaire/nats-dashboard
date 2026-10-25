/**
 * Stream + consumer management routes:
 *   POST /api/stream/create            — create a stream
 *   POST /api/stream/delete            — delete a stream
 *   POST /api/stream/update            — update stream config (merged onto current config)
 *   POST /api/stream/purge             — immediate purge (optionally by subject)
 *   POST /api/stream/duplicate         — duplicate stream config to new stream
 *   POST /api/stream/mirror            — create mirror stream
 *   POST /api/stream/step-down         — step down stream leader
 *   POST /api/stream/remove-followers  — remove follower peers
 *   POST /api/stream/seal              — seal stream
 *   POST /api/stream/message/delete    — delete one message by sequence
 *   GET  /api/stream/config-cli        — generate NATS CLI config command
 *   GET  /api/stream/config-terraform  — generate Terraform config snippet
 *   GET  /api/stream/messages          — fetch messages
 *   POST /api/consumer/create          — create a consumer
 *   POST /api/consumer/delete          — delete a consumer
 */

import { jsApi, assertName } from '../services/nats.js'
import { fetchStreamMessages } from '../services/jetstream.js'
import { readJsonBody, getQuery, sendJson, route, HttpError } from '../utils/http.js'

function toShellArg(value) {
  const v = String(value ?? '')
  if (/^[a-zA-Z0-9._:/=>*-]+$/.test(v)) return v
  return `'${v.replaceAll("'", "'\\''")}'`
}

function nsToGoDuration(ns) {
  if (!Number.isFinite(ns) || ns <= 0) return null
  const units = [['h', 3600e9], ['m', 60e9], ['s', 1e9], ['ms', 1e6], ['us', 1e3], ['ns', 1]]
  let rest = ns
  let out = ''
  for (const [u, size] of units) {
    const n = Math.floor(rest / size)
    if (n > 0) {
      out += `${n}${u}`
      rest -= n * size
    }
  }
  return out
}

function buildCliConfig(streamName, cfg = {}) {
  const args = ['nats', 'stream', 'add', toShellArg(streamName)]
  if (Array.isArray(cfg.subjects) && cfg.subjects.length > 0) args.push(`--subjects=${toShellArg(cfg.subjects.join(','))}`)
  if (cfg.retention) args.push(`--retention=${toShellArg(cfg.retention === 'workqueue' ? 'work' : cfg.retention)}`)
  if (cfg.storage) args.push(`--storage=${toShellArg(cfg.storage)}`)
  if (Number.isFinite(cfg.num_replicas)) args.push(`--replicas=${cfg.num_replicas}`)
  if (Number.isFinite(cfg.max_msgs)) args.push(`--max-msgs=${cfg.max_msgs}`)
  if (Number.isFinite(cfg.max_bytes)) args.push(`--max-bytes=${cfg.max_bytes}`)
  if (Number.isFinite(cfg.max_msgs_per_subject)) args.push(`--max-msgs-per-subject=${cfg.max_msgs_per_subject}`)
  if (Number.isFinite(cfg.max_msg_size)) args.push(`--max-msg-size=${cfg.max_msg_size}`)
  const maxAge = nsToGoDuration(cfg.max_age)
  args.push(`--max-age=${maxAge || '0'}`)
  const dupe = nsToGoDuration(cfg.duplicate_window)
  if (dupe) args.push(`--dupe-window=${dupe}`)
  if (cfg.discard) args.push(`--discard=${toShellArg(cfg.discard)}`)
  if (cfg.description) args.push(`--description=${toShellArg(cfg.description)}`)
  if (cfg.allow_rollup_hdrs === true) args.push('--allow-rollup')
  if (cfg.allow_direct === true) args.push('--allow-direct')
  if (cfg.no_ack === true) args.push('--no-ack')
  if (cfg.deny_purge === true) args.push('--deny-purge')
  if (cfg.deny_delete === true) args.push('--deny-delete')
  if (cfg.mirror?.name) args.push(`--mirror=${toShellArg(cfg.mirror.name)}`)
  args.push('--defaults')
  return args.join(' ')
}

const tfString = (v) => `"${String(v).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`

function addTerraformValue(lines, key, value) {
  if (value === undefined || value === null) return
  if (typeof value === 'string') lines.push(`  ${key} = ${tfString(value)}`)
  else if (typeof value === 'boolean' || typeof value === 'number') lines.push(`  ${key} = ${value}`)
}

function buildTerraformConfig(streamName, cfg = {}) {
  const resourceId = streamName.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  const lines = [
    `resource "jetstream_stream" ${tfString(resourceId)} {`,
    `  name = ${tfString(streamName)}`,
  ]
  if (Array.isArray(cfg.subjects) && cfg.subjects.length > 0) {
    lines.push(`  subjects = [${cfg.subjects.map(tfString).join(', ')}]`)
  }
  addTerraformValue(lines, 'description', cfg.description)
  addTerraformValue(lines, 'retention', cfg.retention)
  addTerraformValue(lines, 'storage', cfg.storage)
  addTerraformValue(lines, 'replicas', cfg.num_replicas)
  addTerraformValue(lines, 'max_msgs', cfg.max_msgs)
  addTerraformValue(lines, 'max_bytes', cfg.max_bytes)
  addTerraformValue(lines, 'max_msgs_per_subject', cfg.max_msgs_per_subject)
  if (Number.isFinite(cfg.max_age)) addTerraformValue(lines, 'max_age', Math.round(cfg.max_age / 1e9))
  if (Number.isFinite(cfg.duplicate_window)) addTerraformValue(lines, 'duplicate_window', Math.round(cfg.duplicate_window / 1e9))
  addTerraformValue(lines, 'max_msg_size', cfg.max_msg_size)
  addTerraformValue(lines, 'discard', cfg.discard)
  addTerraformValue(lines, 'deny_delete', cfg.deny_delete)
  addTerraformValue(lines, 'deny_purge', cfg.deny_purge)
  addTerraformValue(lines, 'allow_rollup_hdrs', cfg.allow_rollup_hdrs)
  addTerraformValue(lines, 'allow_direct', cfg.allow_direct)
  addTerraformValue(lines, 'mirror_direct', cfg.mirror_direct)
  if (cfg.mirror?.name) {
    lines.push('  mirror {')
    lines.push(`    name = ${tfString(cfg.mirror.name)}`)
    if (cfg.mirror.filter_subject) lines.push(`    filter_subject = ${tfString(cfg.mirror.filter_subject)}`)
    if (cfg.mirror.opt_start_time) lines.push(`    start_time = ${tfString(cfg.mirror.opt_start_time)}`)
    if (cfg.mirror.opt_start_seq != null) lines.push(`    start_seq = ${cfg.mirror.opt_start_seq}`)
    lines.push('  }')
  }
  lines.push('}')
  lines.push('')
  lines.push('# Durations are in seconds. Generated for the nats-io/jetstream Terraform provider.')
  return lines.join('\n')
}

/** Fields the server rejects on update (or that describe state, not config). */
const IMMUTABLE_ON_UPDATE = ['storage', 'mirror']

export function registerStreamRoutes(router, { conn }) {
  const post = (path, fallback, handler) => router.post(path, route(async (req, res) => {
    const body = await readJsonBody(req)
    const nc = await conn.connectFor(req, body)
    await handler({ req, res, body, nc })
  }, fallback))

  const get = (path, fallback, handler) => router.get(path, route(async (req, res) => {
    const query = getQuery(req)
    const nc = await conn.connectFor(req, query)
    await handler({ req, res, query, nc })
  }, fallback))

  const streamInfo = (nc, stream) => jsApi(nc, `$JS.API.STREAM.INFO.${stream}`, {}, 'Stream not found')

  post('/api/stream/create', 'Stream create failed', async ({ res, body, nc }) => {
    const config = body.config || {}
    const name = assertName(config.name, 'stream name')
    const resp = await jsApi(nc, `$JS.API.STREAM.CREATE.${name}`, { ...config, name }, 'Create failed')
    sendJson(res, 200, { ok: true, stream: name, config: resp.config })
  })

  post('/api/stream/delete', 'Stream delete failed', async ({ res, body, nc }) => {
    const stream = assertName(body.stream, 'stream name')
    await jsApi(nc, `$JS.API.STREAM.DELETE.${stream}`, {}, 'Delete failed')
    sendJson(res, 200, { ok: true })
  })

  post('/api/stream/update', 'Stream update failed', async ({ res, body, nc }) => {
    const stream = assertName(body.stream, 'stream name')
    if (!body.config || typeof body.config !== 'object') throw new HttpError(400, 'Missing or invalid config')
    const info = await streamInfo(nc, stream)
    const current = info.config || {}
    const patch = { ...body.config }
    for (const key of IMMUTABLE_ON_UPDATE) {
      if (key in patch && JSON.stringify(patch[key]) !== JSON.stringify(current[key])) {
        throw new HttpError(400, `"${key}" cannot be changed after the stream is created`)
      }
    }
    // null clears an optional nested block (e.g. republish / subject_transform)
    const merged = { ...current, ...patch, name: stream }
    for (const [k, v] of Object.entries(merged)) if (v === null) delete merged[k]
    const resp = await jsApi(nc, `$JS.API.STREAM.UPDATE.${stream}`, merged, 'Update failed')
    sendJson(res, 200, { ok: true, config: resp.config })
  })

  post('/api/stream/purge', 'Purge failed', async ({ res, body, nc }) => {
    const stream = assertName(body.stream, 'stream name')
    const req = {}
    if (body.subject) req.filter = String(body.subject)
    if (body.keep != null) req.keep = Number(body.keep)
    if (body.seq != null) req.seq = Number(body.seq)
    const resp = await jsApi(nc, `$JS.API.STREAM.PURGE.${stream}`, req, 'Purge failed')
    sendJson(res, 200, { ok: true, purged: resp.purged ?? 0 })
  })

  post('/api/stream/duplicate', 'Stream duplicate failed', async ({ res, body, nc }) => {
    const stream = assertName(body.stream, 'stream name')
    const target = assertName(body.target, 'target stream name')
    const info = await streamInfo(nc, stream)
    const newConfig = { ...(info.config || {}), ...(body.config || {}), name: target }
    // Two streams cannot listen on overlapping subjects
    if (!body.config?.subjects) delete newConfig.subjects
    if (!newConfig.subjects?.length && !newConfig.mirror && !newConfig.sources?.length) {
      newConfig.sources = [{ name: stream }]
    }
    const resp = await jsApi(nc, `$JS.API.STREAM.CREATE.${target}`, newConfig, 'Duplicate failed')
    sendJson(res, 200, { ok: true, stream: target, config: resp.config })
  })

  post('/api/stream/mirror', 'Stream mirror failed', async ({ res, body, nc }) => {
    const stream = assertName(body.stream, 'stream name')
    const target = assertName(body.target, 'target stream name')
    const mirror = body.mirror || {}
    const info = await streamInfo(nc, stream)
    const mirrorCfg = { name: stream }
    if (mirror.filter_subject) mirrorCfg.filter_subject = mirror.filter_subject
    if (mirror.opt_start_time) mirrorCfg.opt_start_time = mirror.opt_start_time
    if (mirror.opt_start_seq != null) mirrorCfg.opt_start_seq = mirror.opt_start_seq
    if (mirror.external && typeof mirror.external === 'object') mirrorCfg.external = mirror.external
    const createCfg = { ...(info.config || {}), ...(body.config || {}), name: target, mirror: mirrorCfg }
    delete createCfg.subjects
    delete createCfg.sources
    delete createCfg.subject_transform
    delete createCfg.republish
    const resp = await jsApi(nc, `$JS.API.STREAM.CREATE.${target}`, createCfg, 'Mirror creation failed')
    sendJson(res, 200, { ok: true, stream: target, config: resp.config })
  })

  post('/api/stream/step-down', 'Step down failed', async ({ res, body, nc }) => {
    const stream = assertName(body.stream, 'stream name')
    await jsApi(nc, `$JS.API.STREAM.LEADER.STEPDOWN.${stream}`, {}, 'Step down failed')
    sendJson(res, 200, { ok: true })
  })

  post('/api/stream/remove-followers', 'Remove followers failed', async ({ res, body, nc }) => {
    const stream = assertName(body.stream, 'stream name')
    const info = await streamInfo(nc, stream)
    const replicas = info.cluster?.replicas || []
    const inferred = replicas.filter((r) => !r.current && r.name).map((r) => r.name)
    const peers = Array.isArray(body.peers) && body.peers.length > 0 ? body.peers : inferred
    if (peers.length === 0) {
      sendJson(res, 200, { ok: true, removed: [], skipped: 'No lagging follower peers found' })
      return
    }
    const removed = []
    for (const peer of peers) {
      await jsApi(nc, `$JS.API.STREAM.PEER.REMOVE.${stream}`, { peer }, `Remove follower failed for ${peer}`)
      removed.push(peer)
    }
    sendJson(res, 200, { ok: true, removed })
  })

  post('/api/stream/seal', 'Stream seal failed', async ({ res, body, nc }) => {
    const stream = assertName(body.stream, 'stream name')
    const info = await streamInfo(nc, stream)
    const merged = { ...(info.config || {}), name: stream, sealed: true }
    const resp = await jsApi(nc, `$JS.API.STREAM.UPDATE.${stream}`, merged, 'Seal failed')
    sendJson(res, 200, { ok: true, config: resp.config })
  })

  post('/api/stream/message/delete', 'Message delete failed', async ({ res, body, nc }) => {
    const stream = assertName(body.stream, 'stream name')
    const seq = Number(body.seq)
    if (!Number.isInteger(seq) || seq <= 0) throw new HttpError(400, 'Invalid sequence')
    await jsApi(nc, `$JS.API.STREAM.MSG.DELETE.${stream}`, { seq, no_erase: body.erase !== true }, 'Message delete failed')
    sendJson(res, 200, { ok: true })
  })

  get('/api/stream/config-cli', 'Failed to build CLI config', async ({ res, query, nc }) => {
    const stream = assertName(query.stream, 'stream name')
    const info = await streamInfo(nc, stream)
    sendJson(res, 200, { ok: true, stream, cli: buildCliConfig(stream, info.config || {}) })
  })

  get('/api/stream/config-terraform', 'Failed to build Terraform config', async ({ res, query, nc }) => {
    const stream = assertName(query.stream, 'stream name')
    const info = await streamInfo(nc, stream)
    sendJson(res, 200, { ok: true, stream, terraform: buildTerraformConfig(stream, info.config || {}) })
  })

  get('/api/stream/messages', 'Failed to fetch messages', async ({ res, query, nc }) => {
    const stream = assertName(query.stream, 'stream name')
    const limit = Math.max(1, Math.min(parseInt(query.limit || '50', 10) || 50, 500))
    const data = await fetchStreamMessages(nc, stream, {
      limit,
      startSeq: query.startSeq || null,
      afterSeq: query.afterSeq || null,
      startTime: query.startTime || null,
      subject: query.subject || null,
    })
    sendJson(res, 200, data)
  })

  // ── Consumers ──────────────────────────────────────────────────────────────

  post('/api/consumer/create', 'Consumer create failed', async ({ res, body, nc }) => {
    const stream = assertName(body.stream, 'stream name')
    const config = { ...(body.config || {}) }
    const name = config.durable_name || config.name
    if (name) assertName(name, 'consumer name')
    const subject = name ? `$JS.API.CONSUMER.CREATE.${stream}.${name}` : `$JS.API.CONSUMER.CREATE.${stream}`
    const resp = await jsApi(nc, subject, { stream_name: stream, config, action: 'create' }, 'Create failed')
    sendJson(res, 200, { ok: true, consumer: resp })
  })

  post('/api/consumer/delete', 'Consumer delete failed', async ({ res, body, nc }) => {
    const stream = assertName(body.stream, 'stream name')
    const consumer = assertName(body.consumer, 'consumer name')
    await jsApi(nc, `$JS.API.CONSUMER.DELETE.${stream}.${consumer}`, {}, 'Delete failed')
    sendJson(res, 200, { ok: true })
  })
}
