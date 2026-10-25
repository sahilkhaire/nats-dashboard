import { useEffect } from 'react'

/**
 * Page title row: title, optional description and right-aligned actions.
 * Also sets the document title.
 */
export function PageHeader({ title, description, actions, icon: Icon, children }) {
  useEffect(() => {
    if (typeof title === 'string') document.title = `${title} · NATS Dashboard`
  }, [title])

  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary sm:flex">
            <Icon size={18} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          {children}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
