import { useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '../../lib/utils'

const VARIANTS = {
  error:   { icon: AlertCircle,   cls: 'border-nats-error/40 bg-nats-error/10 text-nats-error' },
  warn:    { icon: AlertTriangle, cls: 'border-nats-warn/40 bg-nats-warn/10 text-nats-warn' },
  info:    { icon: Info,          cls: 'border-nats-info/40 bg-nats-info/10 text-nats-info' },
  success: { icon: CheckCircle2,  cls: 'border-nats-ok/40 bg-nats-ok/10 text-nats-ok' },
}

/**
 * Inline status banner. Text is always present, so state never relies on color alone.
 */
export function AlertBanner({ variant = 'error', title, children, action, dismissible = false, className }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  const { icon: Icon, cls } = VARIANTS[variant] || VARIANTS.info
  return (
    <div role={variant === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-lg border px-4 py-3 text-sm', cls, className)}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cn('text-foreground/80', title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {dismissible && (
        <button type="button" onClick={() => setDismissed(true)} className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100" aria-label="Dismiss">
          <X size={14} />
        </button>
      )}
    </div>
  )
}
