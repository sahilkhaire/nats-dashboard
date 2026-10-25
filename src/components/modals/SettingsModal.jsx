import { Moon, Sun, Trash2, Pencil } from 'lucide-react'
import { useConfig, POLL_OPTIONS } from '../../context/ConfigContext'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { useConfirmDialog } from '../shared/ConfirmDialogProvider'
import { cn } from '../../lib/utils'

const label = (ms) => (ms < 60000 ? `${ms / 1000}s` : `${ms / 60000}m`)

export function SettingsModal({ open, onClose, onEditConnection }) {
  const { pollInterval, setPollInterval, savedConnections, removeConnection, connection } = useConfig()
  const { theme, setTheme } = useTheme()
  const { confirm } = useConfirmDialog()
  const { version } = useAuth()

  const handleRemove = async (c) => {
    const ok = await confirm(`Remove "${c.name}"?`, 'The saved connection (and its token) is removed from this browser.', { confirmLabel: 'Remove', destructive: true })
    if (ok) removeConnection(c.id)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Preferences are stored in this browser.{version ? ` · NATS Dashboard v${version}` : ''}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section>
            <div className="field-label">Refresh interval</div>
            <div className="flex flex-wrap gap-1.5">
              {POLL_OPTIONS.map((ms) => (
                <button
                  key={ms}
                  type="button"
                  onClick={() => setPollInterval(ms)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 font-mono text-xs transition-colors',
                    pollInterval === ms ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label(ms)}
                </button>
              ))}
            </div>
            <p className="field-hint">How often monitoring data is refreshed. Polling pauses automatically while the tab is hidden.</p>
          </section>

          <section>
            <div className="field-label">Theme</div>
            <div className="flex gap-1.5">
              {[{ id: 'dark', icon: Moon, text: 'Dark' }, { id: 'light', icon: Sun, text: 'Light' }].map(({ id, icon: Icon, text }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTheme(id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors',
                    theme === id ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon size={13} /> {text}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="field-label">Saved connections</div>
            {savedConnections.length === 0 ? (
              <p className="text-xs text-muted-foreground">No saved connections. Add one from the connection menu in the top bar.</p>
            ) : (
              <div className="divide-y divide-border rounded-md border border-border">
                {savedConnections.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {c.name}
                        {connection?.id === c.id && <span className="ml-2 text-[10px] uppercase tracking-wide text-primary">active</span>}
                      </div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">{c.monitoringUrl}</div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEditConnection?.(c)} title="Edit">
                      <Pencil size={13} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-nats-error" onClick={() => handleRemove(c)} title="Remove">
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
