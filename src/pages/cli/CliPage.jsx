import { useEffect, useRef, useState } from 'react'
import { Loader2, TerminalSquare, Trash2 } from 'lucide-react'
import { useConfig } from '../../context/ConfigContext'
import { Button } from '../../components/ui/button'
import { CopyButton } from '../../components/shared/CopyButton'

const HISTORY_KEY = 'nats-dashboard-cli-history'
const EXAMPLES = ['nats stream ls', 'nats consumer ls ORDERS', 'nats kv ls', 'nats server info', 'nats account info', 'nats --help']

function loadHistory() {
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    return Array.isArray(h) ? h.slice(-50) : []
  } catch {
    return []
  }
}

export function CliPage() {
  const { api, connection } = useConfig()
  const [command, setCommand] = useState('')
  const [running, setRunning] = useState(false)
  const [entries, setEntries] = useState([])
  const [history, setHistory] = useState(loadHistory)
  const [cursor, setCursor] = useState(-1)
  const bodyRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { document.title = 'CLI · NATS Dashboard' }, [])
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [entries, running])

  const run = async (raw = command) => {
    const cmd = raw.trim()
    if (!cmd || running) return
    const full = cmd.startsWith('nats') ? cmd : `nats ${cmd}`
    setRunning(true)
    setCommand('')
    setCursor(-1)
    const nextHistory = [...history.filter((h) => h !== full), full].slice(-50)
    setHistory(nextHistory)
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory)) } catch { /* ignore */ }

    const entry = { id: Date.now(), command: full, at: new Date().toLocaleTimeString() }
    try {
      const data = await api('/api/cli/nats', { method: 'POST', body: { command: full } })
      setEntries((prev) => [...prev, { ...entry, ...data }])
    } catch (err) {
      setEntries((prev) => [...prev, { ...entry, ok: false, validationError: err.data?.validationError, stderr: err.data?.validationError ? '' : err.message }])
    } finally {
      setRunning(false)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      run()
    } else if (e.key === 'ArrowUp' && history.length) {
      e.preventDefault()
      const next = cursor < 0 ? history.length - 1 : Math.max(0, cursor - 1)
      setCursor(next)
      setCommand(history[next])
    } else if (e.key === 'ArrowDown' && cursor >= 0) {
      e.preventDefault()
      const next = cursor + 1
      if (next >= history.length) { setCursor(-1); setCommand('') }
      else { setCursor(next); setCommand(history[next]) }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      setEntries([])
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <TerminalSquare size={16} className="text-primary" />
          <h1 className="text-sm font-semibold">NATS CLI</h1>
          <span className="truncate text-xs text-muted-foreground">
            runs on the dashboard host against <span className="font-mono text-foreground">{connection?.natsUrl || connection?.monitoringUrl || '—'}</span>
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setEntries([])} disabled={!entries.length}><Trash2 size={13} /> Clear</Button>
      </div>

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto bg-muted/30 px-4 py-4 font-mono text-[13px] sm:px-6" onClick={() => inputRef.current?.focus()}>
        {entries.length === 0 && (
          <div className="space-y-3 text-muted-foreground">
            <p>Run non-interactive <span className="text-foreground">nats</span> commands. Shell operators (pipes, &&, ;) are blocked. ↑/↓ browse history, Ctrl+L clears.</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={(e) => { e.stopPropagation(); run(ex) }} className="chip hover:border-primary/50 hover:text-primary">{ex}</button>
              ))}
            </div>
          </div>
        )}
        {entries.map((e) => (
          <div key={e.id} className="mb-5">
            <div className="flex items-center gap-2">
              <span className="text-primary">$</span>
              <span className="break-all text-foreground">{e.command}</span>
              <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                {e.validationError ? 'blocked' : `${e.ok ? 'ok' : `exit ${e.exitCode ?? '?'}`} · ${e.durationMs ?? 0}ms`} · {e.at}
              </span>
            </div>
            {e.validationError && <div className="mt-1.5 rounded-md border border-nats-warn/40 bg-nats-warn/10 px-3 py-2 text-nats-warn">{e.validationError}</div>}
            {e.stdout && (
              <div className="group relative mt-1.5">
                <pre className="overflow-x-auto whitespace-pre rounded-md border border-border bg-card p-3 text-xs leading-relaxed text-foreground">{e.stdout}</pre>
                <CopyButton text={e.stdout} className="absolute right-2 top-2 opacity-0 group-hover:opacity-100" />
              </div>
            )}
            {e.stderr && <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap rounded-md border border-nats-error/30 bg-nats-error/5 p-3 text-xs text-nats-error">{e.stderr}</pre>}
            {!e.stdout && !e.stderr && !e.validationError && <div className="mt-1 text-xs text-muted-foreground">(no output)</div>}
          </div>
        ))}
        {running && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 size={13} className="animate-spin" /> running…</div>}
      </div>

      <div className="border-t border-border bg-background px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 rounded-md border border-input bg-card px-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
          <span className="font-mono text-primary">$</span>
          <input
            ref={inputRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="nats stream ls"
            className="h-10 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground"
            disabled={running}
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
          <Button size="sm" onClick={() => run()} disabled={running || !command.trim()}>Run</Button>
        </div>
      </div>
    </div>
  )
}
