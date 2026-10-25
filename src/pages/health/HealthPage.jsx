import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, HeartPulse, XCircle, AlertTriangle } from 'lucide-react'
import { useNatsPolling } from '../../hooks/useNatsPolling'
import { PageHeader } from '../../components/shared/PageHeader'
import { CopyButton } from '../../components/shared/CopyButton'
import { useConfig } from '../../context/ConfigContext'
import { cn } from '../../lib/utils'

const MAX_CHECKS = 60

export function HealthPage() {
  const { connection } = useConfig()
  const { data, error, lastFetch } = useNatsPolling('/healthz')
  const { data: jsHealth } = useNatsPolling('/healthz?js-enabled-only=true')
  const [checks, setChecks] = useState([])
  const seen = useRef(null)

  const status = error ? 'error' : data?.status === 'ok' ? 'ok' : data ? 'warn' : 'pending'

  useEffect(() => {
    if (lastFetch == null && !error) return
    const key = `${lastFetch}|${error}`
    if (seen.current === key) return
    seen.current = key
    setChecks((prev) => [...prev, { at: Date.now(), status }].slice(-MAX_CHECKS))
  }, [lastFetch, error, status])

  const okCount = checks.filter((c) => c.status === 'ok').length
  const meta = {
    ok: { icon: CheckCircle2, title: 'Server is healthy', cls: 'text-nats-ok', ring: 'border-nats-ok/40 bg-nats-ok/10' },
    warn: { icon: AlertTriangle, title: `Server reports: ${data?.status || 'degraded'}`, cls: 'text-nats-warn', ring: 'border-nats-warn/40 bg-nats-warn/10' },
    error: { icon: XCircle, title: 'Server unreachable', cls: 'text-nats-error', ring: 'border-nats-error/40 bg-nats-error/10' },
    pending: { icon: HeartPulse, title: 'Checking…', cls: 'text-muted-foreground', ring: 'border-border bg-muted' },
  }[status]
  const Icon = meta.icon

  return (
    <div className="space-y-5">
      <PageHeader title="Health" icon={HeartPulse} description={`Health checks for ${connection?.name || 'the selected server'}`} />

      <div className="surface-card flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <div className={cn('flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border', meta.ring)}>
          <Icon size={30} className={meta.cls} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold">{meta.title}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {error ? error : `Last check ${lastFetch ? new Date(lastFetch).toLocaleTimeString() : '—'}`}
          </div>
          {data?.error && <div className="mt-1 font-mono text-xs text-nats-warn">{data.error}</div>}
        </div>
        {checks.length > 0 && (
          <div className="text-right">
            <div className="font-mono text-2xl font-semibold tabular">{((okCount / checks.length) * 100).toFixed(0)}%</div>
            <div className="text-xs text-muted-foreground">of last {checks.length} checks OK</div>
          </div>
        )}
      </div>

      <div className="surface-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="card-title">Recent checks</span>
          <span className="text-[11px] text-muted-foreground">oldest → newest</span>
        </div>
        <div className="flex h-8 items-end gap-[2px]" role="img" aria-label={`${okCount} of ${checks.length} recent checks healthy`}>
          {Array.from({ length: MAX_CHECKS }).map((_, i) => {
            const c = checks[i - (MAX_CHECKS - checks.length)]
            return (
              <div
                key={i}
                title={c ? `${new Date(c.at).toLocaleTimeString()} — ${c.status}` : undefined}
                className={cn('h-full flex-1 rounded-sm', !c ? 'bg-muted' : c.status === 'ok' ? 'bg-nats-ok/70' : c.status === 'warn' ? 'bg-nats-warn/80' : 'bg-nats-error/80')}
              />
            )
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          { title: '/healthz', payload: data },
          { title: '/healthz?js-enabled-only=true', payload: jsHealth },
        ].map(({ title, payload }) => (
          <div key={title} className="surface-card overflow-hidden">
            <div className="card-header justify-between">
              <span className="font-mono text-xs text-muted-foreground">{title}</span>
              {payload && <CopyButton text={JSON.stringify(payload, null, 2)} />}
            </div>
            <pre className="max-h-72 overflow-auto p-4 font-mono text-xs text-foreground">{payload ? JSON.stringify(payload, null, 2) : '—'}</pre>
          </div>
        ))}
      </div>
    </div>
  )
}
