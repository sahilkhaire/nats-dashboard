import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Columns3, Database, MoreHorizontal, Pencil, Plus, Trash2, Eraser } from 'lucide-react'
import { useJetStreamData } from '../../hooks/useJetStreamData'
import { useConfig } from '../../context/ConfigContext'
import { useStreamMutation } from '../../hooks/useStreamMutation'
import { useTableSort } from '../../hooks/useTableSort'
import { usePagination } from '../../hooks/usePagination'
import { useStreamTimeseries } from '../../hooks/useStreamTimeseries'
import { formatBytes, formatBytesRate, formatCompact, formatNumber, formatRate } from '../../utils/byteFormatter'
import { normalizeRetention } from '../../utils/retention'
import { timeAgo } from '../../utils/duration'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { SortableTh } from '../../components/ui/SortableTh'
import { MetricCard } from '../../components/ui/MetricCard'
import { Button } from '../../components/ui/button'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { UpdateStreamModal } from '../../components/modals/UpdateStreamModal'
import { PaginationBar } from '../../components/shared/PaginationBar'
import { PageHeader } from '../../components/shared/PageHeader'
import { PollState } from '../../components/shared/PageState'
import { SearchInput, makeMatcher } from '../../components/shared/SearchInput'
import { EmptyState } from '../../components/shared/EmptyState'
import { Sparkline } from '../../components/charts/TimeSeriesChart'
import { useConfirmDialog } from '../../components/shared/ConfirmDialogProvider'
import { useNotifications } from '../../context/NotificationContext'

const COLUMNS = [
  { key: 'subjects',      label: 'Subjects',  default: true },
  { key: 'retention',     label: 'Retention', default: true },
  { key: 'storage',       label: 'Storage',   default: true },
  { key: 'messages',      label: 'Messages',  default: true },
  { key: 'bytes',         label: 'Size',      default: true },
  { key: 'msgs_per_sec',  label: 'Msgs/s',    default: true },
  { key: 'bytes_per_sec', label: 'Bytes/s',   default: false },
  { key: 'traffic',       label: 'Traffic',   default: true },
  { key: 'consumers',     label: 'Consumers', default: true },
  { key: 'first_seq',     label: 'First seq', default: false },
  { key: 'last_seq',      label: 'Last seq',  default: false },
  { key: 'num_subjects',  label: 'Unique subjects', default: false },
  { key: 'last_ts',       label: 'Last message', default: true },
]
const COLS_KEY = 'nats-stream-columns'

function loadColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLS_KEY) || 'null')
    if (saved && typeof saved === 'object') return { ...Object.fromEntries(COLUMNS.map((c) => [c.key, c.default])), ...saved }
  } catch { /* ignore */ }
  return Object.fromEntries(COLUMNS.map((c) => [c.key, c.default]))
}

