import { useEffect, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTheme } from '../../context/ThemeContext'
import { formatCompact } from '../../utils/byteFormatter'

function readVar(name) {
  if (typeof window === 'undefined') return ''
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v ? `rgb(${v.split(/\s+/).join(', ')})` : ''
}

/** Resolves CSS chart tokens to concrete colors (SVG attributes cannot use var()). */
export function useChartTheme() {
  const { theme } = useTheme()
  const [colors, setColors] = useState(() => resolve())
  function resolve() {
    return {
      series: [1, 2, 3, 4, 5].map((i) => readVar(`--chart-${i}`)),
      grid: readVar('--chart-grid'),
      axis: readVar('--chart-axis'),
      surface: readVar('--popover'),
      border: readVar('--border'),
      text: readVar('--foreground'),
      muted: readVar('--muted-foreground'),
    }
  }
  useEffect(() => {
    setColors(resolve())
  }, [theme])
  return colors
}

const timeLabel = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

function ChartTooltip({ active, payload, label, series, format }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 text-muted-foreground">{timeLabel(label)}</div>
      {payload.map((p) => {
        const s = series.find((x) => x.key === p.dataKey)
        return (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="text-muted-foreground">{s?.label ?? p.dataKey}</span>
            <span className="ml-auto pl-3 font-mono tabular text-foreground">{(s?.format ?? format)(p.value)}</span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Small time-series area chart with one y-axis.
 *
 * @param {{ data: object[], series: { key: string, label: string, colorIndex?: number, format?: (n:number)=>string }[],
 *           height?: number, format?: (n:number)=>string, showAxis?: boolean }} props
 */
export function TimeSeriesChart({ data, series, height = 160, format = formatCompact, showAxis = true, stacked = false }) {
  const colors = useChartTheme()
  const gradientId = (key) => `ts-grad-${key}`

  if (!data || data.length < 2) {
    return (
      <div style={{ height }} className="flex w-full items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
        Collecting samples…
      </div>
    )
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: showAxis ? 0 : 4 }}>
          <defs>
            {series.map((s, i) => {
              const c = colors.series[(s.colorIndex ?? i) % colors.series.length]
              return (
                <linearGradient key={s.key} id={gradientId(s.key)} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={c} stopOpacity={0.02} />
                </linearGradient>
              )
            })}
          </defs>
          <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} hide={!showAxis} tickFormatter={timeLabel}
            stroke={colors.axis} tick={{ fontSize: 10, fill: colors.axis }} tickLine={false} axisLine={false} minTickGap={48} />
          <YAxis hide={!showAxis} domain={[0, 'auto']} tickFormatter={(v) => formatCompact(v)} width={40}
            stroke={colors.axis} tick={{ fontSize: 10, fill: colors.axis }} tickLine={false} axisLine={false} allowDecimals />
          <Tooltip
            content={<ChartTooltip series={series} format={format} />}
            cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
            isAnimationActive={false}
          />
          {series.map((s, i) => {
            const c = colors.series[(s.colorIndex ?? i) % colors.series.length]
            return (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={c} strokeWidth={2}
                fill={`url(#${gradientId(s.key)})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: colors.surface }}
                isAnimationActive={false} stackId={stacked ? 'stack' : undefined} />
            )
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ChartLegend({ series }) {
  const colors = useChartTheme()
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {series.map((s, i) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: colors.series[(s.colorIndex ?? i) % colors.series.length] }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}

/** Tiny inline trend line for tables. */
export function Sparkline({ points, dataKey, colorIndex = 0, width = 96, height = 28, format = formatCompact }) {
  const colors = useChartTheme()
  if (!points || points.length < 2) return <span className="text-[10px] text-muted-foreground">collecting…</span>
  const c = colors.series[colorIndex]
  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <YAxis hide domain={[0, 'auto']} />
          <Tooltip
            content={({ active, payload }) => (active && payload?.length ? (
              <div className="rounded border border-border bg-popover px-2 py-1 font-mono text-[10px] text-foreground shadow">
                {format(payload[0].value)}
              </div>
            ) : null)}
            cursor={false}
            isAnimationActive={false}
          />
          <Area type="monotone" dataKey={dataKey} stroke={c} fill={c} fillOpacity={0.15} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
