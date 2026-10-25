import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, CornerDownLeft, Search, Plug } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import { NAV_ITEMS } from '../../lib/navigation'
import { useJetStreamData } from '../../hooks/useJetStreamData'
import { useConfig } from '../../context/ConfigContext'
import { cn } from '../../lib/utils'

/**
 * ⌘K / Ctrl+K quick switcher: pages, streams and connections.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const listRef = useRef(null)
  const { connections, selectConnection, connection } = useConfig()
  const { streams } = useJetStreamData({ enabled: open && Boolean(connection) })

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('open-command-palette', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('open-command-palette', onOpen)
    }
  }, [])

  useEffect(() => {
    if (open) { setQuery(''); setActive(0) }
  }, [open])

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (...fields) => !q || fields.some((f) => String(f || '').toLowerCase().includes(q))
    const pages = NAV_ITEMS.filter((i) => match(i.title, i.group, i.description)).map((i) => ({
      id: `page:${i.url}`, label: i.title, hint: i.group, icon: i.icon, run: () => navigate(i.url),
    }))
    const streamItems = streams
      .filter((s) => s.kind === 'stream' && match(s.name, ...(s.config?.subjects || [])))
      .slice(0, 30)
      .map((s) => ({
        id: `stream:${s.name}`, label: s.name, hint: `Stream · ${(s.state?.messages ?? 0).toLocaleString()} msgs`, icon: Database, mono: true,
        run: () => navigate(`/streams/${encodeURIComponent(s.name)}`),
      }))
    const conns = q
      ? connections.filter((c) => match(c.name, c.monitoringUrl)).map((c) => ({
        id: `conn:${c.id}`, label: `Connect to ${c.name}`, hint: c.monitoringUrl, icon: Plug, run: () => selectConnection(c),
      }))
      : []
    return [...pages, ...streamItems, ...conns]
  }, [query, streams, connections, navigate, selectConnection])

  useEffect(() => { setActive(0) }, [query])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const runItem = (item) => {
    if (!item) return
    setOpen(false)
    item.run()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); runItem(items[active]) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[20%] max-w-lg translate-y-0 gap-0 overflow-hidden p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">Jump to</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search size={15} className="text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, streams, connections…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <span className="kbd">esc</span>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">No results</div>
          ) : items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              data-index={i}
              role="option"
              aria-selected={i === active}
              onMouseMove={() => setActive(i)}
              onClick={() => runItem(item)}
              className={cn('flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm', i === active ? 'bg-accent text-accent-foreground' : 'text-foreground')}
            >
              <item.icon size={15} className="shrink-0 text-muted-foreground" />
              <span className={cn('truncate', item.mono && 'font-mono')}>{item.label}</span>
              <span className="ml-auto truncate pl-3 text-xs text-muted-foreground">{item.hint}</span>
              {i === active && <CornerDownLeft size={13} className="shrink-0 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
