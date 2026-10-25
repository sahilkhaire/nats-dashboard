import { Link } from 'react-router-dom'
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Cpu, Database, Info, Lock, MemoryStick, Network,
  Radio, Server, Shield, ShieldOff, Unlock, Waves,
} from 'lucide-react'
import { useNatsPolling } from '../../hooks/useNatsPolling'
import { useConfig } from '../../context/ConfigContext'
import { MetricCard } from '../../components/ui/MetricCard'
import { GaugeBar } from '../../components/ui/GaugeBar'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { AlertBanner } from '../../components/ui/AlertBanner'
import { PageHeader } from '../../components/shared/PageHeader'
import { PollState } from '../../components/shared/PageState'
import { TimeSeriesChart } from '../../components/charts/TimeSeriesChart'
import { formatBytes, formatBytesRate, formatCompact, formatNumber, formatRate } from '../../utils/byteFormatter'
import { formatDateTime } from '../../utils/duration'

const MAX_HISTORY = 90

/** Rolling throughput history derived from successive /varz counters, keyed by fetch time. */
const throughputStores = new Map()

function useThroughputHistory(varz, lastFetch, cacheKey) {
  const ref = {
    get current() { return throughputStores.get(cacheKey) ?? { processedAt: null, prev: null, history: [] } },
    set current(v) { throughputStores.set(cacheKey, v) },
  }
  const st = ref.current
  if (!varz || lastFetch == null || (st.processedAt != null && lastFetch <= st.processedAt) || varz.in_msgs == null) return st.history

  const prev = st.prev
  let history = st.history
  if (prev) {
    const dt = (lastFetch - prev.at) / 1000
    if (dt > 0) {
      const rate = (cur, old) => Math.max(0, (cur - old) / dt)
      history = [...history, {
        ts: lastFetch,
        inMsgs: rate(varz.in_msgs, prev.in_msgs),
        outMsgs: rate(varz.out_msgs, prev.out_msgs),
        inBytes: rate(varz.in_bytes, prev.in_bytes),
        outBytes: rate(varz.out_bytes, prev.out_bytes),
      }].slice(-MAX_HISTORY)
    }
  }
  ref.current = {
    processedAt: lastFetch,
    prev: { at: lastFetch, in_msgs: varz.in_msgs, out_msgs: varz.out_msgs, in_bytes: varz.in_bytes, out_bytes: varz.out_bytes },
    history,
  }
  return history
}

function ChartCard({ title, value, children }) {
  return (
    <div className="surface-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{title}</span>
        <span className="font-mono text-sm tabular text-foreground">{value}</span>
      </div>
      {children}
    </div>
  )
}

function InfoRow({ label, children, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={`min-w-0 break-all text-right text-xs text-foreground ${mono ? 'font-mono' : ''}`}>{children ?? '—'}</span>
    </div>
  )
}

