import { useNavigate } from 'react-router-dom'
import { GitMerge }   from 'lucide-react'
import { useChartTheme } from '../../../../components/charts/TimeSeriesChart'

export function RelationsTab({ stream, allStreams }) {
  const navigate = useNavigate()
  const theme = useChartTheme()
  const name  = stream.name
  const cfg   = stream.config || {}

  const nodes = [{ id: name, label: name, type: 'current' }]
  const edges = []

  if (cfg.mirror?.name) {
    const mn = cfg.mirror.name
    if (!nodes.find(n => n.id === mn)) {
      nodes.push({ id: mn, label: mn, type: allStreams.some(s => s.name === mn) ? 'stream' : 'external' })
    }
    edges.push({ from: mn, to: name, label: 'mirror of' })
  }

  for (const src of cfg.sources || []) {
    const sn = src.name
    if (!nodes.find(n => n.id === sn)) {
      nodes.push({ id: sn, label: sn, type: allStreams.some(s => s.name === sn) ? 'stream' : 'external' })
    }
    edges.push({ from: sn, to: name, label: 'source' })
  }

  if (cfg.republish?.dst) {
    const dst   = cfg.republish.dst
    const dstId = `__subj__${dst}`
    nodes.push({ id: dstId, label: dst, type: 'subject' })
    edges.push({ from: name, to: dstId, label: 'republish' })
  }

  for (const s of allStreams) {
    if (s.name === name) continue
    const sc = s.config || {}
    if (sc.mirror?.name === name) {
      if (!nodes.find(n => n.id === s.name)) nodes.push({ id: s.name, label: s.name, type: 'stream' })
      edges.push({ from: name, to: s.name, label: 'mirrored by' })
    }
    for (const src of sc.sources || []) {
      if (src.name === name) {
        if (!nodes.find(n => n.id === s.name)) nodes.push({ id: s.name, label: s.name, type: 'stream' })
        edges.push({ from: name, to: s.name, label: 'sourced by' })
      }
    }
  }

  if (nodes.length === 1) {
    return (
      <div className="surface-card space-y-2 p-10 text-center">
        <GitMerge size={32} className="mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No relations found for this stream.</p>
        <p className="text-xs text-muted-foreground">Configure a mirror, sources, or republish to see relationships here.</p>
      </div>
    )
  }

  const W = 720; const H = 300
  const CX = W / 2; const CY = H / 2
  const NW = 150; const NH = 38

  const incomers = nodes.filter(n => n.id !== name && edges.some(e => e.to === name && e.from === n.id))
  const outgoers = nodes.filter(n => n.id !== name && edges.some(e => e.from === name && e.to === n.id))

  const pos = {}
  pos[name] = { x: CX, y: CY }
  const gap = 85
  incomers.forEach((n, i) => {
    const offset = ((incomers.length - 1) * gap) / 2
    pos[n.id] = { x: CX - 220, y: CY - offset + i * gap }
  })
  outgoers.forEach((n, i) => {
    const offset = ((outgoers.length - 1) * gap) / 2
    pos[n.id] = { x: CX + 220, y: CY - offset + i * gap }
  })

  const typeColor = { current: theme.series[0], stream: theme.series[2], external: theme.series[3], subject: theme.series[1] }
  const typeLabel = { current: 'This stream', stream: 'Other stream (click to open)', external: 'External / unknown', subject: 'Republish subject' }

  return (
    <div className="surface-card overflow-hidden">
      <div className="card-header">
        <GitMerge size={14} className="text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stream Relations</span>
        <span className="ml-auto text-xs text-muted-foreground">{edges.length} relation{edges.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="p-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: '300px' }}>
          <defs>
            <marker id="rel-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill={theme.axis} />
            </marker>
          </defs>

          {edges.map((e, i) => {
            const fp = pos[e.from]; const tp = pos[e.to]
            if (!fp || !tp) return null
            const dx = tp.x - fp.x
            const x1 = fp.x + (dx > 0 ? NW / 2 : -NW / 2)
            const x2 = tp.x + (dx > 0 ? -NW / 2 - 6 : NW / 2 + 6)
            const y1 = fp.y; const y2 = tp.y
            const mx = (x1 + x2) / 2; const my = Math.min(y1, y2) - 10
            return (
              <g key={i}>
                <path d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`} fill="none" stroke={theme.axis} strokeWidth="1.5" markerEnd="url(#rel-arrow)" />
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" fill={theme.muted} fontSize="10" style={{ fontFamily: 'sans-serif' }}>
                  {e.label}
                </text>
              </g>
            )
          })}

          {nodes.map(n => {
            const p = pos[n.id]; if (!p) return null
            const color     = typeColor[n.type] || theme.axis
            const clickable = n.type === 'stream'
            const label     = n.label.length > 18 ? n.label.slice(0, 17) + '…' : n.label
            return (
              <g key={n.id}
                transform={`translate(${p.x - NW / 2},${p.y - NH / 2})`}
                style={{ cursor: clickable ? 'pointer' : 'default' }}
                onClick={() => clickable && navigate(`/streams/${encodeURIComponent(n.id)}`)}
              >
                <rect width={NW} height={NH} rx="6" fill={theme.surface} stroke={color} strokeWidth={n.type === 'current' ? '2' : '1.25'} />
                <text x={NW / 2} y={NH / 2 + 4} textAnchor="middle" fill={theme.text} fontSize="11" fontFamily="monospace" fontWeight={n.type === 'current' ? '600' : '400'}>
                  {label}
                </text>
              </g>
            )
          })}
        </svg>

        <div className="mt-3 flex flex-wrap gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
          {Object.keys(typeLabel).map((type) => ({ color: typeColor[type], label: typeLabel[type] })).map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded border-2" style={{ borderColor: color }} />
              {label}
            </div>
          ))}
        </div>

        {edges.length > 0 && (
          <div className="mt-3 space-y-1">
            {edges.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono text-foreground">{e.from.startsWith('__subj__') ? e.from.replace('__subj__', '') : e.from}</span>
                <span className="text-muted-foreground">→ {e.label} →</span>
                <span className="font-mono text-foreground">{e.to.startsWith('__subj__') ? e.to.replace('__subj__', '') : e.to}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
