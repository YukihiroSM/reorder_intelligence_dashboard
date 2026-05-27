// SKU detail drawer
const { Icon, StatusBadge, FlagChip, AI_RECOMMENDATIONS } = window;

/* Sales trend chart — bars + 7d MA + 14d MA (dashed) */
function SalesChart({ data, flags = [] }) {
  const W = 510, H = 200, padL = 28, padR = 8, padT = 12, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const n = data.length;
  const max = Math.max(1, ...data, ...data.map((_, i) => {
    const s = Math.max(0, i - 6); return data.slice(s, i + 1).reduce((a, b) => a + b, 0) / Math.min(7, i + 1);
  }));
  const barW = innerW / n - 1;

  // moving averages
  function ma(window) {
    return data.map((_, i) => {
      const s = Math.max(0, i - window + 1);
      const slice = data.slice(s, i + 1);
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    });
  }
  const ma7 = ma(7), ma14 = ma(14);

  const yTicks = 4;
  const yMax = Math.ceil(max / 5) * 5;

  // detect trailing zeros
  let trailingFrom = n;
  for (let i = n - 1; i >= 0; i--) {
    if (data[i] === 0) trailingFrom = i; else break;
  }
  const showStockoutLine = trailingFrom < n && flags.includes('RECENT_STOCKOUT');

  const [hover, setHover] = React.useState(null);

  function xOf(i) { return padL + i * (innerW / n) + (innerW / n) / 2; }
  function yOf(v) { return padT + innerH - (v / yMax) * innerH; }

  const labels = ['30d ago', '21d', '14d', '7d', 'today'];

  return (
    <div style={{ position: 'relative' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}
        onMouseMove={e => {
          const svg = e.currentTarget;
          const rect = svg.getBoundingClientRect();
          const xRel = ((e.clientX - rect.left) / rect.width) * W;
          const idx = Math.round(((xRel - padL) / innerW) * n - 0.5);
          if (idx >= 0 && idx < n) setHover(idx); else setHover(null);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {/* Y gridlines */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const v = (yMax / yTicks) * i;
          const y = yOf(v);
          return (
            <g key={i}>
              <line className="grid-line" x1={padL} x2={W - padR} y1={y} y2={y}/>
              <text className="axis-tick" x={padL - 6} y={y + 3} textAnchor="end">{Math.round(v)}</text>
            </g>
          );
        })}
        {/* Bars */}
        {data.map((v, i) => {
          const h = (v / yMax) * innerH;
          const x = padL + i * (innerW / n);
          const y = padT + innerH - h;
          const isStockout = flags.includes('RECENT_STOCKOUT') && i >= trailingFrom && v === 0;
          return <rect key={i} x={x + 0.5} y={y} width={barW} height={Math.max(1, h)} fill={isStockout ? '#FCA5A5' : '#A8A29E'} opacity={0.7}/>;
        })}
        {/* MA7 */}
        <polyline
          fill="none" stroke="#1C1917" strokeWidth={2}
          points={ma7.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' ')}
        />
        {/* MA14 dashed */}
        <polyline
          fill="none" stroke="#78716C" strokeWidth={1.5} strokeDasharray="4 3"
          points={ma14.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' ')}
        />
        {/* Stockout reference line */}
        {showStockoutLine && (
          <g>
            <line x1={xOf(trailingFrom)} x2={xOf(trailingFrom)} y1={padT} y2={padT + innerH} stroke="#DC2626" strokeWidth={1} strokeDasharray="3 3" opacity={0.6}/>
            <text x={xOf(trailingFrom) + 4} y={padT + 10} style={{ fontSize: 9, fill: '#991B1B', fontFamily: 'var(--font-mono)' }}>stockout</text>
          </g>
        )}
        {/* X labels */}
        {labels.map((l, i) => {
          const idx = Math.round((i / (labels.length - 1)) * (n - 1));
          return <text key={i} className="axis-tick" x={xOf(idx)} y={H - padB + 16} textAnchor="middle">{l}</text>;
        })}
        {/* Hover crosshair */}
        {hover !== null && (
          <g>
            <line x1={xOf(hover)} x2={xOf(hover)} y1={padT} y2={padT + innerH} stroke="#1C1917" strokeWidth={1} opacity={0.25}/>
            <circle cx={xOf(hover)} cy={yOf(ma7[hover])} r={3} fill="#1C1917"/>
          </g>
        )}
      </svg>
      {hover !== null && (
        <div style={{
          position: 'absolute', top: 8, right: 12,
          background: 'var(--text-primary)', color: 'white',
          padding: '6px 10px', borderRadius: 4,
          fontSize: 11, fontFamily: 'var(--font-mono)', lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Day {hover - 29} (relative)</div>
          <div>units: {data[hover]}</div>
          <div>ma7: {ma7[hover].toFixed(1)}</div>
          <div>ma14: {ma14[hover].toFixed(1)}</div>
        </div>
      )}
      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, paddingLeft: padL }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 5, background: '#A8A29E', opacity: 0.7 }}/>daily units
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 2, background: '#1C1917' }}/>7d avg
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 2, background: '#78716C', borderTop: '2px dashed #78716C' }}/>14d avg
        </span>
      </div>
    </div>
  );
}

