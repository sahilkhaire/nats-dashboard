import { useConfig } from '../../context/ConfigContext'
import { AlertCircle, RefreshCw, Terminal } from 'lucide-react'
import { Button } from '../ui/button'
import { CopyButton } from './CopyButton'

function Code({ children }) {
  return (
    <div className="group relative mt-1.5">
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/50 px-3 py-2 pr-9 font-mono text-xs text-foreground">{children}</pre>
      <CopyButton text={children} className="absolute right-1.5 top-1.5" />
    </div>
  )
}

export function ConnectionError({ error, onRetry }) {
  const { connection } = useConfig()
  const serverUrl = connection?.monitoringUrl || ''
  const message = String(error || 'Unknown error')

  let hostname = serverUrl
  let isHttp = false
  try {
    const u = new URL(serverUrl)
    hostname = u.hostname
    isHttp = u.protocol.startsWith('http')
  } catch { /* ignore */ }

  const unreachable = /timed out|refused|reach|fetch failed|ECONN|ENOTFOUND|EHOSTUNREACH/i.test(message)
  const auth = /authorization|permission|unauthorized/i.test(message)

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-6">
      <div className="surface-card flex items-start gap-3 border-nats-error/40 p-4">
        <AlertCircle size={18} className="mt-0.5 shrink-0 text-nats-error" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-foreground">Cannot load data from {connection?.name || 'the NATS server'}</div>
          <div className="mt-1 break-words font-mono text-xs text-muted-foreground">{message}</div>
        </div>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw size={13} /> Retry
          </Button>
        )}
      </div>

      {auth && (
        <div className="surface-card p-4 text-sm text-muted-foreground">
          The server rejected the credentials. Edit the connection (connection menu in the top bar) and check its token.
        </div>
      )}

      {unreachable && (
        <div className="surface-card space-y-4 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Terminal size={15} className="text-primary" />
            Troubleshooting
          </div>
          {isHttp ? (
            <>
              <div>
                <div className="text-sm font-medium">1. Check that monitoring is enabled on the server</div>
                <Code>{'nats-server -m 8222\n# or in the config file:\nhttp_port: 8222'}</Code>
              </div>
              <div>
                <div className="text-sm font-medium">2. Tunnel the port if it is firewalled or bound to localhost</div>
                <Code>{`ssh -L 8222:localhost:8222 user@${hostname} -N`}</Code>
                <p className="mt-1.5 text-xs text-muted-foreground">Then add a connection to <span className="font-mono">http://localhost:8222</span>.</p>
              </div>
              <div>
                <div className="text-sm font-medium">3. Or use the NATS protocol instead</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  A <span className="font-mono">nats://{hostname}:4222</span> connection shows JetStream (streams, consumers, KV, objects) without the monitoring port.
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              The dashboard server could not open a NATS connection to <span className="font-mono">{connection?.natsUrl || serverUrl}</span>.
              Make sure the host and port are reachable from where the dashboard runs (inside Docker, use the service name or <span className="font-mono">host.docker.internal</span>).
            </p>
          )}
        </div>
      )}
    </div>
  )
}
