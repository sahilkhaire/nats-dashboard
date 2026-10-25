import { useState } from 'react'
import { Plus, Waves } from 'lucide-react'
import { useConsumerAckRates, formatAckRate } from '../../../../hooks/useConsumerAckRates'
import { useConfig } from '../../../../context/ConfigContext'
import { useStreamMutation } from '../../../../hooks/useStreamMutation'
import { useNotifications } from '../../../../context/NotificationContext'
import { useConfirmDialog } from '../../../../components/shared/ConfirmDialogProvider'
import { ConsumerTable } from '../../../../components/consumers/ConsumerTable'
import { ConsumerModal } from '../../../../components/modals/ConsumerModal'
import { EmptyState } from '../../../../components/shared/EmptyState'
import { MetricCard } from '../../../../components/ui/MetricCard'
import { Button } from '../../../../components/ui/button'
import { formatCompact, formatNumber } from '../../../../utils/byteFormatter'

export function ConsumersTab({ consumers, lastFetch, stream, onChanged }) {
  const { connection } = useConfig()
  const rates = useConsumerAckRates(consumers, lastFetch, `${connection?.id}:${stream.name}`)
  const windowLabel = rates.spanMs > 0 ? `avg over last ${Math.round(rates.spanMs / 1000)}s` : 'collecting samples…'
  const { createConsumer, deleteConsumer } = useStreamMutation()
  const { notifyError, notifySuccess } = useNotifications()
  const { confirm } = useConfirmDialog()
  const [open, setOpen] = useState(false)

  const handleDelete = async (c) => {
    const name = c.name ?? c.config?.durable_name
    const ok = await confirm(`Delete consumer "${name}"?`, 'Clients bound to it will stop receiving messages. Its delivery state is lost.', { confirmLabel: 'Delete consumer' })
    if (!ok) return
    try {
      await deleteConsumer(stream.name, name)
      notifySuccess('Consumer deleted', `"${name}" was removed.`, 'consumer')
      onChanged?.()
    } catch (err) {
      notifyError('Delete failed', err.message, 'consumer')
    }
  }

  const pending = consumers.reduce((s, c) => s + (c.num_pending ?? 0), 0)
  const unacked = consumers.reduce((s, c) => s + (c.num_ack_pending ?? 0), 0)

  return (
    <div className="space-y-4">
      {consumers.length === 0 ? (
        <div className="surface-card">
          <EmptyState icon={Waves} title="No consumers on this stream" description="Consumers track delivery progress for applications reading from the stream."
            action={<Button onClick={() => setOpen(true)} disabled={stream.config?.sealed}><Plus size={15} /> New consumer</Button>} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="Pending" value={formatCompact(pending)} subtext="not yet delivered" tone={pending > 10000 ? 'warn' : 'default'} />
            <MetricCard label="Awaiting ack" value={formatNumber(unacked)} />
            <MetricCard label="Delivered / s" value={formatAckRate(rates.combinedInRate)} subtext={windowLabel} />
            <MetricCard label="Acked / s" value={formatAckRate(rates.combinedOutRate)} subtext={windowLabel} />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setOpen(true)} disabled={stream.config?.sealed}><Plus size={14} /> New consumer</Button>
          </div>
          <ConsumerTable consumers={consumers} rates={rates} onDelete={handleDelete} />
        </>
      )}
      <ConsumerModal
        open={open}
        stream={stream.name}
        onClose={() => setOpen(false)}
        onCreate={async (cfg) => {
          await createConsumer(stream.name, cfg)
          notifySuccess('Consumer created', `"${cfg.name}" is ready.`, 'consumer')
          onChanged?.()
        }}
      />
    </div>
  )
}
