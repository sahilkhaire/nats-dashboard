import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileKey2, History, Plus, Radio, RefreshCw, Save, Trash2, Eraser, X } from 'lucide-react'
import { useApiQuery } from '../../hooks/useApiQuery'
import { useConfig } from '../../context/ConfigContext'
import { useNotifications } from '../../context/NotificationContext'
import { useConfirmDialog } from '../../components/shared/ConfirmDialogProvider'
import { PageHeader } from '../../components/shared/PageHeader'
import { EmptyState } from '../../components/shared/EmptyState'
import { ConnectionError } from '../../components/shared/ConnectionError'
import { LoadingState } from '../../components/shared/PageState'
import { SearchInput, makeMatcher } from '../../components/shared/SearchInput'
import { CopyButton } from '../../components/shared/CopyButton'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { formatBytes, formatNumber } from '../../utils/byteFormatter'
import { parseDurationToNs, nsToHuman, timeAgo, formatDateTime } from '../../utils/duration'
import { cn } from '../../lib/utils'

function pretty(entry) {
  if (!entry) return ''
  if (entry.encoding === 'base64') return entry.value
  try { return JSON.stringify(JSON.parse(entry.value), null, 2) } catch { return entry.value }
}

function CreateBucketDialog({ open, onClose, onCreate }) {
  const [f, setF] = useState({ bucket: '', description: '', history: '1', ttl: '', maxValueSize: '', storage: 'file', replicas: '1' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setF({ bucket: '', description: '', history: '1', ttl: '', maxValueSize: '', storage: 'file', replicas: '1' }); setError('') } }, [open])
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const ttlNs = parseDurationToNs(f.ttl)
    if (ttlNs === null) { setError('TTL must be a duration like 1h or 7d'); return }
    setBusy(true)
    try {
      await onCreate({
        bucket: f.bucket.trim(),
        description: f.description.trim() || undefined,
        history: Number(f.history) || 1,
        ttlMs: ttlNs ? Math.round(ttlNs / 1e6) : undefined,
        maxValueSize: f.maxValueSize ? Number(f.maxValueSize) : undefined,
        storage: f.storage,
        replicas: Number(f.replicas) || 1,
      })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create KV bucket</DialogTitle>
          <DialogDescription>A key-value store backed by a JetStream stream named KV_&lt;bucket&gt;.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="rounded-md border border-nats-error/40 bg-nats-error/10 px-3 py-2 text-sm text-nats-error">{error}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="field-label">Bucket name *</label><Input value={f.bucket} onChange={set('bucket')} className="font-mono" placeholder="config" autoFocus required /></div>
            <div className="sm:col-span-2"><label className="field-label">Description</label><Input value={f.description} onChange={set('description')} /></div>
            <div><label className="field-label">History per key</label><Input type="number" min="1" max="64" value={f.history} onChange={set('history')} /></div>
            <div><label className="field-label">TTL</label><Input value={f.ttl} onChange={set('ttl')} placeholder="none (e.g. 24h)" className="font-mono" /></div>
            <div><label className="field-label">Max value size (bytes)</label><Input type="number" min="1" value={f.maxValueSize} onChange={set('maxValueSize')} placeholder="unlimited" /></div>
            <div>
              <label className="field-label">Storage</label>
              <select className="input-enterprise" value={f.storage} onChange={set('storage')}>
                <option value="file">File</option>
                <option value="memory">Memory</option>
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy || !f.bucket.trim()}>{busy ? 'Creating…' : 'Create bucket'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function KeyPanel({ bucket, keyName, onClose, onChanged }) {
  const { api } = useConfig()
  const { confirm } = useConfirmDialog()
  const { notifyError, notifySuccess } = useNotifications()
  const [entry, setEntry] = useState(null)
  const [history, setHistory] = useState(null)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setError('')
    try {
      const res = await api('/api/kv/entry/get', { method: 'POST', body: { bucket, key: keyName } })
      setEntry(res.data)
      setDraft(res.data.encoding === 'base64' ? '' : res.data.value)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    setEntry(null); setHistory(null); setEditing(false)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, keyName])

  const save = async () => {
    setBusy(true)
    try {
      await api('/api/kv/entry/put', { method: 'POST', body: { bucket, key: keyName, value: draft } })
      notifySuccess('Value saved', `${bucket} / ${keyName}`, 'kv')
      setEditing(false)
      await load()
      onChanged()
    } catch (err) {
      notifyError('Save failed', err.message, 'kv')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (purge) => {
    const ok = await confirm(
      purge ? `Purge "${keyName}"?` : `Delete "${keyName}"?`,
      purge ? 'The key and all of its history are removed.' : 'A delete marker is written; previous revisions remain in history.',
      { confirmLabel: purge ? 'Purge key' : 'Delete key' },
    )
    if (!ok) return
    try {
      await api(`/api/kv/entry/${purge ? 'purge' : 'delete'}`, { method: 'POST', body: { bucket, key: keyName } })
      notifySuccess(purge ? 'Key purged' : 'Key deleted', keyName, 'kv')
      onChanged()
      onClose()
    } catch (err) {
      notifyError('Delete failed', err.message, 'kv')
    }
  }

  const loadHistory = async () => {
    try {
      const res = await api('/api/kv/entry/history', { method: 'POST', body: { bucket, key: keyName } })
      setHistory(res.data)
    } catch (err) {
      notifyError('History failed', err.message, 'kv')
    }
  }

  return (
    <div className="surface-card flex min-h-0 flex-col overflow-hidden">
      <div className="card-header justify-between">
        <span className="min-w-0 truncate font-mono text-sm">{keyName}</span>
        <div className="flex shrink-0 items-center gap-1">
          <CopyButton text={keyName} />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close"><X size={14} /></Button>
        </div>
      </div>
      <div className="space-y-3 overflow-y-auto p-4">
        {error && <div className="text-sm text-nats-error">{error}</div>}
        {entry && (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Revision <span className="font-mono text-foreground">{entry.revision}</span></span>
              <span>Size <span className="font-mono text-foreground">{formatBytes(entry.size)}</span></span>
              <span title={entry.created}>Updated <span className="text-foreground">{timeAgo(entry.created)}</span></span>
              {entry.encoding === 'base64' && <StatusBadge status="info">binary</StatusBadge>}
            </div>
            {editing ? (
              <textarea className="input-enterprise min-h-[220px] font-mono text-xs" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
            ) : (
              <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">{pretty(entry) || <span className="italic text-muted-foreground">empty</span>}</pre>
            )}
            <div className="flex flex-wrap gap-2">
              {editing ? (
                <>
                  <Button size="sm" onClick={save} disabled={busy}><Save size={13} /> {busy ? 'Saving…' : 'Save new revision'}</Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditing(false); setDraft(entry.encoding === 'base64' ? '' : entry.value) }}>Cancel</Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>
                  <CopyButton text={entry.value} label="Copy value" className="rounded-md border border-border px-2.5" />
                  <Button size="sm" variant="outline" onClick={loadHistory}><History size={13} /> History</Button>
                  <Button size="sm" variant="ghost" className="hover:text-nats-error" onClick={() => remove(false)}><Trash2 size={13} /> Delete</Button>
                  <Button size="sm" variant="ghost" className="hover:text-nats-error" onClick={() => remove(true)}><Eraser size={13} /> Purge</Button>
                </>
              )}
            </div>
            {history && (
              <div className="space-y-2 border-t border-border pt-3">
                <div className="card-title">History ({history.length})</div>
                {history.map((h) => (
                  <div key={h.revision} className="rounded-md border border-border p-2 text-xs">
                    <div className="mb-1 flex items-center justify-between text-muted-foreground">
                      <span>rev <span className="font-mono text-foreground">{h.revision}</span> · {formatDateTime(h.created)}</span>
                      <StatusBadge status={h.operation === 'PUT' ? 'neutral' : 'warn'}>{h.operation}</StatusBadge>
                    </div>
                    {h.operation === 'PUT' && <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono">{pretty(h)}</pre>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {!entry && !error && <div className="text-sm text-muted-foreground">Loading…</div>}
      </div>
    </div>
  )
}

function NewKeyDialog({ open, bucket, onClose, onSaved }) {
  const { api } = useConfig()
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setKey(''); setValue(''); setError('') } }, [open])
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/api/kv/entry/put', { method: 'POST', body: { bucket, key: key.trim(), value } })
      onSaved(key.trim())
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Put key in <span className="font-mono">{bucket}</span></DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="rounded-md border border-nats-error/40 bg-nats-error/10 px-3 py-2 text-sm text-nats-error">{error}</div>}
          <div><label className="field-label">Key *</label><Input value={key} onChange={(e) => setKey(e.target.value)} className="font-mono" placeholder="app.feature.enabled" autoFocus required /></div>
          <div><label className="field-label">Value</label><textarea className="input-enterprise min-h-[140px] font-mono text-xs" value={value} onChange={(e) => setValue(e.target.value)} placeholder='"text" or {"json": true}' /></div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy || !key.trim()}>{busy ? 'Saving…' : 'Put key'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function KvPage() {
  const { api, apiUrl } = useConfig()
  const { notifyError, notifySuccess } = useNotifications()
  const { confirm } = useConfirmDialog()
  const [params, setParams] = useSearchParams()
  const bucket = params.get('bucket')
  const selectedKey = params.get('key')
  const [filter, setFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newKeyOpen, setNewKeyOpen] = useState(false)
  const [watching, setWatching] = useState(false)

  const buckets = useApiQuery('/api/kv/buckets', {}, { refreshMs: 10000 })
  const entries = useApiQuery(bucket ? '/api/kv/entries' : null, { bucket })

  const select = (next) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v == null) p.delete(k)
      else p.set(k, v)
    }
    setParams(p, { replace: true })
  }

  // Auto-select the first bucket
  useEffect(() => {
    if (!bucket && buckets.data?.length) select({ bucket: buckets.data[0].bucket })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets.data, bucket])

  // Live watch: refresh the key list whenever something changes
  useEffect(() => {
    if (!watching || !bucket) return undefined
    const es = new EventSource(apiUrl('/api/kv/watch', { bucket }), { withCredentials: true })
    let t = null
    es.onmessage = () => {
      clearTimeout(t)
      t = setTimeout(() => entries.reload({ silent: true }), 250)
    }
    es.onerror = () => { setWatching(false); es.close() }
    return () => { clearTimeout(t); es.close() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching, bucket])

  const current = buckets.data?.find((b) => b.bucket === bucket)
  const matcher = makeMatcher(filter, false)
  const keys = useMemo(() => (entries.data || []).filter((e) => matcher.test(e.key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries.data, filter])

  const deleteBucket = async () => {
    const ok = await confirm(`Delete KV bucket "${bucket}"?`, 'All keys and history are permanently removed.', { confirmLabel: 'Delete bucket', requireText: bucket })
    if (!ok) return
    try {
      await api('/api/kv/bucket/delete', { method: 'POST', body: { bucket } })
      notifySuccess('Bucket deleted', bucket, 'kv')
      select({ bucket: null, key: null })
      buckets.reload()
    } catch (err) {
      notifyError('Delete failed', err.message, 'kv')
    }
  }

  return (
    <div>
      <PageHeader
        title="Key-Value"
        icon={FileKey2}
        description="Browse and edit JetStream KV buckets"
        actions={<Button onClick={() => setCreateOpen(true)}><Plus size={15} /> New bucket</Button>}
      />

      {buckets.error && !buckets.data ? <ConnectionError error={buckets.error} onRetry={buckets.reload} />
        : !buckets.data ? <LoadingState cards={0} />
          : buckets.data.length === 0 ? (
            <div className="surface-card">
              <EmptyState icon={FileKey2} title="No KV buckets" description="Create a bucket to store configuration, feature flags or any small values."
                action={<Button onClick={() => setCreateOpen(true)}><Plus size={15} /> New bucket</Button>} />
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
              {/* Buckets */}
              <div className="surface-card h-fit overflow-hidden">
                <div className="card-header justify-between"><span className="card-title">Buckets</span><span className="text-[11px] text-muted-foreground">{buckets.data.length}</span></div>
                <nav className="max-h-[60vh] space-y-0.5 overflow-y-auto p-1.5">
                  {buckets.data.map((b) => (
                    <button key={b.bucket} type="button" onClick={() => select({ bucket: b.bucket, key: null })}
                      className={cn('flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                        b.bucket === bucket ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                      <span className="truncate font-mono">{b.bucket}</span>
                      <span className="shrink-0 font-mono text-[10px] opacity-70">{formatNumber(b.values)}</span>
                    </button>
                  ))}
                </nav>
              </div>

              {/* Bucket content */}
              <div className="min-w-0 space-y-4">
                {current && (
                  <div className="surface-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-base font-semibold">{current.bucket}</div>
                        {current.description && <div className="text-xs text-muted-foreground">{current.description}</div>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant={watching ? 'secondary' : 'outline'} onClick={() => setWatching((w) => !w)} title="Refresh keys live as they change">
                          <Radio size={13} className={watching ? 'text-primary' : ''} /> {watching ? 'Watching' : 'Watch'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => entries.reload()}><RefreshCw size={13} /> Refresh</Button>
                        <Button size="sm" onClick={() => setNewKeyOpen(true)}><Plus size={13} /> Put key</Button>
                        <Button size="sm" variant="ghost" className="hover:text-nats-error" onClick={deleteBucket}><Trash2 size={13} /></Button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                      {[
                        ['Values', formatNumber(current.values)],
                        ['Size', formatBytes(current.size)],
                        ['History', current.history],
                        ['TTL', current.ttlMs ? nsToHuman(current.ttlMs * 1e6) : 'none'],
                        ['Storage', `${current.storage} · R${current.replicas}`],
                        ['Max value', current.maxValueSize > 0 ? formatBytes(current.maxValueSize) : 'unlimited'],
                        ['Created', formatDateTime(current.created)],
                        ['Last update', current.lastUpdate ? timeAgo(current.lastUpdate) : '—'],
                      ].map(([k, v]) => (
                        <div key={k}><span className="text-muted-foreground">{k} </span><span className="font-mono">{v}</span></div>
                      ))}
                    </div>
                  </div>
                )}

                <div className={cn('grid gap-4', selectedKey && 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
                  <div className="min-w-0 space-y-3">
                    <SearchInput value={filter} onChange={setFilter} placeholder="Filter keys…" />
                    {entries.error ? <div className="text-sm text-nats-error">{entries.error}</div> : (
                      <div className="premium-table-wrap max-h-[60vh] overflow-y-auto">
                        <table className="premium-table">
                          <thead className="sticky top-0 z-10 bg-card"><tr><th>Key</th><th>Revision</th><th>Size</th><th>Updated</th></tr></thead>
                          <tbody>
                            {entries.loading && !entries.data && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Loading keys…</td></tr>}
                            {entries.data && keys.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">{entries.data.length ? 'No keys match.' : 'This bucket is empty.'}</td></tr>}
                            {keys.map((e) => (
                              <tr key={e.key} className={cn('cursor-pointer', e.key === selectedKey && 'bg-primary/5')} onClick={() => select({ key: e.key })}>
                                <td className="max-w-[320px] truncate font-mono text-xs">{e.key}</td>
                                <td className="font-mono text-xs text-muted-foreground">{e.revision}</td>
                                <td className="font-mono text-xs text-muted-foreground">{formatBytes(e.size)}</td>
                                <td className="text-xs text-muted-foreground" title={e.created}>{timeAgo(e.created)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  {selectedKey && (
                    <KeyPanel bucket={bucket} keyName={selectedKey} onClose={() => select({ key: null })} onChanged={() => { entries.reload({ silent: true }); buckets.reload() }} />
                  )}
                </div>
              </div>
            </div>
          )}

      <CreateBucketDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={async (cfg) => {
          await api('/api/kv/bucket/create', { method: 'POST', body: cfg })
          notifySuccess('Bucket created', cfg.bucket, 'kv')
          await buckets.reload()
          select({ bucket: cfg.bucket, key: null })
        }}
      />
      <NewKeyDialog
        open={newKeyOpen}
        bucket={bucket}
        onClose={() => setNewKeyOpen(false)}
        onSaved={(k) => { entries.reload({ silent: true }); buckets.reload(); select({ key: k }) }}
      />
    </div>
  )
}
