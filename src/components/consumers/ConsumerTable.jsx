import { Fragment, useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { useTableSort } from '../../hooks/useTableSort'
import { usePagination } from '../../hooks/usePagination'
import { PaginationBar } from '../shared/PaginationBar'
import { formatAckRate, consumerRowKey, consumerRateKey } from '../../hooks/useConsumerAckRates'
import { SortableTh } from '../ui/SortableTh'
import { StatusBadge } from '../ui/StatusBadge'
import { Button } from '../ui/button'
import { formatCompact, formatNumber } from '../../utils/byteFormatter'
import { nsToHuman, formatDateTime, timeAgo } from '../../utils/duration'

const severity = (value, warnAt, dangerAt) => (value >= dangerAt ? 'text-nats-error' : value >= warnAt ? 'text-nats-warn' : 'text-muted-foreground')

export function consumerHealth(c) {
  if (c.paused) return { status: 'info', label: 'paused' }
  if ((c.num_pending ?? 0) > 10000 || (c.num_ack_pending ?? 0) >= (c.config?.max_ack_pending > 0 ? c.config.max_ack_pending : Infinity)) {
    return { status: 'error', label: 'stalled' }
  }
  if ((c.num_pending ?? 0) > 1000 || (c.num_redelivered ?? 0) > 0) return { status: 'warn', label: 'lagging' }
  if (c.push_bound === false && c.config?.deliver_subject) return { status: 'neutral', label: 'unbound' }
  return { status: 'ok', label: 'ok' }
}

function Detail({ c }) {
  const cfg = c.config || {}
  const rows = [
    ['Type', cfg.deliver_subject ? `push → ${cfg.deliver_subject}` : 'pull'],
    ['Durable', cfg.durable_name ? 'yes' : 'no (ephemeral)'],
    ['Deliver policy', cfg.deliver_policy],
    ['Ack policy', cfg.ack_policy],
    ['Ack wait', cfg.ack_wait ? nsToHuman(cfg.ack_wait) : '—'],
    ['Max deliver', cfg.max_deliver > 0 ? cfg.max_deliver : '∞'],
    ['Max ack pending', cfg.max_ack_pending > 0 ? formatNumber(cfg.max_ack_pending) : '∞'],
    ['Replay', cfg.replay_policy],
    ['Delivered (stream seq)', formatNumber(c.delivered?.stream_seq)],
    ['Ack floor (stream seq)', formatNumber(c.ack_floor?.stream_seq)],
    ['Last active', c.delivered?.last_active ? timeAgo(c.delivered.last_active) : '—'],
    ['Waiting pulls', formatNumber(c.num_waiting ?? 0)],
    ['Created', formatDateTime(c.created)],
  ]
  return (
    <div className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-4">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2 sm:block">
          <span className="text-muted-foreground">{k}</span>{' '}
          <span className="font-mono">{v ?? '—'}</span>
        </div>
      ))}
      {cfg.description && <div className="sm:col-span-2 lg:col-span-4"><span className="text-muted-foreground">Description </span>{cfg.description}</div>}
    </div>
  )
}

/**
 * Consumer table used by the Consumers page and the stream detail Consumers tab.
 */
