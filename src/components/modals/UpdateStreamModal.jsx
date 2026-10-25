import { useEffect, useState } from 'react'
import { normalizeRetention } from '../../utils/retention'
import { nsToDuration, parseDurationToNs } from '../../utils/duration'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'

const NAME_RE = /^[^\s.*>/\\]+$/

const blankForm = {
  name: '',
  description: '',
  subjects: '',
  storage: 'file',
  retention: 'limits',
  num_replicas: '1',
  max_msgs: '',
  max_bytes: '',
  max_age: '',
  max_msg_size: '',
  max_msgs_per_subject: '',
  discard: 'old',
  discard_new_per_subject: false,
  duplicate_window: '2m',
  allow_direct: true,
  allow_rollup_hdrs: false,
  deny_delete: false,
  deny_purge: false,
  compression: 'none',
}

const limitToField = (v) => (v == null || v < 0 ? '' : String(v))

function configToForm(cfg = {}) {
  return {
    ...blankForm,
    name: cfg.name || '',
    description: cfg.description || '',
    subjects: (cfg.subjects || []).join(', '),
    storage: cfg.storage || 'file',
    retention: normalizeRetention(cfg.retention),
    num_replicas: String(cfg.num_replicas || 1),
    max_msgs: limitToField(cfg.max_msgs),
    max_bytes: limitToField(cfg.max_bytes),
    max_age: cfg.max_age ? nsToDuration(cfg.max_age) : '',
    max_msg_size: limitToField(cfg.max_msg_size),
    max_msgs_per_subject: limitToField(cfg.max_msgs_per_subject),
    discard: cfg.discard || 'old',
    discard_new_per_subject: Boolean(cfg.discard_new_per_subject),
    duplicate_window: cfg.duplicate_window ? nsToDuration(cfg.duplicate_window) : '',
    allow_direct: Boolean(cfg.allow_direct),
    allow_rollup_hdrs: Boolean(cfg.allow_rollup_hdrs),
    deny_delete: Boolean(cfg.deny_delete),
    deny_purge: Boolean(cfg.deny_purge),
    compression: cfg.compression || 'none',
  }
}

function parseLimit(v, label) {
  if (v === '' || v == null) return -1
  const n = Number(v)
  if (!Number.isInteger(n) || n < -1) throw new Error(`${label} must be a whole number (empty = unlimited)`)
  return n === 0 ? -1 : n
}

function formToConfig(form, { creating }) {
  const cfg = {}
  if (creating) {
    const name = form.name.trim()
    if (!NAME_RE.test(name)) throw new Error('Stream name is required and cannot contain spaces, ".", "*", ">" or slashes')
    cfg.name = name
    cfg.storage = form.storage
  }
  const subjects = form.subjects.split(',').map((s) => s.trim()).filter(Boolean)
  if (creating && subjects.length === 0) throw new Error('At least one subject is required (e.g. orders.>)')
  if (subjects.length) cfg.subjects = subjects
  cfg.description = form.description.trim() || undefined
  cfg.retention = form.retention
  cfg.num_replicas = Number(form.num_replicas) || 1
  cfg.max_msgs = parseLimit(form.max_msgs, 'Max messages')
  cfg.max_bytes = parseLimit(form.max_bytes, 'Max bytes')
  cfg.max_msg_size = parseLimit(form.max_msg_size, 'Max message size')
  cfg.max_msgs_per_subject = parseLimit(form.max_msgs_per_subject, 'Max messages per subject')
  const maxAge = parseDurationToNs(form.max_age)
  if (maxAge === null) throw new Error('Max age must be a duration like 24h, 7d or 1h30m')
  cfg.max_age = maxAge
  const dupe = parseDurationToNs(form.duplicate_window)
  if (dupe === null) throw new Error('Duplicate window must be a duration like 2m')
  if (dupe > 0) cfg.duplicate_window = dupe
  cfg.discard = form.discard
  cfg.discard_new_per_subject = form.discard === 'new' && form.discard_new_per_subject
  cfg.allow_direct = form.allow_direct
  cfg.allow_rollup_hdrs = form.allow_rollup_hdrs
  cfg.deny_delete = form.deny_delete
  cfg.deny_purge = form.deny_purge
  cfg.compression = form.compression
  return cfg
}

