// App root
const { StickyBar, ThisWeekSection, PortfolioHealthSection, InventoryTable, SKUDrawer, inventoryRows, TODAY_LABEL } = window;

function App() {
  const [scenario, setScenario] = React.useState({ growth: 0, leadBuffer: 7, forecastDays: 60 });
  const [selectedSku, setSelectedSku] = React.useState(null);

  // URL state
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sku = params.get('sku');
    if (sku && inventoryRows.find(r => r.code === sku)) {
      setSelectedSku(sku);
    }
  }, []);

  React.useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedSku) url.searchParams.set('sku', selectedSku);
    else url.searchParams.delete('sku');
    window.history.replaceState(null, '', url.toString());
  }, [selectedSku]);

  const skuObj = selectedSku ? inventoryRows.find(r => r.code === selectedSku) : null;

  function scrollToTable() {
    const el = document.getElementById('inventory');
    if (el) window.scrollTo({ top: el.offsetTop - 200, behavior: 'smooth' });
  }

  function scrollToCashflow() {
    const el = document.getElementById('cash-horizon-anchor');
    if (el) {
      const rect = el.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + rect.top - 200, behavior: 'smooth' });
      // brief flash to draw eye
      el.style.transition = 'box-shadow .4s ease';
      el.style.boxShadow = '0 0 0 3px rgba(14,165,233,0.4)';
      setTimeout(() => { el.style.boxShadow = ''; }, 1100);
    }
  }

  return (
    <>
      <StickyBar
        scenario={scenario}
        setScenario={setScenario}
        dataDate={TODAY_LABEL}
      />
      <main>
        <ThisWeekSection
          rows={inventoryRows}
          scenario={scenario}
          onOpenSku={setSelectedSku}
          onScrollToTable={scrollToTable}
          onScrollToCashflow={scrollToCashflow}
        />
        <PortfolioHealthSection rows={inventoryRows} scenario={scenario}/>
        <InventoryTable
          rows={inventoryRows}
          scenario={scenario}
          selectedSku={selectedSku}
          onOpenSku={setSelectedSku}
        />
        <footer style={{ padding: '40px 0 60px', borderTop: '1px solid var(--border-subtle)' }}>
          <div className="shell" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            <span>Reorder Intelligence · v1.0</span>
            <span>20 SKUs · 5 categories · 8 suppliers · data refreshed 02:14 UTC</span>
          </div>
        </footer>
      </main>
      <SKUDrawer sku={skuObj} scenario={scenario} onClose={() => setSelectedSku(null)}/>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
