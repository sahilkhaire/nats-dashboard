import { formatBytes }                             from '../../../../utils/byteFormatter'
import { nsToDuration, parseDurationToNs }         from '../../../../utils/duration'
import { normalizeRetention }                      from '../../../../utils/retention'
import { PropertyRow }                             from '../components/PropertyRow'
import { BoolBadge }                               from '../components/BoolBadge'
import { SectionBox }                              from '../components/SectionBox'
import { KVRow }                                   from '../components/KVRow'
import { MetadataSection }                         from '../components/MetadataSection'
import { RoutingSection }                          from '../components/RoutingSection'

/** Integer limit where empty / 0 / -1 mean unlimited. Throws on garbage instead of silently going unlimited. */
const parseLimit = (v) => {
  const t = String(v ?? '').trim()
  if (t === '' || t === '-1' || t === '0') return -1
  const n = Number(t)
  if (!Number.isInteger(n) || n < 0) throw new Error('Enter a whole number (empty = unlimited)')
  return n
}

const parseDuration = (example) => (v) => {
  const ns = parseDurationToNs(v)
  if (ns === null) throw new Error(`Invalid duration (e.g. ${example})`)
  return ns
}

export function PropertiesTab({ stream, onUpdate }) {
  const cfg   = stream.config || {}
  const state = stream.state  || {}
  const cl    = cfg.consumer_limits || {}

  const makeUpdater = (field, transform) => async (val) => {
    const v = transform ? transform(val) : val
    if (v === null || v === undefined) throw new Error('Invalid value')
    await onUpdate(stream.name, { [field]: v })
  }

  const makeNestedUpdater = (field, key, transform) => async (val) => {
    const v = transform ? transform(val) : val
    if (v === null || v === undefined) throw new Error('Invalid value')
    await onUpdate(stream.name, { [field]: { ...(cfg[field] || {}), [key]: v } })
  }

  const unlim = (v) => (v == null || v <= 0) ? 'Unlimited' : v.toLocaleString()

  const sections = [
    {
      title: 'Identity',
      rows: [
        { label: 'Name',        value: cfg.name ?? '',        editable: false },
        { label: 'Description', value: cfg.description ?? '', editable: true, onSave: makeUpdater('description') },
        {
          label: 'Subjects',
          value: (cfg.subjects || []).join(', '),
          displayValue: cfg.mirror
            ? <span className="text-xs italic text-muted-foreground">Managed by mirror — not configurable</span>
            : (cfg.subjects?.length
                ? cfg.subjects.map(s => <span key={s} className="mb-0.5 mr-1 inline-block rounded bg-border px-1.5 py-0.5 font-mono text-xs text-foreground">{s}</span>)
                : <span className="text-muted-foreground">—</span>),
          editable: !cfg.mirror,
          onSave: async (val) => {
            const subjects = val.trim() ? val.split(',').map(s => s.trim()).filter(Boolean) : []
            await onUpdate(stream.name, { subjects })
          },
        },
      ],
    },
    {
      title: 'Limits',
      rows: [
        { label: 'Max Messages',       value: cfg.max_msgs?.toString()     ?? '-1',  displayValue: unlim(cfg.max_msgs),     editable: true, inputType: 'number', onSave: makeUpdater('max_msgs',     parseLimit) },
        { label: 'Max Bytes',          value: cfg.max_bytes?.toString()    ?? '-1',  displayValue: (cfg.max_bytes == null || cfg.max_bytes <= 0) ? 'Unlimited' : formatBytes(cfg.max_bytes),  editable: true, inputType: 'number', onSave: makeUpdater('max_bytes',    parseLimit) },
        { label: 'Max Message Size',   value: cfg.max_msg_size?.toString() ?? '-1',  displayValue: (cfg.max_msg_size == null || cfg.max_msg_size <= 0) ? 'Unlimited' : formatBytes(cfg.max_msg_size), editable: true, inputType: 'number', onSave: makeUpdater('max_msg_size', parseLimit) },
        { label: 'Max Age',            value: cfg.max_age ? nsToDuration(cfg.max_age) : '',   displayValue: !cfg.max_age || cfg.max_age === 0 ? 'Unlimited' : nsToDuration(cfg.max_age), editable: true, onSave: makeUpdater('max_age', parseDuration('24h, 7d, 1h30m')) },
        { label: 'Max Consumers',      value: cfg.max_consumers?.toString()         ?? '-1', displayValue: unlim(cfg.max_consumers),         editable: true, inputType: 'number', onSave: makeUpdater('max_consumers',         parseLimit) },
        { label: 'Max Msgs per Subject', value: cfg.max_msgs_per_subject?.toString() ?? '-1', displayValue: unlim(cfg.max_msgs_per_subject),  editable: true, inputType: 'number', onSave: makeUpdater('max_msgs_per_subject', parseLimit) },
      ],
    },
    {
      title: 'Storage & Retention',
      rows: [
        { label: 'Storage Type',    value: cfg.storage ?? 'file', editable: false },
        { label: 'Compression',     value: cfg.compression || 'none', displayValue: cfg.compression && cfg.compression !== 'none' ? <span className="text-nats-accent text-xs font-medium uppercase">{cfg.compression}</span> : 'None', editable: true, options: ['none', 's2'], onSave: makeUpdater('compression') },
        { label: 'Retention',       value: normalizeRetention(cfg.retention), editable: true, options: ['limits', 'interest', 'workqueue'], onSave: makeUpdater('retention') },
        { label: 'Discard Policy',  value: cfg.discard   ?? 'old',   editable: true, options: ['old', 'new'], onSave: makeUpdater('discard') },
        { label: 'Discard New Per Subject', value: cfg.discard_new_per_subject ? 'true' : 'false', displayValue: <BoolBadge value={cfg.discard_new_per_subject} onLabel="Yes" offLabel="No" />, editable: true, options: ['false', 'true'], onSave: makeUpdater('discard_new_per_subject', v => v === 'true') },
        {
          label: 'Replicas',
          value: cfg.num_replicas?.toString() ?? '1',
          displayValue: (
            <span className="flex items-center gap-2">
              <span>{cfg.num_replicas ?? 1}</span>
              <span className="text-xs text-muted-foreground">(1–5, cluster required for &gt;1)</span>
            </span>
          ),
          editable: true,
          options: ['1', '2', '3', '4', '5'],
          onSave: makeUpdater('num_replicas', v => { const n = parseInt(v, 10); if (isNaN(n) || n < 1 || n > 5) throw new Error('Replicas must be 1–5'); return n }),
        },
        { label: 'First Sequence',    value: (cfg.first_seq || 1).toLocaleString(), editable: false },
        { label: 'Duplicate Window',  value: nsToDuration(cfg.duplicate_window), displayValue: !cfg.duplicate_window ? 'Default (2m)' : nsToDuration(cfg.duplicate_window), editable: true, onSave: makeUpdater('duplicate_window', parseDuration('2m, 1h')) },
      ],
    },
    {
      title: 'Access & Behavior',
      rows: [
        { label: 'Sealed',               value: cfg.sealed ? 'true' : 'false',             displayValue: cfg.sealed ? <span className="text-nats-error text-xs font-medium">Sealed — no messages, deletes, or updates allowed</span> : <span className="text-xs text-muted-foreground">No</span>, editable: !cfg.sealed, options: ['false', 'true'], onSave: makeUpdater('sealed',             v => v === 'true') },
        { label: 'Deny Delete',          value: cfg.deny_delete ? 'true' : 'false',         displayValue: <BoolBadge value={cfg.deny_delete} onLabel="Yes — API message delete blocked" offLabel="No" warn />, editable: true, options: ['false', 'true'], onSave: makeUpdater('deny_delete',          v => v === 'true') },
        { label: 'Deny Purge',           value: cfg.deny_purge  ? 'true' : 'false',         displayValue: <BoolBadge value={cfg.deny_purge}  onLabel="Yes — API purge blocked"          offLabel="No" warn />, editable: true, options: ['false', 'true'], onSave: makeUpdater('deny_purge',           v => v === 'true') },
        { label: 'No Ack',               value: cfg.no_ack      ? 'true' : 'false',         displayValue: cfg.no_ack ? <span className="text-nats-warn text-xs font-medium">Enabled — publish acks disabled (use core NATS publish)</span> : <span className="text-xs text-muted-foreground">Disabled</span>, editable: true, options: ['false', 'true'], onSave: makeUpdater('no_ack', v => v === 'true') },
        { label: 'Allow Rollup Headers', value: cfg.allow_rollup_hdrs ? 'true' : 'false',   displayValue: <BoolBadge value={cfg.allow_rollup_hdrs} />, editable: true, options: ['false', 'true'], onSave: makeUpdater('allow_rollup_hdrs', v => v === 'true') },
        { label: 'Allow Direct Get',     value: cfg.allow_direct      ? 'true' : 'false',   displayValue: <BoolBadge value={cfg.allow_direct}      />, editable: true, options: ['false', 'true'], onSave: makeUpdater('allow_direct',      v => v === 'true') },
        { label: 'Mirror Direct Get',    value: cfg.mirror_direct     ? 'true' : 'false',   displayValue: <BoolBadge value={cfg.mirror_direct}     />, editable: true, options: ['false', 'true'], onSave: makeUpdater('mirror_direct',     v => v === 'true') },
      ],
    },
    {
      title: 'Features (2.11+)',
      rows: [
        { label: 'Allow Msg TTL',              value: cfg.allow_msg_ttl      ? 'true' : 'false', displayValue: cfg.allow_msg_ttl ? <span className="text-nats-ok text-xs font-medium">Enabled — publishers may set Nats-Msg-Ttl header</span> : <span className="text-xs text-muted-foreground">Disabled</span>, editable: true, options: ['false', 'true'], onSave: makeUpdater('allow_msg_ttl',      v => v === 'true') },
        { label: 'Subject Delete Marker TTL',  value: nsToDuration(cfg.subject_delete_marker_ttl), displayValue: !cfg.subject_delete_marker_ttl ? <span className="text-xs text-muted-foreground">Disabled</span> : nsToDuration(cfg.subject_delete_marker_ttl), editable: true, onSave: makeUpdater('subject_delete_marker_ttl', parseDuration('5m, 1h')) },
        { label: 'Allow Msg Counter',          value: cfg.allow_msg_counter  ? 'true' : 'false', displayValue: <BoolBadge value={cfg.allow_msg_counter}  />, editable: true, options: ['false', 'true'], onSave: makeUpdater('allow_msg_counter',  v => v === 'true') },
        { label: 'Allow Atomic Publish',       value: cfg.allow_atomic       ? 'true' : 'false', displayValue: <BoolBadge value={cfg.allow_atomic}       />, editable: true, options: ['false', 'true'], onSave: makeUpdater('allow_atomic',       v => v === 'true') },
        { label: 'Allow Msg Schedules',        value: cfg.allow_msg_schedules ? 'true' : 'false', displayValue: <BoolBadge value={cfg.allow_msg_schedules} />, editable: true, options: ['false', 'true'], onSave: makeUpdater('allow_msg_schedules', v => v === 'true') },
        { label: 'Persist Mode',               value: cfg.persist_mode || 'none', editable: true, options: ['none', 'no_fallthrough'], onSave: makeUpdater('persist_mode') },
      ],
    },
    {
      title: 'Consumer Limits',
      rows: [
        { label: 'Max Ack Pending',    value: cl.max_ack_pending?.toString() ?? '', displayValue: unlim(cl.max_ack_pending),    editable: true, inputType: 'number', onSave: makeNestedUpdater('consumer_limits', 'max_ack_pending',    parseLimit) },
        { label: 'Max Deliver',        value: cl.max_deliver?.toString()     ?? '', displayValue: unlim(cl.max_deliver),        editable: true, inputType: 'number', onSave: makeNestedUpdater('consumer_limits', 'max_deliver',        parseLimit) },
        { label: 'Inactive Threshold', value: nsToDuration(cl.inactive_threshold), displayValue: !cl.inactive_threshold ? 'Default' : nsToDuration(cl.inactive_threshold), editable: true, onSave: makeNestedUpdater('consumer_limits', 'inactive_threshold', parseDuration('5m, 1h')) },
      ],
    },
    {
      title: 'Current State',
      rows: [
        { label: 'Messages',       value: state.messages?.toLocaleString()    ?? '0',  editable: false },
        { label: 'Bytes',          value: formatBytes(state.bytes),                    editable: false },
        { label: 'Consumer Count', value: state.consumer_count?.toString()    ?? '0',  editable: false },
        { label: 'Num Subjects',   value: state.num_subjects?.toLocaleString() ?? '—', editable: false },
        { label: 'Num Deleted',    value: state.num_deleted?.toLocaleString()  ?? '0', editable: false },
        { label: 'First Sequence', value: state.first_seq?.toLocaleString()   ?? '—',  editable: false },
        { label: 'Last Sequence',  value: state.last_seq?.toLocaleString()    ?? '—',  editable: false },
        { label: 'First Message',  value: state.first_ts ? new Date(state.first_ts).toLocaleString() : '—', editable: false },
        { label: 'Last Message',   value: state.last_ts  ? new Date(state.last_ts).toLocaleString()  : '—', editable: false },
        { label: 'Created',        value: stream.created ? new Date(stream.created).toLocaleString() : '—', editable: false },
      ],
    },
  ]

  return (
    <div className="space-y-4">
      {cfg.sealed && (
        <div className="rounded-lg border border-nats-warn/40 bg-nats-warn/10 px-4 py-3 text-sm text-nats-warn">This stream is sealed — its configuration can no longer be changed.</div>
      )}
      {sections.map(section => (
        <div key={section.title} className="surface-card overflow-hidden">
          <div className="card-header">
            <span className="card-title">{section.title}</span>
          </div>
          {section.rows.map(row => (
            <PropertyRow key={row.label} {...row} editable={row.editable && !cfg.sealed} />
          ))}
        </div>
      ))}

      {cfg.mirror && (
        <SectionBox title="Mirror Source">
          <KVRow label="Mirror Stream">{cfg.mirror.name ?? '—'}</KVRow>
          {cfg.mirror.filter_subject   && <KVRow label="Filter Subject">{cfg.mirror.filter_subject}</KVRow>}
          {cfg.mirror.opt_start_seq != null && <KVRow label="Start Sequence">{cfg.mirror.opt_start_seq.toLocaleString()}</KVRow>}
          {cfg.mirror.opt_start_time   && <KVRow label="Start Time">{new Date(cfg.mirror.opt_start_time).toLocaleString()}</KVRow>}
          {cfg.mirror.external?.api    && <KVRow label="External API">{cfg.mirror.external.api}</KVRow>}
          {cfg.mirror.external?.deliver && <KVRow label="External Deliver">{cfg.mirror.external.deliver}</KVRow>}
          <KVRow label=""><span className="text-xs text-muted-foreground">Mirror configuration is set at creation and cannot be changed.</span></KVRow>
        </SectionBox>
      )}

      {(cfg.sources || []).length > 0 && (
        <SectionBox title={`Sources (${cfg.sources.length})`}>
          {cfg.sources.map((src, i) => (
            <div key={i} className="space-y-1 border-b border-border px-4 py-3 last:border-0">
              <div className="font-mono text-sm text-nats-accent font-medium">{src.name}</div>
              {src.filter_subject  && <div className="text-xs text-muted-foreground">Filter: <span className="font-mono text-foreground">{src.filter_subject}</span></div>}
              {src.opt_start_seq != null && <div className="text-xs text-muted-foreground">Start seq: <span className="font-mono text-foreground">{src.opt_start_seq.toLocaleString()}</span></div>}
              {src.external?.api   && <div className="text-xs text-muted-foreground">External: <span className="font-mono text-foreground">{src.external.api}</span></div>}
            </div>
          ))}
        </SectionBox>
      )}

      {cfg.placement && (cfg.placement.cluster || (cfg.placement.tags || []).length > 0) && (
        <SectionBox title="Placement">
          {cfg.placement.cluster && <KVRow label="Cluster">{cfg.placement.cluster}</KVRow>}
          {(cfg.placement.tags || []).length > 0 && (
            <KVRow label="Tags">
              {cfg.placement.tags.map(t => (
                <span key={t} className="mr-1 inline-block rounded bg-border px-1.5 py-0.5 font-mono text-xs text-foreground">{t}</span>
              ))}
            </KVRow>
          )}
          <KVRow label=""><span className="text-xs text-muted-foreground">Placement is set at creation and cannot be changed.</span></KVRow>
        </SectionBox>
      )}

      <RoutingSection cfg={cfg} onUpdate={onUpdate} streamName={stream.name} />
      <MetadataSection metadata={cfg.metadata || {}} onSave={async (metadata) => onUpdate(stream.name, { metadata })} />
    </div>
  )
}
