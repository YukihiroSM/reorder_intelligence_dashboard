// Section 3: Inventory Table
const { Icon, StatusBadge, Sparkline, Dropdown, FlagPill, STATUS_ORDER } = window;

function InventoryTable({ rows, scenario, selectedSku, onOpenSku }) {
  const [status, setStatus] = React.useState([]); // multi
  const [category, setCategory] = React.useState(null);
  const [supplier, setSupplier] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState({ key: 'urgency', dir: 'asc' });

  const factor = 1 + scenario.growth / 100;

  // Compute scenario-adjusted urgency for every row.
  const enriched = rows.map((r) => {
    const adjVel = Math.max(0.01, r.v14d * factor);
    const adjDays = r.status === 'STOCKOUT' ? 0 : r.stock / adjVel;
    const totalLead = r.productionLead + r.shippingDays + scenario.leadBuffer;
    return { ...r, _adjVel: adjVel, _adjDays: adjDays, _totalLead: totalLead };
  });

  // Filter
  let filtered = enriched.filter((r) => {
    if (status.length && !status.includes(r.status)) return false;
    if (category && r.category !== category) return false;
    if (supplier && r.supplier !== supplier) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!r.code.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Sort
  filtered = filtered.slice().sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    if (sort.key === 'urgency') {
      const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (so !== 0) return so;
      return a._adjDays - b._adjDays;
    }
    if (sort.key === 'stock') return (a.stock - b.stock) * dir;
    if (sort.key === 'days') return (a._adjDays - b._adjDays) * dir;
    if (sort.key === 'code') return a.code.localeCompare(b.code) * dir;
    if (sort.key === 'name') return a.name.localeCompare(b.name) * dir;
    if (sort.key === 'cost') return (a.poCost - b.poCost) * dir;
    return 0;
  });

  function toggleSort(key) {
    setSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  }

  function ariaSort(key) {
    if (sort.key !== key) return 'none';
    return sort.dir === 'asc' ? 'ascending' : 'descending';
  }

  function arrow(key) {
    if (sort.key !== key) return null;
    return <span className="sort-arrow">{sort.dir === 'asc' ? '↑' : '↓'}</span>;
  }

  const categories = Array.from(new Set(rows.map((r) => r.category)));
  const suppliers = Array.from(new Set(rows.map((r) => r.supplier)));

  const hasFilters = status.length || category || supplier || query;

  function fmtReorder(r) {
    if (!r.reorderBy) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
    const d = new Date(r.reorderBy);
    const label = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    const year = d.getFullYear();
    return (
      <>
        <div className="date">{label}{year !== 2026 ? ` '${String(year).slice(-2)}` : ''}</div>
        {r.overdueDays != null && <div className="od">overdue {r.overdueDays}d</div>}
      </>);

  }

  function fmtDays(r) {
    if (r.status === 'STOCKOUT') return <span className="days">0</span>;
    const d = r._adjDays;
    if (d > 365) return <><span className="days">∞</span><div className="days-cap">365d+</div></>;
    if (d > 99) return <><span className="days">{Math.round(d)}</span><div className="days-cap">days</div></>;
    if (d > 10) return <><span className="days">{Math.round(d)}</span><div className="days-cap">days</div></>;
    return <><span className="days">{d.toFixed(1)}</span><div className="days-cap">days</div></>;
  }

  function daysCellCls(r) {
    if (r.status === 'STOCKOUT') return 'days-cell stockout';
    if (r.status === 'CRITICAL') return 'days-cell critical';
    if (r.status === 'LOW') return 'days-cell low';
    return 'days-cell';
  }

  return (
    <section className="section" id="inventory">
      <div className="shell">
        <div className="section-head">
          <h2 className="section-title">Inventory · all SKUs</h2>
          <span className="section-meta">Click a row for SKU detail</span>
        </div>

        <div className="filters">
          <Dropdown label="Status" value={status} multi onChange={setStatus} options={['STOCKOUT', 'CRITICAL', 'LOW', 'HEALTHY']} />
          <Dropdown label="Category" value={category} onChange={setCategory} options={categories} />
          <Dropdown label="Supplier" value={supplier} onChange={setSupplier} options={suppliers} />
          <div className="search">
            <span className="ico"><Icon name="search" size={13} /></span>
            <input type="text" placeholder="Search SKU or name..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {hasFilters &&
          <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }}
          onClick={() => {setStatus([]);setCategory(null);setSupplier(null);setQuery('');}}>
              Clear
            </button>
          }
          <span className="count">{filtered.length} of {rows.length}</span>
        </div>

        <div className="table-wrap">
          {filtered.length === 0 ?
          <div className="empty-table">
              <div className="ttl">No SKUs match these filters</div>
              <button className="btn btn-ghost" onClick={() => {setStatus([]);setCategory(null);setSupplier(null);setQuery('');}}>Clear filters</button>
            </div> :

          <table className="inv">
            <thead>
              <tr>
                <th className={`sortable ${sort.key === 'code' ? 'active' : ''}`} style={{ width: 80 }} aria-sort={ariaSort('code')} onClick={() => toggleSort('code')}>SKU {arrow('code')}</th>
                <th className={`sortable ${sort.key === 'name' ? 'active' : ''}`} style={{ minWidth: 220 }} aria-sort={ariaSort('name')} onClick={() => toggleSort('name')}>Product {arrow('name')}</th>
                <th style={{ width: 100 }}>Status</th>
                <th className={`num sortable ${sort.key === 'stock' ? 'active' : ''}`} style={{ width: 70 }} aria-sort={ariaSort('stock')} onClick={() => toggleSort('stock')}>Stock {arrow('stock')}</th>
                <th style={{ width: 140 }}>30-day trend</th>
                <th className="num" style={{ width: 96 }}>7d / 14d</th>
                <th className={`num sortable ${sort.key === 'days' ? 'active' : ''}`} style={{ width: 80 }} aria-sort={ariaSort('days')} onClick={() => toggleSort('days')}>Days left {arrow('days')}</th>
                <th style={{ width: 120 }}>Reorder by</th>
                <th className="num" style={{ width: 110 }}>PO qty</th>
                <th className={`num sortable ${sort.key === 'cost' ? 'active' : ''}`} style={{ width: 90 }} aria-sort={ariaSort('cost')} onClick={() => toggleSort('cost')}>Cost {arrow('cost')}</th>
                <th style={{ width: 70 }}>Flags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) =>
              <tr key={r.code} className={selectedSku === r.code ? 'selected' : ''} onClick={() => onOpenSku(r.code)}>
                  <td><span className="code">{r.code}</span></td>
                  <td>
                    <div className="nm">{r.name}</div>
                    <div className="cat">{r.category}</div>
                  </td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="num"><span style={{ fontFamily: 'var(--font-mono)' }}>{r.stock.toLocaleString()}</span></td>
                  <td><Sparkline data={r.sales30d} flags={r.flags} width={124}/></td>
                  <td className="num">
                    <div className="vel-pair">
                      <span className="strong">{r.v7d.toFixed(1)}</span>
                      <span style={{ opacity: 0.5, margin: '0 3px' }}>/</span>
                      {r.v14d.toFixed(1)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>units/day</div>
                  </td>
                  <td className={`num ${daysCellCls(r)}`}>{fmtDays(r)}</td>
                  <td className="reorder">{fmtReorder(r)}</td>
                  <td className="num">
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{r.poQty.toLocaleString()}</span>
                    {r.moqBound && <span className="moq-bound">MOQ</span>}
                  </td>
                  <td className="num"><span className="cost">${r.poCost.toLocaleString()}</span></td>
                  <td>
                    <span className="flag-icons">
                      {r.flags.map((f) => <FlagPill key={f} flag={f} />)}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          }
        </div>
      </div>
    </section>);

}

window.InventoryTable = InventoryTable;