export function StreamsPage() {
  const navigate = useNavigate()
  const { confirm } = useConfirmDialog()
  const { connection } = useConfig()
  const { notifyError, notifySuccess } = useNotifications()
  const { createStream, deleteStream, updateStream, purgeStream } = useStreamMutation()
  const { data, error, lastFetch, refetch, streams: allStreams } = useJetStreamData()

  const [modal, setModal] = useState(null) // { mode: 'create' } | { mode: 'edit', name }
  const [search, setSearch] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const [kind, setKind] = useState('stream')
  const [filterRetention, setFilterRetention] = useState('all')
  const [filterStorage, setFilterStorage] = useState('all')
  const [visible, setVisible] = useState(loadColumns)

  const series = useStreamTimeseries(allStreams, lastFetch, { cacheKey: `jsz:${connection?.id}` })
  const rateOf = (name) => {
    const pts = series.get(name)
    return pts && pts.length > 1 ? pts[pts.length - 1] : null
  }

  const counts = useMemo(() => ({
    stream: allStreams.filter((s) => s.kind === 'stream').length,
    kv: allStreams.filter((s) => s.kind === 'kv').length,
    object: allStreams.filter((s) => s.kind === 'object').length,
  }), [allStreams])

  const matcher = makeMatcher(search, useRegex)
  const filtered = useMemo(() => allStreams.filter((s) =>
    (kind === 'all' || s.kind === kind)
    && (matcher.test(s.name) || (s.config?.subjects || []).some((subj) => matcher.test(subj)) || (!useRegex && matcher.test(s.config?.description)))
    && (filterRetention === 'all' || normalizeRetention(s.config?.retention) === filterRetention)
    && (filterStorage === 'all' || (s.config?.storage ?? 'file') === filterStorage)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [allStreams, kind, search, useRegex, filterRetention, filterStorage])

  const { sortedData, sortBy, sortDir, handleSort } = useTableSort(filtered, {
    defaultSortBy: 'name',
    getSortValue: (s, key) => {
      switch (key) {
        case 'name': return s.name ?? ''
        case 'subjects': return (s.config?.subjects ?? []).join(',')
        case 'retention': return normalizeRetention(s.config?.retention)
        case 'storage': return s.config?.storage ?? ''
        case 'consumers': return s.state?.consumer_count ?? 0
        case 'msgs_per_sec':
        case 'traffic': return rateOf(s.name)?.msgsPerSec ?? 0
        case 'bytes_per_sec': return rateOf(s.name)?.bytesPerSec ?? 0
        case 'last_ts': return s.state?.last_ts ? new Date(s.state.last_ts).getTime() : 0
        default: return s.state?.[key] ?? 0
      }
    },
  })
  const { pagedData, page, pageSize, totalPages, totalItems, setPage, setPageSize } = usePagination(sortedData, 25)

  const totals = useMemo(() => {
    let messages = 0, bytes = 0, rate = 0
    for (const s of allStreams) {
      if (s.kind !== 'stream') continue
      messages += s.state?.messages ?? 0
      bytes += s.state?.bytes ?? 0
      rate += rateOf(s.name)?.msgsPerSec ?? 0
    }
    return { messages, bytes, rate }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allStreams, series])

  const toggleColumn = (key) => setVisible((prev) => {
    const next = { ...prev, [key]: !prev[key] }
    try { localStorage.setItem(COLS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })

  const handleDelete = async (s) => {
    const ok = await confirm(`Delete stream "${s.name}"?`, 'The stream, its messages and all of its consumers are permanently removed.', { confirmLabel: 'Delete stream', requireText: s.name })
    if (!ok) return
    try {
      await deleteStream(s.name)
      notifySuccess('Stream deleted', `"${s.name}" was deleted.`, 'stream')
      refetch()
    } catch (err) {
      notifyError('Delete failed', err.message, 'stream')
    }
  }

  const handlePurge = async (s) => {
    const ok = await confirm(`Purge all messages in "${s.name}"?`, `${formatNumber(s.state?.messages ?? 0)} messages will be removed. The stream and its configuration are kept.`, { confirmLabel: 'Purge' })
    if (!ok) return
    try {
      const res = await purgeStream(s.name)
      notifySuccess('Stream purged', `${formatNumber(res.purged)} messages removed from "${s.name}".`, 'stream')
      refetch()
    } catch (err) {
      notifyError('Purge failed', err.message, 'stream')
    }
  }

  const handleSave = async (name, config) => {
    if (name) {
      await updateStream(name, config)
      notifySuccess('Stream updated', `"${name}" was updated.`, 'stream')
      refetch()
    } else {
      await createStream(config)
      notifySuccess('Stream created', `"${config.name}" is ready.`, 'stream')
      refetch()
      navigate(`/streams/${encodeURIComponent(config.name)}`)
    }
  }

  const editing = modal?.mode === 'edit' ? allStreams.find((s) => s.name === modal.name) : null
  const show = (k) => visible[k]
  const th = (key, label, cls) => <SortableTh sortKey={key} currentSortBy={sortBy} currentSortDir={sortDir} onSort={handleSort} className={cls}>{label}</SortableTh>
  const visibleCount = COLUMNS.filter((c) => visible[c.key]).length + 2
  const filtersActive = search || filterRetention !== 'all' || filterStorage !== 'all'

  return (
    <div>
      <PageHeader
        title="Streams"
        icon={Database}
        description="Persistent message logs captured by JetStream"
        actions={<Button onClick={() => setModal({ mode: 'create' })}><Plus size={15} /> New stream</Button>}
      />
      <PollState data={data} error={error} onRetry={refetch}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="Streams" value={formatNumber(counts.stream)} subtext={`${counts.kv} KV · ${counts.object} object stores`} />
            <MetricCard label="Messages" value={formatCompact(totals.messages)} subtext={totals.messages >= 1000 ? formatNumber(totals.messages) : 'in user streams'} />
            <MetricCard label="Stored" value={formatBytes(totals.bytes)} />
            <MetricCard label="Ingest" value={formatRate(totals.rate)} subtext="across all streams" />
          </div>

          <div className="flex flex-wrap items-start gap-2">
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); setPage(1) }}
              placeholder="Filter by name, subject or description…"
              regex={useRegex}
              onRegexChange={setUseRegex}
              error={matcher.error}
              className="max-w-md"
            />
            <div className="flex rounded-md border border-input bg-background p-0.5 text-xs shadow-sm">
              {[['stream', `Streams (${counts.stream})`], ['kv', `KV (${counts.kv})`], ['object', `Objects (${counts.object})`], ['all', 'All']].map(([id, label]) => (
                <button key={id} type="button" onClick={() => { setKind(id); setPage(1) }}
                  className={`rounded px-2.5 py-1.5 transition-colors ${kind === id ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                  {label}
                </button>
              ))}
            </div>
            <select value={filterRetention} onChange={(e) => { setFilterRetention(e.target.value); setPage(1) }} className="input-enterprise w-auto" aria-label="Retention">
              <option value="all">Any retention</option>
              <option value="limits">Limits</option>
              <option value="interest">Interest</option>
              <option value="workqueue">Work queue</option>
            </select>
            <select value={filterStorage} onChange={(e) => { setFilterStorage(e.target.value); setPage(1) }} className="input-enterprise w-auto" aria-label="Storage">
              <option value="all">Any storage</option>
              <option value="file">File</option>
              <option value="memory">Memory</option>
            </select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-auto h-9"><Columns3 size={14} /> Columns</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {COLUMNS.map((c) => (
                  <DropdownMenuCheckboxItem key={c.key} checked={!!visible[c.key]} onCheckedChange={() => toggleColumn(c.key)} onSelect={(e) => e.preventDefault()}>
                    {c.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {allStreams.length === 0 ? (
            <div className="surface-card">
              <EmptyState icon={Database} title="No streams yet" description="Create a stream to start persisting messages published on its subjects."
                action={<Button onClick={() => setModal({ mode: 'create' })}><Plus size={15} /> New stream</Button>} />
            </div>
          ) : (
            <div className="premium-table-wrap">
              <table className="premium-table">
                <thead>
                  <tr>
                    {th('name', 'Name', 'sticky left-0 z-10 bg-muted')}
                    {show('subjects') && th('subjects', 'Subjects')}
                    {show('retention') && th('retention', 'Retention')}
                    {show('storage') && th('storage', 'Storage')}
                    {show('messages') && th('messages', 'Messages')}
                    {show('bytes') && th('bytes', 'Size')}
                    {show('msgs_per_sec') && th('msgs_per_sec', 'Msgs/s')}
                    {show('bytes_per_sec') && th('bytes_per_sec', 'Bytes/s')}
                    {show('traffic') && th('traffic', 'Traffic')}
                    {show('consumers') && th('consumers', 'Consumers')}
                    {show('first_seq') && th('first_seq', 'First seq')}
                    {show('last_seq') && th('last_seq', 'Last seq')}
                    {show('num_subjects') && th('num_subjects', 'Unique subj.')}
                    {show('last_ts') && th('last_ts', 'Last message')}
                    <th className="w-10"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedData.length === 0 && (
                    <tr>
                      <td colSpan={visibleCount} className="py-10 text-center text-muted-foreground">
                        {filtersActive ? 'No streams match the current filters.' : 'Nothing in this view.'}
                      </td>
                    </tr>
                  )}
                  {pagedData.map((s) => {
                    const r = rateOf(s.name)
                    const subjects = s.config?.subjects ?? []
                    return (
                      <tr key={`${s.account}-${s.name}`} className="group">
                        <td className="sticky left-0 z-10 bg-card group-hover:bg-muted">
                          <Link to={`/streams/${encodeURIComponent(s.name)}`} className="font-mono font-medium text-foreground hover:text-primary">
                            {s.name}
                          </Link>
                          {s.config?.sealed && <StatusBadge status="warn" className="ml-2">sealed</StatusBadge>}
                          {s.config?.mirror && <StatusBadge status="info" className="ml-2">mirror</StatusBadge>}
                          {s.kind !== 'stream' && <StatusBadge status="accent" className="ml-2">{s.kind === 'kv' ? 'KV' : 'object'}</StatusBadge>}
                        </td>
                        {show('subjects') && (
                          <td>
                            {subjects.length > 0 ? (
                              <span className="flex items-center gap-1" title={subjects.join('\n')}>
                                <span className="chip max-w-[200px] truncate">{subjects[0]}</span>
                                {subjects.length > 1 && <span className="text-xs text-muted-foreground">+{subjects.length - 1}</span>}
                              </span>
                            ) : <span className="text-xs text-muted-foreground">{s.config?.mirror ? `mirror of ${s.config.mirror.name}` : s.config?.sources?.length ? `${s.config.sources.length} source(s)` : '—'}</span>}
                          </td>
                        )}
                        {show('retention') && <td className="text-xs">{normalizeRetention(s.config?.retention)}</td>}
                        {show('storage') && <td className="text-xs">{s.config?.storage ?? 'file'}{s.config?.num_replicas > 1 ? ` · R${s.config.num_replicas}` : ''}</td>}
                        {show('messages') && <td className="font-mono tabular" title={formatNumber(s.state?.messages)}>{formatCompact(s.state?.messages ?? 0)}</td>}
                        {show('bytes') && <td className="font-mono text-xs tabular">{formatBytes(s.state?.bytes ?? 0)}</td>}
                        {show('msgs_per_sec') && <td className={`font-mono text-xs tabular ${r?.msgsPerSec > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{r ? formatRate(r.msgsPerSec, '') : '—'}</td>}
                        {show('bytes_per_sec') && <td className="font-mono text-xs tabular text-muted-foreground">{r ? formatBytesRate(r.bytesPerSec) : '—'}</td>}
                        {show('traffic') && <td><Sparkline points={series.get(s.name)?.slice(1)} dataKey="msgsPerSec" format={(v) => formatRate(v)} /></td>}
                        {show('consumers') && <td className="font-mono text-xs tabular">{s.state?.consumer_count ?? 0}</td>}
                        {show('first_seq') && <td className="font-mono text-xs text-muted-foreground">{formatNumber(s.state?.first_seq)}</td>}
                        {show('last_seq') && <td className="font-mono text-xs text-muted-foreground">{formatNumber(s.state?.last_seq)}</td>}
                        {show('num_subjects') && <td className="font-mono text-xs">{formatNumber(s.state?.num_subjects ?? 0)}</td>}
                        {show('last_ts') && <td className="text-xs text-muted-foreground" title={s.state?.last_ts}>{s.state?.last_seq ? timeAgo(s.state?.last_ts) : 'never'}</td>}
                        <td>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${s.name}`}><MoreHorizontal size={15} /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onSelect={() => navigate(`/streams/${encodeURIComponent(s.name)}?tab=messages`)}>View messages</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setModal({ mode: 'edit', name: s.name })} disabled={s.config?.sealed}><Pencil size={13} /> Edit</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => handlePurge(s)} disabled={s.config?.sealed || s.config?.deny_purge}><Eraser size={13} /> Purge</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => handleDelete(s)} className="text-nats-error focus:text-nats-error"><Trash2 size={13} /> Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalItems > 25 && (
            <PaginationBar page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} pageSizes={[25, 50, 100, 250]} />
          )}
          {lastFetch && <p className="text-right text-[11px] text-muted-foreground">Rates are computed between refreshes and need two samples.</p>}
        </div>
      </PollState>

      <UpdateStreamModal
        open={Boolean(modal)}
        stream={modal?.mode === 'edit' ? modal.name : null}
        config={editing?.config}
        onClose={() => setModal(null)}
        onSave={handleSave}
      />
    </div>
  )
}
