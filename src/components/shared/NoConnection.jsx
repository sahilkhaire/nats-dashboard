import { PlugZap } from 'lucide-react'
import { Button } from '../ui/button'
import { useConfig } from '../../context/ConfigContext'
import { LoadingState } from './PageState'

/**
 * Shown when no connection is selected yet.
 */
export function NoConnection() {
  const { contextsLoaded, connections, selectConnection } = useConfig()
  if (!contextsLoaded) return <LoadingState />

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
        <PlugZap size={26} />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Connect to a NATS server</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Add a connection using the server&apos;s HTTP monitoring URL (e.g. <span className="font-mono text-foreground">http://localhost:8222</span>)
        for full visibility, or a <span className="font-mono text-foreground">nats://</span> URL for JetStream views.
      </p>
      <Button className="mt-6" onClick={() => window.dispatchEvent(new CustomEvent('open-add-connection'))}>
        <PlugZap size={15} /> Add connection
      </Button>
      {connections.length > 0 && (
        <div className="mt-8 w-full text-left">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Or pick an existing one</div>
          <div className="surface-card divide-y divide-border">
            {connections.map((c) => (
              <button key={c.id} type="button" onClick={() => selectConnection(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className="truncate font-mono text-xs text-muted-foreground">{c.monitoringUrl}</div>
                </div>
                <span className="text-xs text-primary">Connect →</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="mt-8 text-xs text-muted-foreground">
        Tip: start a local server with <span className="font-mono">nats-server -js -m 8222</span>
      </p>
    </div>
  )
}
