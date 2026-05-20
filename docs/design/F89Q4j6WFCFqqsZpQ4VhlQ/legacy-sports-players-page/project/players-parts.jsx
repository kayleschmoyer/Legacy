// players-parts.jsx — atomic components for the player browser
// Sport-aware: PosChip, stat helpers, FilterRail, StatsTable, Featured all
// switch their shape based on which sport (baseball vs football) is active.

const initials = (name) =>
  name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

// Large-number formatter for football yardage (16,728 reads better than 16728)
const fmt = (n) => {
  if (n == null) return '—';
  if (typeof n === 'string') return n;
  if (typeof n !== 'number') return String(n);
  if (n >= 1000) return n.toLocaleString();
  return String(n);
};

// ── Sport-agnostic position chip ───────────────────────────
const POS_CLASS = {
  // baseball
  P: 'p',
  C: 'c',
  IF: 'if',
  OF: 'of',
  DH: 'dh',
  UT: 'ut',
  '1B': 'if',
  '2B': 'if',
  SS: 'if',
  '3B': 'if',
  LF: 'of',
  CF: 'of',
  RF: 'of',
  // football
  QB: 'qb',
  RB: 'rb',
  WR: 'wr',
  TE: 'te',
  DEF: 'def',
  K: 'k',
};
const PosChip = ({ pos }) => {
  const cls = POS_CLASS[pos] || 'ut';
  return <span className={`pp-pchip ${cls}`}>{pos}</span>;
};

// Availability chip — identical between sports
const AvailChip = ({ status }) => {
  if (status === 'free')
    return <span className="pp-availability free">Free Agent</span>;
  if (status === 'wait')
    return <span className="pp-availability wait">Waivers</span>;
  return <span className="pp-availability rost">Rostered</span>;
};

// ── Stat selectors keyed by posGroup ───────────────────────
// gold flag = which cell gets the gold highlight (the marquee stat)
function statTripletFor(p) {
  switch (p.posGroup) {
    // baseball
    case 'pitcher':
      return [
        ['ERA', p.era_, true],
        ['W', p.w],
        ['K', p.k],
      ];
    // football
    case 'quarterback':
      return [
        ['TD', p.td, true],
        ['YDS', fmt(p.yds)],
        ['RTG', p.rtg],
      ];
    case 'runningback':
      return [
        ['YDS', fmt(p.ryds), true],
        ['TD', p.rtd],
        ['YPC', p.ypc],
      ];
    case 'receiver':
    case 'tightend':
      return [
        ['REC', p.rec],
        ['YDS', fmt(p.recyds), true],
        ['TD', p.rectd],
      ];
    case 'defense':
      return [
        ['TKL', p.tkl],
        ['SCK', p.sck, true],
        ['INT', p.dint],
      ];
    case 'kicker':
      return [
        ['FG', p.fg],
        ['FG%', p.fgpct, true],
        ['XP', p.xp],
      ];
    // baseball batters
    default:
      return [
        ['AVG', p.avg, true],
        ['HR', p.hr],
        ['RBI', p.rbi],
      ];
  }
}

function statQuadFor(p) {
  switch (p.posGroup) {
    case 'pitcher':
      return [
        ['ERA', p.era_, true],
        ['W', p.w],
        ['K', p.k],
        ['WHIP', p.whip],
      ];
    case 'quarterback':
      return [
        ['YDS', fmt(p.yds), true],
        ['TD', p.td],
        ['INT', p.int],
        ['RTG', p.rtg],
      ];
    case 'runningback':
      return [
        ['YDS', fmt(p.ryds), true],
        ['TD', p.rtd],
        ['YPC', p.ypc],
        ['AV', p.av],
      ];
    case 'receiver':
    case 'tightend':
      return [
        ['REC', p.rec, true],
        ['YDS', fmt(p.recyds)],
        ['TD', p.rectd],
        ['AV', p.av],
      ];
    case 'defense':
      return [
        ['TKL', p.tkl, true],
        ['SCK', p.sck],
        ['INT', p.dint],
        ['AV', p.av],
      ];
    case 'kicker':
      return [
        ['FG', p.fg, true],
        ['FG%', p.fgpct],
        ['XP', p.xp],
        ['AV', p.av],
      ];
    default:
      return [
        ['AVG', p.avg, true],
        ['HR', p.hr],
        ['RBI', p.rbi],
        ['OPS', p.ops],
      ];
  }
}

