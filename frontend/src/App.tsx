import { useEffect, useState } from 'react'

import { InventoryTable } from './components/InventoryTable'
import { PortfolioHealthSection } from './components/PortfolioHealth'
import { SKUDrawer } from './components/SKUDrawer'
import { StickyBar } from './components/StickyBar'
import { ThisWeekSection } from './components/ThisWeek'
import { WeeklyBriefingSection } from './components/WeeklyBriefing'
import { useAIStatus, useHealth, useSKUs } from './hooks'
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
  const aiStatus = useAIStatus()
  const skus = useSKUs(scenario)
  const rows = skus.data ?? []
  const dataDate = health.data?.data_date ?? null
  const selectedRow = rows.find((r) => r.sku_code === selectedSku) ?? null
  const loading = skus.isPending && rows.length === 0
  // Filter-dropdown options come from the full set (the table itself paginates).
  const categories = Array.from(new Set(rows.map((r) => r.category))).sort()
  const suppliers = Array.from(new Set(rows.map((r) => r.supplier))).sort()

  // Keep ?sku= in the URL in sync with the open drawer.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (selectedSku) url.searchParams.set('sku', selectedSku)
    else url.searchParams.delete('sku')
    window.history.replaceState(null, '', url.toString())
  }, [selectedSku])

  return (
    <>
      <StickyBar scenario={scenario} setScenario={setScenario} dataDate={dataDate} />
      <main>
        {loading && (
          <section className="section">
            <div className="shell">
              <div className="grid-3" style={{ marginBottom: 24 }}>
                <div className="skel skel-card" />
                <div className="skel skel-card" />
                <div className="skel skel-card" />
              </div>
              <div className="table-wrap">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="skel-row" />
                ))}
              </div>
            </div>
          </section>
        )}

        {skus.isError && (
          <section className="section" id="inventory">
            <div className="shell">
              <div className="empty-table">Failed to load SKUs. Is the API running?</div>
            </div>
          </section>
        )}

        {!loading && !skus.isError && (
          <>
            <ThisWeekSection
              rows={rows}
              dataDate={dataDate}
              forecastDays={scenario.forecastDays}
              onOpenSku={setSelectedSku}
              onScrollToTable={() => scrollToId('inventory')}
              onScrollToCashflow={() => scrollToId('cash-horizon-anchor', true)}
            />
            <WeeklyBriefingSection
              scenario={scenario}
              aiEnabled={aiStatus.data?.ai_enabled ?? false}
              skuOpen={!!selectedSku}
              onOpenSku={setSelectedSku}
            />
            <PortfolioHealthSection rows={rows} forecastDays={scenario.forecastDays} />
            <InventoryTable
              scenario={scenario}
              dataDate={dataDate}
              categories={categories}
              suppliers={suppliers}
              selectedSku={selectedSku}
              onOpenSku={setSelectedSku}
            />
          </>
        )}

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
              {health.data?.skus_loaded ?? rows.length} SKUs · data as of {dataDate ?? '—'}
            </span>
          </div>
        </footer>
      </main>

      <SKUDrawer
        sku={selectedRow}
        scenario={scenario}
        dataDate={dataDate}
        onClose={() => setSelectedSku(null)}
      />
    </>
  )
}

export default App
