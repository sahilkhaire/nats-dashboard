import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react'
import { ChevronDown, ChevronRight, Filter, History, Pause, Play, Radio, RotateCcw, Trash2, X as XIcon } from 'lucide-react'
import { useConfig } from '../../../../context/ConfigContext'
import { useStreamMutation } from '../../../../hooks/useStreamMutation'
import { useConfirmDialog } from '../../../../components/shared/ConfirmDialogProvider'
import { useNotifications } from '../../../../context/NotificationContext'
import { CopyButton } from '../../../../components/shared/CopyButton'
import { Button } from '../../../../components/ui/button'
import { Input } from '../../../../components/ui/input'
import { formatBytes, formatNumber } from '../../../../utils/byteFormatter'
import { cn } from '../../../../lib/utils'

const PAGE = 50
const MAX_LIVE = 500
const FILTERS_KEY = 'nats-msg-filters'
const EMPTY_FILTER = { subject: '', startSeq: '', startTime: '' }

function decodeText(m) {
  if (m.encoding !== 'base64') return m.data ?? ''
  try {
    return atob(m.data)
  } catch {
    return ''
  }
}

function prettyPayload(m) {
  if (!m.data) return { text: '(empty)', json: false }
  if (m.encoding === 'base64') return { text: m.data, json: false, binary: true }
  try {
    return { text: JSON.stringify(JSON.parse(m.data), null, 2), json: true }
  } catch {
    return { text: m.data, json: false }
  }
}

function loadSavedFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) || '[]')
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

function mergeBySeq(prev, next) {
  const seen = new Set(prev.map((m) => m.seq))
  return [...prev, ...next.filter((m) => !seen.has(m.seq))]
}

