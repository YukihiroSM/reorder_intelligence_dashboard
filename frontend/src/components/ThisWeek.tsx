import { ArrowRight, Check } from 'lucide-react'

import { daysAgo, money } from '../lib/format'
import type { SKU } from '../types'

// A SKU needs ordering this week if it's stocked out, or its (already
// scenario-adjusted) days of stock are within the lead time + a 7-day buffer.
function needsThisWeek(r: SKU): boolean {
  if (r.status === 'STOCKOUT') return true
  if (r.days_of_stock === null) return false
  return r.days_of_stock <= r.total_lead_days + 7
}

export function ThisWeekSection({
  rows,
  dataDate,
  onOpenSku,
  onScrollToTable,
  onScrollToCashflow,
}: {
  rows: SKU[]
  dataDate: string | null
  onOpenSku: (code: string) => void
  onScrollToTable: () => void
  onScrollToCashflow: () => void
}) {
  const needing = rows
    .filter(needsThisWeek)
    .sort(
      (a, b) =>
        (a.status === 'STOCKOUT' ? 0 : 1) - (b.status === 'STOCKOUT' ? 0 : 1) ||
        (a.days_of_stock ?? Infinity) - (b.days_of_stock ?? Infinity),
    )
  const preview = needing.slice(0, 4) // most-urgent few, listed in card 1
  const cashCommitment = needing.reduce((s, r) => s + r.estimated_reorder_cost, 0)

  // Cash breakdown: biggest cash items + a "+N more" aggregate, so the bars
  // account for the full committed total rather than just the top few.
  const byCost = [...needing].sort(
    (a, b) => b.estimated_reorder_cost - a.estimated_reorder_cost,
  )
  const barRows: { key: string; label: string; value: number }[] = byCost
    .slice(0, 4)
    .map((r) => ({ key: r.sku_code, label: r.sku_code, value: r.estimated_reorder_cost }))
  if (needing.length > 4) {
    barRows.push({
      key: '__more',
      label: `+${needing.length - 4} more`,
      value: byCost.slice(4).reduce((s, r) => s + r.estimated_reorder_cost, 0),
    })
  }
  const maxBar = Math.max(1, ...barRows.map((b) => b.value))

  const stockouts = rows.filter((r) => r.status === 'STOCKOUT')
  const dayLost = (r: SKU) => Math.round(r.velocity_14d * r.retail_price_usd)

  return (
    <section className="section" id="this-week">
      <div className="shell">
        <div className="section-head">
          <h2 className="section-title">This week · what to do today</h2>
          <span className="section-meta">Live with scenario</span>
        </div>

        <div className="grid-3">
          {/* Card 1: needs ordering */}
          <div className="card hero">
            <div className="card-tag">Needs ordering</div>
            <div className="card-display">
              {needing.length}{' '}
              <span style={{ fontSize: 18, color: 'var(--text-secondary)', fontWeight: 500 }}>
                SKU{needing.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="card-sub">this week</div>

            {needing.length === 0 ? (
              <div className="allclear" style={{ marginTop: 16 }}>
                <span className="check">
                  <Check size={14} strokeWidth={2.4} />
                </span>
                All clear — nothing needs ordering
              </div>
            ) : (
              <div className="tw-list">
                {preview.map((r) => {
                  const overdue = daysAgo(r.reorder_date, dataDate)
                  return (
                    <button
                      key={r.sku_code}
                      className="row"
                      style={{ textAlign: 'left', border: 'none', cursor: 'pointer', width: '100%' }}
                      onClick={() => onOpenSku(r.sku_code)}
                    >
                      <span className="code">{r.sku_code}</span>
                      <span className="nm">{r.name}</span>
                      {r.status === 'STOCKOUT' ? (
                        <span className="status-badge stockout">
                          <span className="dot" />
                          stockout
                        </span>
                      ) : overdue !== null && overdue > 0 ? (
                        <span className="status-badge critical">
                          <span className="dot" />
                          overdue {overdue}d
                        </span>
                      ) : (
                        <span className="status-badge low">
                          <span className="dot" />
                          {Math.ceil(r.days_of_stock ?? 0)}d left
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="card-footer">
              <button className="link-btn" onClick={onScrollToTable}>
                Review &amp; order{' '}
                <span className="arrow">
                  <ArrowRight size={13} />
                </span>
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {needing.length} of {rows.length}
              </span>
            </div>
          </div>

          {/* Card 2: cash exposure */}
          <div className="card hero">
            <div className="card-tag">Cash exposure</div>
            <div className="card-display">{money(cashCommitment)}</div>
            <div className="card-sub">
              committed if you order{' '}
              {needing.length === 1 ? 'this SKU' : `all ${needing.length}`} today
            </div>

            <div className="cash-breakdown">
              {barRows.map((b) => (
                <div key={b.key} className="seg-row">
                  <span className="lbl">{b.label}</span>
                  <span className="bar">
                    <span className="fill" style={{ width: `${(b.value / maxBar) * 100}%` }} />
                  </span>
                  <span className="amt">{money(b.value)}</span>
                </div>
              ))}
            </div>

            <div className="card-footer">
              <button className="link-btn" onClick={onScrollToCashflow}>
                Open cashflow{' '}
                <span className="arrow">
                  <ArrowRight size={13} />
                </span>
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {needing.length === 0 ? 'nothing due' : 'order today'}
              </span>
            </div>
          </div>

          {/* Card 3: active stockouts */}
          {stockouts.length === 0 ? (
            <div className="card hero" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-tag">Active stockouts</div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div className="allclear">
                  <span className="check">
                    <Check size={14} strokeWidth={2.4} />
                  </span>
                  All SKUs in stock
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, marginLeft: 32 }}>
                  No active stockouts to address.
                </div>
              </div>
            </div>
          ) : (
            <div className="card hero stockout-card">
              <div className="card-tag" style={{ color: 'var(--stockout-fg)' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--stockout-accent)',
                  }}
                />
                Active stockout{stockouts.length === 1 ? '' : 's'}
              </div>
              <div className="card-display" style={{ color: 'var(--stockout-fg)' }}>
                {stockouts.length}{' '}
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  STOCKOUT
                </span>
              </div>
              <div className="card-sub">active right now · revenue at risk</div>

              <div className="tw-list" style={{ marginTop: 14 }}>
                {stockouts.map((r) => (
                  <button
                    key={r.sku_code}
                    className="row"
                    style={{ textAlign: 'left', border: 'none', cursor: 'pointer', width: '100%' }}
                    onClick={() => onOpenSku(r.sku_code)}
                  >
                    <span className="code">{r.sku_code}</span>
                    <span className="nm">{r.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      ~{money(dayLost(r))}/day lost
                    </span>
                  </button>
                ))}
              </div>

              <div className="card-footer">
                <button className="link-btn" onClick={() => onOpenSku(stockouts[0].sku_code)}>
                  View SKU{' '}
                  <span className="arrow">
                    <ArrowRight size={13} />
                  </span>
                </button>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--stockout-fg)',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 500,
                  }}
                >
                  est. {money(stockouts.reduce((s, r) => s + dayLost(r), 0))}/day
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
