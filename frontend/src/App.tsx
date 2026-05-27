import { useState } from 'react'

import { StatusBadge, Sparkline } from './components/atoms'
import { useHealth, useSKUs } from './hooks'
import { DEFAULT_SCENARIO } from './lib/constants'
import type { Scenario } from './types'

// Phase 6.0 scaffold — proves CSS tokens + API wiring + types. Real sections
// (sticky bar, This Week, Portfolio, table, drawer) replace this body next.
function App() {
  const [scenario] = useState<Scenario>(DEFAULT_SCENARIO)
  const health = useHealth()
  const skus = useSKUs(scenario)

  return (
    <main className="shell" style={{ paddingTop: 24, paddingBottom: 60 }}>
      <div className="data-badge" style={{ marginBottom: 20 }}>
        <span className="dot" />
        {health.data
          ? `Data as of ${health.data.data_date} · ${health.data.skus_loaded} SKUs`
          : 'Loading…'}
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
              <th>30d</th>
            </tr>
          </thead>
          <tbody>
            {(skus.data ?? []).map((s) => (
              <tr key={s.sku_code}>
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
                <td>
                  <Sparkline data={s.sales_last_30_days ?? []} flags={s.confidence_flags} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}

export default App
