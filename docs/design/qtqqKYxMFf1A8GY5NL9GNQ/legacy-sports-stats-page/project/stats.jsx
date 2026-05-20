// stats.jsx — Player Statistics Page
// Design intent: tables are the star. Chrome is restrained so the numbers
// read like a box score printed in a Sunday paper — generous row leading,
// tabular nums, tight column headers in condensed display face.
//
// This page works for both Baseball and Football. Sport toggle is in the
// page header (next to the H1) and persists in the URL preview.
//
// Responsive behaviour is driven by **container queries** on the shell,
// so the breakpoint selector at the top can resize the shell and the
// layout responds without changing the actual viewport.

const {
  HITTERS,
  PITCHERS,
  BASEBALL_TEAMS,
  BASEBALL_POSITIONS,
  HITTER_COLS,
  PITCHER_COLS,
  BASEBALL_LEGEND,
  OFFENSE,
  DEFENSE,
  FOOTBALL_TEAMS,
  FOOTBALL_POSITIONS,
  OFFENSE_COLS,
  DEFENSE_COLS,
  FOOTBALL_LEGEND,
} = window;

/* ──────────────────────────────────────────
   Sport configuration table
   ────────────────────────────────────────── */
const SPORTS = {
  baseball: {
    label: 'Baseball',
    eyebrow: 'Players · MLB Archive',
    lede: 'Every qualified hitter and pitcher across the archive. Draft legends, compare seasons, and build your dynasty on the numbers that actually happened.',
    views: [
      ['combined', 'Combined'],
      ['primary', 'Hitters'],
      ['secondary', 'Pitchers'],
    ],
    primary: {
      label: 'Hitters',
      rows: HITTERS,
      cols: HITTER_COLS,
      subFmt: (n) => `${n} qualified batters`,
    },
    secondary: {
      label: 'Pitchers',
      rows: PITCHERS,
      cols: PITCHER_COLS,
      subFmt: (n) => `${n} qualified pitchers`,
    },
    teams: BASEBALL_TEAMS,
    positions: BASEBALL_POSITIONS,
    legend: BASEBALL_LEGEND,
    defaultSortKey: 'owar',
    qualifier: 'archived seasons',
    filters: 'baseball',
  },
  football: {
    label: 'Football',
    eyebrow: 'Players · NFL Archive',
    lede: 'Every qualified offensive and defensive player across the archive. Draft Hall-of-Famers alongside the modern stars and run the league on real, archived box scores.',
    views: [
      ['combined', 'Combined'],
      ['primary', 'Offense'],
      ['secondary', 'Defense'],
    ],
    primary: {
      label: 'Offense',
      rows: OFFENSE,
      cols: OFFENSE_COLS,
      subFmt: (n) => `${n} qualified offensive players`,
    },
    secondary: {
      label: 'Defense',
      rows: DEFENSE,
      cols: DEFENSE_COLS,
      subFmt: (n) => `${n} qualified defenders`,
    },
    teams: FOOTBALL_TEAMS,
    positions: FOOTBALL_POSITIONS,
    legend: FOOTBALL_LEGEND,
    defaultSortKey: 'fpts',
    qualifier: 'archived seasons',
    filters: 'football',
  },
};

/* ──────────────────────────────────────────
   Viewport breakpoint catalogue
   Width = the constraint applied to the shell.
   The shell uses container queries, so descendant
   layout responds *just like* it would at that
   actual viewport.
   ────────────────────────────────────────── */
const BREAKPOINTS = [
  { id: 'mobile', label: 'Mobile', width: 375, device: 'iPhone' },
  { id: 'tablet', label: 'Tablet', width: 768, device: 'iPad portrait' },
  { id: 'laptop', label: 'Laptop', width: 1024, device: 'iPad landscape' },
  { id: 'desktop', label: 'Desktop', width: 1280, device: '13" MacBook' },
  { id: 'wide', label: 'Wide', width: 1536, device: '27" monitor' },
  { id: 'full', label: 'Full', width: null, device: 'Fill window' },
];

/* ──────────────────────────────────────────
   Top-level page
   ────────────────────────────────────────── */
