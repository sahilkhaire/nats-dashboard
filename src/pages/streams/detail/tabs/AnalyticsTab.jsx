import { TimeSeriesChart } from '../../../../components/charts/TimeSeriesChart'
import { GaugeBar } from '../../../../components/ui/GaugeBar'
import { formatBytes, formatBytesRate, formatCompact, formatNumber, formatRate } from '../../../../utils/byteFormatter'
import { nsToHuman, formatDateTime } from '../../../../utils/duration'

function ChartPanel({ title, value, legend, children }) {
  return (
    <div className="surface-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="font-mono text-sm tabular">{value}</span>
      </div>
      {children}
      {legend && <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-muted-foreground">{legend}</div>}
    </div>
  )
}

const DOT_BG = { 1: 'bg-chart-1', 2: 'bg-chart-2', 3: 'bg-chart-3', 4: 'bg-chart-4', 5: 'bg-chart-5' }
const Dot = ({ i, children }) => (
  <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${DOT_BG[i]}`} />{children}</span>
)

function LimitRow({ label, used, max, format }) {
  const limited = max != null && max > 0
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular">{format(used)} <span className="text-muted-foreground">/ {limited ? format(max) : '∞'}</span></span>
      </div>
      {limited && <GaugeBar value={used} max={max} showPercent={false} />}
    </div>
  )
}

export function AnalyticsTab({ points, stream }) {
  const data = points.slice(1) // first sample has no rate
  const latest = data[data.length - 1]
  const cfg = stream.config || {}
  const state = stream.state || {}
  const hasConsumers = (stream.consumer_detail ?? []).length > 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartPanel title="Ingest rate" value={latest ? formatRate(latest.msgsPerSec) : 'collecting…'}>
          <TimeSeriesChart data={data} series={[{ key: 'msgsPerSec', label: 'Messages/s' }]} format={(v) => formatRate(v)} />
        </ChartPanel>
        <ChartPanel title="Ingest bandwidth" value={latest ? formatBytesRate(latest.bytesPerSec) : 'collecting…'}>
          <TimeSeriesChart data={data} series={[{ key: 'bytesPerSec', label: 'Bytes/s', colorIndex: 2 }]} format={formatBytesRate} />
        </ChartPanel>
        {hasConsumers && (
          <ChartPanel
            title="Consumer backlog"
            value={latest ? `${formatCompact(latest.backlogPending)} pending · ${formatCompact(latest.ackPending)} unacked` : '—'}
            legend={<><Dot i={1}>Pending (not yet delivered)</Dot><Dot i={2}>Awaiting ack</Dot></>}
          >
            <TimeSeriesChart data={data} series={[{ key: 'backlogPending', label: 'Pending' }, { key: 'ackPending', label: 'Awaiting ack' }]} format={formatNumber} />
          </ChartPanel>
        )}
        {hasConsumers && (
          <ChartPanel title="Redeliveries" value={latest ? `${formatNumber(latest.redeliveredDelta)} last interval` : '—'}>
            <TimeSeriesChart data={data} series={[{ key: 'redeliveredDelta', label: 'Redelivered', colorIndex: 4 }]} format={formatNumber} />
          </ChartPanel>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="surface-card space-y-4 p-4">
          <div className="card-title">Limits usage</div>
          <LimitRow label="Messages" used={state.messages ?? 0} max={cfg.max_msgs} format={formatNumber} />
          <LimitRow label="Bytes" used={state.bytes ?? 0} max={cfg.max_bytes} format={formatBytes} />
          <LimitRow label="Consumers" used={state.consumer_count ?? 0} max={cfg.max_consumers} format={formatNumber} />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Max age</span>
            <span className="font-mono">{cfg.max_age ? nsToHuman(cfg.max_age) : '∞'}</span>
          </div>
        </div>
        <div className="surface-card space-y-2.5 p-4 text-xs">
          <div className="card-title mb-1">State</div>
          {[
            ['First message', formatDateTime(state.first_ts)],
            ['Last message', formatDateTime(state.last_ts)],
            ['Unique subjects', formatNumber(state.num_subjects ?? 0)],
            ['Deleted (interior)', formatNumber(state.num_deleted ?? 0)],
            ['Created', formatDateTime(stream.created)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-mono">{v}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Ingest is derived from the last sequence between refreshes, so it also counts messages already discarded by limits.</p>
    </div>
  )
}