export function MessagesTab({ stream }) {
  const { pollInterval, paused: globalPaused } = useConfig()
  const { fetchMessages, deleteMessage } = useStreamMutation()
  const { confirm } = useConfirmDialog()
  const { notifyError, notifySuccess } = useNotifications()

  const [mode, setMode] = useState('live')
  const [paused, setPaused] = useState(false)
  const [messages, setMessages] = useState([])
  const [meta, setMeta] = useState({ firstSeq: 0, lastSeq: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [expanded, setExpanded] = useState(() => new Set())

  const [showFilters, setShowFilters] = useState(false)
  const [draft, setDraft] = useState(EMPTY_FILTER)
  const [applied, setApplied] = useState(EMPTY_FILTER)
  const [savedFilters, setSavedFilters] = useState(loadSavedFilters)
  const [filterName, setFilterName] = useState('')

  const lastSeqRef = useRef(null)
  const inFlight = useRef(false)
  const generation = useRef(0)

  const request = useCallback(async (params) => {
    const query = { stream: stream.name, limit: PAGE, ...params }
    if (applied.subject.trim()) query.subject = applied.subject.trim()
    return fetchMessages(query)
  }, [fetchMessages, stream.name, applied.subject])

  // Initial / reset load
  const reload = useCallback(async () => {
    const gen = ++generation.current
    setMessages([])
    setExpanded(new Set())
    setHasMore(false)
    setError('')
    setLoading(true)
    inFlight.current = true
    try {
      const params = {}
      if (mode === 'history') {
        if (applied.startSeq) params.startSeq = applied.startSeq
        else if (applied.startTime) params.startTime = new Date(applied.startTime).toISOString()
        else params.startSeq = 1
      }
      const data = await request(params)
      if (gen !== generation.current) return
      setMessages(data.messages || [])
      setMeta({ firstSeq: data.firstSeq, lastSeq: data.lastSeq })
      setHasMore(Boolean(data.hasMore))
      lastSeqRef.current = data.messages?.length ? data.messages[data.messages.length - 1].seq : data.lastSeq
    } catch (err) {
      if (gen === generation.current) setError(err.message)
    } finally {
      if (gen === generation.current) {
        setLoading(false)
        inFlight.current = false
      }
    }
  }, [mode, applied, request])

  useEffect(() => { reload() }, [reload])

  // Live tail: one request at a time, scheduled after the previous finishes.
  useEffect(() => {
    if (mode !== 'live' || paused || globalPaused) return undefined
    let timer = null
    let stopped = false
    const tick = async () => {
      if (stopped) return
      if (!inFlight.current && lastSeqRef.current != null && !document.hidden) {
        inFlight.current = true
        const gen = generation.current
        try {
          const data = await request({ afterSeq: lastSeqRef.current, limit: 100 })
          if (gen === generation.current && !stopped) {
            if (data.messages?.length) {
              setMessages((prev) => mergeBySeq(prev, data.messages).slice(-MAX_LIVE))
              lastSeqRef.current = data.messages[data.messages.length - 1].seq
            } else if (data.lastSeq != null && data.lastSeq < (lastSeqRef.current ?? 0)) {
              // stream was purged / recreated
              lastSeqRef.current = data.lastSeq
            }
            setMeta({ firstSeq: data.firstSeq, lastSeq: data.lastSeq })
            setError('')
          }
        } catch (err) {
          if (gen === generation.current) setError(err.message)
        } finally {
          inFlight.current = false
        }
      }
      if (!stopped) timer = setTimeout(tick, Math.max(1000, pollInterval))
    }
    timer = setTimeout(tick, Math.max(1000, pollInterval))
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [mode, paused, globalPaused, pollInterval, request])

  const loadMore = async () => {
    if (!hasMore || inFlight.current || messages.length === 0) return
    inFlight.current = true
    setLoading(true)
    const gen = generation.current
    try {
      const data = await request({ afterSeq: messages[messages.length - 1].seq })
      if (gen !== generation.current) return
      setMessages((prev) => mergeBySeq(prev, data.messages || []))
      setHasMore(Boolean(data.hasMore))
    } catch (err) {
      setError(err.message)
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  const applyFilters = (next = draft) => {
    setDraft(next)
    setApplied(next)
    if (next.startSeq || next.startTime) setMode('history')
  }

  const persistFilters = (list) => {
    setSavedFilters(list)
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
  }

  const saveFilterSet = () => {
    const name = filterName.trim()
    if (!name) return
    persistFilters([...savedFilters.filter((f) => f.name !== name), { name, ...draft }])
    setFilterName('')
  }

  const handleDelete = async (m) => {
    const ok = await confirm(`Delete message #${m.seq}?`, 'The message is removed from the stream. Consumers that have not received it will skip it.', { confirmLabel: 'Delete message' })
    if (!ok) return
    try {
      await deleteMessage(stream.name, m.seq)
      setMessages((prev) => prev.filter((x) => x.seq !== m.seq))
      notifySuccess('Message deleted', `#${m.seq} removed from ${stream.name}.`, 'stream')
    } catch (err) {
      notifyError('Delete failed', err.message, 'stream')
    }
  }

  const toggle = (seq) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(seq)) next.delete(seq)
    else next.add(seq)
    return next
  })

  const display = useMemo(() => (mode === 'live' ? [...messages].reverse() : messages), [messages, mode])
  const filtersActive = applied.subject || applied.startSeq || applied.startTime
  const canDelete = !stream.config?.deny_delete && !stream.config?.sealed

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-md border border-input bg-background p-0.5 shadow-sm">
          {[
            ['live', 'Live tail', Radio],
            ['history', 'Browse', History],
          ].map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setMode(id)}
              className={cn('flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
                mode === id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
              {id === 'live' && mode === 'live' && !paused && !globalPaused
                ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                : <Icon size={13} />}
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {mode === 'live' && (
            <Button variant="outline" size="sm" onClick={() => setPaused((p) => !p)}>
              {paused ? <Play size={13} /> : <Pause size={13} />}{paused ? 'Resume' : 'Pause'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)} className={cn(filtersActive && 'border-primary/50 text-primary')}>
            <Filter size={13} /> Filters{filtersActive ? ' •' : ''}
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={reload} disabled={loading} title="Reload">
            <RotateCcw size={13} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {showFilters && (
        <form className="surface-card space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); applyFilters() }}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="field-label">Subject filter</label>
              <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="orders.> or events.*" className="font-mono" />
            </div>
            <div>
              <label className="field-label">From sequence</label>
              <Input type="number" min="1" value={draft.startSeq} onChange={(e) => setDraft({ ...draft, startSeq: e.target.value, startTime: '' })} placeholder={`${meta.firstSeq || 1}`} className="font-mono" />
            </div>
            <div>
              <label className="field-label">From time</label>
              <Input type="datetime-local" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value, startSeq: '' })} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm">Apply</Button>
            {filtersActive && <Button type="button" size="sm" variant="ghost" onClick={() => applyFilters(EMPTY_FILTER)}>Clear</Button>}
            <div className="ml-auto flex items-center gap-2">
              <Input value={filterName} onChange={(e) => setFilterName(e.target.value)} placeholder="Save as…" className="h-8 w-40 text-xs" />
              <Button type="button" size="sm" variant="outline" onClick={saveFilterSet} disabled={!filterName.trim()}>Save</Button>
            </div>
          </div>
          {savedFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">Saved:</span>
              {savedFilters.map((f) => (
                <span key={f.name} className="inline-flex items-center overflow-hidden rounded-md border border-border text-xs">
                  <button type="button" onClick={() => applyFilters({ subject: f.subject || '', startSeq: f.startSeq || '', startTime: f.startTime || '' })} className="px-2 py-1 hover:bg-muted">{f.name}</button>
                  <button type="button" onClick={() => persistFilters(savedFilters.filter((x) => x.name !== f.name))} className="border-l border-border px-1.5 py-1 text-muted-foreground hover:text-nats-error" aria-label={`Remove ${f.name}`}>
                    <XIcon size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </form>
      )}

      {error && <div className="rounded-md border border-nats-error/40 bg-nats-error/10 px-3 py-2 text-xs text-nats-error">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {formatNumber(messages.length)} loaded · stream holds {formatNumber(stream.state?.messages ?? 0)} (seq {formatNumber(meta.firstSeq)}–{formatNumber(meta.lastSeq)})
          {applied.subject && <> · subject <span className="font-mono text-foreground">{applied.subject}</span></>}
        </span>
        {mode === 'live' && (paused || globalPaused) && <span className="flex items-center gap-1 text-nats-warn"><Pause size={11} /> Paused</span>}
        {mode === 'live' && !paused && !globalPaused && <span>Newest first · up to {MAX_LIVE} kept</span>}
      </div>

      <div className="premium-table-wrap max-h-[65vh] overflow-y-auto">
        <table className="premium-table table-fixed">
          <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_rgb(var(--border))]">
            <tr>
              <th className="w-8" />
              <th className="w-24">Seq</th>
              <th className="w-44">Time</th>
              <th className="w-56">Subject</th>
              <th>Payload</th>
              <th className="w-20 text-right">Size</th>
            </tr>
          </thead>
          <tbody>
            {loading && messages.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">Loading messages…</td></tr>
            ) : display.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">
                {mode === 'live' ? 'Waiting for new messages…' : 'No messages for these filters.'}
              </td></tr>
            ) : display.map((m) => {
              const open = expanded.has(m.seq)
              const preview = m.encoding === 'base64' ? `[binary ${formatBytes(m.size ?? 0)}]` : (m.data || '')
              const pretty = open ? prettyPayload(m) : null
              const hdrs = Object.entries(m.headers || {})
              return (
                <Fragment key={m.seq}>
                  <tr className="cursor-pointer" onClick={() => toggle(m.seq)} aria-expanded={open}>
                    <td className="text-muted-foreground">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                    <td className="font-mono text-xs text-primary">{formatNumber(m.seq)}</td>
                    <td className="text-xs text-muted-foreground">{m.time ? new Date(m.time).toLocaleString() : '—'}</td>
                    <td className="truncate font-mono text-xs" title={m.subject}>{m.subject}</td>
                    <td className="truncate font-mono text-xs text-muted-foreground" title={m.encoding === 'base64' ? undefined : preview.slice(0, 500)}>
                      {hdrs.length > 0 && <span className="chip mr-1.5">{hdrs.length} hdr</span>}
                      {preview || <span className="italic">empty</span>}
                    </td>
                    <td className="text-right font-mono text-xs text-muted-foreground">{formatBytes(m.size ?? 0)}</td>
                  </tr>
                  {open && (
                    <tr className="bg-muted/30 hover:bg-muted/30">
                      <td colSpan={6} className="whitespace-normal px-4 py-3">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                            <span><span className="text-muted-foreground">Subject </span><span className="font-mono">{m.subject}</span></span>
                            <span><span className="text-muted-foreground">Seq </span><span className="font-mono">{m.seq}</span></span>
                            {m.time && <span><span className="text-muted-foreground">Time </span><span className="font-mono">{m.time}</span></span>}
                            <span className="ml-auto flex items-center gap-1">
                              <CopyButton text={m.encoding === 'base64' ? decodeText(m) : m.data} label="Copy payload" />
                              {canDelete && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs hover:text-nats-error" onClick={(e) => { e.stopPropagation(); handleDelete(m) }}>
                                  <Trash2 size={12} /> Delete
                                </Button>
                              )}
                            </span>
                          </div>
                          {hdrs.length > 0 && (
                            <div className="rounded-md border border-border bg-card p-2">
                              {hdrs.map(([k, v]) => (
                                <div key={k} className="font-mono text-xs"><span className="text-primary">{k}</span><span className="text-muted-foreground">: </span>{v}</div>
                              ))}
                            </div>
                          )}
                          <div className="relative">
                            {pretty.binary && <div className="mb-1 text-[11px] text-muted-foreground">Binary payload shown as base64</div>}
                            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-card p-3 font-mono text-xs">{pretty.text}</pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {mode === 'history' && hasMore && (
        <div className="text-center">
          <Button variant="outline" onClick={loadMore} disabled={loading}>{loading ? 'Loading…' : `Load next ${PAGE}`}</Button>
        </div>
      )}
      {mode === 'history' && !hasMore && messages.length > 0 && !loading && (
        <div className="py-1 text-center text-xs text-muted-foreground">End of stream</div>
      )}
    </div>
  )
}
