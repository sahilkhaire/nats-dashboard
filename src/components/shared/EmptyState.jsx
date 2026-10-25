/**
 * Reusable empty state for pages or panels with no data.
 */
export function EmptyState({ icon: Icon, title, description, hint, action, compact = false }) {
  return (
    <div className={`mx-auto flex max-w-xl flex-col items-center justify-center text-center ${compact ? 'px-4 py-8' : 'px-6 py-14'}`}>
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted/60 text-muted-foreground">
          <Icon size={22} />
        </div>
      )}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>}
      {hint && <p className="mt-2 max-w-md text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
