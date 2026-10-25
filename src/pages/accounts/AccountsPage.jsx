import { useMemo } from 'react'
import { Users } from 'lucide-react'
import { useNatsPolling } from '../../hooks/useNatsPolling'
import { useTableSort } from '../../hooks/useTableSort'
import { SortableTh } from '../../components/ui/SortableTh'
import { MetricCard } from '../../components/ui/MetricCard'
import { PageHeader } from '../../components/shared/PageHeader'
import { PollState } from '../../components/shared/PageState'
import { EmptyState } from '../../components/shared/EmptyState'
import { formatBytes, formatCompact, formatNumber } from '../../utils/byteFormatter'

function Accounts({ data }) {
  const accounts = useMemo(() => (data.account_statz ?? []).map((a) => ({
    name: a.acc ?? a.name ?? '',
    conns: a.conns ?? 0,
    leafnodes: a.leafnodes ?? 0,
    subs: a.num_subscriptions ?? 0,
    sentMsgs: a.sent?.msgs ?? 0,
    sentBytes: a.sent?.bytes ?? 0,
    recvMsgs: a.received?.msgs ?? 0,
    recvBytes: a.received?.bytes ?? 0,
    slow: a.slow_consumers ?? 0,
  })), [data])
  const { sortedData, sortBy, sortDir, handleSort } = useTableSort(accounts, { defaultSortBy: 'name' })
  const th = (k, l) => <SortableTh sortKey={k} currentSortBy={sortBy} currentSortDir={sortDir} onSort={handleSort}>{l}</SortableTh>

  if (!accounts.length) {
    return <div className="surface-card"><EmptyState icon={Users} title="No account statistics" description="No accounts were reported by this server." /></div>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Accounts" value={formatNumber(accounts.length)} />
        <MetricCard label="Connections" value={formatNumber(accounts.reduce((s, a) => s + a.conns, 0))} />
        <MetricCard label="Subscriptions" value={formatNumber(accounts.reduce((s, a) => s + a.subs, 0))} />
        <MetricCard label="Slow consumers" value={formatNumber(accounts.reduce((s, a) => s + a.slow, 0))} tone={accounts.some((a) => a.slow) ? 'warn' : 'default'} />
      </div>
      <div className="premium-table-wrap">
        <table className="premium-table">
          <thead><tr>{th('name', 'Account')}{th('conns', 'Clients')}{th('leafnodes', 'Leafnodes')}{th('subs', 'Subs')}{th('sentMsgs', 'Msgs sent')}{th('sentBytes', 'Bytes sent')}{th('recvMsgs', 'Msgs received')}{th('recvBytes', 'Bytes received')}{th('slow', 'Slow')}</tr></thead>
          <tbody>
            {sortedData.map((a) => (
              <tr key={a.name}>
                <td className="max-w-[280px] truncate font-mono text-xs font-medium" title={a.name}>{a.name}</td>
                <td className="font-mono text-xs">{formatNumber(a.conns)}</td>
                <td className="font-mono text-xs">{formatNumber(a.leafnodes)}</td>
                <td className="font-mono text-xs">{formatNumber(a.subs)}</td>
                <td className="font-mono text-xs" title={formatNumber(a.sentMsgs)}>{formatCompact(a.sentMsgs)}</td>
                <td className="font-mono text-xs text-muted-foreground">{formatBytes(a.sentBytes)}</td>
                <td className="font-mono text-xs" title={formatNumber(a.recvMsgs)}>{formatCompact(a.recvMsgs)}</td>
                <td className="font-mono text-xs text-muted-foreground">{formatBytes(a.recvBytes)}</td>
                <td className={`font-mono text-xs ${a.slow ? 'text-nats-warn' : 'text-muted-foreground'}`}>{formatNumber(a.slow)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function AccountsPage() {
  const { data, error, refetch } = useNatsPolling('/accstatz?unused=true')
  return (
    <div>
      <PageHeader title="Accounts" icon={Users} description="Per-account connection and traffic statistics" />
      <PollState data={data} error={error} onRetry={refetch} endpoint="accstatz">
        {data && <Accounts data={data} />}
      </PollState>
    </div>
  )
}
