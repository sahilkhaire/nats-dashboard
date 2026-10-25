# KV / Object Store API Contract

KV and Object Store operations are implemented with the nats.js client on the dashboard
server, so they work wherever the dashboard runs (no `nats` CLI binary required).

Every endpoint accepts connection parameters (query string for GET, JSON body for POST):

- `server`: monitoring URL (`http://host:8222`) or NATS URL (`nats://host:4222`) of the selected connection.
- `nats`: optional explicit NATS URL (used when the client port differs from the monitoring host).
- `token`: optional token (also accepted as `Authorization: Bearer <token>`).

When omitted, the server falls back to its configured connection (`NATS_URL`, or the current NATS context in dev).

Successful responses are `{ "ok": true, "data": … }`; failures are `{ "ok": false, "error": "…" }`
with a 4xx status for invalid input / missing resources and 502 for NATS errors.

## KV

| Method | Path | Body / query | `data` |
|---|---|---|---|
| GET | `/api/kv/buckets` | — | `[{ bucket, description, values, history, ttlMs, size, storage, replicas, maxValueSize, maxBucketSize, compression, created, lastUpdate }]` |
| GET | `/api/kv/bucket/:bucket` | — | bucket status (same shape) |
| POST | `/api/kv/bucket/create` | `{ bucket, description?, history?, ttlMs?, maxValueSize?, maxBucketSize?, replicas?, storage?, compression? }` | bucket status |
| POST | `/api/kv/bucket/delete` | `{ bucket }` | `null` |
| GET | `/api/kv/keys` | `?bucket=&filter=` | `string[]` |
| GET | `/api/kv/entries` | `?bucket=&filter=` | `[{ key, revision, created, operation, size }]` (latest revision of live keys) |
| POST | `/api/kv/entry/get` | `{ bucket, key, revision? }` | `{ key, revision, created, operation, value, encoding: 'utf8'\|'base64', size }` |
| POST | `/api/kv/entry/put` | `{ bucket, key, value, encoding?: 'utf8'\|'base64'\|'json' }` | `{ key, revision }` |
| POST | `/api/kv/entry/delete` | `{ bucket, key }` | `null` (writes a delete marker) |
| POST | `/api/kv/entry/purge` | `{ bucket, key }` | `null` (removes all history) |
| POST | `/api/kv/entry/history` | `{ bucket, key }` | entries, newest first |
| GET | `/api/kv/watch` | `?bucket=&key=` | Server-sent events; one `data:` JSON entry per change |

## Object Store

| Method | Path | Body / query | `data` |
|---|---|---|---|
| GET | `/api/object/buckets` | — | `[{ bucket, description, ttlMs, storage, replicas, sealed, size, compression, created, lastUpdate }]` |
| GET | `/api/object/bucket/:bucket` | — | bucket status |
| POST | `/api/object/bucket/create` | `{ bucket, description?, ttlMs?, maxBucketSize?, replicas?, storage?, compression? }` | bucket status |
| POST | `/api/object/bucket/delete` | `{ bucket }` | `null` |
| POST | `/api/object/bucket/seal` | `{ bucket }` | bucket status |
| GET | `/api/object/list` | `?bucket=` | `[{ name, description, size, chunks, digest, mtime, revision, deleted, link, headers, metadata }]` |
| POST | `/api/object/info` | `{ bucket, name }` | object info |
| POST | `/api/object/get` | `{ bucket, name }` | `{ info, preview: { value, encoding, size } \| null }` (preview only up to 1 MB) |
| GET | `/api/object/download` | `?bucket=&name=` | raw bytes with `Content-Disposition: attachment` |
| POST | `/api/object/put` | `{ bucket, name, content, encoding?: 'utf8'\|'base64', description? }` | object info (request body limit 25 MB) |
| POST | `/api/object/delete` | `{ bucket, name }` | `null` |
| POST | `/api/object/link` | `{ bucket, name, targetBucket, targetName? }` | link info |

Bucket, stream and consumer names are validated: they cannot contain whitespace, `.`, `*`, `>` or path separators.
