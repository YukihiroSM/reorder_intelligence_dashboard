// Section 1: This Week — three action cards
const { Icon, StatusBadge } = window;

function ThisWeekSection({ rows, scenario, onOpenSku, onScrollToTable, onScrollToCashflow }) {
  // re-derive needs-ordering list and cash commitment from scenario.
  const factor = 1 + scenario.growth / 100;

  const enriched = rows.map(r => {
    const adjVel = r.v14d * factor;
    const adjDays = adjVel > 0 ? r.stock / adjVel : 9999;
    const totalLead = r.productionLead + r.shippingDays + scenario.leadBuffer;
    // reorderBy from today: stock days < lead time → overdue
    const needsThisWeek = r.status === 'STOCKOUT' || adjDays <= totalLead + 7;
    return { ...r, _adjVel: adjVel, _adjDays: adjDays, _totalLead: totalLead, _needsThisWeek: needsThisWeek };
  });

  const needsOrdering = enriched
    .filter(r => r._needsThisWeek)
    .sort((a, b) => (a.status === 'STOCKOUT' ? -1 : 1) - (b.status === 'STOCKOUT' ? -1 : 1) || a._adjDays - b._adjDays)
    .slice(0, 4);

  const cashCommitment = needsOrdering.reduce((s, r) => s + r.poCost, 0);
  const stockouts = enriched.filter(r => r.status === 'STOCKOUT');

  const animKey = `${scenario.growth}-${scenario.leadBuffer}-${scenario.forecastDays}`;

  return (
    <section className="section" id="this-week">
      <div className="shell">
        <div className="section-head">
          <h2 className="section-title">This week · what to do today</h2>
          <span className="section-meta">Updated 2 sec ago · live with scenario</span>
        </div>

        <div className="grid-3" key={animKey}>
          {/* Card 1: needs ordering */}
          <div className="card hero">
            <div className="card-tag">Needs ordering</div>
            <div className="card-display">
              {needsOrdering.length} <span style={{ fontSize: 18, color: 'var(--text-secondary)', fontWeight: 500 }}>SKU{needsOrdering.length === 1 ? '' : 's'}</span>
            </div>
            <div className="card-sub">this week</div>

            {needsOrdering.length === 0 ? (
              <div className="allclear" style={{ marginTop: 16 }}>
                <span className="check"><Icon name="check" size={14} strokeWidth={2.4}/></span>
                All clear — nothing needs ordering
              </div>
            ) : (
              <div className="tw-list">
                {needsOrdering.map(r => (
                  <button
                    key={r.code}
                    className="row"
                    style={{ textAlign: 'left', border: 'none', cursor: 'pointer', width: '100%' }}
                    onClick={() => onOpenSku(r.code)}
                  >
                    <span className="code">{r.code}</span>
                    <span className="nm">{r.name}</span>
                    {r.status === 'STOCKOUT'
                      ? <span className="status-badge stockout"><span className="dot"/>stockout</span>
                      : <span className="status-badge critical"><span className="dot"/>overdue {r.overdueDays || Math.ceil(r._totalLead - r._adjDays)}d</span>}
                  </button>
                ))}
              </div>
            )}

            <div className="card-footer">
              <button className="link-btn" onClick={onScrollToTable}>
                Review &amp; order <span className="arrow"><Icon name="arrowright" size={13}/></span>
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{needsOrdering.length} of {rows.length}</span>
            </div>
          </div>

          {/* Card 2: cash exposure */}
          <div className="card hero">
            <div className="card-tag">Cash exposure</div>
            <div className="card-display">${cashCommitment.toLocaleString()}</div>
            <div className="card-sub">committed if you order {needsOrdering.length === 1 ? 'this SKU' : `all ${needsOrdering.length}`} today</div>

            <div className="cash-breakdown">
              {needsOrdering.slice(0, 3).map(r => {
                const max = Math.max(1, ...needsOrdering.map(x => x.poCost));
                return (
                  <div key={r.code} className="seg-row">
                    <span className="lbl">{r.code}</span>
                    <span className="bar"><span className="fill" style={{ width: `${(r.poCost / max) * 100}%` }}/></span>
                    <span className="amt">${r.poCost.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>

            <div className="card-footer">
              <button className="link-btn" onClick={onScrollToCashflow}>
                Open cashflow <span className="arrow"><Icon name="arrowright" size={13}/></span>
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>30-day window</span>
            </div>
          </div>

          {/* Card 3: stockouts */}
          {stockouts.length === 0 ? (
            <div className="card hero" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-tag">Active stockouts</div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div className="allclear">
                  <span className="check"><Icon name="check" size={14} strokeWidth={2.4}/></span>
                  All SKUs in stock
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, marginLeft: 32 }}>No active stockouts to address.</div>
              </div>
            </div>
          ) : (
            <div className="card hero stockout-card">
              <div className="card-tag" style={{ color: 'var(--stockout-fg)' }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--stockout-accent)' }}/>
                Active stockout{stockouts.length === 1 ? '' : 's'}
              </div>
              <div className="card-display" style={{ color: 'var(--stockout-fg)' }}>
                {stockouts.length} <span style={{ fontSize: 14, color: 'var(--stockout-fg)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>STOCKOUT</span>
              </div>
              <div className="card-sub">active right now · revenue at risk</div>

              <div className="tw-list" style={{ marginTop: 14 }}>
                {stockouts.map(r => (
                  <button key={r.code} className="row" style={{ textAlign: 'left', border: 'none', cursor: 'pointer', width: '100%' }} onClick={() => onOpenSku(r.code)}>
                    <span className="code">{r.code}</span>
                    <span className="nm">{r.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      ~${Math.round(r.v14d * r.retailPrice).toLocaleString()}/day lost
                    </span>
                  </button>
                ))}
              </div>

              <div className="card-footer">
                <button className="link-btn" onClick={() => onOpenSku(stockouts[0].code)}>
                  View SKU <span className="arrow"><Icon name="arrowright" size={13}/></span>
                </button>
                <span style={{ fontSize: 11, color: 'var(--stockout-fg)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>est. ${Math.round(stockouts.reduce((s,r)=>s+r.v14d*r.retailPrice,0)).toLocaleString()}/day</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

window.ThisWeekSection = ThisWeekSection;
