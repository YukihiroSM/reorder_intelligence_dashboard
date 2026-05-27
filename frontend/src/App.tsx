import { useState } from 'react'

import { StatusBadge, Sparkline } from './components/atoms'
import { StickyBar } from './components/StickyBar'
import { useHealth, useSKUs } from './hooks'
import { DEFAULT_SCENARIO } from './lib/constants'
import type { Scenario } from './types'

function App() {
  const [scenario, setScenario] = useState<Scenario>(DEFAULT_SCENARIO)
  const health = useHealth()
  const skus = useSKUs(scenario)

  return (
    <>
      <StickyBar
        scenario={scenario}
        setScenario={setScenario}
        dataDate={health.data?.data_date ?? null}
      />
      <main className="shell" style={{ paddingTop: 8, paddingBottom: 60 }}>
        {skus.isError && <div className="empty-table">Failed to load SKUs.</div>}
        <div className="table-wrap" style={{ marginTop: 20 }}>
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
                  <td className="num">{s.recommended_po_qty.toLocaleString()}</td>
                  <td>
                    <Sparkline data={s.sales_last_30_days ?? []} flags={s.confidence_flags} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  )
}

export default App
