import { Server, ServerCog } from 'lucide-react'
import { useNatsPolling } from '../../hooks/useNatsPolling'
import { useTableSort } from '../../hooks/useTableSort'
import { SortableTh } from '../../components/ui/SortableTh'
import { MetricCard } from '../../components/ui/MetricCard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { PageHeader } from '../../components/shared/PageHeader'
import { PollState } from '../../components/shared/PageState'
import { EmptyState } from '../../components/shared/EmptyState'
import { formatBytes, formatCompact, formatNumber } from '../../utils/byteFormatter'

function Routes({ data, varz }) {
  const routes = data.routes ?? []
  const { sortedData, sortBy, sortDir, handleSort } = useTableSort(routes, {
    defaultSortBy: 'remote_name',
    getSortValue: (r, key) => (key === 'remote_name' ? (r.remote_name || r.remote_id || '') : key === 'addr' ? `${r.ip}:${r.port}` : r[key] ?? 0),
  })
  const th = (k, l) => <SortableTh sortKey={k} currentSortBy={sortBy} currentSortDir={sortDir} onSort={handleSort}>{l}</SortableTh>
  const peers = new Set(routes.map((r) => r.remote_name || r.remote_id)).size
  const pending = routes.reduce((s, r) => s + (r.pending_size ?? 0), 0)

  if (routes.length === 0) {
    return (
      <div className="surface-card">
        <EmptyState icon={ServerCog} title="Standalone server" description="No cluster routes are configured. Routes appear when several NATS servers form a cluster."
          hint="Configure a cluster block with routes in each server's config to cluster them." />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Cluster" value={<span className="text-lg">{varz?.cluster?.name || '—'}</span>} />
        <MetricCard label="Peers" value={formatNumber(peers)} subtext={`${routes.length} route connections`} />
        <MetricCard label="Pending" value={formatBytes(pending)} tone={pending > 0 ? 'warn' : 'default'} />
        <MetricCard label="Routes (total)" value={formatNumber(data.num_routes ?? routes.length)} />
      </div>
      <div className="premium-table-wrap">
        <table className="premium-table">
          <thead><tr>{th('remote_name', 'Peer')}{th('addr', 'Address')}{th('rtt', 'RTT')}{th('in_msgs', 'Msgs in')}{th('out_msgs', 'Msgs out')}{th('subscriptions', 'Subs')}{th('pending_size', 'Pending')}<th>Direction</th></tr></thead>
          <tbody>
            {sortedData.map((r) => (
              <tr key={r.rid ?? `${r.remote_id}-${r.ip}-${r.port}`}>
                <td className="font-mono text-xs"><div className="font-medium">{r.remote_name || '—'}</div><div className="text-[11px] text-muted-foreground">{r.remote_id?.slice(0, 12)}…</div></td>
                <td className="font-mono text-xs">{r.ip}:{r.port}</td>
                <td className="font-mono text-xs text-muted-foreground">{r.rtt || '—'}</td>
                <td className="font-mono text-xs" title={formatNumber(r.in_msgs)}>{formatCompact(r.in_msgs ?? 0)}</td>
                <td className="font-mono text-xs" title={formatNumber(r.out_msgs)}>{formatCompact(r.out_msgs ?? 0)}</td>
                <td className="font-mono text-xs">{formatNumber(r.subscriptions ?? 0)}</td>
                <td className={`font-mono text-xs ${(r.pending_size ?? 0) > 0 ? 'text-nats-warn' : 'text-muted-foreground'}`}>{formatBytes(r.pending_size ?? 0)}</td>
                <td><StatusBadge status={r.did_solicit ? 'info' : 'neutral'}>{r.did_solicit ? 'outbound' : 'inbound'}</StatusBadge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ClusterPage() {
  const { data, error, refetch } = useNatsPolling('/routez')
  const { data: varz } = useNatsPolling('/varz')
  return (
    <div>
      <PageHeader title="Cluster" icon={Server} description="Route connections to the other servers in this cluster" />
      <PollState data={data} error={error} onRetry={refetch} endpoint="routez">
        {data && <Routes data={data} varz={varz} />}
      </PollState>
    </div>
  )
}
