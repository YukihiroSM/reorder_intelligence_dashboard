import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Plus, RefreshCw, Sparkles, TriangleAlert, X } from 'lucide-react'

import { suggestAction } from '../api/api'
import { FLAG_DEFS } from '../lib/constants'
import { daysAgo, money, num, shortDate } from '../lib/format'
import { useBodyScrollLock } from '../lib/scrollLock'
import type { Scenario, SKU } from '../types'
import { ActionBadge, ConfidenceChip, FlagChip, StatusBadge, UrgencyDots } from './atoms'

/* ===== Sales trend chart: daily bars + MA7 (solid) + MA14 (dashed) ===== */
function SalesChart({ data, flags }: { data: number[]; flags: string[] }) {
  const W = 510
  const H = 200
  const padL = 28
  const padR = 8
  const padT = 12
  const padB = 28
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const n = data.length || 1

  const ma = (window: number) =>
    data.map((_, i) => {
      const slice = data.slice(Math.max(0, i - window + 1), i + 1)
      return slice.reduce((a, b) => a + b, 0) / slice.length
    })
  const ma7 = ma(7)
  const ma14 = ma(14)
  const max = Math.max(1, ...data, ...ma7)
  const yMax = Math.ceil(max / 5) * 5 || 5
  const barW = innerW / n - 1

  let trailingFrom = n
  for (let i = n - 1; i >= 0; i--) {
    if (data[i] === 0) trailingFrom = i
    else break
  }
  const showStockoutLine = trailingFrom < n && flags.includes('RECENT_STOCKOUT')

  const [hover, setHover] = useState<number | null>(null)
  const xOf = (i: number) => padL + i * (innerW / n) + innerW / n / 2
  const yOf = (v: number) => padT + innerH - (v / yMax) * innerH
  const labels = ['30d ago', '21d', '14d', '7d', 'today']

  return (
    <div style={{ position: 'relative' }}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block' }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const xRel = ((e.clientX - rect.left) / rect.width) * W
          const idx = Math.round(((xRel - padL) / innerW) * n - 0.5)
          setHover(idx >= 0 && idx < n ? idx : null)
        }}
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: 5 }, (_, i) => {
          const v = (yMax / 4) * i
          const y = yOf(v)
          return (
            <g key={i}>
              <line className="grid-line" x1={padL} x2={W - padR} y1={y} y2={y} />
              <text className="axis-tick" x={padL - 6} y={y + 3} textAnchor="end">{Math.round(v)}</text>
            </g>
          )
        })}
        {data.map((v, i) => {
          const h = (v / yMax) * innerH
          const x = padL + i * (innerW / n)
          const isStockout = flags.includes('RECENT_STOCKOUT') && i >= trailingFrom && v === 0
          return (
            <rect
              key={i}
              x={x + 0.5}
              y={padT + innerH - h}
              width={barW}
              height={Math.max(1, h)}
              fill={isStockout ? '#FCA5A5' : '#A8A29E'}
              opacity={0.7}
            />
          )
        })}
        <polyline fill="none" stroke="#1C1917" strokeWidth={2} points={ma7.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' ')} />
        <polyline fill="none" stroke="#78716C" strokeWidth={1.5} strokeDasharray="4 3" points={ma14.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' ')} />
        {showStockoutLine && (
          <g>
            <line x1={xOf(trailingFrom)} x2={xOf(trailingFrom)} y1={padT} y2={padT + innerH} stroke="#DC2626" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
            <text x={xOf(trailingFrom) + 4} y={padT + 10} style={{ fontSize: 9, fill: '#991B1B', fontFamily: 'var(--font-mono)' }}>stockout</text>
          </g>
        )}
        {labels.map((l, i) => {
          const idx = Math.round((i / (labels.length - 1)) * (n - 1))
          return (
            <text key={i} className="axis-tick" x={xOf(idx)} y={H - padB + 16} textAnchor="middle">{l}</text>
          )
        })}
        {hover !== null && (
          <g>
            <line x1={xOf(hover)} x2={xOf(hover)} y1={padT} y2={padT + innerH} stroke="#1C1917" strokeWidth={1} opacity={0.25} />
            <circle cx={xOf(hover)} cy={yOf(ma7[hover])} r={3} fill="#1C1917" />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div style={{ position: 'absolute', top: 8, right: 12, background: 'var(--text-primary)', color: 'white', padding: '6px 10px', borderRadius: 4, fontSize: 11, fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Day {hover - (n - 1)} (rel.)</div>
          <div>units: {data[hover]}</div>
          <div>ma7: {ma7[hover].toFixed(1)}</div>
          <div>ma14: {ma14[hover].toFixed(1)}</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, paddingLeft: padL }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 5, background: '#A8A29E', opacity: 0.7 }} />daily units
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 2, background: '#1C1917' }} />7d avg
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 0, borderTop: '2px dashed #78716C' }} />14d avg
        </span>
      </div>
    </div>
  )
}

