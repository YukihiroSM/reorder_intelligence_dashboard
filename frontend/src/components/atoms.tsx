import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, CircleHelp, Info } from 'lucide-react'

import { FLAG_DEFS } from '../lib/constants'
import type { StockStatus, Trend } from '../types'

/* ===== Info tooltip (small "?" icon, bubble on hover) ===== */
export function InfoTip({
  text,
  align = 'center',
}: {
  text: string
  align?: 'center' | 'left' | 'right'
}) {
  return (
    <span
      className={`infotip infotip-${align}`}
      tabIndex={0}
      onClick={(e) => e.stopPropagation()} // don't trigger header sort
    >
      <CircleHelp size={12} />
      <span className="infotip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  )
}

/* ===== Status badge ===== */
export function StatusBadge({ status, large }: { status: StockStatus; large?: boolean }) {
  return (
    <span className={`status-badge ${status.toLowerCase()}${large ? ' large' : ''}`}>
      <span className="dot" />
      {status}
    </span>
  )
}

/* ===== Sparkline ===== (ported from design atoms.jsx)
   30 daily bars + 7d moving average, colored by trend; trailing zeros (stockout)
   override to red, leading zeros (launch) to gray. */
interface TrendInfo {
  dir: Trend
  delta: number
}

function trendOf(data: number[]): TrendInfo {
  const nonZero = data.filter((v) => v > 0)
  if (nonZero.length < 8) return { dir: 'flat', delta: 0 }
  const half = Math.floor(nonZero.length / 2)
  const earlier = nonZero.slice(0, half).reduce((s, x) => s + x, 0) / half
  const later = nonZero.slice(-half).reduce((s, x) => s + x, 0) / half
  if (earlier === 0) return { dir: 'flat', delta: 0 }
  const delta = (later - earlier) / earlier
  if (delta > 0.06) return { dir: 'up', delta }
  if (delta < -0.06) return { dir: 'down', delta }
  return { dir: 'flat', delta }
}

const TREND_COLORS: Record<Trend, { bar: string; line: string; tint: string }> = {
  up: { bar: '#16A34A', line: '#166534', tint: '#DCFCE7' },
  down: { bar: '#DC2626', line: '#991B1B', tint: '#FEE2E2' },
  flat: { bar: '#0369A1', line: '#0C4A6E', tint: '#DBEAFE' },
}

export function Sparkline({
  data,
  flags = [],
  width = 110,
  height = 26,
  showIndicator = true,
}: {
  data: number[]
  flags?: string[]
  width?: number
  height?: number
  showIndicator?: boolean
}) {
  const max = Math.max(1, ...data)
  const n = data.length
  const gap = 1
  const indW = showIndicator ? 16 : 0
  const chartW = width - indW
  const barW = Math.max(1, (chartW - (n - 1) * gap) / n)

  let trailingFrom = n
  for (let i = n - 1; i >= 0; i--) {
    if (data[i] === 0) trailingFrom = i
    else break
  }
  let leadingTo = 0
  for (let i = 0; i < n; i++) {
    if (data[i] === 0) leadingTo = i + 1
    else break
  }

  const ma = data.map((_, i) => {
    const slice = data.slice(Math.max(0, i - 6), i + 1)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })

  const stockoutHighlight = flags.includes('RECENT_STOCKOUT')
  const launchHighlight = flags.includes('LEADING_ZEROS')
  const trend = trendOf(data)
  const colors = TREND_COLORS[trend.dir]

  const maPoints = ma
    .map((v, i) => {
      const x = i * (barW + gap) + barW / 2
      const h = (v / max) * (height - 2)
      return `${x},${height - h}`
    })
    .join(' ')

  return (
    <svg
      className="sparkline-svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label={`trend ${trend.dir}`}
    >
      {data.map((v, i) => {
        const h = (v / max) * (height - 2)
        const x = i * (barW + gap)
        let fill = colors.bar
        let opacity = 0.75
        if (v === 0 && i >= trailingFrom && stockoutHighlight) {
          fill = '#DC2626'
          opacity = 0.55
        } else if (v === 0 && i < leadingTo && launchHighlight) {
          fill = '#D6D3D1'
          opacity = 0.6
        } else if (v === 0) {
          fill = '#D6D3D1'
          opacity = 0.5
        }
        return (
          <rect key={i} x={x} y={height - h} width={barW} height={Math.max(1, h)} fill={fill} opacity={opacity} rx={0.5} />
        )
      })}
      <polyline points={maPoints} fill="none" stroke={colors.line} strokeWidth={1} opacity={0.9} />
      {showIndicator && (
        <g transform={`translate(${chartW + 2}, 0)`}>
          <rect x={0} y={(height - 14) / 2} width={14} height={14} rx={3} fill={colors.tint} />
          {trend.dir === 'up' && (
            <path d={`M3 ${height / 2 + 3} L7 ${height / 2 - 3} L11 ${height / 2 + 3}`} fill="none" stroke={colors.line} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          )}
          {trend.dir === 'down' && (
            <path d={`M3 ${height / 2 - 3} L7 ${height / 2 + 3} L11 ${height / 2 - 3}`} fill="none" stroke={colors.line} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          )}
          {trend.dir === 'flat' && (
            <line x1={3} x2={11} y1={height / 2} y2={height / 2} stroke={colors.line} strokeWidth={1.5} strokeLinecap="round" />
          )}
        </g>
      )}
    </svg>
  )
}

/* ===== Confidence flag chip (drawer) ===== */
export function FlagChip({ flag, onClick }: { flag: string; onClick?: () => void }) {
  const def = FLAG_DEFS[flag]
  if (!def) return null
  return (
    <button className={`flag-chip ${def.kind}`} onClick={onClick} title={def.explain}>
      <span className="ico">{def.kind === 'warn' ? <AlertTriangle size={11} /> : <Info size={11} />}</span>
      {def.label}
    </button>
  )
}

/* ===== Mini flag pill (table cell) ===== */
export function FlagPill({ flag }: { flag: string }) {
  const def = FLAG_DEFS[flag]
  if (!def) return null
  return (
    <span className="tt">
      <span className="flag-pill" data-kind={def.kind}>
        {def.icon}
      </span>
      <span className="tt-bubble">{def.label}</span>
    </span>
  )
}

/* ===== Dropdown (single or multi-select) ===== */
export function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  multi = false,
}: {
  label: string
  value: T | T[] | null
  options: readonly T[]
  onChange: (next: T | T[] | null) => void
  multi?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const arr = (value ?? []) as T[]
  const hasValue = multi ? arr.length > 0 : !!value
  const triggerLabel = !hasValue
    ? label
    : multi
      ? `${label} · ${arr.length}`
      : `${label}: ${value}`

  return (
    <div className="dropdown" ref={ref}>
      <button className={`trigger ${hasValue ? 'has-value' : ''}`} onClick={() => setOpen((o) => !o)}>
        {triggerLabel}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="menu" role="listbox">
          {hasValue && (
            <button
              onClick={() => {
                onChange(multi ? [] : null)
                setOpen(false)
              }}
            >
              <span className="check" />
              Clear
            </button>
          )}
          {options.map((opt) => {
            const isSel = multi ? arr.includes(opt) : value === opt
            return (
              <button
                key={opt}
                className={isSel ? 'selected' : ''}
                onClick={() => {
                  if (multi) {
                    onChange(isSel ? arr.filter((v) => v !== opt) : [...arr, opt])
                  } else {
                    onChange(isSel ? null : opt)
                    setOpen(false)
                  }
                }}
              >
                <span className="check">{isSel && <Check size={12} />}</span>
                {opt}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
