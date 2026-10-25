import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Database, ExternalLink, Gauge, HardDrive, MemoryStick } from 'lucide-react'
import { useNatsPolling } from '../../hooks/useNatsPolling'
import { MetricCard } from '../../components/ui/MetricCard'
import { GaugeBar } from '../../components/ui/GaugeBar'
import { PageHeader } from '../../components/shared/PageHeader'
import { PollState } from '../../components/shared/PageState'
import { TimeSeriesChart } from '../../components/charts/TimeSeriesChart'
import { formatBytes, formatNumber, formatRate } from '../../utils/byteFormatter'

/** API call rate history keyed on fetch time. */
function useApiRate(total, errors, lastFetch) {
  const ref = useRef({ processedAt: null, prev: null, history: [] })
  const st = ref.current
  if (lastFetch == null || total == null || st.processedAt === lastFetch) return st.history
  let history = st.history
  if (st.prev && lastFetch > st.prev.at) {
    const dt = (lastFetch - st.prev.at) / 1000
    history = [...history, {
      ts: lastFetch,
      calls: Math.max(0, (total - st.prev.total) / dt),
      errors: Math.max(0, (errors - st.prev.errors) / dt),
    }].slice(-90)
  }
  ref.current = { processedAt: lastFetch, prev: { at: lastFetch, total, errors }, history }
  return history
}

function UsageCard({ title, icon: Icon, used, max, reserved }) {
  const limited = max != null && max > 0
  return (
    <div className="surface-card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium"><Icon size={14} className="text-muted-foreground" />{title}</span>
        <span className="font-mono text-sm tabular">{formatBytes(used)} <span className="text-muted-foreground">/ {limited ? formatBytes(max) : 'unlimited'}</span></span>
      </div>
      {limited ? <GaugeBar value={used} max={max} label="Used" /> : <div className="text-xs text-muted-foreground">No account limit configured</div>}
      {reserved > 0 && <div className="text-xs text-muted-foreground">Reserved by stream limits: <span className="font-mono">{formatBytes(reserved)}</span></div>}
    </div>
  )
}

export function JetStreamPage() {
  const { data, error, lastFetch, refetch } = useNatsPolling('/jsz?accounts=true')
  const history = useApiRate(data?.api?.total, data?.api?.errors ?? 0, lastFetch)
  const latest = history[history.length - 1]

  return (
    <div>
      <PageHeader title="JetStream" icon={Gauge} description="Persistence layer: storage, memory and API activity" />
      <PollState data={data} error={error} onRetry={refetch}>
        {data && (
          <div className="space-y-5">
            {data.disabled && (
              <div className="surface-card p-4 text-sm text-nats-warn">JetStream is disabled on this server.</div>
            )}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <MetricCard label="Streams" icon={Database} to="/streams" value={formatNumber(data.total_streams ?? data.streams ?? 0)} />
              <MetricCard label="Consumers" to="/consumers" value={formatNumber(data.total_consumers ?? data.consumers ?? 0)} />
              <MetricCard label="Messages" value={formatNumber(data.total_messages ?? data.messages ?? 0)} subtext={formatBytes(data.total_message_bytes ?? data.bytes ?? 0)} />
              <MetricCard label="API errors" value={formatNumber(data.api?.errors ?? 0)} tone={(data.api?.errors ?? 0) > 0 ? 'warn' : 'default'}
                subtext={`of ${formatNumber(data.api?.total ?? 0)} calls`} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <UsageCard title="File storage" icon={HardDrive} used={data.storage ?? 0} max={data.config?.max_storage} reserved={data.reserved_storage} />
              <UsageCard title="Memory storage" icon={MemoryStick} used={data.memory ?? 0} max={data.config?.max_memory} reserved={data.reserved_memory} />
            </div>

            <div className="surface-card p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium"><Activity size={14} className="text-primary" /> API calls / second</span>
                <span className="font-mono text-sm tabular">{latest ? formatRate(latest.calls, 'calls/s') : 'collecting…'}</span>
              </div>
              <TimeSeriesChart data={history} series={[{ key: 'calls', label: 'Calls' }, { key: 'errors', label: 'Errors', colorIndex: 1 }]} format={(v) => formatRate(v, '/s')} />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="flex gap-4">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-chart-1" />Calls</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-chart-2" />Errors</span>
                </span>
                <span>API level {data.api?.level ?? '—'}{data.domain ? ` · domain ${data.domain}` : ''}</span>
              </div>
            </div>

            <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <span className="text-muted-foreground">
                JetStream uses internal <span className="font-mono text-foreground">$JS.*</span> subjects for its API, acks and flow control.
              </span>
              <Link to="/subscriptions?filter=js" className="link inline-flex items-center gap-1 text-xs">
                View $JS subscriptions <ExternalLink size={11} />
              </Link>
            </div>
          </div>
        )}
      </PollState>
    </div>
  )
}
