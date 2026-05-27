// Section 2: Portfolio Health — Donut, Stacked Bar, Runway Bars
const { CATEGORY_COLORS } = window;

const STATUS_META = {
  HEALTHY: { label: "Healthy", color: "#16A34A" },
  LOW: { label: "Low", color: "#CA8A04" },
  CRITICAL: { label: "Critical", color: "#D97706" },
  STOCKOUT: { label: "Stockout", color: "#DC2626" }
};

/* ===== Donut ===== */
function StatusDonut({ rows }) {
  const order = ["HEALTHY", "LOW", "CRITICAL", "STOCKOUT"];
  const counts = order.map((k) => ({ k, count: rows.filter((r) => r.status === k).length }));
  const total = rows.length;
  const [hover, setHover] = React.useState(null);

  const cx = 80,cy = 80,R = 70,r = 50;
  let acc = -Math.PI / 2;

  function arcPath(start, end) {
    if (end - start >= Math.PI * 2 - 0.0001) {
      // full circle as donut: draw two arcs
      return [
      `M ${cx + R} ${cy}`,
      `A ${R} ${R} 0 1 1 ${cx - R} ${cy}`,
      `A ${R} ${R} 0 1 1 ${cx + R} ${cy}`,
      `L ${cx + r} ${cy}`,
      `A ${r} ${r} 0 1 0 ${cx - r} ${cy}`,
      `A ${r} ${r} 0 1 0 ${cx + r} ${cy}`,
      'Z'].
      join(' ');
    }
    const x1 = cx + R * Math.cos(start),y1 = cy + R * Math.sin(start);
    const x2 = cx + R * Math.cos(end),y2 = cy + R * Math.sin(end);
    const xi2 = cx + r * Math.cos(end),yi2 = cy + r * Math.sin(end);
    const xi1 = cx + r * Math.cos(start),yi1 = cy + r * Math.sin(start);
    const large = end - start > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${r} ${r} 0 ${large} 0 ${xi1} ${yi1} Z`;
  }

  return (
    <div className="card hero donut-card">
      <svg width={160} height={160} viewBox="0 0 160 160">
        {counts.map(({ k, count }) => {
          if (count === 0) return null;
          const span = count / total * Math.PI * 2;
          const start = acc,end = acc + span - 0.012;
          acc = acc + span;
          const op = hover ? hover === k ? 1 : 0.25 : 1;
          return (
            <path
              key={k}
              d={arcPath(start, end)}
              fill={STATUS_META[k].color}
              opacity={op}
              style={{ transition: 'opacity .15s ease', cursor: 'pointer' }}
              onMouseEnter={() => setHover(k)}
              onMouseLeave={() => setHover(null)} />);


        })}
        <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', fontFamily: 'var(--font-sans)', fill: 'var(--text-primary)' }}>
          {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>SKUS TOTAL</text>
      </svg>

      <div className="donut-legend">
        <div className="card-tag" style={{ marginBottom: 2 }}>Status mix</div>
        {counts.map(({ k, count }) =>
        <div
          key={k}
          className="item"
          onMouseEnter={() => setHover(k)}
          onMouseLeave={() => setHover(null)}
          style={{ opacity: hover && hover !== k ? 0.5 : 1, transition: 'opacity .12s ease' }}>
          
            <span className="dot" style={{ background: STATUS_META[k].color, ...(k === 'STOCKOUT' ? { animation: 'pulseDot 1.6s ease-in-out infinite' } : {}) }} />
            <span className="num">{count}</span>
            <span className="lbl">{STATUS_META[k].label}</span>
          </div>
        )}
      </div>
    </div>);

}

/* ===== Stacked bar — cash horizon by week ===== */
function CashHorizon({ rows, scenario }) {
  // Build 12 weeks ahead. A SKU contributes its poCost to the week containing its reorder date.
  // For a clean visual we synthesize stacks across weeks from the enriched data.
  const factor = 1 + scenario.growth / 100;
  const today = window.TODAY;
  const WEEKS = 12;

  // For each SKU, calculate which week the reorder would fall into within 90 days
  // weekIndex = max(0, ceil(daysUntilReorder/7))
  const weeks = Array.from({ length: WEEKS }, (_, i) => ({
    label: `W${i + 1}`,
    Supplements: 0, Vitamins: 0, "Sports Nutrition": 0, Beauty: 0, Bundles: 0,
    total: 0, items: []
  }));

  rows.forEach((r) => {
    const adjVel = Math.max(0.01, r.v14d * factor);
    const adjDays = r.stock / adjVel;
    const totalLead = r.productionLead + r.shippingDays + scenario.leadBuffer;
    const reorderInDays = Math.max(0, adjDays - totalLead);
    const w = Math.min(WEEKS - 1, Math.floor(reorderInDays / 7));
    if (reorderInDays > WEEKS * 7) return;
    weeks[w][r.category] = (weeks[w][r.category] || 0) + r.poCost;
    weeks[w].total += r.poCost;
    weeks[w].items.push({ code: r.code, cost: r.poCost, cat: r.category });
  });

  const maxTotal = Math.max(1, ...weeks.map((w) => w.total));
  // Y axis layout
  const W = 520,H = 200,padL = 36,padR = 12,padT = 16,padB = 28;
  const innerW = W - padL - padR,innerH = H - padT - padB;
  const barGap = 4;
  const barW = (innerW - barGap * (WEEKS - 1)) / WEEKS;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.ceil(maxTotal * t / 1000) * 1000);

  const [hoverWeek, setHoverWeek] = React.useState(null);

  // KPI totals (30/60/90)
  const k30 = weeks.slice(0, 4).reduce((s, w) => s + w.total, 0);
  const k60 = weeks.slice(0, 8).reduce((s, w) => s + w.total, 0);
  const k90 = weeks.reduce((s, w) => s + w.total, 0);

  const fmt = (v) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;

  return (
    <div className="card hero" style={{ overflow: 'visible', position: 'relative' }}>
      <div className="card-tag" style={{ marginBottom: 12 }}>Cash horizon · by week</div>
      <div className="kpi-strip">
        <div className="item"><div className="l">30d</div><div className="v">{fmt(k30)}</div></div>
        <div className="item"><div className="l">60d</div><div className="v">{fmt(k60)}</div></div>
        <div className="item"><div className="l">90d</div><div className="v">{fmt(k90)}</div></div>
        <div className="item" style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
          <div className="l">Forecast</div>
          <div className="v" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{scenario.forecastDays}d window</div>
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* Gridlines */}
        {yTicks.map((t, i) => {
          const y = padT + innerH - t / yTicks[yTicks.length - 1] * innerH;
          return (
            <g key={i}>
              <line className="grid-line" x1={padL} x2={W - padR} y1={y} y2={y} />
              <text className="axis-tick" x={padL - 6} y={y + 3} textAnchor="end">{fmt(t)}</text>
            </g>);

        })}
        {/* Bars */}
        {weeks.map((w, i) => {
          const cats = ["Supplements", "Vitamins", "Sports Nutrition", "Beauty", "Bundles"];
          let yCursor = padT + innerH;
          const x = padL + i * (barW + barGap);
          return (
            <g key={i}
            onMouseEnter={() => setHoverWeek(i)}
            onMouseLeave={() => setHoverWeek(null)}>
              
              {cats.map((cat) => {
                const v = w[cat] || 0;
                if (v === 0) return null;
                const h = v / yTicks[yTicks.length - 1] * innerH;
                yCursor -= h;
                return <rect key={cat} x={x} y={yCursor} width={barW} height={h} fill={CATEGORY_COLORS[cat]} opacity={hoverWeek === null || hoverWeek === i ? 1 : 0.35} style={{ transition: 'opacity .12s ease' }} />;
              })}
              {/* hit area */}
              <rect x={x} y={padT} width={barW} height={innerH} fill="transparent" />
              <text className="axis-tick" x={x + barW / 2} y={H - padB + 16} textAnchor="middle">{w.label}</text>
            </g>);

        })}
      </svg>

      {/* Tooltip */}
      {hoverWeek !== null && weeks[hoverWeek].total > 0 &&
      <div style={{
        position: 'absolute', top: 50, right: 12,
        background: 'var(--text-primary)', color: 'white',
        padding: '8px 10px', borderRadius: 4,
        fontSize: 11, fontFamily: 'var(--font-mono)',
        minWidth: 140, lineHeight: 1.5
      }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{weeks[hoverWeek].label} · {fmt(weeks[hoverWeek].total)}</div>
          {["Supplements", "Vitamins", "Sports Nutrition", "Beauty", "Bundles"].
        filter((c) => weeks[hoverWeek][c]).
        map((c) =>
        <div key={c} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <span style={{ opacity: 0.85 }}><span style={{ display: 'inline-block', width: 7, height: 7, background: CATEGORY_COLORS[c], borderRadius: 1, marginRight: 6 }} />{c}</span>
                <span>{fmt(weeks[hoverWeek][c])}</span>
              </div>
        )}
        </div>
      }

      {/* Legend */}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 8 }}>
          By category · 90d total
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {(() => {
            const totals = Object.fromEntries(Object.keys(CATEGORY_COLORS).map(c => [c, 0]));
            weeks.forEach(w => Object.keys(CATEGORY_COLORS).forEach(c => { totals[c] += w[c] || 0; }));
            const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
            const max90 = Math.max(1, ...Object.values(totals));
            return sorted.map(([cat, total]) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                <span style={{ width: 8, height: 8, background: CATEGORY_COLORS[cat], borderRadius: 1, flexShrink: 0 }}/>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: total > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: total > 0 ? 500 : 400 }}>
                  {total > 0 ? fmt(total) : '—'}
                </span>
              </div>
            ));
          })()}
        </div>
      </div>
    </div>);

}

/* ===== Runway by category ===== */
function RunwayBars({ rows, scenario }) {
  const factor = 1 + scenario.growth / 100;
  const byCat = {};
  rows.forEach((r) => {
    if (!byCat[r.category]) byCat[r.category] = { totalStock: 0, totalVel: 0, hasStockout: false };
    byCat[r.category].totalStock += r.stock;
    byCat[r.category].totalVel += Math.max(0.01, r.v14d * factor);
    if (r.status === 'STOCKOUT') byCat[r.category].hasStockout = true;
  });
  const entries = Object.entries(byCat).map(([cat, v]) => ({
    cat,
    avgDays: v.hasStockout && v.totalStock === 0 ? 0 : v.totalStock / v.totalVel,
    hasStockout: v.hasStockout
  })).sort((a, b) => a.avgDays - b.avgDays);

  const max = 180; // cap visually

  function healthColor(d, stockout) {
    if (stockout && d < 5) return 'var(--stockout-accent)';
    if (d < 30) return 'var(--critical-accent)';
    if (d < 60) return 'var(--low-accent)';
    return 'var(--healthy-accent)';
  }

  return (
    <div className="card hero">
      <div className="card-tag" style={{ marginBottom: 14 }}>Coverage runway · by category</div>
      <div className="runway-list">
        {entries.map(({ cat, avgDays, hasStockout }) => {
          const isOut = hasStockout && avgDays < 5;
          const w = Math.min(100, avgDays / max * 100);
          return (
            <div key={cat} className={`runway-row ${isOut ? 'stockout' : ''}`}>
              <span className="cat">{cat}</span>
              <span className="bar">
                <span className="fill" style={{ width: `${Math.max(w, isOut ? 4 : 2)}%`, background: isOut ?
                  'repeating-linear-gradient(45deg, #FEE2E2 0 6px, #FCA5A5 6px 12px)' :
                  healthColor(avgDays, hasStockout) }} />
              </span>
              <span className="val">{isOut ? 'STOCKOUT' : `${Math.round(avgDays)}d`}</span>
            </div>);

        })}
      </div>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-tertiary)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 8, background: 'var(--critical-accent)', borderRadius: 1 }} />&lt; 30d
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 8, background: 'var(--low-accent)', borderRadius: 1 }} />30–60d
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 8, background: 'var(--healthy-accent)', borderRadius: 1 }} />&gt; 60d
        </span>
      </div>
    </div>);

}

function PortfolioHealthSection({ rows, scenario }) {
  return (
    <section className="section" id="portfolio-health">
      <div className="shell">
        <div className="section-head">
          <h2 className="section-title">Portfolio health</h2>
          <span className="section-meta">{rows.length} SKUs · 5 categories · 8 suppliers</span>
        </div>
        <div className="grid-3" style={{ gridTemplateColumns: '1fr 1.4fr 1fr', gap: 12 }}>
          <StatusDonut rows={rows} />
          <div id="cash-horizon-anchor"><CashHorizon rows={rows} scenario={scenario} /></div>
          <RunwayBars rows={rows} scenario={scenario} />
        </div>
      </div>
    </section>);

}

window.PortfolioHealthSection = PortfolioHealthSection;