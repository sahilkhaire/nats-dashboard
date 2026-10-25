import { Skeleton } from '../ui/skeleton'
import { ConnectionError } from './ConnectionError'
import { EmptyState } from './EmptyState'
import { Unplug } from 'lucide-react'

export function LoadingState({ rows = 3, cards = 4 }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      {cards > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: cards }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-lg" />)}
        </div>
      )}
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
    </div>
  )
}

/**
 * Standard loading / error / unavailable handling for a polled monitoring endpoint.
 * Renders `children` once data is present. A transient error while data exists is
 * shown by the page itself (data stays visible).
 */
export function PollState({ data, error, onRetry, endpoint, loading, children }) {
  if (data?._unavailable) {
    return (
      <div className="surface-card">
        <EmptyState
          icon={Unplug}
          title="Needs the HTTP monitoring port"
          description={`/${endpoint ?? 'this endpoint'} is only available from the NATS HTTP monitoring endpoint (port 8222). This connection uses the NATS protocol, which exposes JetStream data only.`}
          hint="Edit the connection and set its URL to http://<host>:8222 to unlock connections, subscriptions, cluster and account views."
        />
      </div>
    )
  }
  if (!data && error) return <ConnectionError error={error} onRetry={onRetry} />
  if (!data) return loading ?? <LoadingState />
  return children
}