const StatsPage = () => {
  const [sport, setSport] = React.useState('baseball'); // baseball | football
  const [state, setState] = React.useState('populated'); // loading | error | empty | populated
  const [view, setView] = React.useState('combined'); // combined | primary | secondary
  const [pageSize, setPageSize] = React.useState(25);
  const [search, setSearch] = React.useState('');
  const [team, setTeam] = React.useState('All Teams');
  const [position, setPosition] = React.useState('All Positions');
  const [sort, setSort] = React.useState({ key: 'owar', dir: 'desc' });
  // Baseball filters
  const [minHR, setMinHR] = React.useState(0);
  const [minAVG, setMinAVG] = React.useState(0);
  const [maxERA, setMaxERA] = React.useState(5);
  // Football filters
  const [minPYds, setMinPYds] = React.useState(0);
  const [minRecYds, setMinRecYds] = React.useState(0);
  const [minSack, setMinSack] = React.useState(0);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [detail, setDetail] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const [breakpoint, setBreakpoint] = React.useState('full');

  const cfg = SPORTS[sport];

  // When sport changes, reset cross-sport state so we never carry
  // a baseball position into football.
  const switchSport = (s) => {
    if (s === sport) return;
    setSport(s);
    setView('combined');
    setTeam('All Teams');
    setPosition('All Positions');
    setSearch('');
    setSort({ key: SPORTS[s].defaultSortKey, dir: 'desc' });
  };

  const bp = BREAKPOINTS.find((b) => b.id === breakpoint) || BREAKPOINTS[5];
  const shellStyle = bp.width ? { maxWidth: bp.width } : null;
  const shellClass = `sp-shell sp-shell-bp-${bp.id} ${bp.width ? 'sp-shell-bounded' : 'sp-shell-full'}`;

  // URL surface
  const query = React.useMemo(() => {
    const params = { sport, view, pageSize };
    if (search) params.search = search;
    if (team !== 'All Teams') params.team = team;
    if (position !== 'All Positions') params.position = position;
    if (sport === 'baseball') {
      if (minHR > 0) params.minHomeRuns = minHR;
      if (minAVG > 0) params.minBattingAvg = minAVG.toFixed(3);
      if (maxERA < 5) params.maxERA = maxERA.toFixed(2);
    } else {
      if (minPYds > 0) params.minPassYds = minPYds;
      if (minRecYds > 0) params.minRecYds = minRecYds;
      if (minSack > 0) params.minSacks = minSack.toFixed(1);
    }
    return Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
  }, [
    sport,
    view,
    pageSize,
    search,
    team,
    position,
    minHR,
    minAVG,
    maxERA,
    minPYds,
    minRecYds,
    minSack,
  ]);

  // Filtering — sport-aware
  const filterRows = (rows, isPrimary) => {
    const k = sort.key;
    let list = rows
      .filter(
        (p) => !search || p.name.toLowerCase().includes(search.toLowerCase()),
      )
      .filter((p) => team === 'All Teams' || p.team === team)
      .filter((p) => position === 'All Positions' || p.pos === position);

    if (sport === 'baseball') {
      if (isPrimary) {
        list = list.filter((p) => p.hr >= minHR).filter((p) => p.avg >= minAVG);
      } else {
        list = list.filter((p) => p.eraN <= maxERA);
      }
    } else {
      if (isPrimary) {
        list = list
          .filter((p) => p.pyds >= minPYds)
          .filter((p) => p.recyds >= minRecYds);
      } else {
        list = list.filter((p) => p.sack >= minSack);
      }
    }

    if (rows[0] && k in rows[0]) {
      list = [...list].sort((a, b) =>
        sort.dir === 'desc' ? b[k] - a[k] : a[k] - b[k],
      );
    }
    return list.slice(0, pageSize);
  };

  const primaryRows = React.useMemo(
    () => filterRows(cfg.primary.rows, true),
    [
      sport,
      search,
      team,
      position,
      minHR,
      minAVG,
      minPYds,
      minRecYds,
      sort,
      pageSize,
    ],
  );
  const secondaryRows = React.useMemo(
    () => filterRows(cfg.secondary.rows, false),
    [sport, search, team, position, maxERA, minSack, sort, pageSize],
  );

  const totalRows =
    view === 'primary'
      ? primaryRows.length
      : view === 'secondary'
        ? secondaryRows.length
        : primaryRows.length + secondaryRows.length;
  const archiveTotal =
    view === 'primary'
      ? cfg.primary.rows.length
      : view === 'secondary'
        ? cfg.secondary.rows.length
        : cfg.primary.rows.length + cfg.secondary.rows.length;

  const fire = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  return (
    <div className="sp-page">
      <BreakpointBar
        breakpoint={breakpoint}
        setBreakpoint={setBreakpoint}
        bp={bp}
      />
      <div className={shellClass} style={shellStyle} data-bp={bp.id}>
        <Nav />

        <main className="sp-main" data-screen-label="Player Stats">
          <StateSwitcher state={state} setState={setState} />

          <PageHeader
            cfg={cfg}
            sport={sport}
            switchSport={switchSport}
            totalRows={totalRows}
            query={query}
            onExport={() => fire('Exported filtered results as JSON')}
            onShare={() => fire('Link copied to clipboard')}
          />

          <ViewTabs cfg={cfg} view={view} setView={setView} />

          <Toolbar
            cfg={cfg}
            search={search}
            setSearch={setSearch}
            team={team}
            setTeam={setTeam}
            position={position}
            setPosition={setPosition}
            pageSize={pageSize}
            setPageSize={setPageSize}
            advancedOpen={advancedOpen}
            setAdvancedOpen={setAdvancedOpen}
          />

          {advancedOpen &&
            (sport === 'baseball' ? (
              <BaseballFilters
                minHR={minHR}
                setMinHR={setMinHR}
                minAVG={minAVG}
                setMinAVG={setMinAVG}
                maxERA={maxERA}
                setMaxERA={setMaxERA}
                onReset={() => {
                  setMinHR(0);
                  setMinAVG(0);
                  setMaxERA(5);
                }}
              />
            ) : (
              <FootballFilters
                minPYds={minPYds}
                setMinPYds={setMinPYds}
                minRecYds={minRecYds}
                setMinRecYds={setMinRecYds}
                minSack={minSack}
                setMinSack={setMinSack}
                onReset={() => {
                  setMinPYds(0);
                  setMinRecYds(0);
                  setMinSack(0);
                }}
              />
            ))}

          {state === 'loading' && <LoadingState cfg={cfg} view={view} />}
          {state === 'error' && (
            <ErrorState onRetry={() => setState('populated')} />
          )}
          {state === 'empty' && (
            <EmptyState
              onClear={() => {
                setSearch('');
                setTeam('All Teams');
                setPosition('All Positions');
                setMinHR(0);
                setMinAVG(0);
                setMaxERA(5);
                setMinPYds(0);
                setMinRecYds(0);
                setMinSack(0);
                setState('populated');
              }}
            />
          )}
          {state === 'populated' && (
            <>
              {(view === 'combined' || view === 'primary') && (
                <StatTable
                  cfg={cfg}
                  kind="primary"
                  rows={primaryRows}
                  sort={sort}
                  setSort={setSort}
                  onOpen={setDetail}
                />
              )}
              {(view === 'combined' || view === 'secondary') && (
                <StatTable
                  cfg={cfg}
                  kind="secondary"
                  rows={secondaryRows}
                  sort={sort}
                  setSort={setSort}
                  onOpen={setDetail}
                />
              )}
              <TableFooter
                total={archiveTotal}
                showing={totalRows}
                qualifier={cfg.qualifier}
              />
            </>
          )}
        </main>

        {detail && (
          <DetailModal
            player={detail}
            sport={sport}
            onClose={() => setDetail(null)}
          />
        )}
      </div>
      {toast && <Toast msg={toast} />}
      <LiveRegion toast={toast} />
    </div>
  );
};

