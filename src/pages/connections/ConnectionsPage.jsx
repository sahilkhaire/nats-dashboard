import { useState, useMemo, Fragment } from 'react'
import { ChevronDown, ChevronRight, Network } from 'lucide-react'
import { useNatsPolling } from '../../hooks/useNatsPolling'
import { useTableSort } from '../../hooks/useTableSort'
import { usePagination } from '../../hooks/usePagination'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { SortableTh } from '../../components/ui/SortableTh'
import { MetricCard } from '../../components/ui/MetricCard'
import { AlertBanner } from '../../components/ui/AlertBanner'
import { PageHeader } from '../../components/shared/PageHeader'
import { PollState } from '../../components/shared/PageState'
import { SearchInput, makeMatcher } from '../../components/shared/SearchInput'
import { PaginationBar } from '../../components/shared/PaginationBar'
import { EmptyState } from '../../components/shared/EmptyState'
import { formatBytes, formatCompact, formatNumber } from '../../utils/byteFormatter'

export function ConnectionsPage() {
  const { data, error, refetch } = useNatsPolling('/connz?subs=1&state=open&limit=1024&sort=cid')
  const [expanded, setExpanded] = useState(() => new Set())
  const [search, setSearch] = useState('')

  const conns = useMemo(() => data?.connections ?? [], [data])
  const pending = conns.filter((c) => (c.pending_bytes ?? 0) > 0)
  const matcher = makeMatcher(search, false)

  const filtered = useMemo(
    () => (search ? conns.filter((c) => [c.cid, c.ip, c.name, c.lang, c.account, c.authorized_user, c.kind].some((v) => matcher.test(v))) : conns),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conns, search],
  )

  const { sortedData, sortBy, sortDir, handleSort } = useTableSort(filtered, {
    defaultSortBy: 'cid',
    getSortValue: (c, key) => {
      switch (key) {
        case 'ip_port': return `${c.ip ?? ''}:${c.port ?? ''}`
        case 'uptime': return c.start ? new Date(c.start).getTime() : 0
        default: return c[key] ?? ''
      }
    },
  })
  const { pagedData, page, pageSize, totalPages, totalItems, setPage, setPageSize } = usePagination(sortedData, 25)

  const toggle = (cid) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(cid)) next.delete(cid)
    else next.add(cid)
    return next
  })

  const th = (key, label, cls) => <SortableTh sortKey={key} currentSortBy={sortBy} currentSortDir={sortDir} onSort={handleSort} className={cls}>{label}</SortableTh>

  return (
    <div>
      <PageHeader title="Connections" icon={Network} description="Clients currently connected to this server" />
      <PollState data={data} error={error} onRetry={refetch} endpoint="connz">
        {data && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <MetricCard label="Open connections" value={formatNumber(data.num_connections ?? conns.length)} subtext={data.total > conns.length ? `showing ${conns.length} of ${formatNumber(data.total)}` : undefined} />
              <MetricCard label="Subscriptions" value={formatNumber(conns.reduce((s, c) => s + (c.subscriptions ?? 0), 0))} />
              <MetricCard label="Pending data" value={formatBytes(pending.reduce((s, c) => s + (c.pending_bytes ?? 0), 0))} tone={pending.length ? 'warn' : 'default'} subtext={`${pending.length} connection${pending.length === 1 ? '' : 's'} with buffered data`} />
              <MetricCard label="Languages" value={new Set(conns.map((c) => c.lang).filter(Boolean)).size} subtext={[...new Set(conns.map((c) => c.lang).filter(Boolean))].slice(0, 3).join(', ') || '—'} />
            </div>

            {pending.length > 0 && (
              <AlertBanner variant="warn" title="Connections with pending outbound data">
                {pending.slice(0, 5).map((c) => `${c.name || c.ip}:${c.port} (${formatBytes(c.pending_bytes)})`).join(' · ')}
                {pending.length > 5 && ` · +${pending.length - 5} more`}. Sustained pending data can lead to slow-consumer disconnects.
              </AlertBanner>
            )}

            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Filter by CID, IP, name, language, account…" className="max-w-xl" />

            {conns.length === 0 ? (
              <div className="surface-card"><EmptyState icon={Network} title="No client connections" description="No clients are connected right now." /></div>
            ) : (
              <div className="premium-table-wrap">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th className="w-8" />
                      {th('cid', 'CID')}
                      {th('name', 'Name')}
                      {th('ip_port', 'Address')}
                      {th('account', 'Account')}
                      {th('lang', 'Client')}
                      {th('uptime', 'Uptime')}
                      {th('pending_bytes', 'Pending')}
                      {th('in_msgs', 'Msgs in')}
                      {th('out_msgs', 'Msgs out')}
                      {th('subscriptions', 'Subs')}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedData.length === 0 && (
                      <tr><td colSpan={11} className="py-10 text-center text-muted-foreground">No connections match the filter.</td></tr>
                    )}
                    {pagedData.map((c) => {
                      const open = expanded.has(c.cid)
                      return (
                        <Fragment key={c.cid}>
                          <tr className="cursor-pointer" onClick={() => toggle(c.cid)} aria-expanded={open}>
                            <td className="text-muted-foreground">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                            <td className="font-mono">{c.cid}</td>
                            <td className="max-w-[220px] truncate" title={c.name}>{c.name || <span className="text-muted-foreground">—</span>}</td>
                            <td className="font-mono text-xs">{c.ip}:{c.port}</td>
                            <td className="font-mono text-xs">{c.account || '—'}</td>
                            <td className="text-xs">{c.lang ? <StatusBadge status="neutral">{c.lang}{c.version ? ` ${c.version}` : ''}</StatusBadge> : '—'}</td>
                            <td className="text-xs text-muted-foreground">{c.uptime || '—'}</td>
                            <td className={`font-mono text-xs ${(c.pending_bytes ?? 0) > 0 ? 'text-nats-warn' : 'text-muted-foreground'}`}>{formatBytes(c.pending_bytes ?? 0)}</td>
                            <td className="font-mono text-xs tabular" title={formatNumber(c.in_msgs)}>{formatCompact(c.in_msgs ?? 0)}</td>
                            <td className="font-mono text-xs tabular" title={formatNumber(c.out_msgs)}>{formatCompact(c.out_msgs ?? 0)}</td>
                            <td className="font-mono text-xs tabular">{c.subscriptions ?? 0}</td>
                          </tr>
                          {open && (
                            <tr className="bg-muted/30 hover:bg-muted/30">
                              <td colSpan={11} className="whitespace-normal px-4 py-3">
                                <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
                                  <div><span className="text-muted-foreground">RTT </span><span className="font-mono">{c.rtt || '—'}</span></div>
                                  <div><span className="text-muted-foreground">Idle </span><span className="font-mono">{c.idle || '—'}</span></div>
                                  <div><span className="text-muted-foreground">Bytes in/out </span><span className="font-mono">{formatBytes(c.in_bytes)} / {formatBytes(c.out_bytes)}</span></div>
                                  <div><span className="text-muted-foreground">User </span><span className="font-mono">{c.authorized_user || '—'}</span></div>
                                  {c.tls_version && <div><span className="text-muted-foreground">TLS </span><span className="font-mono">{c.tls_version}</span></div>}
                                </div>
                                <div className="mt-3 text-xs text-muted-foreground">Subscriptions ({c.subscriptions_list?.length ?? 0})</div>
                                <div className="mt-1 flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                                  {(c.subscriptions_list ?? []).map((s, i) => <span key={i} className="chip">{s}</span>)}
                                  {!c.subscriptions_list?.length && <span className="text-xs text-muted-foreground">none</span>}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {totalItems > 25 && (
              <PaginationBar page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} pageSizes={[25, 50, 100, 250]} />
            )}
          </div>
        )}
      </PollState>
    </div>
  )
}
