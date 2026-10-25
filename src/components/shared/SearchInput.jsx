import { Search, X } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * Search box with icon, clear button and an optional "Regex" toggle.
 */
export function SearchInput({ value, onChange, placeholder = 'Search…', regex, onRegexChange, error, className, autoFocus }) {
  return (
    <div className={cn('min-w-[200px] flex-1', className)}>
      <div className={cn(
        'flex h-9 items-center gap-2 rounded-md border border-input bg-background px-2.5 shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30',
        error && 'border-nats-error/60',
      )}>
        <Search size={14} className="shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-invalid={Boolean(error)}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {value && (
          <button type="button" onClick={() => onChange('')} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Clear search">
            <X size={13} />
          </button>
        )}
        {onRegexChange && (
          <button
            type="button"
            onClick={() => onRegexChange(!regex)}
            aria-pressed={regex}
            title="Use regular expression"
            className={cn(
              'rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors',
              regex ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            .*
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-[11px] text-nats-error">{error}</p>}
    </div>
  )
}

/** Build a predicate for text / regex search. Returns { test, error }. */
export function makeMatcher(query, useRegex) {
  const q = query.trim()
  if (!q) return { test: () => true, error: '' }
  if (useRegex) {
    try {
      const re = new RegExp(q, 'i')
      return { test: (s) => re.test(String(s ?? '')), error: '' }
    } catch {
      return { test: () => true, error: 'Invalid regular expression' }
    }
  }
  const lower = q.toLowerCase()
  return { test: (s) => String(s ?? '').toLowerCase().includes(lower), error: '' }
}