export function OverviewPage() {
  const { data: varz, error, lastFetch, refetch } = useNatsPolling('/varz')
  const { data: jsz } = useNatsPolling('/jsz')
  const { data: health, error: healthError } = useNatsPolling('/healthz')
  const { connection } = useConfig()
  const history = useThroughputHistory(varz, lastFetch, connection?.id)

  const viaProtocol = varz?._via === 'nats_protocol'
  const latest = history[history.length - 1]
  const slowConsumers = varz?.slow_consumers ?? 0
  const apiErrors = jsz?.api?.errors ?? 0
  const healthy = !healthError && health?.status === 'ok'
  const streams = jsz ? (jsz.total_streams ?? jsz.streams ?? 0) : null
  const consumers = jsz ? (jsz.total_consumers ?? jsz.consumers ?? 0) : null
  const isCluster = (varz?.routes ?? 0) > 0 || Boolean(varz?.cluster?.name)

  return (
    <div>
      <PageHeader
        title="Overview"
        icon={Activity}
        description={varz ? `${varz.server_name || 'NATS server'}${varz.version ? ` · v${varz.version}` : ''}${varz.uptime ? ` · up ${varz.uptime}` : ''}` : 'Server health and throughput'}
        actions={varz && (
          <StatusBadge status={healthy ? 'ok' : healthError ? 'error' : 'warn'} dot>
            {healthy ? 'Healthy' : healthError ? 'Unreachable' : (health?.status || 'Checking')}
          </StatusBadge>
        )}
      />

      <PollState data={varz} error={error} onRetry={refetch}>
        {varz && (
          <div className="space-y-5">
            {viaProtocol && (
              <AlertBanner variant="info" title="Connected over the NATS protocol">
                JetStream data is fully available. CPU, memory, connections, subscriptions and cluster details need the
                HTTP monitoring port — add a connection with <span className="font-mono">http://host:8222</span> for the full picture.
              </AlertBanner>
            )}
            {slowConsumers > 0 && (
              <AlertBanner variant="error" title={`${slowConsumers.toLocaleString()} slow consumer event${slowConsumers === 1 ? '' : 's'} since start`}
                action={<Link to="/connections" className="link text-xs">View connections</Link>}>
                Clients could not keep up and were disconnected or dropped messages.
              </AlertBanner>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <MetricCard label="Connections" icon={Network} to={viaProtocol ? undefined : '/connections'}
                value={varz.connections != null ? formatNumber(varz.connections) : '—'}
                subtext={varz.total_connections != null ? `${formatNumber(varz.total_connections)} total since start` : viaProtocol ? 'Needs monitoring port' : undefined} />
              <MetricCard label="Subscriptions" icon={Radio} to={viaProtocol ? undefined : '/subscriptions'}
                value={varz.subscriptions != null ? formatNumber(varz.subscriptions) : '—'} />
              <MetricCard label="Streams" icon={Database} to="/streams"
                value={streams != null ? formatNumber(streams) : '—'}
                subtext={jsz ? `${formatBytes(jsz.storage + jsz.memory)} stored` : 'JetStream'} />
              <MetricCard label="Consumers" icon={Waves} to="/consumers"
                value={consumers != null ? formatNumber(consumers) : '—'}
                subtext={jsz ? `${formatNumber(apiErrors)} API errors` : undefined} />
            </div>

            {/* Throughput */}
            {!viaProtocol && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <ChartCard title="Messages / second" value={latest ? `↓ ${formatRate(latest.inMsgs, '')} · ↑ ${formatRate(latest.outMsgs, '')}` : 'collecting…'}>
                  <TimeSeriesChart
                    data={history}
                    series={[{ key: 'inMsgs', label: 'In' }, { key: 'outMsgs', label: 'Out' }]}
                    format={(v) => formatRate(v)}
                  />
                  <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-chart-1" />In (received)</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-chart-2" />Out (delivered)</span>
                  </div>
                </ChartCard>
                <ChartCard title="Bytes / second" value={latest ? `↓ ${formatBytesRate(latest.inBytes)} · ↑ ${formatBytesRate(latest.outBytes)}` : 'collecting…'}>
                  <TimeSeriesChart
                    data={history}
                    series={[{ key: 'inBytes', label: 'In' }, { key: 'outBytes', label: 'Out' }]}
                    format={formatBytesRate}
                  />
                  <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-chart-1" />In</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-chart-2" />Out</span>
                  </div>
                </ChartCard>
              </div>
            )}

            {/* Totals since start */}
            {!viaProtocol && (
              <div className="surface-card grid grid-cols-2 divide-border md:grid-cols-4 md:divide-x">
                {[
                  { label: 'Messages in', value: formatCompact(varz.in_msgs), full: formatNumber(varz.in_msgs), icon: ArrowDownToLine },
                  { label: 'Messages out', value: formatCompact(varz.out_msgs), full: formatNumber(varz.out_msgs), icon: ArrowUpFromLine },
                  { label: 'Bytes in', value: formatBytes(varz.in_bytes), icon: ArrowDownToLine },
                  { label: 'Bytes out', value: formatBytes(varz.out_bytes), icon: ArrowUpFromLine },
                ].map(({ label, value, full, icon: Icon }) => (
                  <div key={label} className="p-4" title={full}>
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <Icon size={12} /> {label}
                    </div>
                    <div className="mt-1 font-mono text-lg font-semibold tabular">{value}</div>
                    <div className="text-[11px] text-muted-foreground">since server start</div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Resources */}
              <div className="surface-card space-y-4 p-4">
                <div className="card-title">Resources</div>
                {!viaProtocol && (
                  <>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground"><Cpu size={12} /> CPU</span>
                        <span className="font-mono tabular">{varz.cpu != null ? `${varz.cpu.toFixed(1)}%` : '—'}{varz.cores ? ` of ${varz.cores} cores` : ''}</span>
                      </div>
                      {/* /varz cpu is a percentage of one core */}
                      <GaugeBar value={varz.cpu ?? 0} max={(varz.cores || 1) * 100} showPercent={false} />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-muted-foreground"><MemoryStick size={12} /> Memory (RSS)</span>
                      <span className="font-mono tabular">{formatBytes(varz.mem)}</span>
                    </div>
                  </>
                )}
                {jsz && (
                  <>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">JetStream storage</span>
                        <span className="font-mono tabular">{formatBytes(jsz.storage)}{jsz.config?.max_storage > 0 ? ` / ${formatBytes(jsz.config.max_storage)}` : ''}</span>
                      </div>
                      {jsz.config?.max_storage > 0 && <GaugeBar value={jsz.storage} max={jsz.config.max_storage} showPercent={false} />}
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">JetStream memory</span>
                        <span className="font-mono tabular">{formatBytes(jsz.memory)}{jsz.config?.max_memory > 0 ? ` / ${formatBytes(jsz.config.max_memory)}` : ''}</span>
                      </div>
                      {jsz.config?.max_memory > 0 && <GaugeBar value={jsz.memory} max={jsz.config.max_memory} showPercent={false} />}
                    </div>
                  </>
                )}
                {!jsz && viaProtocol && <p className="text-xs text-muted-foreground">Resource metrics need the monitoring port.</p>}
              </div>

              {/* Server info */}
              <div className="surface-card overflow-hidden">
                <div className="card-header"><Server size={13} className="text-primary" /><span className="card-title">Server</span></div>
                <div className="px-4 py-1">
                  <InfoRow label="Name" mono>{varz.server_name}</InfoRow>
                  <InfoRow label="Server ID" mono>{varz.server_id ? `${varz.server_id.slice(0, 16)}…` : '—'}</InfoRow>
                  <InfoRow label="Version" mono>{varz.version}{varz.go ? ` (${varz.go})` : ''}</InfoRow>
                  <InfoRow label="Listen" mono>{varz.host != null && varz.port != null ? `${varz.host}:${varz.port}` : '—'}</InfoRow>
                  <InfoRow label="Max payload" mono>{varz.max_payload ? formatBytes(varz.max_payload) : '—'}</InfoRow>
                  <InfoRow label="Started">{formatDateTime(varz.start)}</InfoRow>
                  <InfoRow label="Security">
                    <span className="inline-flex flex-wrap justify-end gap-1">
                      <StatusBadge status={varz.auth_required ? 'ok' : 'neutral'}>
                        {varz.auth_required ? <Lock size={10} /> : <Unlock size={10} />}{varz.auth_required ? 'Auth' : 'No auth'}
                      </StatusBadge>
                      <StatusBadge status={varz.tls_required ? 'ok' : 'neutral'}>
                        {varz.tls_required ? <Shield size={10} /> : <ShieldOff size={10} />}{varz.tls_required ? 'TLS' : 'No TLS'}
                      </StatusBadge>
                    </span>
                  </InfoRow>
                </div>
              </div>

              {/* Topology */}
              <div className="surface-card overflow-hidden">
                <div className="card-header justify-between">
                  <span className="flex items-center gap-2"><Network size={13} className="text-primary" /><span className="card-title">Topology</span></span>
                  {!viaProtocol && <StatusBadge status={isCluster ? 'accent' : 'neutral'}>{isCluster ? 'Cluster' : 'Standalone'}</StatusBadge>}
                </div>
                <div className="grid grid-cols-2">
                  {[
                    { label: 'Routes', value: varz.routes, to: '/cluster' },
                    { label: 'Remotes', value: varz.remotes, to: '/cluster' },
                    { label: 'Leaf nodes', value: varz.leafnodes, to: '/leaf-nodes' },
                    { label: 'Gateways', value: varz.gateways ?? (varz.gateway?.name ? 1 : 0), to: '/gateways' },
                  ].map(({ label, value, to }) => (
                    <Link key={label} to={to} className="border-b border-r border-border p-3 transition-colors even:border-r-0 hover:bg-muted/40">
                      <div className="text-[11px] text-muted-foreground">{label}</div>
                      <div className="font-mono text-lg tabular">{value ?? '—'}</div>
                    </Link>
                  ))}
                </div>
                <div className="space-y-1 px-4 py-3 text-xs">
                  {varz.cluster?.name && <div className="text-muted-foreground">Cluster <span className="font-mono text-foreground">{varz.cluster.name}</span></div>}
                  {jsz?.domain && <div className="text-muted-foreground">JetStream domain <span className="font-mono text-foreground">{jsz.domain}</span></div>}
                  {apiErrors > 0 && (
                    <div className="flex items-center gap-1.5 text-nats-warn"><AlertTriangle size={12} /> {formatNumber(apiErrors)} JetStream API errors since start</div>
                  )}
                  {!varz.cluster?.name && !jsz?.domain && apiErrors === 0 && (
                    <div className="flex items-center gap-1.5 text-muted-foreground"><Info size={12} /> No cluster or domain configured</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </PollState>
    </div>
  )
}
