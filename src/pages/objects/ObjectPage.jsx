import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Boxes, Download, Eye, Lock, Plus, RefreshCw, Trash2, Upload } from 'lucide-react'
import { useApiQuery } from '../../hooks/useApiQuery'
import { useConfig } from '../../context/ConfigContext'
import { useNotifications } from '../../context/NotificationContext'
import { useConfirmDialog } from '../../components/shared/ConfirmDialogProvider'
import { PageHeader } from '../../components/shared/PageHeader'
import { EmptyState } from '../../components/shared/EmptyState'
import { ConnectionError } from '../../components/shared/ConnectionError'
import { LoadingState } from '../../components/shared/PageState'
import { SearchInput, makeMatcher } from '../../components/shared/SearchInput'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { formatBytes, formatNumber } from '../../utils/byteFormatter'
import { parseDurationToNs, nsToHuman, formatDateTime, timeAgo } from '../../utils/duration'
import { cn } from '../../lib/utils'

const MAX_UPLOAD = 16 * 1024 * 1024

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

function CreateBucketDialog({ open, onClose, onCreate }) {
  const [f, setF] = useState({ bucket: '', description: '', ttl: '', storage: 'file' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setF({ bucket: '', description: '', ttl: '', storage: 'file' }); setError('') } }, [open])
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const submit = async (e) => {
    e.preventDefault()
    const ttlNs = parseDurationToNs(f.ttl)
    if (ttlNs === null) { setError('TTL must be a duration like 7d'); return }
    setBusy(true)
    setError('')
    try {
      await onCreate({ bucket: f.bucket.trim(), description: f.description.trim() || undefined, ttlMs: ttlNs ? Math.round(ttlNs / 1e6) : undefined, storage: f.storage })
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
          <DialogTitle>Create object store</DialogTitle>
          <DialogDescription>Stores files of any size in chunks, backed by a stream named OBJ_&lt;bucket&gt;.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="rounded-md border border-nats-error/40 bg-nats-error/10 px-3 py-2 text-sm text-nats-error">{error}</div>}
          <div><label className="field-label">Bucket name *</label><Input value={f.bucket} onChange={set('bucket')} className="font-mono" placeholder="assets" autoFocus required /></div>
          <div><label className="field-label">Description</label><Input value={f.description} onChange={set('description')} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="field-label">TTL</label><Input value={f.ttl} onChange={set('ttl')} placeholder="none (e.g. 30d)" className="font-mono" /></div>
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
            <Button type="submit" disabled={busy || !f.bucket.trim()}>{busy ? 'Creating…' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PreviewDialog({ target, onClose }) {
  const { api } = useConfig()
  const [state, setState] = useState(null)
  useEffect(() => {
    if (!target) return
    setState(null)
    api('/api/object/get', { method: 'POST', body: target })
      .then((r) => setState(r.data))
      .catch((err) => setState({ error: err.message }))
  }, [target, api])
  let text = null
  if (state?.preview) {
    if (state.preview.encoding === 'utf8') {
      try { text = JSON.stringify(JSON.parse(state.preview.value), null, 2) } catch { text = state.preview.value }
    }
  }
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="font-mono">{target?.name}</DialogTitle></DialogHeader>
        {!state && <div className="text-sm text-muted-foreground">Loading…</div>}
        {state?.error && <div className="text-sm text-nats-error">{state.error}</div>}
        {state && !state.error && (
          text != null
            ? <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">{text}</pre>
            : <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {state.preview ? 'Binary content — download to view.' : 'Too large to preview — download to view.'}
            </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function ObjectPage() {
  const { api, apiUrl } = useConfig()
  const { notifyError, notifySuccess } = useNotifications()
  const { confirm } = useConfirmDialog()
  const [params, setParams] = useSearchParams()
  const bucket = params.get('bucket')
  const [filter, setFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const buckets = useApiQuery('/api/object/buckets', {}, { refreshMs: 15000 })
  const objects = useApiQuery(bucket ? '/api/object/list' : null, { bucket })

  const select = (b) => {
    const p = new URLSearchParams(params)
    if (b) p.set('bucket', b)
    else p.delete('bucket')
    setParams(p, { replace: true })
  }

  useEffect(() => {
    if (!bucket && buckets.data?.length) select(buckets.data[0].bucket)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets.data, bucket])

  const current = buckets.data?.find((b) => b.bucket === bucket)
  const matcher = makeMatcher(filter, false)
  const list = useMemo(() => (objects.data || []).filter((o) => !o.deleted && matcher.test(o.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objects.data, filter])

  const refreshAll = () => { objects.reload({ silent: true }); buckets.reload() }

  const upload = async (files) => {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const file of files) {
        if (file.size > MAX_UPLOAD) {
          notifyError('File too large', `${file.name} is ${formatBytes(file.size)}; uploads from the browser are limited to ${formatBytes(MAX_UPLOAD)}.`, 'object')
          continue
        }
        const content = await readAsBase64(file)
        await api('/api/object/put', { method: 'POST', body: { bucket, name: file.name, content, encoding: 'base64' } })
        notifySuccess('Uploaded', `${file.name} (${formatBytes(file.size)})`, 'object')
      }
      refreshAll()
    } catch (err) {
      notifyError('Upload failed', err.message, 'object')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeObject = async (o) => {
    if (!(await confirm(`Delete "${o.name}"?`, 'The object and its chunks are removed from the bucket.', { confirmLabel: 'Delete' }))) return
    try {
      await api('/api/object/delete', { method: 'POST', body: { bucket, name: o.name } })
      notifySuccess('Object deleted', o.name, 'object')
      refreshAll()
    } catch (err) {
      notifyError('Delete failed', err.message, 'object')
    }
  }

  const bucketAction = async (action) => {
    const ok = action === 'delete'
      ? await confirm(`Delete object store "${bucket}"?`, 'All objects are permanently removed.', { confirmLabel: 'Delete bucket', requireText: bucket })
      : await confirm(`Seal "${bucket}"?`, 'A sealed object store becomes read-only. This cannot be undone.', { confirmLabel: 'Seal' })
    if (!ok) return
    try {
      await api(`/api/object/bucket/${action}`, { method: 'POST', body: { bucket } })
      notifySuccess(action === 'delete' ? 'Bucket deleted' : 'Bucket sealed', bucket, 'object')
      if (action === 'delete') select(null)
      buckets.reload()
    } catch (err) {
      notifyError('Action failed', err.message, 'object')
    }
  }

  return (
    <div>
      <PageHeader
        title="Object Store"
        icon={Boxes}
        description="Browse, upload and download objects in JetStream object stores"
        actions={<Button onClick={() => setCreateOpen(true)}><Plus size={15} /> New bucket</Button>}
      />

      {buckets.error && !buckets.data ? <ConnectionError error={buckets.error} onRetry={buckets.reload} />
        : !buckets.data ? <LoadingState cards={0} />
          : buckets.data.length === 0 ? (
            <div className="surface-card">
              <EmptyState icon={Boxes} title="No object stores" description="Object stores hold files and blobs of any size, chunked into a stream."
                action={<Button onClick={() => setCreateOpen(true)}><Plus size={15} /> New bucket</Button>} />
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
              <div className="surface-card h-fit overflow-hidden">
                <div className="card-header justify-between"><span className="card-title">Buckets</span><span className="text-[11px] text-muted-foreground">{buckets.data.length}</span></div>
                <nav className="max-h-[60vh] space-y-0.5 overflow-y-auto p-1.5">
                  {buckets.data.map((b) => (
                    <button key={b.bucket} type="button" onClick={() => select(b.bucket)}
                      className={cn('flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                        b.bucket === bucket ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                      <span className="truncate font-mono">{b.bucket}</span>
                      <span className="shrink-0 font-mono text-[10px] opacity-70">{formatBytes(b.size)}</span>
                    </button>
                  ))}
                </nav>
              </div>

              <div
                className="min-w-0 space-y-4"
                onDragOver={(e) => { if (current && !current.sealed) e.preventDefault() }}
                onDrop={(e) => { if (current && !current.sealed) { e.preventDefault(); upload([...e.dataTransfer.files]) } }}
              >
                {current && (
                  <div className="surface-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-mono text-base font-semibold">
                          {current.bucket}
                          {current.sealed && <StatusBadge status="warn">sealed</StatusBadge>}
                        </div>
                        {current.description && <div className="text-xs text-muted-foreground">{current.description}</div>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => upload([...e.target.files])} />
                        <Button size="sm" variant="outline" onClick={() => objects.reload()}><RefreshCw size={13} /> Refresh</Button>
                        <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading || current.sealed}>
                          <Upload size={13} /> {uploading ? 'Uploading…' : 'Upload'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => bucketAction('seal')} disabled={current.sealed} title="Seal bucket"><Lock size={13} /></Button>
                        <Button size="sm" variant="ghost" className="hover:text-nats-error" onClick={() => bucketAction('delete')} title="Delete bucket"><Trash2 size={13} /></Button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                      {[
                        ['Objects', formatNumber(list.length)],
                        ['Size', formatBytes(current.size)],
                        ['TTL', current.ttlMs ? nsToHuman(current.ttlMs * 1e6) : 'none'],
                        ['Storage', `${current.storage} · R${current.replicas}`],
                      ].map(([k, v]) => (
                        <div key={k}><span className="text-muted-foreground">{k} </span><span className="font-mono">{v}</span></div>
                      ))}
                    </div>
                  </div>
                )}

                <SearchInput value={filter} onChange={setFilter} placeholder="Filter objects…" />
                {objects.error ? <div className="text-sm text-nats-error">{objects.error}</div> : (
                  <div className="premium-table-wrap max-h-[60vh] overflow-y-auto">
                    <table className="premium-table">
                      <thead className="sticky top-0 z-10 bg-card"><tr><th>Name</th><th>Size</th><th>Chunks</th><th>Modified</th><th className="w-28"><span className="sr-only">Actions</span></th></tr></thead>
                      <tbody>
                        {objects.loading && !objects.data && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Loading objects…</td></tr>}
                        {objects.data && list.length === 0 && (
                          <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">
                            {objects.data.length ? 'No objects match.' : current?.sealed ? 'This bucket is empty.' : 'Empty bucket — upload files or drop them here.'}
                          </td></tr>
                        )}
                        {list.map((o) => (
                          <tr key={o.name}>
                            <td className="max-w-[360px] truncate font-mono text-xs" title={o.name}>
                              {o.name}
                              {o.link && <StatusBadge status="info" className="ml-2">link → {o.link.bucket}</StatusBadge>}
                            </td>
                            <td className="font-mono text-xs">{formatBytes(o.size)}</td>
                            <td className="font-mono text-xs text-muted-foreground">{o.chunks}</td>
                            <td className="text-xs text-muted-foreground" title={formatDateTime(o.mtime)}>{formatDateTime(o.mtime) === '—' ? '—' : timeAgo(o.mtime)}</td>
                            <td>
                              <div className="flex justify-end gap-0.5">
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Preview" onClick={() => setPreview({ bucket, name: o.name })}><Eye size={13} /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Download" asChild>
                                  <a href={apiUrl('/api/object/download', { bucket, name: o.name })} download={o.name.split('/').pop()}><Download size={13} /></a>
                                </Button>
                                {!current?.sealed && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-nats-error" title="Delete" onClick={() => removeObject(o)}><Trash2 size={13} /></Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

      <CreateBucketDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={async (cfg) => {
          await api('/api/object/bucket/create', { method: 'POST', body: cfg })
          notifySuccess('Object store created', cfg.bucket, 'object')
          await buckets.reload()
          select(cfg.bucket)
        }}
      />
      <PreviewDialog target={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
