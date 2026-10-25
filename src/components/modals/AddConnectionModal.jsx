import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, PlugZap, XCircle } from 'lucide-react'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { apiRequest } from '../../lib/api'
import { normalizeServerUrl } from '../../hooks/useSavedConnections'

const EMPTY = { name: '', monitoringUrl: '', natsUrl: '', token: '' }

/**
 * Add or edit a saved connection. Pass `initial` to edit.
 */
export function AddConnectionModal({ open, onClose, onAdd, onSave, initial }) {
  const [form, setForm] = useState(EMPTY)
  const [test, setTest] = useState(null) // { state: 'running'|'ok'|'error', message }
  const editing = Boolean(initial)

  useEffect(() => {
    if (open) {
      setForm(initial ? { name: initial.name || '', monitoringUrl: initial.monitoringUrl || '', natsUrl: initial.natsUrl || '', token: initial.token || '' } : EMPTY)
      setTest(null)
    }
  }, [open, initial])

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setTest(null) }

  const url = normalizeServerUrl(form.monitoringUrl)
  const isNatsProtocol = /^(nats|tls|ws|wss):\/\//i.test(url)

  const runTest = async () => {
    if (!url) return
    setTest({ state: 'running' })
    const conn = { monitoringUrl: url, natsUrl: form.natsUrl.trim() ? normalizeServerUrl(form.natsUrl) : null, token: form.token.trim() || null }
    try {
      const varz = await apiRequest(conn, '/api/nats-proxy', { query: { path: '/varz' } })
      const name = varz.server_name || varz.server_id?.slice(0, 8) || 'server'
      setTest({ state: 'ok', message: `Connected to ${name}${varz.version ? ` (v${varz.version})` : ''}${varz._via === 'nats_protocol' ? ' via NATS protocol — JetStream views only' : ''}` })
    } catch (err) {
      setTest({ state: 'error', message: err.message })
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!url) return
    const payload = { name: form.name.trim() || url, monitoringUrl: url, natsUrl: form.natsUrl.trim(), token: form.token }
    if (editing) onSave?.(initial.id, payload)
    else onAdd?.(payload)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlugZap size={18} className="text-primary" />
            {editing ? 'Edit connection' : 'Add connection'}
          </DialogTitle>
          <DialogDescription>
            Saved in this browser. Use the HTTP monitoring URL for full visibility, or a NATS URL for JetStream-only access.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label" htmlFor="conn-url">Server URL *</label>
            <Input id="conn-url" value={form.monitoringUrl} onChange={set('monitoringUrl')} placeholder="http://localhost:8222" className="font-mono" required autoFocus />
            <p className="field-hint">
              <span className="font-mono">http://host:8222</span> — monitoring port, all pages ·{' '}
              <span className="font-mono">nats://host:4222</span> — JetStream pages only
            </p>
          </div>
          <div>
            <label className="field-label" htmlFor="conn-name">Display name</label>
            <Input id="conn-name" value={form.name} onChange={set('name')} placeholder="Production cluster" />
          </div>
          {!isNatsProtocol && (
            <div>
              <label className="field-label" htmlFor="conn-nats">NATS URL <span className="font-normal">(optional)</span></label>
              <Input id="conn-nats" value={form.natsUrl} onChange={set('natsUrl')} placeholder="nats://host:4222 — defaults to the same host on port 4222" className="font-mono" />
              <p className="field-hint">Used for JetStream operations (messages, publish, KV, objects). Set it when the client port differs.</p>
            </div>
          )}
          <div>
            <label className="field-label" htmlFor="conn-token">Auth token <span className="font-normal">(optional)</span></label>
            <Input id="conn-token" type="password" value={form.token} onChange={set('token')} placeholder="Token for secured NATS" className="font-mono" autoComplete="off" />
          </div>

          {test && (
            <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
              test.state === 'ok' ? 'border-nats-ok/40 bg-nats-ok/10 text-nats-ok'
                : test.state === 'error' ? 'border-nats-error/40 bg-nats-error/10 text-nats-error'
                  : 'border-border text-muted-foreground'
            }`}>
              {test.state === 'running' ? <Loader2 size={14} className="mt-0.5 animate-spin" />
                : test.state === 'ok' ? <CheckCircle2 size={14} className="mt-0.5" /> : <XCircle size={14} className="mt-0.5" />}
              <span className="break-words">{test.state === 'running' ? 'Testing connection…' : test.message}</span>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={runTest} disabled={!url || test?.state === 'running'}>
              Test connection
            </Button>
            <div className="flex gap-2">
              <Button type="button" onClick={onClose} variant="outline">Cancel</Button>
              <Button type="submit" disabled={!url}>{editing ? 'Save' : 'Add & connect'}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
