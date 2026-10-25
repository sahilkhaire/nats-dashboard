import { useEffect, useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { parseDurationToNs } from '../../utils/duration'

const NAME_RE = /^[^\s.*>/\\]+$/

const INITIAL = {
  name: '',
  description: '',
  mode: 'pull',
  deliverSubject: '',
  filter: '',
  deliverPolicy: 'all',
  startSeq: '',
  startTime: '',
  ackPolicy: 'explicit',
  ackWait: '30s',
  maxDeliver: '',
  maxAckPending: '',
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}

export function ConsumerModal({ open, stream, onClose, onCreate }) {
  const [f, setF] = useState(INITIAL)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setF(INITIAL); setError('') }
  }, [open])

  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }))

  const build = () => {
    const name = f.name.trim()
    if (!NAME_RE.test(name)) throw new Error('Name is required and cannot contain spaces, ".", "*", ">" or slashes')
    const cfg = { durable_name: name, name, ack_policy: f.ackPolicy, deliver_policy: f.deliverPolicy }
    if (f.description.trim()) cfg.description = f.description.trim()
    const filters = f.filter.split(',').map((s) => s.trim()).filter(Boolean)
    if (filters.length === 1) cfg.filter_subject = filters[0]
    else if (filters.length > 1) cfg.filter_subjects = filters
    if (f.mode === 'push') {
      if (!f.deliverSubject.trim()) throw new Error('Push consumers need a deliver subject')
      cfg.deliver_subject = f.deliverSubject.trim()
    }
    if (f.deliverPolicy === 'by_start_sequence') {
      const seq = Number(f.startSeq)
      if (!Number.isInteger(seq) || seq < 1) throw new Error('Start sequence must be a positive integer')
      cfg.opt_start_seq = seq
    }
    if (f.deliverPolicy === 'by_start_time') {
      if (!f.startTime) throw new Error('Pick a start time')
      cfg.opt_start_time = new Date(f.startTime).toISOString()
    }
    if (f.ackPolicy !== 'none') {
      const wait = parseDurationToNs(f.ackWait)
      if (wait === null) throw new Error('Ack wait must be a duration such as 30s')
      if (wait > 0) cfg.ack_wait = wait
      if (f.maxAckPending) cfg.max_ack_pending = Number(f.maxAckPending)
    }
    if (f.maxDeliver) cfg.max_deliver = Number(f.maxDeliver)
    return cfg
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    let cfg
    try { cfg = build() } catch (err) { setError(err.message); return }
    setBusy(true)
    try {
      await onCreate(cfg)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New consumer on <span className="font-mono">{stream}</span></DialogTitle>
          <DialogDescription>Creates a durable consumer. Pull consumers are recommended for new applications.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div role="alert" className="rounded-md border border-nats-error/40 bg-nats-error/10 px-3 py-2 text-sm text-nats-error">{error}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name *"><Input value={f.name} onChange={set('name')} className="font-mono" placeholder="processor" autoFocus /></Field>
            <Field label="Type">
              <select className="input-enterprise" value={f.mode} onChange={set('mode')}>
                <option value="pull">Pull</option>
                <option value="push">Push</option>
              </select>
            </Field>
            {f.mode === 'push' && (
              <Field label="Deliver subject *" hint="Messages are pushed to this subject">
                <Input value={f.deliverSubject} onChange={set('deliverSubject')} className="font-mono" placeholder="deliver.processor" />
              </Field>
            )}
            <Field label="Filter subject(s)" hint="Comma separated; empty = all subjects">
              <Input value={f.filter} onChange={set('filter')} className="font-mono" placeholder="orders.created" />
            </Field>
            <Field label="Deliver policy">
              <select className="input-enterprise" value={f.deliverPolicy} onChange={set('deliverPolicy')}>
                <option value="all">All messages</option>
                <option value="last">Last message</option>
                <option value="last_per_subject">Last per subject</option>
                <option value="new">New messages only</option>
                <option value="by_start_sequence">From sequence…</option>
                <option value="by_start_time">From time…</option>
              </select>
            </Field>
            {f.deliverPolicy === 'by_start_sequence' && (
              <Field label="Start sequence"><Input type="number" min="1" value={f.startSeq} onChange={set('startSeq')} className="font-mono" /></Field>
            )}
            {f.deliverPolicy === 'by_start_time' && (
              <Field label="Start time"><Input type="datetime-local" value={f.startTime} onChange={set('startTime')} /></Field>
            )}
            <Field label="Ack policy">
              <select className="input-enterprise" value={f.ackPolicy} onChange={set('ackPolicy')}>
                <option value="explicit">Explicit</option>
                <option value="all">All</option>
                <option value="none">None</option>
              </select>
            </Field>
            {f.ackPolicy !== 'none' && (
              <>
                <Field label="Ack wait"><Input value={f.ackWait} onChange={set('ackWait')} className="font-mono" placeholder="30s" /></Field>
                <Field label="Max ack pending" hint="Empty = server default"><Input type="number" min="-1" value={f.maxAckPending} onChange={set('maxAckPending')} className="font-mono" /></Field>
              </>
            )}
            <Field label="Max deliveries" hint="Empty = unlimited"><Input type="number" min="-1" value={f.maxDeliver} onChange={set('maxDeliver')} className="font-mono" /></Field>
            <Field label="Description"><Input value={f.description} onChange={set('description')} /></Field>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create consumer'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
