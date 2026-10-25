import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Check, ChevronDown, ChevronRight, GitMerge, LogOut, Moon, Pause, Play, Plus, RefreshCw, ServerCog, Settings, Sun,
} from 'lucide-react'
import { useConfig, POLL_OPTIONS } from '../../context/ConfigContext'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { NotificationCenterButton } from '../../context/NotificationContext'
import { useNatsPolling } from '../../hooks/useNatsPolling'
import { findNavItem } from '../../lib/navigation'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { SidebarTrigger } from '../ui/sidebar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { AddConnectionModal } from '../modals/AddConnectionModal'
import { SettingsModal } from '../modals/SettingsModal'

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

function healthTone(health, error) {
  if (error) return { tone: 'error', label: 'Unreachable' }
  const status = String(health?.status || '').toLowerCase()
  if (status === 'ok') return { tone: 'ok', label: 'Healthy' }
  if (!health) return { tone: 'neutral', label: 'Connecting' }
  return { tone: 'warn', label: health.status || 'Degraded' }
}

const DOT = { ok: 'bg-nats-ok', warn: 'bg-nats-warn', error: 'bg-nats-error', neutral: 'bg-muted-foreground' }

function ConnectionSwitcher({ health, onAdd }) {
  const { connection, contexts, savedConnections, selectConnection } = useConfig()
  const h = healthTone(health.data, health.error)

  const renderItem = (c) => (
    <DropdownMenuItem key={c.id} onSelect={() => selectConnection(c)} className="items-start gap-2 py-2">
      <span className="mt-1 w-3.5 shrink-0">{connection?.id === c.id && <Check size={14} className="text-primary" />}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{c.name}</span>
        <span className="block truncate font-mono text-[11px] text-muted-foreground">{c.monitoringUrl}</span>
      </span>
    </DropdownMenuItem>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 max-w-[260px] gap-2 px-2.5" title={connection ? `${connection.name} — ${h.label}` : 'Select a connection'}>
          <span className={cn('h-2 w-2 shrink-0 rounded-full', connection ? DOT[h.tone] : 'bg-muted-foreground', h.tone === 'ok' && 'shadow-[0_0_0_3px_rgb(var(--nats-ok)/0.15)]')} />
          <span className="truncate text-xs font-medium">{connection?.name || 'No connection'}</span>
          <ChevronDown size={13} className="shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        {contexts.length > 0 && (
          <>
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">NATS contexts</DropdownMenuLabel>
            {contexts.map(renderItem)}
          </>
        )}
        {savedConnections.length > 0 && (
          <>
            {contexts.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Saved connections</DropdownMenuLabel>
            {savedConnections.map(renderItem)}
          </>
        )}
        {(contexts.length > 0 || savedConnections.length > 0) && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={onAdd} className="gap-2">
          <Plus size={14} /> Add connection…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RefreshControl({ lastFetch, onRefresh }) {
  const { pollInterval, setPollInterval, paused, setPaused } = useConfig()
  const now = useNow()
  const age = lastFetch ? Math.max(0, Math.round((now - lastFetch) / 1000)) : null
  const label = (ms) => (ms < 60000 ? `${ms / 1000}s` : `${ms / 60000}m`)

  return (
    <div className="flex h-8 items-center rounded-md border border-input bg-background shadow-sm">
      <button
        type="button"
        onClick={onRefresh}
        className="flex h-full items-center gap-1.5 rounded-l-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Refresh now"
      >
        <RefreshCw size={13} />
        <span className="hidden font-mono tabular lg:inline">{paused ? 'paused' : age == null ? '—' : `${age}s ago`}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex h-full items-center gap-1 border-l border-input px-2 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="Refresh interval">
            {paused ? <Pause size={12} /> : label(pollInterval)}
            <ChevronDown size={12} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Auto refresh</DropdownMenuLabel>
          {POLL_OPTIONS.map((ms) => (
            <DropdownMenuItem key={ms} onSelect={() => { setPollInterval(ms); setPaused(false) }} className="gap-2">
              <span className="w-3.5">{!paused && pollInterval === ms && <Check size={13} className="text-primary" />}</span>
              Every {label(ms)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setPaused(!paused)} className="gap-2">
            {paused ? <Play size={13} /> : <Pause size={13} />}
            {paused ? 'Resume' : 'Pause'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function Breadcrumbs() {
  const { pathname } = useLocation()
  const item = findNavItem(pathname)
  const parts = pathname.split('/').filter(Boolean)
  const detail = parts.length > 1 ? decodeURIComponent(parts.slice(1).join('/')) : null
  if (!item) return null
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
      <span className="text-muted-foreground">{item.group}</span>
      <ChevronRight size={13} className="shrink-0 text-muted-foreground/60" />
      {detail ? (
        <>
          <Link to={item.url} className="text-muted-foreground hover:text-foreground">{item.title}</Link>
          <ChevronRight size={13} className="shrink-0 text-muted-foreground/60" />
          <span className="truncate font-mono text-foreground">{detail}</span>
        </>
      ) : (
        <span className="truncate font-medium text-foreground">{item.title}</span>
      )}
    </nav>
  )
}

export function Header({ serverMode, lastUpdated, onRefresh }) {
  const { addConnection, updateConnection, selectConnection } = useConfig()
  const { logout, authEnabled } = useAuth()
  const { theme, setTheme } = useTheme()
  const health = useNatsPolling('/healthz')
  const [connModal, setConnModal] = useState({ open: false, initial: null })
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    const open = () => setConnModal({ open: true, initial: null })
    window.addEventListener('open-add-connection', open)
    return () => window.removeEventListener('open-add-connection', open)
  }, [])

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4">
      <SidebarTrigger className="-ml-1 h-8 w-8" />
      <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
      <ConnectionSwitcher health={health} onAdd={() => setConnModal({ open: true, initial: null })} />
      {serverMode && (
        <span
          className="hidden items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground lg:inline-flex"
          title={serverMode.type === 'cluster' ? `Cluster ${serverMode.clusterName || ''}` : 'Standalone server'}
        >
          {serverMode.type === 'cluster' ? <GitMerge size={12} /> : <ServerCog size={12} />}
          {serverMode.type === 'cluster' ? `Cluster${serverMode.routes ? ` · ${serverMode.routes} routes` : ''}` : 'Standalone'}
        </span>
      )}
      <div className="mx-2 min-w-0 flex-1">
        <Breadcrumbs />
      </div>
      <div className="flex items-center gap-1">
        <RefreshControl lastFetch={lastUpdated} onRefresh={onRefresh} />
        <Button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </Button>
        <NotificationCenterButton />
        <Button onClick={() => setSettingsOpen(true)} variant="ghost" size="icon" className="h-8 w-8" title="Settings">
          <Settings size={16} />
        </Button>
        {authEnabled && (
          <Button onClick={logout} variant="ghost" size="icon" className="h-8 w-8" title="Sign out">
            <LogOut size={16} />
          </Button>
        )}
      </div>

      <AddConnectionModal
        open={connModal.open}
        initial={connModal.initial}
        onClose={() => setConnModal({ open: false, initial: null })}
        onAdd={(c) => selectConnection(addConnection(c))}
        onSave={(id, c) => updateConnection(id, c)}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onEditConnection={(c) => { setSettingsOpen(false); setConnModal({ open: true, initial: c }) }}
      />
    </header>
  )
}