/* Metric cell with formula tooltip */
function MetricCell({ label, value, caption, formula, highlight }) {
  return (
    <div className={`metric-cell ${highlight ? 'crit' : ''}`}>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {caption && <div className="c">{caption}</div>}
      {formula && <div className="tip">{formula}</div>}
    </div>
  );
}

function AIBlock({ sku, scenario }) {
  const [state, setState] = React.useState('idle'); // idle | loading | result
  const [result, setResult] = React.useState(null);

  React.useEffect(() => {
    // reset whenever sku changes
    setState('idle'); setResult(null);
  }, [sku.code]);

  async function generate() {
    setState('loading');
    // Try cached, else simulate generation.
    const pre = AI_RECOMMENDATIONS[sku.code];
    await new Promise(r => setTimeout(r, 1200 + Math.random() * 400));
    if (pre) {
      setResult(pre);
    } else {
      // synthesize a recommendation based on numbers
      const r = sku;
      const adjVel = r.v14d * (1 + scenario.growth / 100);
      const adjDays = adjVel > 0 ? r.stock / adjVel : 0;
      const totalLead = r.productionLead + r.shippingDays + scenario.leadBuffer;
      let action = 'WAIT', urgency = 1, reasoning = '', warnings = [];
      if (r.status === 'STOCKOUT') {
        action = 'ORDER_NOW'; urgency = 5;
        reasoning = `SKU is <mark>actively stocked out</mark>. Order the MOQ of ${r.moq} immediately. Revenue lost at ~<mark>$${Math.round(r.v14d * r.retailPrice)}/day</mark>.`;
        warnings = ['Every day costs revenue while you wait.'];
      } else if (adjDays <= totalLead) {
        action = 'ORDER_NOW'; urgency = 4;
        reasoning = `${adjDays.toFixed(1)} days of stock against a <mark>${totalLead}-day lead</mark> means a stockout window is unavoidable. Place the PO immediately.`;
      } else if (adjDays <= totalLead + 14) {
        action = 'INVESTIGATE'; urgency = 3;
        reasoning = `${adjDays.toFixed(0)} days of stock — comfortable, but the <mark>${totalLead}-day lead</mark> leaves limited slack. Consider ordering this cycle.`;
      } else {
        action = 'WAIT'; urgency = 1;
        reasoning = `${adjDays.toFixed(0)} days of stock against a ${totalLead}-day lead. No action needed this week.`;
      }
      setResult({
        action, urgency, reasoning, warnings,
        suggestedPOQty: r.poQty,
        generatedAgo: '1s ago',
        model: 'claude-sonnet-4-5',
        tokens: 200 + Math.floor(Math.random() * 300),
      });
    }
    setState('result');
  }

  if (state === 'idle') {
    return (
      <div className="ai-card">
        <button className="ai-button" onClick={generate}>
          <Icon name="sparkles" size={14}/>
          Get AI recommendation
        </button>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 8 }}>
          Re-runs against current scenario · uses claude-sonnet-4-5
        </div>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div className="ai-card expanded">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
          <Icon name="sparkles" size={13}/>
          <span>Analyzing…</span>
        </div>
        <div className="ai-skeleton">
          <div className="line l1"/>
          <div className="line l2"/>
          <div className="line l3"/>
        </div>
      </div>
    );
  }

  const r = result;
  return (
    <div className="ai-card expanded">
      <div className="ai-action-row">
        <span className={`action-badge ${r.action.toLowerCase()}`}>{r.action.replace('_', ' ')}</span>
        <span className="urgency-dots" title={`Urgency ${r.urgency}/5`}>
          {[1,2,3,4,5].map(i => <span key={i} className={`d ${i <= r.urgency ? 'on' : ''}`}/>)}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
          urgency {r.urgency}/5
        </span>
      </div>
      <div className="ai-reason" dangerouslySetInnerHTML={{ __html: r.reasoning }}/>
      {r.warnings && r.warnings.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {r.warnings.map((w, i) => (
            <div key={i} className="ai-warning">
              <Icon name="warn" size={13}/>
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
      <div className="ai-footer">
        <span>Generated {r.generatedAgo}</span>
        <span className="sep">·</span>
        <span>{r.model}</span>
        <span className="sep">·</span>
        <span>{r.tokens} tokens</span>
        <button className="refresh" onClick={generate}>
          <Icon name="refresh" size={10}/> Refresh
        </button>
      </div>
    </div>
  );
}

function SKUDrawer({ sku, scenario, onClose }) {
  const open = !!sku;
  const [expandedFlag, setExpandedFlag] = React.useState(null);

  // Lock scroll while open
  React.useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  React.useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && open) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Hold the most recent sku so close animation keeps its content
  const [shown, setShown] = React.useState(sku);
  React.useEffect(() => {
    if (sku) setShown(sku);
  }, [sku]);

  const r = shown;

  // Compute scenario-adjusted values
  const factor = 1 + scenario.growth / 100;
  const adjVel = (r ? r.v14d : 0) * factor;
  const adjDays = r && adjVel > 0 ? r.stock / adjVel : 0;
  const totalLead = r ? r.productionLead + r.shippingDays + scenario.leadBuffer : 0;

  return (
    <>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={onClose}/>
      <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
        {r && (
          <>
            <div className="drawer-head">
              <div className="top-row">
                <div>
                  <div className="code">{r.code}</div>
                  <div className="title">{r.name}</div>
                  <div className="meta">
                    {r.category}
                    <span className="sep">·</span>
                    {r.supplier}
                    <span className="sep">·</span>
                    MOQ {r.moq.toLocaleString()}
                    <span className="sep">·</span>
                    ${r.costPerUnit.toFixed(2)}/unit
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <StatusBadge status={r.status} large/>
                  </div>
                </div>
                <button className="drawer-close" onClick={onClose} aria-label="Close drawer">
                  <Icon name="close" size={15}/>
                </button>
              </div>
            </div>

            <div className="drawer-body">
              <div className="drawer-section">
                <div className="drawer-section-title">
                  <span>Sales trend · 30 days</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>units / day</span>
                </div>
                <SalesChart data={r.sales30d} flags={r.flags}/>
              </div>

              <div className="drawer-section">
                <div className="drawer-section-title">
                  <span>Operational metrics</span>
                  {scenario.growth !== 0 && (
                    <span style={{ color: scenario.growth > 0 ? 'var(--critical-fg)' : 'var(--healthy-fg)', fontFamily: 'var(--font-mono)' }}>
                      adjusted @ {scenario.growth > 0 ? '+' : ''}{scenario.growth}%
                    </span>
                  )}
                </div>
                <div className="metric-grid">
                  <MetricCell
                    label="Current stock"
                    value={r.stock.toLocaleString()}
                    caption="units on hand"
                    formula={`stock = ${r.stock.toLocaleString()} units`}
                  />
                  <MetricCell
                    label="MOQ"
                    value={r.moq.toLocaleString()}
                    caption={r.moqBound ? 'PO bound to MOQ' : 'PO above MOQ'}
                  />
                  <MetricCell
                    label="V (7d / 14d)"
                    value={`${r.v7d.toFixed(1)} / ${r.v14d.toFixed(1)}`}
                    caption="units / day"
                    formula="velocity = mean(daily sales)"
                  />
                  <MetricCell
                    label="Effective velocity"
                    value={adjVel.toFixed(1)}
                    caption={scenario.growth !== 0 ? `14d × (1 + growth) = ${adjVel.toFixed(1)}` : "= 14d velocity"}
                    formula={`${r.v14d.toFixed(1)} × ${factor.toFixed(2)} = ${adjVel.toFixed(2)}`}
                  />
                  <MetricCell
                    label="Days of stock"
                    value={r.status === 'STOCKOUT' ? '0' : adjDays > 999 ? '∞' : adjDays.toFixed(1)}
                    caption={r.status === 'STOCKOUT' ? 'STOCKED OUT' : 'days remaining'}
                    formula={`${r.stock} / ${adjVel.toFixed(2)} = ${adjDays.toFixed(2)}`}
                    highlight={r.status === 'CRITICAL' || r.status === 'STOCKOUT'}
                  />
                  <MetricCell
                    label="Total lead"
                    value={`${totalLead}d`}
                    caption={`${r.productionLead}p + ${r.shippingDays}s + ${scenario.leadBuffer}b`}
                    formula={`${r.productionLead} + ${r.shippingDays} + ${scenario.leadBuffer} = ${totalLead}d`}
                  />
                  <MetricCell
                    label="Reorder by"
                    value={r.reorderBy ? new Date(r.reorderBy).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : '—'}
                    caption={r.overdueDays != null ? `overdue ${r.overdueDays}d` : 'on schedule'}
                    highlight={r.overdueDays != null}
                  />
                  <MetricCell
                    label="Recommended PO"
                    value={r.poQty.toLocaleString()}
                    caption={r.moqBound ? 'MOQ bound' : 'above MOQ'}
                  />
                  <MetricCell
                    label="PO cost"
                    value={`$${r.poCost.toLocaleString()}`}
                    caption={`${r.poQty} × $${r.costPerUnit.toFixed(2)}`}
                  />
                </div>
              </div>

              {r.flags.length > 0 && (
                <div className="drawer-section">
                  <div className="drawer-section-title">
                    <span>Confidence flags</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{r.flags.length} flag{r.flags.length===1?'':'s'}</span>
                  </div>
                  <div className="flag-strip">
                    {r.flags.map(f => (
                      <FlagChip key={f} flag={f}
                        expanded={expandedFlag === f}
                        onClick={() => setExpandedFlag(e => e === f ? null : f)}
                      />
                    ))}
                  </div>
                  {expandedFlag && (
                    <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border-subtle)', borderRadius: 4, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{window.FLAG_DEFS[expandedFlag].label}.</strong> {window.FLAG_DEFS[expandedFlag].explain}
                    </div>
                  )}
                </div>
              )}

              <div className="drawer-section">
                <div className="drawer-section-title">
                  <span>AI recommendation</span>
                </div>
                <AIBlock sku={r} scenario={scenario}/>
              </div>
            </div>

            <div className="drawer-footer">
              <button className="btn btn-primary">
                <Icon name="plus" size={12} strokeWidth={2.4}/> Generate PO · ${r.poCost.toLocaleString()}
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 12 }}>
                <Icon name="history" size={12}/> AI history
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

window.SKUDrawer = SKUDrawer;
