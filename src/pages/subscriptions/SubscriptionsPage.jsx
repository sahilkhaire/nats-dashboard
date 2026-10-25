import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useNatsPolling } from '../../hooks/useNatsPolling'
import { useTableSort } from '../../hooks/useTableSort'
import { usePagination } from '../../hooks/usePagination'
import { MetricCard } from '../../components/ui/MetricCard'
import { SortableTh } from '../../components/ui/SortableTh'
import { PageHeader } from '../../components/shared/PageHeader'
import { PollState } from '../../components/shared/PageState'
import { Radio as PageIcon } from 'lucide-react'
import { PaginationBar } from '../../components/shared/PaginationBar'
import { Database, Server, Layers, Search } from 'lucide-react'

const FILTER_ALL = 'all'
const FILTER_JS = 'js'
const FILTER_SYS = 'sys'
const FILTER_APP = 'app'

function getFilterCategory(subject) {
  if (!subject) return FILTER_APP
  if (subject.startsWith('$JS')) return FILTER_JS
  if (subject.startsWith('$SYS')) return FILTER_SYS
  return FILTER_APP
}

function SubscriptionsPageBody() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlFilter = searchParams.get('filter') || FILTER_ALL
  const [filter, setFilter] = useState(urlFilter)
  const [search, setSearch] = useState('')

  const { data, error, refetch } = useNatsPolling('/subsz?subs=1&limit=2000')

  const subs = data?.subscriptions_list ?? []
  const counts = useMemo(() => {
    let js = 0, sys = 0, app = 0
    for (const s of subs) {
      const subj = s?.subject ?? ''
      if (subj.startsWith('$JS')) js++
      else if (subj.startsWith('$SYS')) sys++
      else app++
    }
    return { js, sys, app, total: subs.length }
  }, [subs])

  const filtered = useMemo(() => {
    let list = subs
    if (filter !== FILTER_ALL) {
      list = list.filter(s => getFilterCategory(s?.subject) === filter)
    }
    if (search.trim()) {
      let re = null
      try {
        re = search.includes('*') || search.includes('.')
          ? new RegExp(search.replace(/\./g, '\\.').replace(/\*/g, '.*'), 'i')
          : null
      } catch {
        re = null
      }
      const term = search.toLowerCase()
      list = list.filter(s => {
        const subj = (s?.subject ?? '').toLowerCase()
        return re ? re.test(s?.subject ?? '') : subj.includes(term)
      })
    }
    return list
  }, [subs, filter, search])

  const { sortedData, sortBy, sortDir, handleSort } = useTableSort(filtered, {
    defaultSortBy: 'subject',
    getSortValue: (s, key) => {
      if (key === 'subject') return s?.subject ?? ''
      if (key === 'account') return s?.account ?? ''
      if (key === 'cid') return s?.cid ?? 0
      if (key === 'sid') return s?.sid ?? ''
      if (key === 'msgs') return s?.msgs ?? 0
      return ''
    },
  })

  const { pagedData, page, pageSize, totalPages, totalItems, setPage, setPageSize } = usePagination(sortedData, 10)

  const handleFilterChange = (f) => {
    setFilter(f)
    setSearchParams(f === FILTER_ALL ? {} : { filter: f })
  }


  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Subscriptions" value={(data.num_subscriptions ?? 0).toLocaleString()} />
        <MetricCard label="Cache Hit Rate" value={`${((data.cache_hit_rate ?? 0) * 100).toFixed(1)}%`} />
        <MetricCard label="Max Fanout" value={data.max_fanout ?? 0} />
        <MetricCard label="Avg Fanout" value={(data.avg_fanout ?? 0).toFixed(2)} />
      </div>

      {/* Category breakdown */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subscription Categories</span>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <button
            onClick={() => handleFilterChange(FILTER_ALL)}
            className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
              filter === FILTER_ALL ? 'border-foreground/25 bg-muted' : 'border-border hover:border-muted-foreground'
            }`}
          >
            <Layers size={18} className="text-muted-foreground" />
            <div>
              <div className="font-mono text-lg text-foreground">{counts.total}</div>
              <div className="text-xs text-muted-foreground">All</div>
            </div>
          </button>
          <button
            onClick={() => handleFilterChange(FILTER_JS)}
            className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
              filter === FILTER_JS ? 'border-foreground/25 bg-muted' : 'border-border hover:border-muted-foreground'
            }`}
          >
            <Database size={18} className="text-foreground/70" />
            <div>
              <div className="font-mono text-lg text-foreground">{counts.js}</div>
              <div className="text-xs text-muted-foreground">JetStream ($JS.*)</div>
            </div>
          </button>
          <button
            onClick={() => handleFilterChange(FILTER_SYS)}
            className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
              filter === FILTER_SYS ? 'border-foreground/25 bg-muted' : 'border-border hover:border-muted-foreground'
            }`}
          >
            <Server size={18} className="text-foreground/70" />
            <div>
              <div className="font-mono text-lg text-foreground">{counts.sys}</div>
              <div className="text-xs text-muted-foreground">System ($SYS.*)</div>
            </div>
          </button>
          <button
            onClick={() => handleFilterChange(FILTER_APP)}
            className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
              filter === FILTER_APP ? 'border-foreground/25 bg-muted' : 'border-border hover:border-muted-foreground'
            }`}
          >
            <Layers size={18} className="text-foreground/70" />
            <div>
              <div className="font-mono text-lg text-foreground">{counts.app}</div>
              <div className="text-xs text-muted-foreground">Application</div>
            </div>
          </button>
        </div>
      </div>

      {/* Search + table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search subject (regex supported)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-enterprise w-full pl-8"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {filtered.length} of {counts.total} subscriptions
          </span>
        </div>
        <div className="premium-table-wrap rounded-none border-0">
          <table className="premium-table">
            <thead>
              <tr>
                <SortableTh sortKey="subject" currentSortBy={sortBy} currentSortDir={sortDir} onSort={handleSort}>
                  Subject
                </SortableTh>
                <SortableTh sortKey="account" currentSortBy={sortBy} currentSortDir={sortDir} onSort={handleSort}>
                  Account
                </SortableTh>
                <SortableTh sortKey="cid" currentSortBy={sortBy} currentSortDir={sortDir} onSort={handleSort}>
                  CID
                </SortableTh>
                <SortableTh sortKey="sid" currentSortBy={sortBy} currentSortDir={sortDir} onSort={handleSort}>
                  SID
                </SortableTh>
                <SortableTh sortKey="msgs" currentSortBy={sortBy} currentSortDir={sortDir} onSort={handleSort}>
                  Msgs
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {pagedData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                    No subscriptions match the current filter.
                  </td>
                </tr>
              ) : (
                pagedData.map((s, i) => (
                  <tr key={`${s.cid}-${s.sid}-${i}`}>
                    <td className="p-3 font-mono text-sm text-foreground">
                      <span className={s.subject?.startsWith('$JS') ? 'text-foreground' : s.subject?.startsWith('$SYS') ? 'text-foreground/80' : ''}>
                        {s.subject ?? '—'}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{s.account ?? '—'}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{s.cid ?? '—'}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{s.sid ?? '—'}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{(s.msgs ?? 0).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="border-t border-border px-4 py-2.5">
            <PaginationBar
              page={page}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={setPageSize}
              pageSizes={[10, 25, 50, 100]}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export function SubscriptionsPage() {
  const { data, error, refetch } = useNatsPolling('/subsz?subs=1&limit=2000')
  return (
    <div>
      <PageHeader title="Subscriptions" icon={PageIcon} description="Subject interest registered on this server" />
      <PollState data={data} error={error} onRetry={refetch} endpoint="subsz">
        {data && <SubscriptionsPageBody />}
      </PollState>
    </div>
  )
}
