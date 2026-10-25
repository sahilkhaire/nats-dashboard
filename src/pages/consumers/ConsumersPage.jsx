import { useMemo, useState } from 'react'
import { Waves } from 'lucide-react'
import { useJetStreamData } from '../../hooks/useJetStreamData'
import { useConsumerAckRates, formatAckRate } from '../../hooks/useConsumerAckRates'
import { useConfig } from '../../context/ConfigContext'
import { useStreamMutation } from '../../hooks/useStreamMutation'
import { useConfirmDialog } from '../../components/shared/ConfirmDialogProvider'
import { useNotifications } from '../../context/NotificationContext'
import { ConsumerTable, consumerHealth } from '../../components/consumers/ConsumerTable'
import { MetricCard } from '../../components/ui/MetricCard'
import { PageHeader } from '../../components/shared/PageHeader'
import { PollState } from '../../components/shared/PageState'
import { SearchInput, makeMatcher } from '../../components/shared/SearchInput'
import { EmptyState } from '../../components/shared/EmptyState'
import { formatCompact, formatNumber } from '../../utils/byteFormatter'

export function ConsumersPage() {
  const { data, error, refetch, consumers, lastFetch } = useJetStreamData()
  const { connection } = useConfig()
  const rates = useConsumerAckRates(consumers, lastFetch, `${connection?.id}:all`)
  const { deleteConsumer } = useStreamMutation()
  const { confirm } = useConfirmDialog()
  const { notifyError, notifySuccess } = useNotifications()
  const [search, setSearch] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const [filterStream, setFilterStream] = useState('all')
  const [filterHealth, setFilterHealth] = useState('all')

  const streamNames = useMemo(() => [...new Set(consumers.map((c) => c.stream))].sort(), [consumers])
  const matcher = makeMatcher(search, useRegex)

  const filtered = useMemo(() => consumers.filter((c) =>
    (matcher.test(c.name) || matcher.test(c.stream) || matcher.test(c.config?.filter_subject))
    && (filterStream === 'all' || c.stream === filterStream)
    && (filterHealth === 'all' || (filterHealth === 'attention' ? consumerHealth(c).status !== 'ok' : consumerHealth(c).status === 'ok'))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [consumers, search, useRegex, filterStream, filterHealth])


  const attention = consumers.filter((c) => consumerHealth(c).status !== 'ok').length
  const pending = consumers.reduce((s, c) => s + (c.num_pending ?? 0), 0)
  const unacked = consumers.reduce((s, c) => s + (c.num_ack_pending ?? 0), 0)

  const handleDelete = async (c) => {
    const ok = await confirm(`Delete consumer "${c.name}" on "${c.stream}"?`, 'Clients bound to it will stop receiving messages. Its delivery state is lost.', { confirmLabel: 'Delete consumer' })
    if (!ok) return
    try {
      await deleteConsumer(c.stream, c.name)
      notifySuccess('Consumer deleted', `"${c.name}" was removed.`, 'consumer')
      refetch()
    } catch (err) {
      notifyError('Delete failed', err.message, 'consumer')
    }
  }

  return (
    <div>
      <PageHeader title="Consumers" icon={Waves} description="Delivery progress of every JetStream consumer" />
      <PollState data={data} error={error} onRetry={refetch}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="Consumers" value={formatNumber(consumers.length)} subtext={`across ${streamNames.length} streams`} />
            <MetricCard label="Needs attention" value={formatNumber(attention)} tone={attention ? 'warn' : 'ok'} subtext="lagging, stalled or redelivering" />
            <MetricCard label="Pending" value={formatCompact(pending)} subtext="messages not yet delivered" />
            <MetricCard label="Acked / s" value={formatAckRate(rates.combinedOutRate)}
              subtext={rates.spanMs > 0 ? `delivered ${formatAckRate(rates.combinedInRate)} · ${Math.round(rates.spanMs / 1000)}s avg` : 'collecting samples…'} />
          </div>

          <div className="flex flex-wrap items-start gap-2">
            <SearchInput value={search} onChange={(v) => { setSearch(v) }} placeholder="Filter by consumer, stream or subject…"
              regex={useRegex} onRegexChange={setUseRegex} error={matcher.error} className="max-w-md" />
            <select value={filterStream} onChange={(e) => { setFilterStream(e.target.value) }} className="input-enterprise w-auto" aria-label="Stream">
              <option value="all">All streams</option>
              {streamNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <select value={filterHealth} onChange={(e) => { setFilterHealth(e.target.value) }} className="input-enterprise w-auto" aria-label="Status">
              <option value="all">Any status</option>
              <option value="attention">Needs attention</option>
              <option value="ok">Healthy</option>
            </select>
          </div>

          {consumers.length === 0 ? (
            <div className="surface-card">
              <EmptyState icon={Waves} title="No consumers" description="Create one from a stream's Consumers tab." />
            </div>
          ) : (
            <ConsumerTable consumers={filtered} showStream rates={rates} onDelete={handleDelete} />
          )}
        </div>
      </PollState>
    </div>
  )
}