export function ConsumerTable({ consumers, showStream = false, rates, onDelete, pageSize: initialPageSize = 50 }) {
  const [expanded, setExpanded] = useState(() => new Set())
  const { inRatesByName, outRatesByName } = rates || {}
  const keyOf = (c) => `${c.stream ?? ''}/${consumerRowKey(c)}`

  const getSortValue = useCallback((c, key) => {
    switch (key) {
      case 'stream': return c.stream ?? ''
      case 'name': return consumerRowKey(c) ?? ''
      case 'filter': return c.config?.filter_subject || c.config?.filter_subjects?.join(',') || ''
      case 'in_rate': return inRatesByName?.get(consumerRateKey(c)) ?? -1
      case 'out_rate': return outRatesByName?.get(consumerRateKey(c)) ?? -1
      case 'status': return consumerHealth(c).label
      case 'last_active': return c.delivered?.last_active ? new Date(c.delivered.last_active).getTime() : 0
      default: return c[key] ?? 0
    }
  }, [inRatesByName, outRatesByName])

  const { sortedData, sortBy, sortDir, handleSort } = useTableSort(consumers, { defaultSortBy: showStream ? 'stream' : 'name', getSortValue })
  const { pagedData, page, pageSize, totalPages, totalItems, setPage, setPageSize } = usePagination(sortedData, initialPageSize)
  const th = (key, label) => <SortableTh sortKey={key} currentSortBy={sortBy} currentSortDir={sortDir} onSort={handleSort}>{label}</SortableTh>
  const toggle = (k) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    return next
  })
  const cols = 8 +(showStream ? 1 : 0) + (rates ? 2 : 0) + (onDelete ? 1 : 0)

  return (
    <div className="space-y-3">
    <div className="premium-table-wrap">
      <table className="premium-table">
        <thead>
          <tr>
            <th className="w-8" />
            {showStream && th('stream', 'Stream')}
            {th('name', 'Consumer')}
            {th('status', 'Status')}
            {th('filter', 'Filter')}
            {th('num_pending', 'Pending')}
            {th('num_ack_pending', 'Unacked')}
            {th('num_redelivered', 'Redelivered')}
            {rates && th('in_rate', 'Delivered/s')}
            {rates && th('out_rate', 'Acked/s')}
            {th('last_active', 'Last active')}
            {onDelete && <th className="w-10"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {sortedData.length === 0 && (
            <tr><td colSpan={cols} className="py-10 text-center text-muted-foreground">No consumers match.</td></tr>
          )}
          {pagedData.map((c) => {
            const k = keyOf(c)
            const name = consumerRowKey(c)
            const open = expanded.has(k)
            const health = consumerHealth(c)
            const filter = c.config?.filter_subject || c.config?.filter_subjects?.join(', ')
            return (
              <Fragment key={k}>
                <tr className="cursor-pointer" onClick={() => toggle(k)} aria-expanded={open}>
                  <td className="text-muted-foreground">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                  {showStream && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <Link to={`/streams/${encodeURIComponent(c.stream)}?tab=consumers`} className="font-mono text-xs text-muted-foreground hover:text-primary">{c.stream}</Link>
                    </td>
                  )}
                  <td className="font-mono font-medium">{name ?? '—'}</td>
                  <td><StatusBadge status={health.status}>{health.label}</StatusBadge></td>
                  <td className="max-w-[160px] truncate font-mono text-xs text-muted-foreground" title={filter}>{filter || 'all'}</td>
                  <td className={`font-mono text-xs tabular ${severity(c.num_pending ?? 0, 100, 10000)}`} title={formatNumber(c.num_pending)}>{formatCompact(c.num_pending ?? 0)}</td>
                  <td className={`font-mono text-xs tabular ${severity(c.num_ack_pending ?? 0, 100, 1000)}`}>{formatNumber(c.num_ack_pending ?? 0)}</td>
                  <td className={`font-mono text-xs tabular ${severity(c.num_redelivered ?? 0, 1, 100)}`}>{formatNumber(c.num_redelivered ?? 0)}</td>
                  {rates && <td className="font-mono text-xs tabular text-muted-foreground">{formatAckRate(inRatesByName?.get(consumerRateKey(c)))}</td>}
                  {rates && <td className="font-mono text-xs tabular text-muted-foreground">{formatAckRate(outRatesByName?.get(consumerRateKey(c)))}</td>}
                  <td className="text-xs text-muted-foreground">{c.delivered?.last_active ? timeAgo(c.delivered.last_active) : '—'}</td>
                  {onDelete && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-nats-error" onClick={() => onDelete(c)} title="Delete consumer" aria-label={`Delete consumer ${name}`}>
                        <Trash2 size={13} />
                      </Button>
                    </td>
                  )}
                </tr>
                {open && (
                  <tr className="bg-muted/30 hover:bg-muted/30">
                    <td colSpan={cols} className="whitespace-normal px-4 py-3"><Detail c={c} /></td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
    {rates && (
      <p className="text-right text-[11px] text-muted-foreground">
        Rates are averaged over a {Math.round((rates.windowMs ?? 30000) / 1000)}s sliding window{rates.spanMs > 0 && rates.spanMs < (rates.windowMs ?? 30000) - 1000 ? ` (${Math.round(rates.spanMs / 1000)}s collected so far)` : ''}.
      </p>
    )}
    {totalItems > initialPageSize && (
      <PaginationBar page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} pageSizes={[50, 100, 250]} />
    )}
    </div>
  )
}
