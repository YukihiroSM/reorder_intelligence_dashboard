// Atoms: small reusable building blocks.
// Exposed on `window` at end of file.

/* ===== Icon ===== */
function Icon({ name, size = 14, strokeWidth = 2, ...rest }) {
  const paths = {
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    arrow: <path d="M5 12h14M13 5l7 7-7 7"/>,
    arrowright: <path d="M5 12h14M13 5l7 7-7 7"/>,
    arrowdown: <path d="M12 5v14M5 12l7 7 7-7"/>,
    close: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    check: <path d="M20 6 9 17l-5-5"/>,
    chevron: <path d="m6 9 6 6 6-6"/>,
    refresh: <><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></>,
    warn: <><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></>,
    info: <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></>,
    sparkles: <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    history: <><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></>,
    pulse: <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>,
  };
  const d = paths[name] || null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>{d}</svg>
  );
}

/* ===== Status badge ===== */
function StatusBadge({ status, large }) {
  const cls = status.toLowerCase();
  return (
    <span className={`status-badge ${cls}${large ? ' large' : ''}`}>
      <span className="dot"/>
      {status}
    </span>
  );
}

/* ===== Sparkline =====
   30 daily bars + 7d moving average line.
   Bars are colored by overall trend direction:
     green = growing, red = falling, blue = stable.
   Trailing zeros (stockout) override to red; leading zeros (launch) lighter.
*/
function trendOf(data) {
  // Compare last 10 non-zero days vs prior 10 non-zero days
  const nonZero = data.map((v, i) => ({ v, i })).filter(x => x.v > 0);
  if (nonZero.length < 8) return { dir: 'stable', delta: 0 };
  const half = Math.floor(nonZero.length / 2);
  const earlier = nonZero.slice(0, half).reduce((s, x) => s + x.v, 0) / half;
  const later = nonZero.slice(-half).reduce((s, x) => s + x.v, 0) / half;
  if (earlier === 0) return { dir: 'stable', delta: 0 };
  const delta = (later - earlier) / earlier;
  if (delta > 0.06) return { dir: 'up', delta };
  if (delta < -0.06) return { dir: 'down', delta };
  return { dir: 'stable', delta };
}

const TREND_COLORS = {
  up: { bar: '#16A34A', line: '#166534', tint: '#DCFCE7' },
  down: { bar: '#DC2626', line: '#991B1B', tint: '#FEE2E2' },
  stable: { bar: '#0369A1', line: '#0C4A6E', tint: '#DBEAFE' },
};

