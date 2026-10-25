import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft, ChevronsDown, CircleMinus, Code2, Copy, CopyPlus, Database, Eraser, Lock, MoreHorizontal, PencilLine, Terminal, Trash2,
} from 'lucide-react'
import { useJetStreamData } from '../../../hooks/useJetStreamData'
import { useStreamTimeseries } from '../../../hooks/useStreamTimeseries'
import { useConfig } from '../../../context/ConfigContext'
import { useStreamMutation } from '../../../hooks/useStreamMutation'
import { normalizeRetention } from '../../../utils/retention'
import { formatBytes, formatCompact, formatNumber, formatRate } from '../../../utils/byteFormatter'
import { timeAgo } from '../../../utils/duration'
import { useConfirmDialog } from '../../../components/shared/ConfirmDialogProvider'
import { UpdateStreamModal } from '../../../components/modals/UpdateStreamModal'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'
import { PollState } from '../../../components/shared/PageState'
import { EmptyState } from '../../../components/shared/EmptyState'
import { CopyButton } from '../../../components/shared/CopyButton'
import { useNotifications } from '../../../context/NotificationContext'

import { AnalyticsTab }  from './tabs/AnalyticsTab'
import { PropertiesTab } from './tabs/PropertiesTab'
import { ConsumersTab }  from './tabs/ConsumersTab'
import { MessagesTab }   from './tabs/MessagesTab'
import { RelationsTab }  from './tabs/RelationsTab'
import { PublishTab }    from './tabs/PublishTab'
import { ScheduleTab }   from './tabs/ScheduleTab'
import { StreamSwitcherSidebar } from './components/StreamSwitcherSidebar'

const TAB_IDS = ['analytics', 'messages', 'consumers', 'publish', 'properties', 'relations', 'schedule']
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl'

function Stat({ label, value, title }) {
  return (
    <div className="min-w-0 px-4 py-3" title={title}>
      <div className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-mono text-base font-semibold tabular">{value}</div>
    </div>
  )
}

