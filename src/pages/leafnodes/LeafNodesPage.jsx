import { Leaf } from 'lucide-react'
import { useNatsPolling } from '../../hooks/useNatsPolling'
import { useTableSort } from '../../hooks/useTableSort'
import { SortableTh } from '../../components/ui/SortableTh'
import { MetricCard } from '../../components/ui/MetricCard'
import { PageHeader } from '../../components/shared/PageHeader'
import { PollState } from '../../components/shared/PageState'
import { EmptyState } from '../../components/shared/EmptyState'
import { formatBytes, formatCompact, formatNumber } from '../../utils/byteFormatter'

function Leafs({ data }) {
  const leafs = data.leafs ?? []
  const { sortedData, sortBy, sortDir, handleSort } = useTableSort(leafs, {
    defaultSortBy: 'name',
    getSortValue: (l, key) => (key === 'addr' ? `${l.ip}:${l.port}` : l[key] ?? (key === 'name' || key === 'account' ? '' : 0)),
  })
  const th = (k, l) => <SortableTh sortKey={k} currentSortBy={sortBy} currentSortDir={sortDir} onSort={handleSort}>{l}</SortableTh>

  if (leafs.length === 0) {
    return (
      <div className="surface-card">
        <EmptyState icon={Leaf} title="No leaf nodes connected" description="Leaf nodes extend this server to edge sites, remote offices or devices."
          hint="Configure a leafnodes block to accept or create leaf node connections." />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Leaf nodes" value={formatNumber(leafs.length)} />
        <MetricCard label="Accounts" value={formatNumber(new Set(leafs.map((l) => l.account)).size)} />
        <MetricCard label="Msgs in" value={formatCompact(leafs.reduce((s, l) => s + (l.in_msgs ?? 0), 0))} />
        <MetricCard label="Msgs out" value={formatCompact(leafs.reduce((s, l) => s + (l.out_msgs ?? 0), 0))} />
      </div>
      <div className="premium-table-wrap">
        <table className="premium-table">
          <thead><tr>{th('name', 'Name')}{th('account', 'Account')}{th('addr', 'Address')}{th('rtt', 'RTT')}{th('in_msgs', 'Msgs in')}{th('out_msgs', 'Msgs out')}{th('in_bytes', 'Bytes in')}{th('out_bytes', 'Bytes out')}{th('subscriptions', 'Subs')}</tr></thead>
          <tbody>
            {sortedData.map((l) => (
              <tr key={`${l.account}-${l.ip}:${l.port}`}>
                <td className="font-mono text-xs font-medium">{l.name || '—'}</td>
                <td className="font-mono text-xs">{l.account}</td>
                <td className="font-mono text-xs">{l.ip}:{l.port}</td>
                <td className="font-mono text-xs text-muted-foreground">{l.rtt || '—'}</td>
                <td className="font-mono text-xs">{formatCompact(l.in_msgs ?? 0)}</td>
                <td className="font-mono text-xs">{formatCompact(l.out_msgs ?? 0)}</td>
                <td className="font-mono text-xs text-muted-foreground">{formatBytes(l.in_bytes ?? 0)}</td>
                <td className="font-mono text-xs text-muted-foreground">{formatBytes(l.out_bytes ?? 0)}</td>
                <td className="font-mono text-xs">{formatNumber(l.subscriptions ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function LeafNodesPage() {
  const { data, error, refetch } = useNatsPolling('/leafz')
  return (
    <div>
      <PageHeader title="Leaf Nodes" icon={Leaf} description="Leaf node connections bridged to this server" />
      <PollState data={data} error={error} onRetry={refetch} endpoint="leafz">
        {data && <Leafs data={data} />}
      </PollState>
    </div>
  )
}
