import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '../../lib/utils'

const TONES = {
  default: '',
  ok: 'text-nats-ok',
  warn: 'text-nats-warn',
  error: 'text-nats-error',
  accent: 'text-primary',
}

/**
 * Stat tile: label, big tabular value, optional hint, icon, tone and link.
 */
export function MetricCard({ label, value, subtext, hint, icon: Icon, tone = 'default', variant, to, children, className }) {
  const t = variant === 'error' ? 'error' : variant === 'warn' ? 'warn' : tone
  const body = (
    <div className={cn(
      'surface-card group relative h-full p-4 transition-colors',
      t === 'error' && 'border-nats-error/40',
      t === 'warn' && 'border-nats-warn/40',
      to && 'hover:border-primary/40',
      className,
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        {to
          ? <ArrowUpRight size={14} className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          : Icon && <Icon size={14} className="shrink-0 text-muted-foreground" />}
      </div>
      <div className={cn('mt-2 truncate font-mono text-2xl font-semibold tabular', TONES[t] || 'text-foreground')}>
        {value ?? <span className="text-muted-foreground">—</span>}
      </div>
      {(subtext || hint) && <div className="mt-1 truncate text-xs text-muted-foreground">{subtext || hint}</div>}
      {children}
    </div>
  )
  return to ? <Link to={to} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-lg">{body}</Link> : body
}
