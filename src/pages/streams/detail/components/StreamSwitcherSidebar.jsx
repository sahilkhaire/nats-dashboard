import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SearchInput, makeMatcher } from '../../../../components/shared/SearchInput'
import { formatCompact } from '../../../../utils/byteFormatter'
import { cn } from '../../../../lib/utils'

export function StreamSwitcherSidebar({ streams, currentStreamName, currentSearch = '' }) {
  const [query, setQuery] = useState('')
  const [showInternal, setShowInternal] = useState(false)
  const matcher = makeMatcher(query, false)

  const list = useMemo(
    () => [...streams]
      .filter((s) => showInternal || s.kind === 'stream' || s.name === currentStreamName)
      .filter((s) => matcher.test(s.name))
      .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streams, query, showInternal, currentStreamName],
  )
  const internalCount = streams.filter((s) => s.kind !== 'stream').length

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card/40 lg:flex lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)]">
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center justify-between">
          <span className="card-title">Streams</span>
          <span className="text-[11px] text-muted-foreground">{list.length}</span>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Filter…" className="min-w-0" />
        {internalCount > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={showInternal} onChange={(e) => setShowInternal(e.target.checked)} />
            Show KV / object store streams ({internalCount})
          </label>
        )}
      </div>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {list.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted-foreground">No streams match.</p>}
        {list.map((s) => {
          const active = s.name === currentStreamName
          return (
            <Link
              key={`${s.account ?? 'default'}-${s.name}`}
              to={{ pathname: `/streams/${encodeURIComponent(s.name)}`, search: currentSearch }}
              className={cn(
                'flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                active ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <span className="truncate font-mono text-[13px]">{s.name}</span>
              <span className="shrink-0 font-mono text-[10px] tabular opacity-70">{formatCompact(s.state?.messages ?? 0)}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