/* ──────────────────────────────────────────
   Breakpoint bar (top, full-width, persistent)
   ────────────────────────────────────────── */
const BreakpointBar = ({ breakpoint, setBreakpoint, bp }) => {
  const [actualW, setActualW] = React.useState(0);
  React.useEffect(() => {
    const el = document.querySelector('.sp-shell');
    if (!el) return;
    const update = () => setActualW(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [breakpoint]);

  return (
    <div className="sp-bpbar" role="toolbar" aria-label="Viewport breakpoint">
      <div className="sp-bpbar-inner">
        <div className="sp-bpbar-left">
          <span className="sp-bpbar-eyebrow">Viewport</span>
          <div className="sp-bp-chips">
            {BREAKPOINTS.map((b) => (
              <button
                key={b.id}
                className={`sp-bp-chip ${breakpoint === b.id ? 'on' : ''}`}
                onClick={() => setBreakpoint(b.id)}
                title={b.device}
              >
                <BpIcon kind={b.id} />
                <span className="sp-bp-chip-label">{b.label}</span>
                <span className="sp-bp-chip-width">
                  {b.width ? `${b.width}` : '∞'}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="sp-bpbar-right">
          <div className="sp-bpbar-readout">
            <span className="sp-bpbar-readout-label">Current</span>
            <span className="sp-bpbar-readout-val">
              {Math.round(actualW)}
              <span className="sp-bpbar-readout-unit">px</span>
            </span>
            <span className="sp-bpbar-readout-device">· {bp.device}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const BpIcon = ({ kind }) => {
  // Tiny line-art glyph per breakpoint — feels like a Storybook viewport menu.
  if (kind === 'mobile')
    return (
      <svg
        width="12"
        height="14"
        viewBox="0 0 12 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      >
        <rect x="1.5" y="1" width="9" height="12" rx="1.5" />
        <line x1="5" y1="11" x2="7" y2="11" />
      </svg>
    );
  if (kind === 'tablet')
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      >
        <rect x="2" y="1" width="10" height="12" rx="1" />
        <line x1="6" y1="11" x2="8" y2="11" />
      </svg>
    );
  if (kind === 'laptop')
    return (
      <svg
        width="16"
        height="14"
        viewBox="0 0 16 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      >
        <rect x="2" y="2" width="12" height="8" rx="1" />
        <line x1="0.5" y1="12.5" x2="15.5" y2="12.5" />
      </svg>
    );
  if (kind === 'desktop')
    return (
      <svg
        width="16"
        height="14"
        viewBox="0 0 16 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      >
        <rect x="1" y="1.5" width="14" height="9" rx="1" />
        <line x1="6" y1="13" x2="10" y2="13" />
        <line x1="4" y1="13" x2="12" y2="13" />
      </svg>
    );
  if (kind === 'wide')
    return (
      <svg
        width="18"
        height="14"
        viewBox="0 0 18 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      >
        <rect x="1" y="2" width="16" height="8" rx="1" />
        <line x1="6" y1="12.5" x2="12" y2="12.5" />
      </svg>
    );
  return (
    <svg
      width="14"
      height="12"
      viewBox="0 0 14 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <polyline points="3 6 1 6 1 1 6 1" />
      <polyline points="11 6 13 6 13 1 8 1" />
      <polyline points="3 6 1 6 1 11 6 11" transform="translate(0 0)" />
      <polyline points="11 6 13 6 13 11 8 11" />
    </svg>
  );
};

/* ──────────────────────────────────────────
   Nav
   ────────────────────────────────────────── */
const Nav = () => (
  <header className="sp-nav">
    <div className="sp-nav-inner">
      <a className="sp-brand">
        <img src="ds/assets/logo.png" alt="" />
        <div className="sp-wordmark">
          LEGACY
          <br />
          <span>SPORTS</span>
        </div>
      </a>
      <nav className="sp-tabs">
        {[
          ['Home', 'scoreboard'],
          ['Scoreboard', 'live'],
          ['My League', 'league'],
          ['Players', 'stats'],
          ['Draft', 'draft'],
        ].map(([l, i]) => (
          <a key={l} className={l === 'Players' ? 'on' : ''}>
            <img src={`ds/icons/${i}.svg`} width="16" height="16" alt="" />
            {l}
          </a>
        ))}
      </nav>
      <div className="sp-nav-right">
        <button className="sp-icon-btn">
          <img
            src="ds/icons/bell.svg"
            width="18"
            height="18"
            alt="Notifications"
          />
        </button>
        <div className="sp-avatar">MJ</div>
      </div>
    </div>
  </header>
);

/* ──────────────────────────────────────────
   State switcher (review tool)
   ────────────────────────────────────────── */
const StateSwitcher = ({ state, setState }) => (
  <div className="sp-state-switcher" role="tablist" aria-label="Preview state">
    <span className="sp-state-label">Preview state</span>
    {['loading', 'error', 'empty', 'populated'].map((s) => (
      <button
        key={s}
        role="tab"
        aria-selected={state === s}
        className={`sp-state-btn ${state === s ? 'on' : ''}`}
        onClick={() => setState(s)}
      >
        {s}
      </button>
    ))}
  </div>
);

/* ──────────────────────────────────────────
   Page header — sport toggle + H1
   ────────────────────────────────────────── */
const PageHeader = ({ cfg, sport, switchSport, query, onExport, onShare }) => (
  <header className="sp-page-head">
    <div>
      <div className="sp-eyebrow">{cfg.eyebrow}</div>
      <div className="sp-h1-row">
        <h1 className="sp-h1">Player Statistics</h1>
        <SportSwitcher sport={sport} switchSport={switchSport} />
      </div>
      <p className="sp-lede">{cfg.lede}</p>
      <div className="sp-url-preview" title="URL persisted state — shareable">
        <span className="sp-url-label">URL</span>
        <span className="sp-url-value">/players/stats?{query}</span>
      </div>
    </div>
    <div className="sp-head-actions">
      <button className="sp-btn sp-btn-ghost" onClick={onShare}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Share
      </button>
      <button className="sp-btn sp-btn-ghost" onClick={onExport}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export JSON
      </button>
    </div>
  </header>
);

const SportSwitcher = ({ sport, switchSport }) => (
  <div className="sp-sport-switch" role="tablist" aria-label="Sport">
    {Object.entries(SPORTS).map(([id, s]) => (
      <button
        key={id}
        role="tab"
        aria-selected={sport === id}
        className={`sp-sport-btn ${sport === id ? 'on' : ''} sp-sport-${id}`}
        onClick={() => switchSport(id)}
      >
        <img
          src={`ds/icons/${id === 'baseball' ? 'baseball' : 'football'}.svg`}
          width="18"
          height="18"
          alt=""
        />
        {s.label}
      </button>
    ))}
  </div>
);

/* ──────────────────────────────────────────
   View tabs
   ────────────────────────────────────────── */
const ViewTabs = ({ cfg, view, setView }) => (
  <div className="sp-subnav">
    {cfg.views.map(([id, label]) => (
      <button
        key={id}
        className={view === id ? 'on' : ''}
        onClick={() => setView(id)}
      >
        {label}
      </button>
    ))}
  </div>
);

/* ──────────────────────────────────────────
   Toolbar
   ────────────────────────────────────────── */
const Toolbar = ({
  cfg,
  search,
  setSearch,
  team,
  setTeam,
  position,
  setPosition,
  pageSize,
  setPageSize,
  advancedOpen,
  setAdvancedOpen,
}) => (
  <div className="sp-toolbar">
    <label className="sp-search">
      <svg
        className="sp-search-ic"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="text"
        placeholder="Search player name · min 2 chars"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {search && (
        <button
          className="sp-search-clear"
          onClick={() => setSearch('')}
          aria-label="Clear"
        >
          ×
        </button>
      )}
    </label>

    <Select
      label="Position"
      value={position}
      options={cfg.positions}
      onChange={setPosition}
    />
    <Select label="Team" value={team} options={cfg.teams} onChange={setTeam} />
    <Select
      label="Rows"
      value={pageSize}
      options={[10, 25, 50, 100]}
      onChange={(v) => setPageSize(Number(v))}
    />

    <button
      className={`sp-btn sp-btn-ghost sp-adv-toggle ${advancedOpen ? 'on' : ''}`}
      onClick={() => setAdvancedOpen((v) => !v)}
      aria-expanded={advancedOpen}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
      Advanced
      <span className="sp-adv-chev">{advancedOpen ? '▴' : '▾'}</span>
    </button>
  </div>
);

const Select = ({ label, value, options, onChange }) => (
  <label className="sp-select">
    <span className="sp-select-label">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
    <span className="sp-select-chev">▾</span>
  </label>
);

/* ──────────────────────────────────────────
   Advanced filters
   ────────────────────────────────────────── */
const BaseballFilters = ({
  minHR,
  setMinHR,
  minAVG,
  setMinAVG,
  maxERA,
  setMaxERA,
  onReset,
}) => (
  <div className="sp-adv">
    <div className="sp-adv-head">
      <div className="sp-eyebrow">Stat Ranges · Baseball</div>
      <button className="sp-linkbtn" onClick={onReset}>
        Reset ranges
      </button>
    </div>
    <div className="sp-adv-grid">
      <Slider
        label="Min Home Runs"
        value={minHR}
        min={0}
        max={75}
        step={1}
        onChange={setMinHR}
        format={(v) => v}
      />
      <Slider
        label="Min Batting Average"
        value={minAVG}
        min={0}
        max={0.43}
        step={0.005}
        onChange={setMinAVG}
        format={(v) => v.toFixed(3).replace(/^0/, '')}
      />
      <Slider
        label="Max ERA"
        value={maxERA}
        min={0.5}
        max={5.0}
        step={0.05}
        onChange={setMaxERA}
        format={(v) => v.toFixed(2)}
      />
    </div>
  </div>
);

const FootballFilters = ({
  minPYds,
  setMinPYds,
  minRecYds,
  setMinRecYds,
  minSack,
  setMinSack,
  onReset,
}) => (
  <div className="sp-adv">
    <div className="sp-adv-head">
      <div className="sp-eyebrow">Stat Ranges · Football</div>
      <button className="sp-linkbtn" onClick={onReset}>
        Reset ranges
      </button>
    </div>
    <div className="sp-adv-grid">
      <Slider
        label="Min Passing Yards"
        value={minPYds}
        min={0}
        max={5500}
        step={50}
        onChange={setMinPYds}
        format={(v) => v.toLocaleString()}
      />
      <Slider
        label="Min Receiving Yards"
        value={minRecYds}
        min={0}
        max={2000}
        step={25}
        onChange={setMinRecYds}
        format={(v) => v.toLocaleString()}
      />
      <Slider
        label="Min Sacks"
        value={minSack}
        min={0}
        max={25}
        step={0.5}
        onChange={setMinSack}
        format={(v) => v.toFixed(1)}
      />
    </div>
  </div>
);

const Slider = ({ label, value, min, max, step, onChange, format }) => {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="sp-slider">
      <div className="sp-slider-row">
        <span className="sp-slider-label">{label}</span>
        <span className="sp-slider-value">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--pct': `${pct}%` }}
      />
      <div className="sp-slider-ticks">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </label>
  );
};

/* ──────────────────────────────────────────
   Stat table
   ────────────────────────────────────────── */
const fmtCell = (v, fmt) => {
  if (v === null || v === undefined)
    return <span className="sp-td-null">—</span>;
  if (fmt === 'avg') return v.toFixed(3).replace(/^0/, '');
  if (fmt === 'era') return v.toFixed(2);
  if (fmt === 'whip') return v.toFixed(2);
  if (fmt === 'war') return v.toFixed(1);
  if (fmt === 'ip') return v.toFixed(1);
  if (fmt === 'fpts') return v.toFixed(1);
  if (fmt === 'sack') return v.toFixed(1);
  if (typeof v === 'number') return v.toLocaleString();
  return v;
};

const StatTable = ({ cfg, kind, rows, sort, setSort, onOpen }) => {
  const block = kind === 'primary' ? cfg.primary : cfg.secondary;
  const cols = block.cols;
  const title = block.label;
  const sublabel = `${block.subFmt(rows.length)} · sorted by ${cols.find((c) => c.k === sort.key)?.l || 'default'}`;

  const toggleSort = (k) => {
    if (sort.key === k)
      setSort({ key: k, dir: sort.dir === 'desc' ? 'asc' : 'desc' });
    else setSort({ key: k, dir: 'desc' });
  };

  return (
    <section className="sp-table-block">
      <div className="sp-table-cap">
        <div>
          <div className="sp-eyebrow">{title}</div>
          <div className="sp-table-sub">{sublabel}</div>
        </div>
        <div className="sp-legend">
          {cfg.legend.map(([key, label]) => (
            <span key={key} className="sp-legend-item">
              <span className={`sp-legend-dot sp-pos-${key}`} />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="sp-table-wrap">
        <table className="sp-table">
          <thead>
            <tr>
              <th className="sp-th-player">Player</th>
              <th className="sp-th-team">Team</th>
              <th className="sp-th-era">Season</th>
              {cols.map((c) => (
                <th
                  key={c.k}
                  className={`sp-th-num ${c.hi ? 'sp-th-hi' : ''} ${sort.key === c.k ? 'sp-th-on' : ''}`}
                  onClick={() => toggleSort(c.k)}
                >
                  <span>{c.l}</span>
                  <span className="sp-sort-ind">
                    {sort.key === c.k ? (sort.dir === 'desc' ? '▼' : '▲') : ''}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr
                key={i}
                className={`sp-tr sp-pos-row-${p.posKey}`}
                onClick={() => onOpen(p)}
              >
                <td className="sp-td-player">
                  <div className={`sp-pos-rule sp-pos-${p.posKey}`} />
                  <div className="sp-pcell">
                    <span className={`sp-pchip sp-pchip-${p.posKey}`}>
                      {p.pos}
                    </span>
                    <div className="sp-pname-wrap">
                      <span className="sp-pname">
                        {p.name}
                        {p.fav && (
                          <svg
                            className="sp-fav"
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <polygon points="12 2 15 8.5 22 9.3 17 14.2 18.2 21 12 17.8 5.8 21 7 14.2 2 9.3 9 8.5" />
                          </svg>
                        )}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="sp-td-team">
                  <span className="sp-team-abbr">{p.team}</span>
                </td>
                <td className="sp-td-era">{p.era}</td>
                {cols.map((c) => (
                  <td
                    key={c.k}
                    className={`sp-td-num ${c.hi ? 'sp-td-hi' : ''}`}
                  >
                    {fmtCell(p[c.k], c.fmt)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const TableFooter = ({ total, showing, qualifier }) => (
  <div className="sp-table-foot">
    <span>
      Showing <strong>{showing}</strong> of{' '}
      <strong>{total.toLocaleString()}</strong> {qualifier}
    </span>
    <div className="sp-pager">
      <button className="sp-page-btn" disabled>
        ‹
      </button>
      <span className="sp-page-cur">Page 1</span>
      <button className="sp-page-btn">›</button>
    </div>
  </div>
);

/* ──────────────────────────────────────────
   States
   ────────────────────────────────────────── */
const LoadingState = ({ cfg, view }) => {
  const colCount =
    view === 'secondary' ? cfg.secondary.cols.length : cfg.primary.cols.length;
  return (
    <section className="sp-table-block">
      <div className="sp-table-cap">
        <div>
          <div className="sp-eyebrow">Loading</div>
          <div className="sp-table-sub sp-sk-sub">
            Fetching archived seasons…
          </div>
        </div>
      </div>
      <div className="sp-table-wrap">
        <table className="sp-table sp-table-skeleton">
          <thead>
            <tr>
              <th className="sp-th-player">
                <span className="sp-sk-bar w80" />
              </th>
              <th className="sp-th-team">
                <span className="sp-sk-bar w40" />
              </th>
              <th className="sp-th-era">
                <span className="sp-sk-bar w40" />
              </th>
              {Array.from({ length: colCount }).map((_, i) => (
                <th key={i} className="sp-th-num">
                  <span className="sp-sk-bar w40" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, r) => (
              <tr key={r} className="sp-tr sp-tr-skeleton">
                <td className="sp-td-player">
                  <div className="sp-pos-rule sp-sk-rule" />
                  <div className="sp-pcell">
                    <span className="sp-sk-chip" />
                    <span className="sp-sk-bar w60" />
                  </div>
                </td>
                <td className="sp-td-team">
                  <span className="sp-sk-bar w30" />
                </td>
                <td className="sp-td-era">
                  <span className="sp-sk-bar w40" />
                </td>
                {Array.from({ length: colCount }).map((_, c) => (
                  <td key={c} className="sp-td-num">
                    <span className="sp-sk-bar w50" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const EmptyState = ({ onClear }) => (
  <section className="sp-state-card sp-empty">
    <svg
      width="56"
      height="56"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className="sp-state-ic"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
    <h3 className="sp-state-title">No players found</h3>
    <p className="sp-state-msg">
      No players match the current filters. Try widening your search, relaxing a
      range, or clearing filters entirely.
    </p>
    <button className="sp-btn sp-btn-primary" onClick={onClear}>
      Clear all filters
    </button>
  </section>
);

const ErrorState = ({ onRetry }) => (
  <section className="sp-state-card sp-error">
    <svg
      width="56"
      height="56"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="sp-state-ic"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
    <h3 className="sp-state-title">Unable to load player stats</h3>
    <p className="sp-state-msg">
      We couldn't reach the archive service. Your filters are safe — we'll
      restore them when the connection returns.
    </p>
    <div className="sp-error-code">REQUEST_TIMEOUT · archive/v2/players</div>
    <button className="sp-btn sp-btn-primary" onClick={onRetry}>
      Retry
    </button>
  </section>
);

/* ──────────────────────────────────────────
   Detail modal — sport-aware key stats
   ────────────────────────────────────────── */
const DetailModal = ({ player, sport, onClose }) => {
  React.useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Determine the four key stats based on player + sport.
  let kstats = [];
  let blurb = '';
  if (sport === 'baseball') {
    const isPitcher = ['SP', 'RP'].includes(player.pos);
    if (isPitcher) {
      kstats = [
        ['ERA', player.eraN.toFixed(2)],
        ['WHIP', player.whip.toFixed(2)],
        ['K', player.so],
        ['W-L', `${player.w}-${player.l}`],
      ];
      blurb = `Workhorse arm · ${player.ip} IP · ${player.so} punchouts · ERA ${player.eraN.toFixed(2)}`;
    } else {
      kstats = [
        ['AVG', player.avg.toFixed(3).replace(/^0/, '')],
        ['HR', player.hr],
        ['RBI', player.rbi],
        ['oWAR', player.owar.toFixed(1)],
      ];
      blurb = `${player.hr}-HR season · ${player.h} hits · .${String(Math.round(player.avg * 1000)).padStart(3, '0')} / .${String(Math.round(player.obp * 1000)).padStart(3, '0')} / .${String(Math.round(player.slg * 1000)).padStart(3, '0')} slash`;
    }
  } else {
    const isDef = String(player.posKey).startsWith('def-');
    if (isDef) {
      kstats = [
        ['TKL', player.tkl],
        ['SACK', player.sack.toFixed(1)],
        ['INT', player.intd],
        ['FPTS', player.fpts.toFixed(1)],
      ];
      blurb = `${player.tkl} tackles · ${player.sack.toFixed(1)} sacks · ${player.intd} interceptions · ${player.fpts.toFixed(1)} fantasy points`;
    } else if (player.pos === 'QB') {
      kstats = [
        ['PYDS', player.pyds.toLocaleString()],
        ['PTD', player.ptd],
        ['INT', player.intc],
        ['FPTS', player.fpts.toFixed(1)],
      ];
      blurb = `${player.pyds.toLocaleString()} passing yards · ${player.ptd} TDs · ${player.intc} INTs · ${player.fpts.toFixed(1)} fantasy points`;
    } else if (player.pos === 'RB') {
      kstats = [
        ['RYDS', player.ryds.toLocaleString()],
        ['RTD', player.rtd],
        ['REC', player.rec],
        ['FPTS', player.fpts.toFixed(1)],
      ];
      blurb = `${player.ryds.toLocaleString()} rushing yards · ${player.rtd} rushing TDs · ${player.rec} catches · ${player.fpts.toFixed(1)} fantasy points`;
    } else {
      kstats = [
        ['REC', player.rec],
        ['RECYDS', player.recyds.toLocaleString()],
        ['RECTD', player.rectd],
        ['FPTS', player.fpts.toFixed(1)],
      ];
      blurb = `${player.rec} catches · ${player.recyds.toLocaleString()} receiving yards · ${player.rectd} TDs · ${player.fpts.toFixed(1)} fantasy points`;
    }
  }

  return (
    <div className="sp-modal-scrim" onClick={onClose}>
      <div
        className="sp-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${player.name} detail`}
      >
        <button className="sp-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className={`sp-modal-head sp-pos-bg-${player.posKey}`}>
          <div className="sp-eyebrow">
            {player.era} Season · {player.team}
          </div>
          <div className="sp-modal-name">
            <span className={`sp-pchip sp-pchip-${player.posKey} sp-pchip-lg`}>
              {player.pos}
            </span>
            {player.name}
            {player.fav && (
              <svg
                className="sp-fav sp-fav-lg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <polygon points="12 2 15 8.5 22 9.3 17 14.2 18.2 21 12 17.8 5.8 21 7 14.2 2 9.3 9 8.5" />
              </svg>
            )}
          </div>
          <p className="sp-modal-sub">{blurb}</p>
        </div>

        <div className="sp-modal-body">
          <div className="sp-kstat-row">
            {kstats.map(([l, v]) => (
              <div className="sp-kstat" key={l}>
                <div className="sp-kstat-val">{v}</div>
                <div className="sp-kstat-lbl">{l}</div>
              </div>
            ))}
          </div>

          <div className="sp-modal-columns">
            <div>
              <div className="sp-eyebrow">Availability</div>
              <div className="sp-modal-field">Free Agent</div>
              <div className="sp-modal-caption">Drafted 3 of 12 leagues</div>
            </div>
            <div>
              <div className="sp-eyebrow">Archive coverage</div>
              <div className="sp-modal-field">
                {sport === 'baseball'
                  ? 'Full season · 162 archived games'
                  : `Full season · ${player.g} archived games`}
              </div>
              <div className="sp-modal-caption">
                Data verified against{' '}
                {sport === 'baseball' ? 'Retrosheet' : 'Pro Football Reference'}
              </div>
            </div>
            <div>
              <div className="sp-eyebrow">Next action</div>
              <div className="sp-modal-ctas">
                <button className="sp-btn sp-btn-primary">
                  Add to watchlist
                </button>
                <button className="sp-btn sp-btn-ghost">
                  View full breakdown
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────
   Toast + ARIA live region
   ────────────────────────────────────────── */
const Toast = ({ msg }) => (
  <div className="sp-toast" role="status">
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
    {msg}
  </div>
);

const LiveRegion = ({ toast }) => (
  <div className="sp-sr-only" aria-live="polite" aria-atomic="true">
    {toast || ''}
  </div>
);

Object.assign(window, { StatsPage });
