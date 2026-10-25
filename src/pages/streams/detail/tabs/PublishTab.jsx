import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock, Plus, Send, X as XIcon } from 'lucide-react'
import { useStreamMutation } from '../../../../hooks/useStreamMutation'
import { useConfig } from '../../../../context/ConfigContext'
import { useConfirmDialog } from '../../../../components/shared/ConfirmDialogProvider'
import { Button } from '../../../../components/ui/button'
import { Input } from '../../../../components/ui/input'
import { StatusBadge } from '../../../../components/ui/StatusBadge'
import { toDateTimeLocal, formatDateTime, timeAgo } from '../../../../utils/duration'

const DELAY_OPTIONS = [
  { label: 'Immediately', value: 0 },
  { label: 'In 1 minute', value: 60_000 },
  { label: 'In 5 minutes', value: 300_000 },
  { label: 'In 15 minutes', value: 900_000 },
  { label: 'In 1 hour', value: 3_600_000 },
  { label: 'In 6 hours', value: 21_600_000 },
  { label: 'In 24 hours', value: 86_400_000 },
  { label: 'At a specific time…', value: -1 },
]

/** Stream subjects are often wildcards (orders.>) which cannot be published to directly. */
const concrete = (s) => (s || '').replace(/\.>$/, '.test').replace(/(^|\.)\*(?=\.|$)/g, '$1test').replace(/^>$/, 'test')

/** Does `subject` match a NATS subject pattern with * and > wildcards? */
function matchesPattern(subject, pattern) {
  const s = subject.split('.')
  const p = pattern.split('.')
  for (let i = 0; i < p.length; i += 1) {
    if (p[i] === '>') return s.length > i
    if (i >= s.length) return false
    if (p[i] !== '*' && p[i] !== s[i]) return false
  }
  return s.length === p.length
}

const STATUS = { pending: 'neutral', running: 'warn', delivered: 'ok', error: 'error' }

