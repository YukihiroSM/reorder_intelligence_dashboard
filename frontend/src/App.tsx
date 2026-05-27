import { useEffect, useState } from 'react'

import { StatusBadge, Sparkline } from './components/atoms'
import { StickyBar } from './components/StickyBar'
import { ThisWeekSection } from './components/ThisWeek'
import { useHealth, useSKUs } from './hooks'
import { DEFAULT_SCENARIO } from './lib/constants'
import type { Scenario } from './types'

function scrollToId(id: string, flash = false) {
  const el = document.getElementById(id)
  if (!el) return
  const top = window.scrollY + el.getBoundingClientRect().top - 120
  window.scrollTo({ top, behavior: 'smooth' })
  if (flash) {
    el.style.transition = 'box-shadow .4s ease'
    el.style.boxShadow = '0 0 0 3px rgba(14,165,233,0.4)'
    setTimeout(() => {
      el.style.boxShadow = ''
    }, 1100)
  }
}

function App() {
  const [scenario, setScenario] = useState<Scenario>(DEFAULT_SCENARIO)
  const [selectedSku, setSelectedSku] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('sku'),
  )
  const health = useHealth()
  const skus = useSKUs(scenario)
  const rows = skus.data ?? []

  // Keep ?sku= in the URL in sync with the open drawer.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (selectedSku) url.searchParams.set('sku', selectedSku)
    else url.searchParams.delete('sku')
    window.history.replaceState(null, '', url.toString())
  }, [selectedSku])

  return (
    <>
      <StickyBar
        scenario={scenario}
        setScenario={setScenario}
        dataDate={health.data?.data_date ?? null}
      />
      <main>
        <ThisWeekSection
          rows={rows}
          dataDate={health.data?.data_date ?? null}
          onOpenSku={setSelectedSku}
          onScrollToTable={() => scrollToId('inventory')}
          onScrollToCashflow={() => scrollToId('cash-horizon-anchor', true)}
        />

        {/* Temporary table — replaced by the full InventoryTable in 6.5. */}
        <section className="section" id="inventory">
          <div className="shell">
            <div className="section-head">
              <h2 className="section-title">Inventory</h2>
              <span className="section-meta">{rows.length} SKUs</span>
            </div>
            {skus.isError && <div className="empty-table">Failed to load SKUs.</div>}
            <div className="table-wrap">
              <table className="inv">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product</th>
                    <th>Status</th>
                    <th className="num">Days</th>
                    <th className="num">PO qty</th>
                    <th>30d</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.sku_code} onClick={() => setSelectedSku(s.sku_code)}>
                      <td className="code">{s.sku_code}</td>
                      <td>
                        <div className="nm">{s.name}</div>
                        <div className="cat">{s.category}</div>
                      </td>
                      <td>
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="num">
                        {s.days_of_stock === null ? '∞' : s.days_of_stock.toFixed(1)}
                      </td>
                      <td className="num">{s.recommended_po_qty.toLocaleString()}</td>
                      <td>
                        <Sparkline data={s.sales_last_30_days ?? []} flags={s.confidence_flags} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <footer style={{ padding: '40px 0 60px', borderTop: '1px solid var(--border-subtle)' }}>
          <div
            className="shell"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span>Reorder Intelligence · v1.0</span>
            <span>
              {health.data?.skus_loaded ?? rows.length} SKUs · data as of{' '}
              {health.data?.data_date ?? '—'}
            </span>
          </div>
        </footer>
      </main>
    </>
  )
}

export default App
