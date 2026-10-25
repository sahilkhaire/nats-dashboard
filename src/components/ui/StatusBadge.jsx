import { cn } from '../../lib/utils'

const CLASSES = {
  ok:      'border-nats-ok/30 bg-nats-ok/10 text-nats-ok',
  warn:    'border-nats-warn/30 bg-nats-warn/10 text-nats-warn',
  error:   'border-nats-error/30 bg-nats-error/10 text-nats-error',
  info:    'border-nats-info/30 bg-nats-info/10 text-nats-info',
  accent:  'border-primary/30 bg-primary/10 text-primary',
  neutral: 'border-border bg-muted text-muted-foreground',
}

export function StatusBadge({ status = 'neutral', children, dot = false, className }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium', CLASSES[status] || CLASSES.neutral, className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}