export function PublishTab({ stream }) {
  const { confirm } = useConfirmDialog()
  const { pollInterval } = useConfig()
  const { publishMessage, listScheduledPublishes, cancelScheduledPublish } = useStreamMutation()
  const subjects = stream.config?.subjects ?? []
  const allowMsgTtl = stream.config?.allow_msg_ttl === true
  const blocked = stream.config?.sealed ? 'This stream is sealed and rejects new messages.' : stream.config?.mirror ? 'Mirrors only receive messages from their origin stream.' : null

  const [subject, setSubject] = useState(concrete(subjects[0]))
  const [payload, setPayload] = useState('')
  const [hdrs, setHdrs] = useState([])
  const [msgId, setMsgId] = useState('')
  const [msgTtl, setMsgTtl] = useState('')
  const [delay, setDelay] = useState(0)
  const [scheduleAt, setScheduleAt] = useState(() => toDateTimeLocal(new Date(Date.now() + 3_600_000)))
  const [publishing, setPublishing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState([])

  const reloadPending = useCallback(async () => {
    try { setPending(await listScheduledPublishes(stream.name)) } catch { /* ignore */ }
  }, [listScheduledPublishes, stream.name])

  useEffect(() => {
    reloadPending()
    const t = setInterval(reloadPending, Math.max(3000, pollInterval * 2))
    return () => clearInterval(t)
  }, [reloadPending, pollInterval])

  const subjectOk = subject.trim() && !/[\s*>]/.test(subject.trim())
  const inStream = !subjects.length || subjects.some((p) => matchesPattern(subject.trim(), p))
  let jsonState = null
  if (payload.trim().startsWith('{') || payload.trim().startsWith('[')) {
    try { JSON.parse(payload); jsonState = 'valid' } catch { jsonState = 'invalid' }
  }

  const handlePublish = async (e) => {
    e?.preventDefault()
    setError('')
    setResult(null)
    if (!subjectOk) { setError('Enter a concrete subject (no spaces or wildcards).'); return }
    let at
    if (delay === -1) {
      const ts = new Date(scheduleAt)
      if (!Number.isFinite(ts.getTime()) || ts <= new Date()) { setError('Pick a delivery time in the future.'); return }
      at = ts.toISOString()
    } else if (delay > 0) {
      at = new Date(Date.now() + delay).toISOString()
    }
    setPublishing(true)
    try {
      const res = await publishMessage({
        stream: stream.name,
        subject: subject.trim(),
        payload,
        headers: hdrs.filter((h) => h.key.trim()),
        msgId: msgId.trim() || undefined,
        msgTtl: allowMsgTtl && msgTtl.trim() ? msgTtl.trim() : undefined,
        scheduleAt: at,
      })
      setResult(res)
      if (at) reloadPending()
    } catch (err) {
      setError(err.message)
    } finally {
      setPublishing(false)
    }
  }

  const cancel = async (id) => {
    if (!(await confirm('Cancel scheduled message?', 'It will not be delivered.', { confirmLabel: 'Cancel message' }))) return
    try { await cancelScheduledPublish(id); reloadPending() } catch (err) { setError(err.message) }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <form className="surface-card overflow-hidden" onSubmit={handlePublish}>
        <div className="card-header"><Send size={13} className="text-primary" /><span className="card-title">Compose message</span></div>
        <div className="space-y-4 p-4">
          {blocked && <div className="rounded-md border border-nats-warn/40 bg-nats-warn/10 px-3 py-2 text-sm text-nats-warn">{blocked}</div>}
          <div>
            <label className="field-label">Subject *</label>
            <div className="flex gap-2">
              {subjects.length > 0 && (
                <select className="input-enterprise w-44 shrink-0 font-mono" value={subjects.find((s) => concrete(s) === subject) ?? ''}
                  onChange={(e) => e.target.value && setSubject(concrete(e.target.value))} aria-label="Stream subject patterns">
                  <option value="">pattern…</option>
                  {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="orders.created" className="font-mono" />
            </div>
            {subject.trim() && !subjectOk && <p className="field-hint text-nats-error">Subjects cannot contain spaces or wildcards.</p>}
            {subjectOk && !inStream && <p className="field-hint text-nats-warn">Not covered by this stream&apos;s subjects ({subjects.join(', ')}) — the publish will be rejected.</p>}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="field-label mb-0">Payload</label>
              <div className="flex items-center gap-3 text-xs">
                {jsonState && <span className={jsonState === 'valid' ? 'text-nats-ok' : 'text-nats-error'}>{jsonState === 'valid' ? 'valid JSON' : 'invalid JSON'}</span>}
                <button type="button" className="text-muted-foreground hover:text-primary" disabled={jsonState !== 'valid'}
                  onClick={() => setPayload(JSON.stringify(JSON.parse(payload), null, 2))}>Format</button>
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setPayload('')}>Clear</button>
              </div>
            </div>
            <textarea value={payload} onChange={(e) => setPayload(e.target.value)} rows={7} placeholder={'{"orderId": "123"}'}
              className="input-enterprise resize-y font-mono text-xs" />
            <p className="field-hint">{new TextEncoder().encode(payload).length.toLocaleString()} bytes</p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="field-label mb-0">Headers</label>
              <button type="button" onClick={() => setHdrs((h) => [...h, { key: '', value: '' }])} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                <Plus size={11} /> Add header
              </button>
            </div>
            <div className="space-y-2">
              {hdrs.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={h.key} onChange={(e) => setHdrs((p) => p.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} placeholder="Name" className="h-8 font-mono text-xs" />
                  <Input value={h.value} onChange={(e) => setHdrs((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="Value" className="h-8 font-mono text-xs" />
                  <button type="button" onClick={() => setHdrs((p) => p.filter((_, j) => j !== i))} className="rounded p-1 text-muted-foreground hover:text-nats-error" aria-label="Remove header"><XIcon size={13} /></button>
                </div>
              ))}
              {!hdrs.length && <p className="text-xs text-muted-foreground">No custom headers.</p>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Message ID <span className="font-normal">(deduplication)</span></label>
              <Input value={msgId} onChange={(e) => setMsgId(e.target.value)} placeholder="optional Nats-Msg-Id" className="font-mono text-xs" />
            </div>
            {allowMsgTtl && (
              <div>
                <label className="field-label">Message TTL</label>
                <Input value={msgTtl} onChange={(e) => setMsgTtl(e.target.value)} placeholder="e.g. 1h (Nats-TTL)" className="font-mono text-xs" />
              </div>
            )}
            <div>
              <label className="field-label">Delivery</label>
              <select className="input-enterprise" value={delay} onChange={(e) => setDelay(Number(e.target.value))}>
                {DELAY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {delay === -1 && (
              <div>
                <label className="field-label">Deliver at</label>
                <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
              </div>
            )}
          </div>
          {delay !== 0 && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock size={12} /> Held by the dashboard server until delivery; lost if the dashboard restarts.</p>}

          {error && <div className="flex items-start gap-2 rounded-md border border-nats-error/40 bg-nats-error/10 px-3 py-2 text-xs text-nats-error"><AlertCircle size={13} className="mt-0.5 shrink-0" />{error}</div>}
          {result && !error && (
            <div className="flex items-start gap-2 rounded-md border border-nats-ok/40 bg-nats-ok/10 px-3 py-2 text-xs text-nats-ok">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
              {result.scheduled
                ? `Scheduled for ${formatDateTime(result.scheduleAt)}`
                : `Stored in ${result.stream} at sequence ${result.seq}${result.duplicate ? ' (duplicate — already stored)' : ''}`}
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={publishing || Boolean(blocked) || !subjectOk}>
              <Send size={14} /> {publishing ? 'Sending…' : delay !== 0 ? 'Schedule message' : 'Publish'}
            </Button>
          </div>
        </div>
      </form>

      <div className="surface-card h-fit overflow-hidden">
        <div className="card-header justify-between">
          <span className="flex items-center gap-2"><Clock size={13} className="text-muted-foreground" /><span className="card-title">Scheduled messages</span></span>
          <span className="text-[11px] text-muted-foreground">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Nothing scheduled.</div>
        ) : (
          <ul className="divide-y divide-border">
            {[...pending].sort((a, b) => new Date(b.scheduleAt) - new Date(a.scheduleAt)).map((p) => (
              <li key={p.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-xs">{p.subject}</span>
                    <StatusBadge status={STATUS[p.status] || 'neutral'}>{p.status}</StatusBadge>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground" title={formatDateTime(p.scheduleAt)}>
                    {p.status === 'pending' ? `delivers ${timeAgo(p.scheduleAt)}` : formatDateTime(p.scheduleAt)}
                    {p.result?.seq ? ` · seq ${p.result.seq}` : ''}
                  </div>
                  {p.payload && <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{p.payload.slice(0, 120)}</div>}
                  {p.error && <div className="mt-1 text-[11px] text-nats-error">{p.error}</div>}
                </div>
                {p.status === 'pending' && (
                  <button type="button" onClick={() => cancel(p.id)} className="rounded p-1 text-muted-foreground hover:text-nats-error" title="Cancel"><XIcon size={13} /></button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