function NameDialog({ open, title, description, label, initial, extra, submitLabel, onSubmit, onClose }) {
  const [name, setName] = useState(initial)
  const [extraValue, setExtraValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (open) { setName(initial); setExtraValue(''); setError('') }
  }, [open, initial])

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(name.trim(), extraValue.trim())
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="rounded-md border border-nats-error/40 bg-nats-error/10 px-3 py-2 text-sm text-nats-error">{error}</div>}
          <div>
            <label className="field-label">{label}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono" autoFocus />
          </div>
          {extra && (
            <div>
              <label className="field-label">{extra.label}</label>
              <Input value={extraValue} onChange={(e) => setExtraValue(e.target.value)} placeholder={extra.placeholder} className="font-mono" />
              {extra.hint && <p className="field-hint">{extra.hint}</p>}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Working…' : submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function StreamDetailPage() {
  const { name } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState(null) // 'edit' | 'duplicate' | 'mirror'
  const [preview, setPreview] = useState(null) // { title, content }
  const { confirm } = useConfirmDialog()
  const { connection } = useConfig()
  const { notifyError, notifySuccess } = useNotifications()
  const api = useStreamMutation()

  const { data, error, lastFetch, refetch, streams } = useJetStreamData()
  const series = useStreamTimeseries(streams, lastFetch, { cacheKey: `jsz:${connection?.id}` })

  const tab = TAB_IDS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'analytics'
  const stream = useMemo(() => streams.find((s) => s.name === name) || null, [streams, name])
  const streamName = stream?.name || name
  const consumers = stream?.consumer_detail ?? []
  const points = series.get(streamName) ?? []
  const latest = points.length > 1 ? points[points.length - 1] : null
  const cfg = stream?.config || {}
  const followerCount = (stream?.cluster?.replicas || []).filter((r) => !r.current).length

  const setTab = (id) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', id)
    setSearchParams(next, { replace: true })
  }

  const run = async (fn, ok) => {
    setBusy(true)
    try {
      const res = await fn()
      if (ok) notifySuccess('Done', typeof ok === 'function' ? ok(res) : ok, 'stream')
      refetch()
      return res
    } catch (err) {
      notifyError('Action failed', err.message, 'stream')
      return null
    } finally {
      setBusy(false)
    }
  }

  const actions = {
    edit: () => setDialog('edit'),
    duplicate: () => setDialog('duplicate'),
    mirror: () => setDialog('mirror'),
    stepDown: async () => {
      if (!(await confirm('Step down the stream leader?', 'A new leader is elected among the replicas. Clients may see a brief pause.', { confirmLabel: 'Step down', destructive: false }))) return
      run(() => api.stepDownLeader(streamName), 'Leader step-down requested.')
    },
    removeFollowers: async () => {
      if (!(await confirm('Remove lagging followers?', 'Replicas that are not current are removed; JetStream re-places them on other servers.', { confirmLabel: 'Remove' }))) return
      run(() => api.removeFollowers(streamName), (r) => (r?.removed?.length ? `Removed ${r.removed.join(', ')}` : r?.skipped || 'Nothing to remove.'))
    },
    cli: () => run(async () => {
      const r = await api.getStreamCliConfig(streamName)
      setPreview({ title: 'NATS CLI command', content: r.cli })
    }),
    terraform: () => run(async () => {
      const r = await api.getStreamTerraformConfig(streamName)
      setPreview({ title: 'Terraform', content: r.terraform })
    }),
    purge: async () => {
      if (!(await confirm(`Purge all messages in "${streamName}"?`, `${formatNumber(stream?.state?.messages ?? 0)} messages will be removed. Configuration and consumers are kept.`, { confirmLabel: 'Purge' }))) return
      run(() => api.purgeStream(streamName), (r) => `${formatNumber(r?.purged ?? 0)} messages purged.`)
    },
    seal: async () => {
      if (!(await confirm(`Seal "${streamName}"?`, 'A sealed stream rejects new messages, deletes and purges. This cannot be undone.', { confirmLabel: 'Seal stream', requireText: streamName }))) return
      run(() => api.sealStream(streamName), 'Stream sealed.')
    },
    delete: async () => {
      if (!(await confirm(`Delete stream "${streamName}"?`, 'The stream, its messages and all consumers are permanently removed.', { confirmLabel: 'Delete stream', requireText: streamName }))) return
      const res = await run(() => api.deleteStream(streamName), `"${streamName}" deleted.`)
      if (res) navigate('/streams')
    },
  }

  // Keyboard shortcuts (ignored while typing)
  const actionsRef = useRef(actions)
  actionsRef.current = actions
  useEffect(() => {
    if (!stream) return undefined
    const onKeyDown = (e) => {
      const el = document.activeElement
      if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      const a = actionsRef.current
      if (mod && !e.shiftKey && key === 'e') { e.preventDefault(); a.edit() }
      else if (mod && e.shiftKey && key === 'd') { e.preventDefault(); a.duplicate() }
      else if (mod && e.shiftKey && key === 'm') { e.preventDefault(); a.mirror() }
      else if (!mod && !e.altKey && /^[1-7]$/.test(e.key)) { setTab(TAB_IDS[Number(e.key) - 1]) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(stream), searchParams])

  useEffect(() => {
    document.title = `${name} · Streams · NATS Dashboard`
  }, [name])

  const tabs = [
    { id: 'analytics', label: 'Overview' },
    { id: 'messages', label: 'Messages' },
    { id: 'consumers', label: 'Consumers', count: consumers.length },
    { id: 'publish', label: 'Publish' },
    { id: 'properties', label: 'Configuration' },
    { id: 'relations', label: 'Relations' },
    { id: 'schedule', label: 'Purge & schedules' },
  ]

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
      <StreamSwitcherSidebar streams={streams} currentStreamName={streamName} currentSearch={location.search} />
      <div className="min-w-0 flex-1 p-4 sm:p-6">
        <PollState data={data} error={error} onRetry={refetch}>
          {!stream ? (
            <div className="surface-card">
              <EmptyState icon={Database} title={`Stream "${name}" not found`} description="It may have been deleted, or it lives on another connection."
                action={<Link to="/streams" className="link text-sm">Back to streams</Link>} />
            </div>
          ) : (
            <div className="space-y-5">
              {/* Header */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-2">
                  <Link to="/streams" className="mt-0.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Back to streams">
                    <ChevronLeft size={18} />
                  </Link>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="truncate font-mono text-lg font-semibold">{stream.name}</h1>
                      <CopyButton text={stream.name} />
                      {cfg.sealed && <StatusBadge status="warn">sealed</StatusBadge>}
                      {cfg.mirror && <StatusBadge status="info">mirror of {cfg.mirror.name}</StatusBadge>}
                      {stream.kind !== 'stream' && <StatusBadge status="accent">{stream.kind === 'kv' ? 'KV bucket' : 'object store'}</StatusBadge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {cfg.description ? `${cfg.description} · ` : ''}{cfg.storage ?? 'file'} · {normalizeRetention(cfg.retention)} retention · R{cfg.num_replicas ?? 1}
                      {stream.cluster?.leader ? ` · leader ${stream.cluster.leader}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" onClick={actions.edit} disabled={busy || cfg.sealed}><PencilLine size={14} /> Edit</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" disabled={busy} aria-label="More actions"><MoreHorizontal size={15} /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuLabel>Stream actions</DropdownMenuLabel>
                      <DropdownMenuItem onSelect={actions.edit} disabled={cfg.sealed}><PencilLine size={14} /> Edit configuration<DropdownMenuShortcut>{MOD}E</DropdownMenuShortcut></DropdownMenuItem>
                      <DropdownMenuItem onSelect={actions.duplicate}><CopyPlus size={14} /> Duplicate…<DropdownMenuShortcut>{MOD}⇧D</DropdownMenuShortcut></DropdownMenuItem>
                      <DropdownMenuItem onSelect={actions.mirror}><Copy size={14} /> Create mirror…<DropdownMenuShortcut>{MOD}⇧M</DropdownMenuShortcut></DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={actions.cli}><Terminal size={14} /> Show CLI command</DropdownMenuItem>
                      <DropdownMenuItem onSelect={actions.terraform}><Code2 size={14} /> Show Terraform</DropdownMenuItem>
                      {stream.cluster?.leader && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={actions.stepDown}><ChevronsDown size={14} /> Step down leader</DropdownMenuItem>
                          <DropdownMenuItem onSelect={actions.removeFollowers} disabled={followerCount === 0}><CircleMinus size={14} /> Remove lagging followers</DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={actions.purge} disabled={cfg.sealed || cfg.deny_purge}><Eraser size={14} /> Purge messages</DropdownMenuItem>
                      <DropdownMenuItem onSelect={actions.seal} disabled={cfg.sealed}><Lock size={14} /> Seal stream</DropdownMenuItem>
                      <DropdownMenuItem onSelect={actions.delete} className="text-nats-error focus:text-nats-error"><Trash2 size={14} /> Delete stream</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Stat strip */}
              <div className="surface-card grid grid-cols-2 divide-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
                <Stat label="Messages" value={formatCompact(stream.state?.messages ?? 0)} title={formatNumber(stream.state?.messages)} />
                <Stat label="Size" value={formatBytes(stream.state?.bytes ?? 0)} />
                <Stat label="Ingest" value={latest ? formatRate(latest.msgsPerSec) : '—'} />
                <Stat label="Consumers" value={formatNumber(stream.state?.consumer_count ?? consumers.length)} />
                <Stat label="Sequence" value={`${formatCompact(stream.state?.first_seq ?? 0)} → ${formatCompact(stream.state?.last_seq ?? 0)}`} title={`${formatNumber(stream.state?.first_seq)} → ${formatNumber(stream.state?.last_seq)}`} />
                <Stat label="Last message" value={stream.state?.last_seq ? timeAgo(stream.state?.last_ts) : 'never'} title={stream.state?.last_ts} />
              </div>

              {/* Tabs */}
              <div className="premium-tabs" role="tablist">
                {tabs.map((t) => (
                  <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                    className={`premium-tab-btn ${tab === t.id ? 'premium-tab-btn-active' : ''}`}>
                    {t.label}
                    {t.count > 0 && <span className="rounded-full bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">{t.count}</span>}
                  </button>
                ))}
              </div>

              {/* key = stream name so per-tab state never leaks between streams */}
              <div key={stream.name}>
                {tab === 'analytics'  && <AnalyticsTab points={points} stream={stream} />}
                {tab === 'properties' && <PropertiesTab stream={stream} onUpdate={(n, c) => api.updateStream(n, c).then((r) => { refetch(); return r })} />}
                {tab === 'consumers'  && <ConsumersTab consumers={consumers} lastFetch={lastFetch} stream={stream} onChanged={refetch} />}
                {tab === 'messages'   && <MessagesTab stream={stream} />}
                {tab === 'relations'  && <RelationsTab stream={stream} allStreams={streams} />}
                {tab === 'publish'    && <PublishTab stream={stream} />}
                {tab === 'schedule'   && <ScheduleTab stream={stream} onPurged={refetch} />}
              </div>
            </div>
          )}
        </PollState>
      </div>

      <UpdateStreamModal
        open={dialog === 'edit'}
        stream={streamName}
        config={cfg}
        onClose={() => setDialog(null)}
        onSave={async (n, c) => {
          await api.updateStream(n, c)
          notifySuccess('Stream updated', `"${n}" was updated.`, 'stream')
          refetch()
        }}
      />
      <NameDialog
        open={dialog === 'duplicate'}
        title="Duplicate stream"
        description="Creates a new stream with the same configuration. Without subjects, the copy sources all messages from this stream."
        label="New stream name"
        initial={`${streamName}_copy`}
        extra={{ label: 'Subjects (optional)', placeholder: 'e.g. orders-copy.>', hint: 'Must not overlap with this stream\'s subjects' }}
        submitLabel="Duplicate"
        onClose={() => setDialog(null)}
        onSubmit={async (target, subjects) => {
          const config = subjects ? { subjects: subjects.split(',').map((s) => s.trim()).filter(Boolean) } : undefined
          await api.duplicateStream(streamName, target, config)
          notifySuccess('Stream duplicated', `"${target}" created.`, 'stream')
          refetch()
        }}
      />
      <NameDialog
        open={dialog === 'mirror'}
        title="Create mirror"
        description="A mirror is a read-only replica that copies every message from this stream."
        label="Mirror stream name"
        initial={`${streamName}_mirror`}
        extra={{ label: 'Filter subject (optional)', placeholder: 'e.g. orders.created' }}
        submitLabel="Create mirror"
        onClose={() => setDialog(null)}
        onSubmit={async (target, filter) => {
          await api.createMirrorStream(streamName, target, filter ? { filter_subject: filter } : {})
          notifySuccess('Mirror created', `"${target}" mirrors "${streamName}".`, 'stream')
          refetch()
        }}
      />
      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{preview?.title}</DialogTitle></DialogHeader>
          <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/50 p-3 font-mono text-xs">{preview?.content}</pre>
          <DialogFooter className="gap-2">
            <CopyButton text={preview?.content} label="Copy" className="rounded-md border border-border px-3 py-1.5" />
            <Button onClick={() => setPreview(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