function statFeaturedFor(p) {
  switch (p.posGroup) {
    case 'pitcher':
      return [
        ['ERA', p.era_, true],
        ['W', p.w],
        ['K', p.k],
        ['WAR', p.war],
      ];
    case 'quarterback':
      return [
        ['TD', p.td, true],
        ['YDS', fmt(p.yds)],
        ['RTG', p.rtg],
        ['AV', p.av],
      ];
    case 'runningback':
      return [
        ['YDS', fmt(p.ryds), true],
        ['TD', p.rtd],
        ['YPC', p.ypc],
        ['AV', p.av],
      ];
    case 'receiver':
    case 'tightend':
      return [
        ['REC', p.rec, true],
        ['YDS', fmt(p.recyds)],
        ['TD', p.rectd],
        ['AV', p.av],
      ];
    case 'defense':
      return [
        ['TKL', p.tkl, true],
        ['SCK', p.sck],
        ['INT', p.dint],
        ['AV', p.av],
      ];
    case 'kicker':
      return [
        ['FG', p.fg, true],
        ['FG%', p.fgpct],
        ['XP', p.xp],
        ['AV', p.av],
      ];
    default:
      return [
        ['AVG', p.avg, true],
        ['HR', p.hr],
        ['RBI', p.rbi],
        ['WAR', p.war],
      ];
  }
}

// Stats triplet (card view)
const StatTriplet = ({ p, gold }) => {
  const cells = statTripletFor(p);
  return (
    <div className="pp-card-stats">
      {cells.map(([label, v, hi], i) => (
        <div key={i} className="pp-stat-cell">
          <div className="pp-stat-label">{label}</div>
          <div className={'pp-stat-val' + (hi && gold ? ' gold' : '')}>
            {v ?? '—'}
          </div>
        </div>
      ))}
    </div>
  );
};

// MOTION: card hover lifts -2px, 200ms ease-out — feels like flipping a baseball card
const PlayerCard = ({ p }) => (
  <div className={`pp-card pos-${p.posGroup}`} role="button" tabIndex={0}>
    <div className="pp-card-head">
      <div className={`pp-card-mug ${p.mug}`}>{initials(p.name)}</div>
      <div className="pp-card-id">
        <div className="pp-card-name">
          {p.name}
          {p.hof && (
            <span
              className="pp-card-hof pp-card-hof-inline"
              title="Hall of Fame"
            >
              HOF
            </span>
          )}
        </div>
        <div className="pp-card-sub">{p.years}</div>
      </div>
      <PosChip pos={p.pos} />
    </div>
    <StatTriplet p={p} gold={true} />
    <div className="pp-card-foot">
      <div className="pp-card-team">
        {p.team}
        <span className="pp-dot">·</span>
        {p.teamName}
      </div>
      <AvailChip status={p.status} />
    </div>
    {p.note && (
      <div className="pp-card-banner">
        <strong>·</strong> {p.note}
      </div>
    )}
  </div>
);

const PlayerListRow = ({ p, idx }) => {
  const cells = statQuadFor(p);
  return (
    <div className={`pp-list-row pos-${p.posGroup}`} role="button" tabIndex={0}>
      <div className="pp-list-rank">{String(idx + 1).padStart(2, '0')}</div>
      <div className={`pp-list-mug ${p.mug}`}>{initials(p.name)}</div>
      <div className="pp-list-id">
        <div className="pp-list-name">
          {p.name}
          <PosChip pos={p.pos} />
          {p.hof && (
            <span
              className="pp-card-hof"
              style={{ position: 'static', width: 18, height: 18, fontSize: 8 }}
            >
              HOF
            </span>
          )}
        </div>
        <div className="pp-list-meta">
          {p.team} · {p.teamName} · {p.years}
        </div>
      </div>
      {cells.map(([label, v, hi], i) => (
        <div key={i} className={'pp-list-stat' + (i >= 2 ? ' hide-sm' : '')}>
          <div className="pp-list-stat-label">{label}</div>
          <div className={'pp-list-stat-val' + (hi ? ' gold' : '')}>
            {v ?? '—'}
          </div>
        </div>
      ))}
    </div>
  );
};