function Field({ label, hint, children, className }) {
  return (
    <div className={className}>
      <label className="field-label">{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}

function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={`flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-2.5 ${disabled ? 'opacity-50' : 'hover:bg-muted/40'}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}

/**
 * Create (no `stream`) or edit (with `stream` + `config`) a stream.
 * onSave(streamName, config) for edits, onSave(null, config) for creates.
 */
export function UpdateStreamModal({ open, stream, config, onClose, onSave }) {
  const creating = !stream
  const [form, setForm] = useState(blankForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(creating ? blankForm : configToForm(config))
      setError('')
    }
  }, [open, config, creating])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    let cfg
    try {
      cfg = formToConfig(form, { creating })
    } catch (err) {
      setError(err.message)
      return
    }
    setSaving(true)
    try {
      await onSave(creating ? null : stream, cfg)
      onClose()
    } catch (err) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const isMirror = Boolean(config?.mirror)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{creating ? 'Create stream' : <>Edit stream <span className="font-mono">{stream}</span></>}</DialogTitle>
          <DialogDescription>
            {creating ? 'Streams capture messages published on their subjects.' : 'Storage type cannot be changed after creation. Some changes (e.g. retention) may be rejected by the server.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div role="alert" className="rounded-md border border-nats-error/40 bg-nats-error/10 px-3 py-2 text-sm text-nats-error">{error}</div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {creating ? (
              <Field label="Name *">
                <Input value={form.name} onChange={set('name')} placeholder="ORDERS" className="font-mono" autoFocus required />
              </Field>
            ) : null}
            <Field label="Description" className={creating ? '' : 'sm:col-span-2'}>
              <Input value={form.description} onChange={set('description')} placeholder="Optional" />
            </Field>
            <Field label={creating ? 'Subjects *' : 'Subjects'} hint="Comma separated, wildcards allowed (orders.>, events.*)" className="sm:col-span-2">
              <Input value={form.subjects} onChange={set('subjects')} placeholder="orders.>, payments.*" className="font-mono" disabled={isMirror}
                title={isMirror ? 'Mirrors do not have subjects' : undefined} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Storage" hint={creating ? undefined : 'Fixed at creation'}>
              <select className="input-enterprise" value={form.storage} onChange={set('storage')} disabled={!creating}>
                <option value="file">File</option>
                <option value="memory">Memory</option>
              </select>
            </Field>
            <Field label="Retention">
              <select className="input-enterprise" value={form.retention} onChange={set('retention')}>
                <option value="limits">Limits</option>
                <option value="interest">Interest</option>
                <option value="workqueue">Work queue</option>
              </select>
            </Field>
            <Field label="Replicas">
              <select className="input-enterprise" value={form.num_replicas} onChange={set('num_replicas')}>
                {['1', '3', '5'].map((r) => <option key={r} value={r}>{r}</option>)}
                {!['1', '3', '5'].includes(form.num_replicas) && <option value={form.num_replicas}>{form.num_replicas}</option>}
              </select>
            </Field>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Limits <span className="font-normal normal-case">— leave empty for unlimited</span></div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Max age" hint="e.g. 24h, 7d, 1h30m"><Input value={form.max_age} onChange={set('max_age')} placeholder="unlimited" className="font-mono" /></Field>
              <Field label="Max messages"><Input type="number" min="-1" value={form.max_msgs} onChange={set('max_msgs')} placeholder="unlimited" className="font-mono" /></Field>
              <Field label="Max bytes"><Input type="number" min="-1" value={form.max_bytes} onChange={set('max_bytes')} placeholder="unlimited" className="font-mono" /></Field>
              <Field label="Max message size (bytes)"><Input type="number" min="-1" value={form.max_msg_size} onChange={set('max_msg_size')} placeholder="server default" className="font-mono" /></Field>
              <Field label="Max msgs per subject"><Input type="number" min="-1" value={form.max_msgs_per_subject} onChange={set('max_msgs_per_subject')} placeholder="unlimited" className="font-mono" /></Field>
              <Field label="Duplicate window" hint="Deduplication by Nats-Msg-Id"><Input value={form.duplicate_window} onChange={set('duplicate_window')} placeholder="2m" className="font-mono" /></Field>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="When limits are reached">
              <select className="input-enterprise" value={form.discard} onChange={set('discard')}>
                <option value="old">Discard old messages</option>
                <option value="new">Reject new messages</option>
              </select>
            </Field>
            <Field label="Compression">
              <select className="input-enterprise" value={form.compression} onChange={set('compression')} disabled={form.storage === 'memory'}>
                <option value="none">None</option>
                <option value="s2">S2</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle checked={form.allow_direct} onChange={set('allow_direct')} label="Allow direct get" hint="Faster reads of individual messages" />
            <Toggle checked={form.allow_rollup_hdrs} onChange={set('allow_rollup_hdrs')} label="Allow rollups" hint="Nats-Rollup header can purge a subject" />
            <Toggle checked={form.deny_delete} onChange={set('deny_delete')} label="Deny message delete" hint="Block deleting messages via the API" />
            <Toggle checked={form.deny_purge} onChange={set('deny_purge')} label="Deny purge" hint="Block purging via the API" />
            <Toggle checked={form.discard_new_per_subject} onChange={set('discard_new_per_subject')} disabled={form.discard !== 'new'} label="Discard new per subject" hint="Apply 'reject new' per subject (needs max msgs per subject)" />
          </div>

          <DialogFooter className="gap-2 pt-1">
            <Button type="button" onClick={onClose} variant="outline" disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : creating ? 'Create stream' : 'Save changes'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