/* ===== Metric cell with hover formula tooltip ===== */
function MetricCell({
  label,
  value,
  caption,
  formula,
  highlight,
}: {
  label: string
  value: string
  caption?: string
  formula?: string
  highlight?: boolean
}) {
  return (
    <div className={`metric-cell ${highlight ? 'crit' : ''}`}>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {caption && <div className="c">{caption}</div>}
      {formula && <div className="tip">{formula}</div>}
    </div>
  )
}

/* ===== AI recommendation card ===== Live LLM (LangGraph) endpoint, scenario-aware.
   Resets when the SKU or scenario changes so a stale rec never lingers. */
function AIBlock({ sku, scenario }: { sku: SKU; scenario: Scenario }) {
  const gen = useMutation({
    mutationFn: (force: boolean) => suggestAction(sku.sku_code, scenario, force),
  })
  // Clear the recommendation when the SKU or the scenario it was reasoned under changes.
  const scenarioKey = `${scenario.growth}|${scenario.forecastDays}|${scenario.leadBuffer}`
  useEffect(() => {
    gen.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku.sku_code, scenarioKey])

  const r = gen.data

  if (!r && !gen.isPending && !gen.isError) {
    return (
      <div className="ai-card">
        <button className="ai-button" onClick={() => gen.mutate(false)}>
          <Sparkles size={14} />
          Get AI recommendation
        </button>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 8 }}>
          Reasons over this SKU under the current scenario
          {scenario.growth !== 0 ? ` (${scenario.growth > 0 ? '+' : ''}${scenario.growth}%)` : ''}
        </div>
      </div>
    )
  }

  if (gen.isPending) {
    return (
      <div className="ai-card expanded">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
          <Sparkles size={13} />
          <span>Reasoning…</span>
        </div>
        <div className="ai-skeleton">
          <div className="line l1" />
          <div className="line l2" />
          <div className="line l3" />
        </div>
      </div>
    )
  }

  if (gen.isError || !r) {
    return (
      <div className="ai-card expanded">
        <div className="ai-warning">
          <TriangleAlert size={13} />
          <span>Couldn't get a recommendation. Is the API running?</span>
        </div>
        <div className="ai-footer">
          <span>&nbsp;</span>
          <button className="refresh" onClick={() => gen.mutate(false)}>
            <RefreshCw size={10} /> Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="ai-card expanded">
      <div className="ai-action-row">
        <ActionBadge action={r.action} />
        <UrgencyDots urgency={r.urgency} />
        <ConfidenceChip confidence={r.confidence} />
      </div>
      <div className="ai-headline">{r.headline}</div>
      <div className="ai-reason">{r.reasoning}</div>

      <div className="ai-figures">
        {r.revenue_at_risk_usd > 0 && (
          <span className="ai-fig crit">
            {money(r.revenue_at_risk_usd)} <em>revenue at risk</em>
          </span>
        )}
        {r.suggested_po_qty != null && (
          <span className="ai-fig">
            {r.suggested_po_qty.toLocaleString()} <em>suggested PO</em>
          </span>
        )}
      </div>

      {r.warnings.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {r.warnings.map((w, i) => (
            <div key={i} className="ai-warning">
              <TriangleAlert size={13} />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
      <div className="ai-footer">
        <span>
          {r.ai_status === 'fallback' ? 'deterministic' : r.model_name}
          {r.cached ? ' · cached' : ' · fresh'}
        </span>
        <button className="refresh" onClick={() => gen.mutate(true)}>
          <RefreshCw size={10} /> Refresh
        </button>
      </div>
    </div>
  )
}

/* ===== Drawer ===== */
export function SKUDrawer({
  sku,
  scenario,
  dataDate,
  onClose,
}: {
  sku: SKU | null
  scenario: { growth: number; leadBuffer: number; forecastDays: number }
  dataDate: string | null
  onClose: () => void
}) {
  const open = !!sku
  const [expandedFlag, setExpandedFlag] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // Hold the last SKU so content stays during the close animation; update
  // during render whenever a (new) SKU is selected.
  const [shown, setShown] = useState<SKU | null>(sku)
  if (sku && sku !== shown) setShown(sku)
  // Reset the open flag explanation when switching SKUs (else a stale panel lingers).
  const [flagForSku, setFlagForSku] = useState<string | null>(sku?.sku_code ?? null)
  if (sku && sku.sku_code !== flagForSku) {
    setFlagForSku(sku.sku_code)
    setExpandedFlag(null)
  }

  useBodyScrollLock(open)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Transient confirmation toast (e.g. the not-yet-built PO export).
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(t)
  }, [toast, setToast])

  const r = shown
  const factor = 1 + scenario.growth / 100
  const overdue = r ? daysAgo(r.reorder_date, dataDate) : null
  const isOverdue = overdue !== null && overdue > 0
  const daysVal =
    !r || r.status === 'STOCKOUT'
      ? '0'
      : r.days_of_stock === null
        ? '∞'
        : num(r.days_of_stock)

  return (
    <>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
        {r && (
          <>
            <div className="drawer-head">
              <div className="top-row">
                <div>
                  <div className="code">{r.sku_code}</div>
                  <div className="title">{r.name}</div>
                  <div className="meta">
                    {r.category}
                    <span className="sep">·</span>
                    {r.supplier}
                    <span className="sep">·</span>
                    MOQ {r.moq.toLocaleString()}
                    <span className="sep">·</span>
                    ${r.cost_per_unit_usd.toFixed(2)}/unit
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <StatusBadge status={r.status} large />
                  </div>
                </div>
                <button className="drawer-close" onClick={onClose} aria-label="Close drawer">
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="drawer-body">
              <div className="drawer-section">
                <div className="drawer-section-title">
                  <span>Sales trend · 30 days</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>units / day</span>
                </div>
                <SalesChart data={r.sales_last_30_days ?? []} flags={r.confidence_flags} />
              </div>

              <div className="drawer-section">
                <div className="drawer-section-title">
                  <span>Operational metrics</span>
                  {scenario.growth !== 0 && (
                    <span style={{ color: scenario.growth > 0 ? 'var(--critical-fg)' : 'var(--healthy-fg)', fontFamily: 'var(--font-mono)' }}>
                      adjusted @ {scenario.growth > 0 ? '+' : ''}
                      {scenario.growth}%
                    </span>
                  )}
                </div>
                <div className="metric-grid">
                  <MetricCell label="Current stock" value={r.current_stock.toLocaleString()} caption="units on hand" formula={`stock = ${r.current_stock.toLocaleString()} units`} />
                  <MetricCell label="MOQ" value={r.moq.toLocaleString()} caption={r.moq_binding ? 'PO bound to MOQ' : 'PO above MOQ'} />
                  <MetricCell label="V (7d / 14d)" value={`${num(r.velocity_7d)} / ${num(r.velocity_14d)}`} caption="units / day" formula="velocity = mean(daily sales)" />
                  <MetricCell
                    label="Effective velocity"
                    value={num(r.projected_velocity)}
                    caption={scenario.growth !== 0 ? 'stockout-aware × (1+growth)' : 'stockout-aware rate'}
                    formula={`${num(r.effective_velocity)} × ${factor.toFixed(2)} = ${num(r.projected_velocity)}`}
                  />
                  <MetricCell
                    label="Days of stock"
                    value={daysVal}
                    caption={r.status === 'STOCKOUT' ? 'STOCKED OUT' : 'days remaining'}
                    formula={r.days_of_stock === null ? 'no demand → ∞' : `${r.current_stock} / ${num(r.projected_velocity)} = ${num(r.days_of_stock)}`}
                    highlight={r.status === 'CRITICAL' || r.status === 'STOCKOUT'}
                  />
                  <MetricCell
                    label="Total lead"
                    value={`${r.total_lead_days}d`}
                    caption={`${r.production_lead_days}p + ${r.shipping_days}s + ${scenario.leadBuffer}b`}
                    formula={`${r.production_lead_days} + ${r.shipping_days} + ${scenario.leadBuffer} = ${r.total_lead_days}d`}
                  />
                  <MetricCell
                    label="Reorder by"
                    value={shortDate(r.reorder_date)}
                    caption={isOverdue ? `overdue ${overdue}d` : 'on schedule'}
                    highlight={isOverdue}
                  />
                  <MetricCell label="Recommended PO" value={r.recommended_po_qty.toLocaleString()} caption={r.moq_binding ? 'MOQ bound' : 'above MOQ'} />
                  <MetricCell label="PO cost" value={money(r.estimated_reorder_cost)} caption={`${r.recommended_po_qty.toLocaleString()} × $${r.cost_per_unit_usd.toFixed(2)}`} />
                  <MetricCell
                    label="Retail / unit"
                    value={`$${r.retail_price_usd.toFixed(2)}`}
                    caption="list price"
                  />
                  <MetricCell
                    label="Stock value"
                    value={money(r.current_stock * r.retail_price_usd)}
                    caption={`${r.current_stock.toLocaleString()} × $${r.retail_price_usd.toFixed(2)} retail`}
                    formula={`${r.current_stock.toLocaleString()} × $${r.retail_price_usd.toFixed(2)} = ${money(r.current_stock * r.retail_price_usd)}`}
                  />
                  <MetricCell
                    label="Gross margin"
                    value={`${r.retail_price_usd > 0 ? Math.round(((r.retail_price_usd - r.cost_per_unit_usd) / r.retail_price_usd) * 100) : 0}%`}
                    caption={`$${(r.retail_price_usd - r.cost_per_unit_usd).toFixed(2)}/unit`}
                  />
                </div>
              </div>

              {r.confidence_flags.length > 0 && (
                <div className="drawer-section">
                  <div className="drawer-section-title">
                    <span>Confidence flags</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                      {r.confidence_flags.length} flag{r.confidence_flags.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="flag-strip">
                    {r.confidence_flags.map((f) => (
                      <FlagChip key={f} flag={f} onClick={() => setExpandedFlag((e) => (e === f ? null : f))} />
                    ))}
                  </div>
                  {expandedFlag && r.confidence_flags.includes(expandedFlag) && FLAG_DEFS[expandedFlag] && (
                    <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border-subtle)', borderRadius: 4, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{FLAG_DEFS[expandedFlag].label}.</strong>{' '}
                      {FLAG_DEFS[expandedFlag].explain}
                    </div>
                  )}
                </div>
              )}

              <div className="drawer-section">
                <div className="drawer-section-title">
                  <span>AI recommendation</span>
                </div>
                <AIBlock sku={r} scenario={scenario} />
              </div>
            </div>

            <div className="drawer-footer">
              <button
                className="btn btn-primary"
                onClick={() =>
                  setToast(`PO export coming next — CSV / email-ready PO for ${r.sku_code}.`)
                }
              >
                <Plus size={12} strokeWidth={2.4} /> Generate PO · {money(r.estimated_reorder_cost)}
              </button>
            </div>
          </>
        )}
      </aside>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  )
}