// Featured player banner — pulls editorial weight up top
const Featured = ({ p, sport }) => {
  const cells = statFeaturedFor(p);
  const eyebrowLabel =
    sport === 'football'
      ? 'Player Spotlight · Sunday Marquee'
      : 'Player Spotlight · This Week';
  return (
    <div className="pp-featured">
      <div className={`pp-featured-mug ${p.mug}`}>{initials(p.name)}</div>
      <div className="pp-featured-body">
        <div className="pp-featured-eyebrow">
          <img src="ds/brand/award.svg" width="14" height="14" alt="" />
          {eyebrowLabel}
        </div>
        <div className="pp-featured-name">{p.name}</div>
        <div className="pp-featured-meta">
          <PosChip pos={p.pos} /> &nbsp; {p.team} · {p.teamName}{' '}
          <em>· {p.years}</em>
          <div
            style={{
              marginTop: 8,
              fontStyle: 'italic',
              color: 'var(--fg3)',
              maxWidth: '46ch',
            }}
          >
            {p.note}
          </div>
        </div>
      </div>
      <div className="pp-featured-stats">
        {cells.map(([l, v, hi], i) => (
          <div key={i}>
            <div className="pp-fstat-label">{l}</div>
            <div className={'pp-fstat-value' + (hi ? ' gold' : '')}>
              {v ?? '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Filter rail — uses sport-specific eras + positions
const FilterRail = ({
  sportCfg,
  era,
  setEra,
  pos,
  setPos,
  avail,
  setAvail,
}) => (
  <div className="pp-rail">
    <div className="pp-rail-group">
      <span className="pp-rail-label">Era</span>
      {sportCfg.eras.map((e) => (
        <button
          key={e.id}
          className={'pp-pill' + (era === e.id ? ' on' : '')}
          onClick={() => setEra(e.id)}
        >
          {e.label}
          {e.range && (
            <span style={{ opacity: 0.55, marginLeft: 6, fontWeight: 400 }}>
              {e.range}
            </span>
          )}
        </button>
      ))}
    </div>
    <div className="pp-rail-divider" />
    <div className="pp-rail-group">
      <span className="pp-rail-label">Position</span>
      {sportCfg.positions.map((o) => (
        <button
          key={o.id}
          className={'pp-pill' + (pos === o.id ? ' on' : '')}
          onClick={() => setPos(o.id)}
        >
          {o.id !== 'all' && (
            <span className="pp-pill-dot" style={{ background: o.dot }} />
          )}
          {o.label}
        </button>
      ))}
    </div>
    <div className="pp-rail-divider" />
    <div className="pp-rail-group">
      <span className="pp-rail-label">Status</span>
      {AVAILABILITY.map((a) => (
        <button
          key={a.id}
          className={'pp-pill' + (avail === a.id ? ' on' : '')}
          onClick={() => setAvail(a.id)}
        >
          {a.label}
        </button>
      ))}
    </div>
  </div>
);

// View toggle
const ViewToggle = ({ view, setView }) => (
  <div className="pp-view" role="tablist">
    {[
      { id: 'cards', label: 'Cards' },
      { id: 'list', label: 'List' },
      { id: 'table', label: 'Stats' },
    ].map((v) => (
      <button
        key={v.id}
        className={view === v.id ? 'on' : ''}
        onClick={() => setView(v.id)}
      >
        {v.label}
      </button>
    ))}
  </div>
);

// Stats table — driven by sportCfg.tableCols
const StatsTable = ({ rows, sportCfg }) => {
  const [sortKey, setSortKey] = React.useState(sportCfg.primarySort);
  React.useEffect(() => {
    setSortKey(sportCfg.primarySort);
  }, [sportCfg.id]);

  const sorted = [...rows].sort((a, b) => {
    if (sortKey === 'name') return a.name.localeCompare(b.name);
    const av =
      typeof a[sortKey] === 'string' ? parseFloat(a[sortKey]) : a[sortKey] || 0;
    const bv =
      typeof b[sortKey] === 'string' ? parseFloat(b[sortKey]) : b[sortKey] || 0;
    return bv - av;
  });

  const cols = sportCfg.tableCols;
  return (
    <div className="pp-table-wrap">
      <table className="pp-table">
        <thead>
          <tr>
            <th className="sticky-l">Player</th>
            {cols.map((c) => (
              <th
                key={c.k}
                className={'sortable ' + (sortKey === c.k ? 'sorted' : '')}
                onClick={() =>
                  c.k !== 'pos' && c.k !== 'years' && setSortKey(c.k)
                }
              >
                {c.label}
                {sortKey === c.k && <span className="pp-arrow">▼</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id} className={`pos-${p.posGroup}`}>
              <td className="player-cell">
                <div className="ppt-row-id">
                  <div className="ppt-name">
                    <span
                      className={`pp-list-mug ${p.mug}`}
                      style={{ width: 28, height: 28, fontSize: 10 }}
                    >
                      {initials(p.name)}
                    </span>
                    {p.name}
                    {p.hof && (
                      <span
                        className="pp-card-hof"
                        style={{
                          position: 'static',
                          width: 16,
                          height: 16,
                          fontSize: 7,
                        }}
                      >
                        HOF
                      </span>
                    )}
                  </div>
                  <div className="ppt-sub">
                    {p.team} · {p.teamName}
                  </div>
                </div>
              </td>
              {cols.map((c) => {
                if (c.k === 'pos')
                  return (
                    <td key={c.k}>
                      <PosChip pos={p.pos} />
                    </td>
                  );
                if (c.k === 'years')
                  return (
                    <td key={c.k} style={{ whiteSpace: 'nowrap' }}>
                      {p.years}
                    </td>
                  );
                const raw = p[c.k];
                const v =
                  raw == null
                    ? '—'
                    : c.fmt === 'k' && typeof raw === 'number'
                      ? raw.toLocaleString()
                      : typeof raw === 'number' && c.k === 'war'
                        ? raw.toFixed(1)
                        : raw;
                return (
                  <td key={c.k} className={sortKey === c.k ? 'lead' : ''}>
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Loading skeleton
const LoadingSkeleton = ({ view, sportCfg }) => {
  const Card = (k) => (
    <div key={k} className="pp-sk-card">
      <div className="pp-sk-row">
        <div
          className="pp-sk"
          style={{ width: 48, height: 48, borderRadius: '50%' }}
        />
        <div
          style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <div className="pp-sk" style={{ height: 18, width: '70%' }} />
          <div className="pp-sk" style={{ height: 12, width: '45%' }} />
        </div>
        <div
          className="pp-sk"
          style={{ width: 30, height: 18, borderRadius: 4 }}
        />
      </div>
      <div
        className="pp-sk"
        style={{ height: 54, borderRadius: 'var(--radius-2)' }}
      />
      <div className="pp-sk-row" style={{ justifyContent: 'space-between' }}>
        <div className="pp-sk" style={{ height: 12, width: '40%' }} />
        <div
          className="pp-sk"
          style={{ height: 18, width: 80, borderRadius: 9999 }}
        />
      </div>
    </div>
  );
  if (view === 'cards') {
    return (
      <div className="pp-grid">
        {Array.from({ length: 8 }).map((_, i) => Card(i))}
      </div>
    );
  }
  if (view === 'list') {
    return (
      <div className="pp-list">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="pp-list-row">
            <div className="pp-sk" style={{ width: 18, height: 12 }} />
            <div
              className="pp-sk"
              style={{ width: 36, height: 36, borderRadius: '50%' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="pp-sk" style={{ height: 16, width: 160 }} />
              <div className="pp-sk" style={{ height: 12, width: 220 }} />
            </div>
            <div className="pp-sk" style={{ width: 50, height: 24 }} />
            <div className="pp-sk" style={{ width: 50, height: 24 }} />
            <div className="pp-sk" style={{ width: 50, height: 24 }} />
            <div className="pp-sk" style={{ width: 50, height: 24 }} />
          </div>
        ))}
      </div>
    );
  }
  // table — use sport's columns
  const cols = sportCfg.tableCols;
  return (
    <div className="pp-table-wrap">
      <table className="pp-table">
        <thead>
          <tr>
            <th className="sticky-l">Player</th>
            {cols.map((c) => (
              <th key={c.k}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 8 }).map((_, r) => (
            <tr key={r}>
              <td className="player-cell">
                <div className="pp-sk" style={{ height: 18, width: 200 }} />
              </td>
              {cols.map((c, ci) => (
                <td key={ci}>
                  <div
                    className="pp-sk"
                    style={{ height: 14, width: 40, marginLeft: 'auto' }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ErrorState = ({ onRetry }) => (
  <div className="pp-state">
    <div className="pp-state-mark err">
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#E63950"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    </div>
    <h3>Unable to load players</h3>
    <p>
      The archive didn’t respond. Check your connection or try again — most stat
      queries take only a moment.
    </p>
    <div className="pp-state-actions">
      <button className="ls-btn ls-btn-primary" onClick={onRetry}>
        Retry
      </button>
      <button className="ls-btn ls-btn-ghost">Report Issue</button>
    </div>
  </div>
);

const EmptyState = ({ onClear, sportCfg }) => (
  <div className="pp-state">
    <div className="pp-state-mark">
      <img
        src={`ds/brand/${sportCfg.emptyIcon}.svg`}
        width="36"
        height="36"
        alt=""
      />
    </div>
    <h3>No players match those filters</h3>
    <p>{sportCfg.emptyMsg}</p>
    <div className="pp-state-actions">
      <button className="ls-btn ls-btn-gold" onClick={onClear}>
        Clear Filters
      </button>
      <button className="ls-btn ls-btn-ghost">Browse All Eras</button>
    </div>
  </div>
);

// ── Sport switcher — real product UI (lives in the nav) ────
// The user can toggle between baseball and football inside the running app.
const SportSwitch = ({ sport, setSport }) => (
  <div className="ls-sportswitch" role="tablist" aria-label="Sport">
    {Object.keys(SPORTS).map((s) => {
      const cfg = SPORTS[s];
      const active = sport === s;
      return (
        <button
          key={s}
          role="tab"
          aria-selected={active}
          className={`ls-sportswitch-btn ${active ? 'on' : ''} sw-${s}`}
          onClick={() => setSport(s)}
          title={cfg.label}
        >
          <img src={`ds/brand/${cfg.icon}.svg`} width="16" height="16" alt="" />
          <span>{cfg.label}</span>
        </button>
      );
    })}
  </div>
);

// ── Viewport switcher — design tool, lives above the nav ───
const ViewportBar = ({ vp, setVp }) => (
  <div className="pp-vpbar" role="tablist" aria-label="Viewport preview">
    <div className="pp-vpbar-inner">
      <div className="pp-vpbar-titleblock">
        <span className="pp-vpbar-eyebrow">Design Tool</span>
        <span className="pp-vpbar-title">Viewport Preview</span>
      </div>
      <div className="pp-vpbar-pills">
        {VIEWPORTS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={vp === v.id}
            className={'pp-vpbar-btn' + (vp === v.id ? ' on' : '')}
            onClick={() => setVp(v.id)}
            title={v.device}
          >
            <span className="pp-vpbar-name">{v.label}</span>
            <span className="pp-vpbar-w">
              {v.width ? `${v.width}px` : 'auto'}
            </span>
          </button>
        ))}
      </div>
    </div>
  </div>
);

Object.assign(window, {
  initials,
  fmt,
  PosChip,
  AvailChip,
  StatTriplet,
  PlayerCard,
  PlayerListRow,
  Featured,
  FilterRail,
  ViewToggle,
  StatsTable,
  LoadingSkeleton,
  ErrorState,
  EmptyState,
  SportSwitch,
  ViewportBar,
});