function Sparkline({ data, flags = [], width = 110, height = 26, showIndicator = true }) {
  const max = Math.max(1, ...data);
  const n = data.length;
  const gap = 1;
  const indW = showIndicator ? 16 : 0;
  const chartW = width - indW;
  const barW = Math.max(1, (chartW - (n - 1) * gap) / n);

  // detect trailing zeros (stockout) and leading zeros (launch)
  let trailingFrom = n;
  for (let i = n - 1; i >= 0; i--) {
    if (data[i] === 0) trailingFrom = i; else break;
  }
  let leadingTo = 0;
  for (let i = 0; i < n; i++) {
    if (data[i] === 0) leadingTo = i + 1; else break;
  }

  // 7-day moving average
  const ma = data.map((_, i) => {
    const s = Math.max(0, i - 6);
    const slice = data.slice(s, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });

  const stockoutHighlight = flags.includes("RECENT_STOCKOUT");
  const launchHighlight = flags.includes("LEADING_ZEROS");

  const trend = trendOf(data);
  const colors = TREND_COLORS[trend.dir];

  return (
    <svg className="sparkline-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label={`trend ${trend.dir}`}>
      {data.map((v, i) => {
        const h = max === 0 ? 0 : (v / max) * (height - 2);
        const x = i * (barW + gap);
        const y = height - h;
        let fill = colors.bar;
        let opacity = 0.75;
        if (v === 0 && i >= trailingFrom && stockoutHighlight) { fill = '#DC2626'; opacity = 0.55; }
        else if (v === 0 && i < leadingTo && launchHighlight) { fill = '#D6D3D1'; opacity = 0.6; }
        else if (v === 0) { fill = '#D6D3D1'; opacity = 0.5; }
        return <rect key={i} x={x} y={y} width={barW} height={Math.max(1, h)} fill={fill} opacity={opacity} rx={0.5}/>;
      })}
      {/* MA7 line */}
      {(() => {
        const pts = ma.map((v, i) => {
          const x = i * (barW + gap) + barW / 2;
          const h = max === 0 ? 0 : (v / max) * (height - 2);
          const y = height - h;
          return `${x},${y}`;
        }).join(' ');
        return <polyline points={pts} fill="none" stroke={colors.line} strokeWidth={1} opacity={0.9}/>;
      })()}
      {/* Trend indicator */}
      {showIndicator && (
        <g transform={`translate(${chartW + 2}, 0)`}>
          <rect x={0} y={(height-14)/2} width={14} height={14} rx={3} fill={colors.tint}/>
          {trend.dir === 'up' && (
            <path d={`M3 ${height/2 + 3} L7 ${height/2 - 3} L11 ${height/2 + 3}`} fill="none" stroke={colors.line} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
          )}
          {trend.dir === 'down' && (
            <path d={`M3 ${height/2 - 3} L7 ${height/2 + 3} L11 ${height/2 - 3}`} fill="none" stroke={colors.line} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
          )}
          {trend.dir === 'stable' && (
            <line x1={3} x2={11} y1={height/2} y2={height/2} stroke={colors.line} strokeWidth={1.5} strokeLinecap="round"/>
          )}
        </g>
      )}
    </svg>
  );
}

Sparkline.trendOf = trendOf;

/* ===== Dropdown ===== */
function Dropdown({ label, value, options, onChange, multi = false }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const hasValue = multi ? (value && value.length > 0) : !!value;
  const triggerLabel = !hasValue
    ? label
    : multi
      ? `${label} · ${value.length}`
      : `${label}: ${value}`;
  return (
    <div className="dropdown" ref={ref}>
      <button className={`trigger ${hasValue ? 'has-value' : ''}`} onClick={() => setOpen(o => !o)}>
        {triggerLabel}
        <Icon name="chevron" size={12}/>
      </button>
      {open && (
        <div className="menu" role="listbox">
          {hasValue && (
            <button onClick={() => { onChange(multi ? [] : null); setOpen(false); }}>
              <span className="check"/>Clear
            </button>
          )}
          {options.map(opt => {
            const isSel = multi ? value.includes(opt) : value === opt;
            return (
              <button key={opt} className={isSel ? 'selected' : ''} onClick={() => {
                if (multi) {
                  const next = isSel ? value.filter(v => v !== opt) : [...value, opt];
                  onChange(next);
                } else {
                  onChange(isSel ? null : opt);
                  setOpen(false);
                }
              }}>
                <span className="check">{isSel && <Icon name="check" size={12}/>}</span>
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ===== Confidence flag chip ===== */
function FlagChip({ flag, onClick, expanded }) {
  const def = window.FLAG_DEFS[flag];
  if (!def) return null;
  return (
    <button
      className={`flag-chip ${def.kind}`}
      onClick={onClick}
      title={def.explain}
    >
      <span className="ico"><Icon name={def.kind === 'warn' ? 'warn' : 'info'} size={11}/></span>
      {def.label}
    </button>
  );
}

/* Mini flag pill (table cell) */
function FlagPill({ flag }) {
  const def = window.FLAG_DEFS[flag];
  if (!def) return null;
  return (
    <span className="tt">
      <span className="flag-pill" data-kind={def.kind}>{def.icon}</span>
      <span className="tt-bubble">{def.label}</span>
    </span>
  );
}

Object.assign(window, { Icon, StatusBadge, Sparkline, Dropdown, FlagChip, FlagPill });
