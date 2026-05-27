import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'

import { useInfiniteSKUs } from '../hooks'
import { daysAgo, money, num, shortDate } from '../lib/format'
import type { Scenario, SKU, SortField, StockStatus } from '../types'
import { Dropdown, FlagPill, Sparkline, StatusBadge } from './atoms'

const STATUS_OPTS: StockStatus[] = ['STOCKOUT', 'CRITICAL', 'LOW', 'HEALTHY']

export function InventoryTable({
  scenario,
  dataDate,
  categories,
  suppliers,
  selectedSku,
  onOpenSku,
}: {
  scenario: Scenario
  dataDate: string | null
  categories: string[]
  suppliers: string[]
  selectedSku: string | null
  onOpenSku: (code: string) => void
}) {
  const [status, setStatus] = useState<StockStatus[]>([])
  const [category, setCategory] = useState<string | null>(null)
  const [supplier, setSupplier] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortField>('urgency')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const q = { status, category, supplier, search, sortBy, sortDir }
  const query = useInfiniteSKUs(scenario, q)
  const rows = query.data?.pages.flatMap((p) => p.items) ?? []
  const total = query.data?.pages[0]?.total ?? 0
  const hasFilters = status.length > 0 || !!category || !!supplier || !!search

  // Infinite scroll: load the next page when the sentinel nears the viewport.
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
          query.fetchNextPage()
        }
      },
      { rootMargin: '240px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [query])

  function toggleSort(field: SortField) {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortBy(field)
      setSortDir('asc')
    }
  }
  const ariaSort = (f: SortField): 'none' | 'ascending' | 'descending' =>
    sortBy !== f ? 'none' : sortDir === 'asc' ? 'ascending' : 'descending'
  const arrow = (f: SortField) =>
    sortBy === f ? <span className="sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span> : null

  function clearFilters() {
    setStatus([])
    setCategory(null)
    setSupplier(null)
    setSearch('')
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
    else
      body = (
        <>
          <span className="days">{r.days_of_stock > 10 ? Math.round(r.days_of_stock) : r.days_of_stock.toFixed(1)}</span>
          <div className="days-cap">days</div>
        </>
      )
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {hasFilters && (
            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={clearFilters}>
              Clear
            </button>
          )}
          <span className="count">
            {rows.length} of {total}
          </span>
        </div>

        <div className="table-wrap">
          {!query.isPending && rows.length === 0 ? (
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
                  <th scope="col" className={`sortable ${sortBy === 'code' ? 'active' : ''}`} style={{ width: 80 }} aria-sort={ariaSort('code')} onClick={() => toggleSort('code')}>
                    SKU {arrow('code')}
                  </th>
                  <th scope="col" className={`sortable ${sortBy === 'name' ? 'active' : ''}`} style={{ minWidth: 220 }} aria-sort={ariaSort('name')} onClick={() => toggleSort('name')}>
                    Product {arrow('name')}
                  </th>
                  <th scope="col" style={{ width: 100 }}>Status</th>
                  <th scope="col" className={`num sortable ${sortBy === 'stock' ? 'active' : ''}`} style={{ width: 70 }} aria-sort={ariaSort('stock')} onClick={() => toggleSort('stock')}>
                    Stock {arrow('stock')}
                  </th>
                  <th scope="col" style={{ width: 140 }}>30-day trend</th>
                  <th scope="col" className="num" style={{ width: 96 }}>7d / 14d</th>
                  <th scope="col" className="num" style={{ width: 96 }}>Lead · ship</th>
                  <th scope="col" className={`num sortable ${sortBy === 'days' ? 'active' : ''}`} style={{ width: 80 }} aria-sort={ariaSort('days')} onClick={() => toggleSort('days')}>
                    Days left {arrow('days')}
                  </th>
                  <th scope="col" style={{ width: 120 }}>Reorder by</th>
                  <th scope="col" className="num" style={{ width: 110 }}>PO qty</th>
                  <th scope="col" className={`num sortable ${sortBy === 'cost' ? 'active' : ''}`} style={{ width: 90 }} aria-sort={ariaSort('cost')} onClick={() => toggleSort('cost')}>
                    Cost {arrow('cost')}
                  </th>
                  <th scope="col" style={{ width: 70 }}>Flags</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
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

        {/* Infinite-scroll sentinel + status line */}
        <div ref={sentinel} style={{ height: 1 }} />
        {rows.length > 0 && (
          <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            {query.isFetchingNextPage
              ? 'Loading more…'
              : query.hasNextPage
                ? `Scroll to load more · ${rows.length} of ${total}`
                : `All ${total} loaded`}
          </div>
        )}
      </div>
    </section>
  )
}
