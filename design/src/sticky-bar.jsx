// Sticky bar (brand row + scenario controls)
const { Icon } = window;

function StickyBar({ scenario, setScenario, dataDate }) {
  const [scrolled, setScrolled] = React.useState(false);
  const [menu, setMenu] = React.useState(null); // 'history' | 'settings' | null
  React.useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 4); }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  React.useEffect(() => {
    function onDoc(e) {
      if (!e.target.closest('.brand-meta')) setMenu(null);
    }
    if (menu) {
      document.addEventListener('mousedown', onDoc);
      return () => document.removeEventListener('mousedown', onDoc);
    }
  }, [menu]);

  const growthTicks = [-20, -10, 0, 10, 20, 30, 50, 100];
  const fwOptions = [30, 60, 90];
  const lbOptions = [0, 7, 14, 21];

  function deltaCls(v, base = 0) {
    if (v === base) return '';
    return v > base ? 'delta-up' : 'delta-dn';
  }

  return (
    <header className={`sticky-bar ${scrolled ? 'scrolled' : ''}`}>
      <div className="shell sticky-inner">
        <div className="sticky-row1">
          <div className="brand">
            <div className="brand-mark">R</div>
            <div>
              <div className="brand-title">Reorder Intelligence</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>GLOW Supplements · operations</div>
            </div>
          </div>
          <div className="brand-meta" style={{ position: 'relative' }}>
            <span className="data-badge"><span className="dot"/>Data as of {dataDate}</span>
            <div style={{ position: 'relative' }}>
              <button className={`icon-btn ${menu === 'history' ? 'active' : ''}`} onClick={() => setMenu(m => m === 'history' ? null : 'history')}>
                <Icon name="history" size={13}/> History
              </button>
              {menu === 'history' && (
                <div className="bar-menu">
                  <div className="bar-menu-head">Recent syncs</div>
                  <div className="bar-menu-row">
                    <div>
                      <div className="bar-menu-row-title">Inventory snapshot</div>
                      <div className="bar-menu-row-sub">25 May · 02:14 UTC</div>
                    </div>
                    <span className="bar-menu-tag ok">live</span>
                  </div>
                  <div className="bar-menu-row">
                    <div>
                      <div className="bar-menu-row-title">Sales backfill</div>
                      <div className="bar-menu-row-sub">25 May · 02:09 UTC</div>
                    </div>
                    <span className="bar-menu-tag ok">ok</span>
                  </div>
                  <div className="bar-menu-row">
                    <div>
                      <div className="bar-menu-row-title">PO ledger pull</div>
                      <div className="bar-menu-row-sub">24 May · 23:00 UTC</div>
                    </div>
                    <span className="bar-menu-tag ok">ok</span>
                  </div>
                  <div className="bar-menu-row">
                    <div>
                      <div className="bar-menu-row-title">Saved scenario · "+20% holiday"</div>
                      <div className="bar-menu-row-sub">22 May · by you</div>
                    </div>
                    <button className="bar-menu-link" onClick={() => { setScenario({ growth: 20, leadBuffer: 7, forecastDays: 90 }); setMenu(null); }}>load</button>
                  </div>
                  <div className="bar-menu-foot">
                    <button className="bar-menu-link">View full audit log →</button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button className={`icon-btn ${menu === 'settings' ? 'active' : ''}`} onClick={() => setMenu(m => m === 'settings' ? null : 'settings')}>
                <Icon name="settings" size={13}/> Settings
              </button>
              {menu === 'settings' && (
                <div className="bar-menu">
                  <div className="bar-menu-head">Display & alerts</div>
                  <button className="bar-menu-item">
                    <span>Density</span>
                    <span className="bar-menu-mini">Comfortable / <strong>Compact</strong></span>
                  </button>
                  <button className="bar-menu-item">
                    <span>Currency</span>
                    <span className="bar-menu-mini"><strong>USD</strong></span>
                  </button>
                  <button className="bar-menu-item">
                    <span>Alert threshold</span>
                    <span className="bar-menu-mini"><strong>&lt; 30 days</strong></span>
                  </button>
                  <div className="bar-menu-divider"/>
                  <div className="bar-menu-head">Account</div>
                  <button className="bar-menu-item"><span>Suppliers & SKUs</span><Icon name="arrow" size={10}/></button>
                  <button className="bar-menu-item"><span>Notifications</span><Icon name="arrow" size={10}/></button>
                  <button className="bar-menu-item"><span>Sign out</span></button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="scenario-bar" role="group" aria-label="Scenario controls">
          <div className="scenario-field">
            <div className="scenario-label">
              <span>Demand growth</span>
              <span className={`v ${deltaCls(scenario.growth)}`}>
                {scenario.growth > 0 ? '+' : ''}{scenario.growth}%
              </span>
            </div>
            <input
              type="range"
              min={-20} max={100} step={5}
              value={scenario.growth}
              onChange={e => setScenario(s => ({ ...s, growth: parseInt(e.target.value, 10) }))}
              className="slider"
            />
            <div className="tick-row" style={{ position: 'relative', height: 14 }}>
              {growthTicks.map(t => {
                const frac = (t - (-20)) / (100 - (-20));
                return (
                  <button
                    key={t}
                    onClick={() => setScenario(s => ({ ...s, growth: t }))}
                    style={{
                      position: 'absolute',
                      left: `calc(7px + (100% - 14px) * ${frac})`,
                      transform: 'translateX(-50%)',
                      background: 'transparent', border: 'none', padding: '0 2px',
                      color: scenario.growth === t ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      fontWeight: scenario.growth === t ? 600 : 400,
                      fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t > 0 ? `+${t}` : t}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="scenario-field">
            <div className="scenario-label">
              <span>Lead time buffer</span>
              <span className="v">{scenario.leadBuffer}d</span>
            </div>
            <div className="scenario-segment">
              {lbOptions.map(o => (
                <button key={o} className={scenario.leadBuffer === o ? 'active' : ''}
                  onClick={() => setScenario(s => ({ ...s, leadBuffer: o }))}>
                  {o}d
                </button>
              ))}
            </div>
          </div>

          <div className="scenario-field">
            <div className="scenario-label">
              <span>Forecast window</span>
              <span className="v">{scenario.forecastDays}d</span>
            </div>
            <div className="scenario-segment">
              {fwOptions.map(o => (
                <button key={o} className={scenario.forecastDays === o ? 'active' : ''}
                  onClick={() => setScenario(s => ({ ...s, forecastDays: o }))}>
                  {o}d
                </button>
              ))}
            </div>
          </div>

          <div className="scenario-actions">
            <button className="btn btn-ghost" onClick={() => setScenario({ growth: 0, leadBuffer: 7, forecastDays: 60 })}>Reset</button>
            <button className="btn"><Icon name="download" size={12} strokeWidth={2.2}/> Save scenario</button>
          </div>
        </div>
      </div>
    </header>
  );
}

window.StickyBar = StickyBar;
