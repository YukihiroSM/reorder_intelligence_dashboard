import { useEffect, useState } from 'react'

import { InventoryTable } from './components/InventoryTable'
import { PortfolioHealthSection } from './components/PortfolioHealth'
import { SKUDrawer } from './components/SKUDrawer'
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
  const dataDate = health.data?.data_date ?? null
  const selectedRow = rows.find((r) => r.sku_code === selectedSku) ?? null

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
        <ThisWeekSection
          rows={rows}
          dataDate={dataDate}
          onOpenSku={setSelectedSku}
          onScrollToTable={() => scrollToId('inventory')}
          onScrollToCashflow={() => scrollToId('cash-horizon-anchor', true)}
        />

        <PortfolioHealthSection rows={rows} forecastDays={scenario.forecastDays} />

        {skus.isError ? (
          <section className="section" id="inventory">
            <div className="shell">
              <div className="empty-table">Failed to load SKUs. Is the API running?</div>
            </div>
          </section>
        ) : (
          <InventoryTable
            rows={rows}
            dataDate={dataDate}
            selectedSku={selectedSku}
            onOpenSku={setSelectedSku}
          />
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
