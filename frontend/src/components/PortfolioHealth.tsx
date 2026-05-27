import { useState } from 'react'

import { CATEGORY_COLORS } from '../lib/constants'
import type { SKU, StockStatus } from '../types'

const STATUS_META: Record<StockStatus, { label: string; color: string }> = {
  HEALTHY: { label: 'Healthy', color: '#16A34A' },
  LOW: { label: 'Low', color: '#CA8A04' },
  CRITICAL: { label: 'Critical', color: '#D97706' },
  STOCKOUT: { label: 'Stockout', color: '#DC2626' },
}
const STATUS_ORDER: StockStatus[] = ['HEALTHY', 'LOW', 'CRITICAL', 'STOCKOUT']
const CATEGORIES = Object.keys(CATEGORY_COLORS)

const fmt = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`)

/* ===== Donut ===== */
function StatusDonut({ rows }: { rows: SKU[] }) {
  const counts = STATUS_ORDER.map((k) => ({ k, count: rows.filter((r) => r.status === k).length }))
  const total = rows.length
  const [hover, setHover] = useState<StockStatus | null>(null)
  const cx = 80
  const cy = 80
  const R = 70
  const r = 50

  // Precompute slice angles without mutating a render-scope accumulator.
  const slices = counts
    .filter((c) => c.count > 0)
    .map((c, i, arr) => {
      const startFrac = arr.slice(0, i).reduce((s, x) => s + x.count, 0) / (total || 1)
      const start = -Math.PI / 2 + startFrac * 2 * Math.PI
      const end = start + (c.count / (total || 1)) * 2 * Math.PI - 0.012
      return { k: c.k, start, end }
    })

  function arcPath(start: number, end: number): string {
    if (end - start >= Math.PI * 2 - 0.0001) {
      return [
        `M ${cx + R} ${cy}`,
        `A ${R} ${R} 0 1 1 ${cx - R} ${cy}`,
        `A ${R} ${R} 0 1 1 ${cx + R} ${cy}`,
        `L ${cx + r} ${cy}`,
        `A ${r} ${r} 0 1 0 ${cx - r} ${cy}`,
        `A ${r} ${r} 0 1 0 ${cx + r} ${cy}`,
        'Z',
      ].join(' ')
    }
    const x1 = cx + R * Math.cos(start)
    const y1 = cy + R * Math.sin(start)
    const x2 = cx + R * Math.cos(end)
    const y2 = cy + R * Math.sin(end)
    const xi2 = cx + r * Math.cos(end)
    const yi2 = cy + r * Math.sin(end)
    const xi1 = cx + r * Math.cos(start)
    const yi1 = cy + r * Math.sin(start)
    const large = end - start > Math.PI ? 1 : 0
    return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${r} ${r} 0 ${large} 0 ${xi1} ${yi1} Z`
  }

  return (
    <div className="card hero donut-card">
      <svg width={160} height={160} viewBox="0 0 160 160">
        {slices.map(({ k, start, end }) => (
          <path
            key={k}
            d={arcPath(start, end)}
            fill={STATUS_META[k].color}
            opacity={hover ? (hover === k ? 1 : 0.25) : 1}
            style={{ transition: 'opacity .15s ease', cursor: 'pointer' }}
            onMouseEnter={() => setHover(k)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', fill: 'var(--text-primary)' }}>
          {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
          SKUS TOTAL
        </text>
      </svg>

      <div className="donut-legend">
        <div className="card-tag" style={{ marginBottom: 2 }}>Status mix</div>
        {counts.map(({ k, count }) => (
          <div
            key={k}
            className="item"
            onMouseEnter={() => setHover(k)}
            onMouseLeave={() => setHover(null)}
            style={{ opacity: hover && hover !== k ? 0.5 : 1, transition: 'opacity .12s ease' }}
          >
            <span
              className="dot"
              style={{ background: STATUS_META[k].color, ...(k === 'STOCKOUT' ? { animation: 'pulseDot 1.6s ease-in-out infinite' } : {}) }}
            />
            <span className="num">{count}</span>
            <span className="lbl">{STATUS_META[k].label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ===== Cash horizon — 12-week stacked bars by category ===== */
interface Week {
  label: string
  total: number
  cats: Record<string, number>
}

function CashHorizon({ rows, forecastDays }: { rows: SKU[]; forecastDays: number }) {
  const WEEKS = 12
  const weeks: Week[] = Array.from({ length: WEEKS }, (_, i) => ({
    label: `W${i + 1}`,
    total: 0,
    cats: {},
  }))

  rows.forEach((r) => {
    if (r.days_of_stock === null) return // no demand -> never reorders
    const reorderInDays = Math.max(0, r.days_of_stock - r.total_lead_days)
    if (reorderInDays > WEEKS * 7) return
    const w = Math.min(WEEKS - 1, Math.floor(reorderInDays / 7))
    weeks[w].cats[r.category] = (weeks[w].cats[r.category] ?? 0) + r.estimated_reorder_cost
    weeks[w].total += r.estimated_reorder_cost
  })

  const maxTotal = Math.max(1, ...weeks.map((w) => w.total))
  const W = 520
  const H = 200
  const padL = 36
  const padR = 12
  const padT = 16
  const padB = 28
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const barGap = 4
  const barW = (innerW - barGap * (WEEKS - 1)) / WEEKS
  const yTop = Math.ceil(maxTotal / 1000) * 1000 || 1000
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(yTop * t))

  const [hoverWeek, setHoverWeek] = useState<number | null>(null)

  const k30 = weeks.slice(0, 4).reduce((s, w) => s + w.total, 0)
  const k60 = weeks.slice(0, 8).reduce((s, w) => s + w.total, 0)
  const k90 = weeks.reduce((s, w) => s + w.total, 0)

  const catTotals = CATEGORIES.map((c) => ({
    c,
    total: weeks.reduce((s, w) => s + (w.cats[c] ?? 0), 0),
  })).sort((a, b) => b.total - a.total)

  return (
    <div className="card hero" style={{ overflow: 'visible', position: 'relative' }}>
      <div className="card-tag" style={{ marginBottom: 12 }}>Cash horizon · by week</div>
      <div className="kpi-strip">
        <div className="item"><div className="l">30d</div><div className="v">{fmt(k30)}</div></div>
        <div className="item"><div className="l">60d</div><div className="v">{fmt(k60)}</div></div>
        <div className="item"><div className="l">90d</div><div className="v">{fmt(k90)}</div></div>
        <div className="item" style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
          <div className="l">Forecast</div>
          <div className="v" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{forecastDays}d window</div>
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {yTicks.map((t, i) => {
          const y = padT + innerH - (t / yTop) * innerH
          return (
            <g key={i}>
              <line className="grid-line" x1={padL} x2={W - padR} y1={y} y2={y} />
              <text className="axis-tick" x={padL - 6} y={y + 3} textAnchor="end">{fmt(t)}</text>
            </g>
          )
        })}
        {weeks.map((w, i) => {
          let yCursor = padT + innerH
          const x = padL + i * (barW + barGap)
          return (
            <g key={i} onMouseEnter={() => setHoverWeek(i)} onMouseLeave={() => setHoverWeek(null)}>
              {CATEGORIES.map((cat) => {
                const v = w.cats[cat] ?? 0
                if (v === 0) return null
                const h = (v / yTop) * innerH
                yCursor -= h
                return (
                  <rect
                    key={cat}
                    x={x}
                    y={yCursor}
                    width={barW}
                    height={h}
                    fill={CATEGORY_COLORS[cat]}
                    opacity={hoverWeek === null || hoverWeek === i ? 1 : 0.35}
                    style={{ transition: 'opacity .12s ease' }}
                  />
                )
              })}
              <rect x={x} y={padT} width={barW} height={innerH} fill="transparent" />
              <text className="axis-tick" x={x + barW / 2} y={H - padB + 16} textAnchor="middle">{w.label}</text>
            </g>
          )
        })}
      </svg>

      {hoverWeek !== null && weeks[hoverWeek].total > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 50,
            right: 12,
            background: 'var(--text-primary)',
            color: 'white',
            padding: '8px 10px',
            borderRadius: 4,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            minWidth: 140,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {weeks[hoverWeek].label} · {fmt(weeks[hoverWeek].total)}
          </div>
          {CATEGORIES.filter((c) => weeks[hoverWeek].cats[c]).map((c) => (
            <div key={c} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ opacity: 0.85 }}>
                <span style={{ display: 'inline-block', width: 7, height: 7, background: CATEGORY_COLORS[c], borderRadius: 1, marginRight: 6 }} />
                {c}
              </span>
              <span>{fmt(weeks[hoverWeek].cats[c])}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 8 }}>
          By category · 90d total
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {catTotals.map(({ c, total }) => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
              <span style={{ width: 8, height: 8, background: CATEGORY_COLORS[c], borderRadius: 1, flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: total > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: total > 0 ? 500 : 400 }}>
                {total > 0 ? fmt(total) : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ===== Coverage runway by category ===== */
function RunwayBars({ rows }: { rows: SKU[] }) {
  const byCat: Record<string, { stock: number; vel: number; stockout: boolean }> = {}
  rows.forEach((r) => {
    const e = (byCat[r.category] ??= { stock: 0, vel: 0, stockout: false })
    e.stock += r.current_stock
    e.vel += Math.max(0.01, r.projected_velocity)
    if (r.status === 'STOCKOUT') e.stockout = true
  })
  const entries = Object.entries(byCat)
    .map(([cat, v]) => ({
      cat,
      avgDays: v.stockout && v.stock === 0 ? 0 : v.stock / v.vel,
      hasStockout: v.stockout,
    }))
    .sort((a, b) => a.avgDays - b.avgDays)

  const max = 180
  function healthColor(d: number, stockout: boolean): string {
    if (stockout && d < 5) return 'var(--stockout-accent)'
    if (d < 30) return 'var(--critical-accent)'
    if (d < 60) return 'var(--low-accent)'
    return 'var(--healthy-accent)'
  }

  return (
    <div className="card hero">
      <div className="card-tag" style={{ marginBottom: 14 }}>Coverage runway · by category</div>
      <div className="runway-list">
        {entries.map(({ cat, avgDays, hasStockout }) => {
          const isOut = hasStockout && avgDays < 5
          const w = Math.min(100, (avgDays / max) * 100)
          return (
            <div key={cat} className={`runway-row ${isOut ? 'stockout' : ''}`}>
              <span className="cat">{cat}</span>
              <span className="bar">
                <span
                  className="fill"
                  style={{
                    width: `${Math.max(w, isOut ? 4 : 2)}%`,
                    background: isOut
                      ? 'repeating-linear-gradient(45deg, #FEE2E2 0 6px, #FCA5A5 6px 12px)'
                      : healthColor(avgDays, hasStockout),
                  }}
                />
              </span>
              <span className="val">{isOut ? 'STOCKOUT' : `${Math.round(avgDays)}d`}</span>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-tertiary)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 8, background: 'var(--critical-accent)', borderRadius: 1 }} />&lt; 30d
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 8, background: 'var(--low-accent)', borderRadius: 1 }} />30–60d
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 8, background: 'var(--healthy-accent)', borderRadius: 1 }} />&gt; 60d
        </span>
      </div>
    </div>
  )
}

export function PortfolioHealthSection({
  rows,
  forecastDays,
}: {
  rows: SKU[]
  forecastDays: number
}) {
  return (
    <section className="section" id="portfolio-health">
      <div className="shell">
        <div className="section-head">
          <h2 className="section-title">Portfolio health</h2>
          <span className="section-meta">{rows.length} SKUs · 5 categories</span>
        </div>
        <div className="grid-3" style={{ gridTemplateColumns: '1fr 1.4fr 1fr', gap: 12 }}>
          <StatusDonut rows={rows} />
          <div id="cash-horizon-anchor">
            <CashHorizon rows={rows} forecastDays={forecastDays} />
          </div>
          <RunwayBars rows={rows} />
        </div>
      </div>
    </section>
  )
}
