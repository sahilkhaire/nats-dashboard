/**
 * Horizontal usage bar. Turns amber above 80% and red above 95%; the percentage is
 * always printed so the state never depends on color alone.
 */
export function GaugeBar({ value, max, label, showPercent = true }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const tone = pct > 95 ? 'bg-nats-error' : pct > 80 ? 'bg-nats-warn' : 'bg-primary'
  return (
    <div>
      {(label || showPercent) && (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          {showPercent && <span className="font-mono tabular text-foreground">{pct.toFixed(pct < 10 && pct > 0 ? 1 : 0)}%</span>}
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-all duration-500 ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
