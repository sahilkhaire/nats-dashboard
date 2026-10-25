import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Clock, Flame, Plus, RotateCcw, X as XIcon } from 'lucide-react'
import { useStreamMutation } from '../../../../hooks/useStreamMutation'
import { useConfirmDialog } from '../../../../components/shared/ConfirmDialogProvider'
import { useNotifications } from '../../../../context/NotificationContext'
import { Button } from '../../../../components/ui/button'
import { Input } from '../../../../components/ui/input'
import { StatusBadge } from '../../../../components/ui/StatusBadge'
import { formatNumber } from '../../../../utils/byteFormatter'
import { toDateTimeLocal, formatDateTime, timeAgo } from '../../../../utils/duration'
import { cn } from '../../../../lib/utils'

const INTERVALS = [
  { label: 'Every hour', value: 3_600_000, display: '1h' },
  { label: 'Every 6 hours', value: 21_600_000, display: '6h' },
  { label: 'Every 12 hours', value: 43_200_000, display: '12h' },
  { label: 'Every day', value: 86_400_000, display: '24h' },
  { label: 'Every week', value: 604_800_000, display: '7d' },
]

const STATUS = { active: 'ok', running: 'warn', done: 'neutral', error: 'error' }

function ScheduleForm({ streamName, onCreate, onCancel }) {
  const [type, setType] = useState('once')
  const [runAt, setRunAt] = useState(() => toDateTimeLocal(new Date(Date.now() + 3_600_000)))
  const [intervalMs, setIntervalMs] = useState(INTERVALS[3].value)
  const [subject, setSubject] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const params = { stream: streamName, type, subject: subject.trim() || undefined }
    if (type === 'once') {
      const ts = new Date(runAt)
      if (!Number.isFinite(ts.getTime()) || ts <= new Date()) { setError('Pick a time in the future.'); return }
      params.runAt = ts.toISOString()
    } else {
      params.intervalMs = intervalMs
      params.intervalLabel = INTERVALS.find((o) => o.value === intervalMs)?.display
    }
    setSaving(true)
    try {
      await onCreate(params)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 border-b border-border bg-muted/30 p-4">
      <div className="flex rounded-md border border-input bg-background p-0.5 text-xs w-fit">
        {[['once', 'One-time'], ['recurring', 'Recurring']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setType(id)}
            className={cn('rounded px-3 py-1.5 font-medium', type === id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {type === 'once' ? (
          <div><label className="field-label">Run at</label><Input type="datetime-local" value={runAt} onChange={(e) => setRunAt(e.target.value)} /></div>
        ) : (
          <div>
            <label className="field-label">Repeat</label>
            <select className="input-enterprise" value={intervalMs} onChange={(e) => setIntervalMs(Number(e.target.value))}>
              {INTERVALS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
        <div><label className="field-label">Subject filter <span className="font-normal">(optional)</span></label><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="all subjects" className="font-mono" /></div>
      </div>
      {error && <div className="text-xs text-nats-error">{error}</div>}
      <p className="text-[11px] text-muted-foreground">Schedules are kept in the dashboard server&apos;s memory and are lost if it restarts.</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Create schedule'}</Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}

export function ScheduleTab({ stream, onPurged }) {
  const streamName = stream.name
  const { confirm } = useConfirmDialog()
  const { notifyError, notifySuccess } = useNotifications()
  const { listSchedules, createSchedule, deleteSchedule, purgeStream } = useStreamMutation()
  const [schedules, setSchedules] = useState(null)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [purgeSubject, setPurgeSubject] = useState('')
  const [keep, setKeep] = useState('')
  const [purging, setPurging] = useState(false)
  const blocked = stream.config?.sealed ? 'Sealed streams cannot be purged.' : stream.config?.deny_purge ? 'Purging is disabled for this stream (deny purge).' : null

  const reload = useCallback(async () => {
    try {
      setSchedules(await listSchedules(streamName))
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [listSchedules, streamName])

  useEffect(() => {
    reload()
    const t = setInterval(reload, 10_000)
    return () => clearInterval(t)
  }, [reload])

  const handlePurge = async (e) => {
    e.preventDefault()
    const subj = purgeSubject.trim()
    const keepN = keep.trim() ? Number(keep) : undefined
    if (keepN != null && (!Number.isInteger(keepN) || keepN < 0)) { notifyError('Invalid value', 'Keep must be a whole number.', 'stream'); return }
    const what = `${subj ? `messages on "${subj}"` : 'all messages'}${keepN ? `, keeping the newest ${keepN}` : ''}`
    if (!(await confirm(`Purge ${streamName}?`, `This permanently deletes ${what}.`, { confirmLabel: 'Purge' }))) return
    setPurging(true)
    try {
      const res = await purgeStream(streamName, subj || undefined, keepN != null ? { keep: keepN } : {})
      notifySuccess('Purged', `${formatNumber(res.purged ?? 0)} messages removed from ${streamName}.`, 'stream')
      onPurged?.()
    } catch (err) {
      notifyError('Purge failed', err.message, 'stream')
    } finally {
      setPurging(false)
    }
  }

  const handleDelete = async (id) => {
    if (!(await confirm('Cancel scheduled purge?', 'No further purges will run from this schedule.', { confirmLabel: 'Cancel schedule' }))) return
    try { await deleteSchedule(id); reload() } catch (err) { setError(err.message) }
  }

  return (
    <div className="space-y-4">
      <form className="surface-card overflow-hidden" onSubmit={handlePurge}>
        <div className="card-header"><Flame size={13} className="text-nats-error" /><span className="card-title">Purge now</span></div>
        <div className="space-y-3 p-4">
          {blocked ? <div className="text-sm text-nats-warn">{blocked}</div> : (
            <>
              <p className="text-xs text-muted-foreground">Delete messages immediately. Optionally limit to a subject, or keep the newest N messages.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={purgeSubject} onChange={(e) => setPurgeSubject(e.target.value)} placeholder="Subject filter (optional)" className="font-mono" />
                <Input type="number" min="0" value={keep} onChange={(e) => setKeep(e.target.value)} placeholder="Keep newest N" className="sm:w-40" />
                <Button type="submit" variant="destructive" disabled={purging} className="shrink-0"><Flame size={14} /> {purging ? 'Purging…' : 'Purge'}</Button>
              </div>
            </>
          )}
        </div>
      </form>

      <div className="surface-card overflow-hidden">
        <div className="card-header justify-between">
          <span className="flex items-center gap-2"><CalendarClock size={13} className="text-muted-foreground" /><span className="card-title">Scheduled purges</span></span>
          <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)} disabled={Boolean(blocked)}><Plus size={13} /> Add</Button>
        </div>
        {showForm && (
          <ScheduleForm
            streamName={streamName}
            onCancel={() => setShowForm(false)}
            onCreate={async (params) => {
              await createSchedule(params)
              notifySuccess('Schedule created', params.type === 'once' ? `Purge at ${formatDateTime(params.runAt)}` : `Purge ${params.intervalLabel}`, 'stream')
              setShowForm(false)
              reload()
            }}
          />
        )}
        {error && <div className="border-b border-border px-4 py-2 text-xs text-nats-error">{error}</div>}
        {schedules === null ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : schedules.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No scheduled purges.</div>
        ) : (
          <ul className="divide-y divide-border">
            {schedules.map((s) => (
              <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                {s.type === 'recurring' ? <RotateCcw size={14} className="mt-0.5 text-primary" /> : <Clock size={14} className="mt-0.5 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{s.type === 'recurring' ? `Every ${s.intervalLabel}` : 'One-time'}</span>
                    <span className="font-mono text-xs text-muted-foreground">{s.subject || 'all subjects'}</span>
                    <StatusBadge status={STATUS[s.status] || 'neutral'}>{s.status}</StatusBadge>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {s.status !== 'done' && s.nextRun && <>Next run {timeAgo(s.nextRun)} ({formatDateTime(s.nextRun)})</>}
                    {s.lastRun && <> · last run {timeAgo(s.lastRun)}{s.lastPurged != null ? `, ${formatNumber(s.lastPurged)} purged` : ''}</>}
                  </div>
                  {s.error && <div className="mt-1 text-[11px] text-nats-error">{s.error}</div>}
                </div>
                {s.status !== 'done' && (
                  <button type="button" onClick={() => handleDelete(s.id)} className="rounded p-1 text-muted-foreground hover:text-nats-error" title="Cancel schedule"><XIcon size={13} /></button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
