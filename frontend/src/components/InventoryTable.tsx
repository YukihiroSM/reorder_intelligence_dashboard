import { useState } from 'react'
import { Search } from 'lucide-react'

import { money, num, shortDate } from '../lib/format'
import { daysAgo } from '../lib/format'
import { STATUS_ORDER } from '../lib/constants'
import type { SKU, StockStatus } from '../types'
import { Dropdown, FlagPill, Sparkline, StatusBadge } from './atoms'

type SortKey = 'urgency' | 'code' | 'name' | 'stock' | 'days' | 'cost'
const STATUS_OPTS: StockStatus[] = ['STOCKOUT', 'CRITICAL', 'LOW', 'HEALTHY']

export function InventoryTable({
  rows,
  dataDate,
  selectedSku,
  onOpenSku,
}: {
  rows: SKU[]
  dataDate: string | null
  selectedSku: string | null
  onOpenSku: (code: string) => void
}) {
  const [status, setStatus] = useState<StockStatus[]>([])
  const [category, setCategory] = useState<string | null>(null)
  const [supplier, setSupplier] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'urgency',
    dir: 'asc',
  })

  const categories = Array.from(new Set(rows.map((r) => r.category))).sort()
  const suppliers = Array.from(new Set(rows.map((r) => r.supplier))).sort()
  const hasFilters = status.length > 0 || !!category || !!supplier || !!query

  const filtered = rows.filter((r) => {
    if (status.length && !status.includes(r.status)) return false
    if (category && r.category !== category) return false
    if (supplier && r.supplier !== supplier) return false
    if (query) {
      const q = query.toLowerCase()
      if (!r.sku_code.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q)) return false
    }
    return true
  })

  const days = (r: SKU) => (r.days_of_stock === null ? Infinity : r.days_of_stock)
  const sorted = [...filtered].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1
    switch (sort.key) {
      case 'urgency': {
        const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        return so !== 0 ? so : days(a) - days(b)
      }
      case 'stock':
        return (a.current_stock - b.current_stock) * dir
      case 'days':
        return (days(a) - days(b)) * dir
      case 'code':
        return a.sku_code.localeCompare(b.sku_code) * dir
      case 'name':
        return a.name.localeCompare(b.name) * dir
      case 'cost':
        return (a.estimated_reorder_cost - b.estimated_reorder_cost) * dir
    }
  })

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }
  const ariaSort = (key: SortKey): 'none' | 'ascending' | 'descending' =>
    sort.key !== key ? 'none' : sort.dir === 'asc' ? 'ascending' : 'descending'
  const arrow = (key: SortKey) =>
    sort.key === key ? <span className="sort-arrow">{sort.dir === 'asc' ? '↑' : '↓'}</span> : null

  function clearFilters() {
    setStatus([])
    setCategory(null)
    setSupplier(null)
    setQuery('')
  }

  function daysCell(r: SKU) {
    const cls =
      r.status === 'STOCKOUT'
        ? 'days-cell stockout'
        : r.status === 'CRITICAL'
          ? 'days-cell critical'
          : r.status === 'LOW'
            ? 'days-cell low'
            : 'days-cell'
    let body
    if (r.status === 'STOCKOUT') body = <span className="days">0</span>
    else if (r.days_of_stock === null)
      body = (
        <>
          <span className="days">∞</span>
          <div className="days-cap">365d+</div>
        </>
      )
    else {
      const d = r.days_of_stock
      body = (
        <>
          <span className="days">{d > 10 ? Math.round(d) : d.toFixed(1)}</span>
          <div className="days-cap">days</div>
        </>
      )
    }
    return <td className={`num ${cls}`}>{body}</td>
  }

  function reorderCell(r: SKU) {
    if (!r.reorder_date) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>
    const overdue = daysAgo(r.reorder_date, dataDate)
    return (
      <>
        <div className="date">{shortDate(r.reorder_date)}</div>
        {overdue !== null && overdue > 0 && <div className="od">overdue {overdue}d</div>}
      </>
    )
  }

  return (
    <section className="section" id="inventory">
      <div className="shell">
        <div className="section-head">
          <h2 className="section-title">Inventory · all SKUs</h2>
          <span className="section-meta">Click a row for SKU detail</span>
        </div>

        <div className="filters">
          <Dropdown
            label="Status"
            value={status}
            multi
            onChange={(v) => setStatus((v as StockStatus[]) ?? [])}
            options={STATUS_OPTS}
          />
          <Dropdown
            label="Category"
            value={category}
            onChange={(v) => setCategory((v as string) ?? null)}
            options={categories}
          />
          <Dropdown
            label="Supplier"
            value={supplier}
            onChange={(v) => setSupplier((v as string) ?? null)}
            options={suppliers}
          />
          <div className="search">
            <span className="ico">
              <Search size={13} />
            </span>
            <input
              type="text"
              placeholder="Search SKU or name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {hasFilters && (
            <button
              className="btn btn-ghost"
              style={{ padding: '4px 8px', fontSize: 12 }}
              onClick={clearFilters}
            >
              Clear
            </button>
          )}
          <span className="count">
            {sorted.length} of {rows.length}
          </span>
        </div>

        <div className="table-wrap">
          {sorted.length === 0 ? (
            <div className="empty-table">
              <div className="ttl">No SKUs match these filters</div>
              <button className="btn btn-ghost" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          ) : (
            <table className="inv">
              <thead>
                <tr>
                  <th scope="col" className={`sortable ${sort.key === 'code' ? 'active' : ''}`} style={{ width: 80 }} aria-sort={ariaSort('code')} onClick={() => toggleSort('code')}>
                    SKU {arrow('code')}
                  </th>
                  <th scope="col" className={`sortable ${sort.key === 'name' ? 'active' : ''}`} style={{ minWidth: 220 }} aria-sort={ariaSort('name')} onClick={() => toggleSort('name')}>
                    Product {arrow('name')}
                  </th>
                  <th scope="col" style={{ width: 100 }}>Status</th>
                  <th scope="col" className={`num sortable ${sort.key === 'stock' ? 'active' : ''}`} style={{ width: 70 }} aria-sort={ariaSort('stock')} onClick={() => toggleSort('stock')}>
                    Stock {arrow('stock')}
                  </th>
                  <th scope="col" style={{ width: 140 }}>30-day trend</th>
                  <th scope="col" className="num" style={{ width: 96 }}>7d / 14d</th>
                  <th scope="col" className="num" style={{ width: 96 }}>Lead · ship</th>
                  <th scope="col" className={`num sortable ${sort.key === 'days' ? 'active' : ''}`} style={{ width: 80 }} aria-sort={ariaSort('days')} onClick={() => toggleSort('days')}>
                    Days left {arrow('days')}
                  </th>
                  <th scope="col" style={{ width: 120 }}>Reorder by</th>
                  <th scope="col" className="num" style={{ width: 110 }}>PO qty</th>
                  <th scope="col" className={`num sortable ${sort.key === 'cost' ? 'active' : ''}`} style={{ width: 90 }} aria-sort={ariaSort('cost')} onClick={() => toggleSort('cost')}>
                    Cost {arrow('cost')}
                  </th>
                  <th scope="col" style={{ width: 70 }}>Flags</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.sku_code}
                    className={selectedSku === r.sku_code ? 'selected' : ''}
                    onClick={() => onOpenSku(r.sku_code)}
                  >
                    <td>
                      <span className="code">{r.sku_code}</span>
                    </td>
                    <td>
                      <div className="nm">{r.name}</div>
                      <div className="cat">{r.category}</div>
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="num">
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{r.current_stock.toLocaleString()}</span>
                    </td>
                    <td>
                      <Sparkline data={r.sales_last_30_days ?? []} flags={r.confidence_flags} width={124} />
                    </td>
                    <td className="num">
                      <div className="vel-pair">
                        <span className="strong">{num(r.velocity_7d)}</span>
                        <span style={{ opacity: 0.5, margin: '0 3px' }}>/</span>
                        {num(r.velocity_14d)}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>units/day</div>
                    </td>
                    <td className="num">
                      <div className="vel-pair">
                        <span className="strong">{r.production_lead_days}</span>
                        <span style={{ opacity: 0.5, margin: '0 3px' }}>+</span>
                        {r.shipping_days}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>prod + ship (d)</div>
                    </td>
                    {daysCell(r)}
                    <td className="reorder">{reorderCell(r)}</td>
                    <td className="num">
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{r.recommended_po_qty.toLocaleString()}</span>
                      {r.moq_binding && <span className="moq-bound">MOQ</span>}
                    </td>
                    <td className="num">
                      <span className="cost">{money(r.estimated_reorder_cost)}</span>
                    </td>
                    <td>
                      <span className="flag-icons">
                        {r.confidence_flags.map((f) => (
                          <FlagPill key={f} flag={f} />
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  )
}
