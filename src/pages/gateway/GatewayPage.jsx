import { ArrowDownToLine, ArrowUpFromLine, Globe } from 'lucide-react'
import { useNatsPolling } from '../../hooks/useNatsPolling'
import { MetricCard } from '../../components/ui/MetricCard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { PageHeader } from '../../components/shared/PageHeader'
import { PollState } from '../../components/shared/PageState'
import { EmptyState } from '../../components/shared/EmptyState'
import { formatCompact, formatNumber } from '../../utils/byteFormatter'

function GatewayTable({ title, icon: Icon, rows }) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="card-header justify-between">
        <span className="flex items-center gap-2"><Icon size={13} className="text-muted-foreground" /><span className="card-title">{title}</span></span>
        <span className="text-[11px] text-muted-foreground">{rows.length}</span>
      </div>
      {rows.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">None</div> : (
        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead><tr><th>Gateway</th><th>Address</th><th>RTT</th><th>Msgs in</th><th>Msgs out</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((g, i) => (
                <tr key={`${g.name}-${g.cid ?? i}`}>
                  <td className="font-mono text-xs font-medium">{g.name}</td>
                  <td className="font-mono text-xs">{g.ip ? `${g.ip}:${g.port}` : '—'}</td>
                  <td className="font-mono text-xs text-muted-foreground">{g.rtt || '—'}</td>
                  <td className="font-mono text-xs">{formatCompact(g.in_msgs ?? 0)}</td>
                  <td className="font-mono text-xs">{formatCompact(g.out_msgs ?? 0)}</td>
                  <td><StatusBadge status={g.connected ? 'ok' : 'warn'}>{g.connected ? 'connected' : 'connecting'}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** /gatewayz maps gateway name → { connection } (outbound) or [{ connection }] (inbound). */
function flatten(map) {
  const rows = []
  for (const [name, value] of Object.entries(map || {})) {
    for (const item of Array.isArray(value) ? value : [value]) {
      const c = item?.connection || {}
      rows.push({ name, cid: c.cid, ip: c.ip, port: c.port, rtt: c.rtt, in_msgs: c.in_msgs, out_msgs: c.out_msgs, connected: Boolean(c.cid) })
    }
  }
  return rows
}

export function GatewayPage() {
  const { data, error, refetch } = useNatsPolling('/gatewayz')
  const outbound = flatten(data?.outbound_gateways)
  const inbound = flatten(data?.inbound_gateways)
  const configured = Boolean(data?.name) || outbound.length > 0 || inbound.length > 0

  return (
    <div>
      <PageHeader title="Gateways" icon={Globe} description="Connections between clusters in a supercluster" />
      <PollState data={data} error={error} onRetry={refetch} endpoint="gatewayz">
        {data && (!configured ? (
          <div className="surface-card">
            <EmptyState icon={Globe} title="No gateways configured" description="Gateways join separate clusters (for example across regions) into a supercluster."
              hint="Configure a gateway block in the server config to enable them." />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <MetricCard label="This gateway" value={<span className="text-lg">{data.name || '—'}</span>} subtext={data.host ? `${data.host}:${data.port}` : undefined} />
              <MetricCard label="Outbound" value={formatNumber(outbound.length)} />
              <MetricCard label="Inbound" value={formatNumber(inbound.length)} />
              <MetricCard label="Remote clusters" value={formatNumber(new Set([...outbound, ...inbound].map((g) => g.name)).size)} />
            </div>
            <GatewayTable title="Outbound" icon={ArrowUpFromLine} rows={outbound} />
            <GatewayTable title="Inbound" icon={ArrowDownToLine} rows={inbound} />
          </div>
        ))}
      </PollState>
    </div>
  )
}
