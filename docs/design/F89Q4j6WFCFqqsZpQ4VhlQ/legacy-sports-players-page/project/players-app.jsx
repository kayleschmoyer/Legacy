// players-app.jsx — page composition + state management
// Adds sport switcher (real product UI) + viewport switcher (design tool).

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/ {
  sport: 'baseball',
  viewport: 'full',
  viewMode: 'cards',
  showFeatured: true,
}; /*EDITMODE-END*/

// Mini-Nav — recreates the sticky top bar from the UI kit
const PageNav = ({ sport, setSport }) => (
  <header className="ls-nav">
    <div className="ls-nav-inner">
      <a className="ls-brand">
        <img src="ds/logo.png" alt="" />
        <div className="ls-wordmark">
          LEGACY
          <br />
          <span>SPORTS</span>
        </div>
      </a>
      <SportSwitch sport={sport} setSport={setSport} />
      <nav className="ls-tabs">
        {[
          { id: 'home', label: 'Home', icon: 'scoreboard' },
          { id: 'scoreboard', label: 'Scoreboard', icon: 'live' },
          { id: 'league', label: 'My League', icon: 'league' },
          { id: 'players', label: 'Players', icon: 'roster' },
          { id: 'draft', label: 'Draft', icon: 'draft' },
        ].map((t) => (
          <a key={t.id} className={t.id === 'players' ? 'on' : ''}>
            <img src={`ds/brand/${t.icon}.svg`} width="16" height="16" alt="" />
            {t.label}
          </a>
        ))}
      </nav>
      <div className="ls-nav-right">
        <button className="ls-icon-btn" title="Notifications">
          <img src="ds/brand/bell.svg" width="20" height="20" />
        </button>
        <div className="ls-avatar" title="You">
          MJ
        </div>
      </div>
    </div>
  </header>
);

// State switcher — DESIGN TOOL ONLY
const StateSwitch = ({ state, setState }) => (
  <div
    className="pp-stateswitch"
    role="tablist"
    aria-label="Mock state switcher"
  >
    <span className="pp-stateswitch-label">Mock State</span>
    {['populated', 'loading', 'empty', 'error'].map((s) => (
      <button
        key={s}
        className={state === s ? 'on' : ''}
        onClick={() => setState(s)}
      >
        {s}
      </button>
    ))}
  </div>
);

// Active-filter summary chips
const ActiveSummary = ({ sportCfg, era, pos, avail, q, onClear }) => {
  const items = [];
  if (era !== 'all')
    items.push({ k: 'era', v: sportCfg.eras.find((e) => e.id === era).label });
  if (pos !== 'all')
    items.push({
      k: 'pos',
      v: sportCfg.positions.find((p) => p.id === pos).label,
    });
  if (avail !== 'all')
    items.push({
      k: 'avail',
      v: AVAILABILITY.find((a) => a.id === avail).label,
    });
  if (q.trim()) items.push({ k: 'q', v: `"${q.trim()}"` });
  if (!items.length) return null;
  return (
    <div className="pp-active">
      <span className="pp-active-label">Showing</span>
      {items.map((it, i) => (
        <span key={i} className="pp-tag">
          {it.v}
          <button onClick={() => onClear(it.k)}>×</button>
        </span>
      ))}
      <button className="pp-clear" onClick={() => onClear('all')}>
        Clear all
      </button>
    </div>
  );
};

// Main page — keyed by sport so internal state resets cleanly on sport switch
const PlayersPage = ({ sport, mockState, view, setView, showFeatured }) => {
  const sportCfg = SPORTS[sport];
  const [q, setQ] = React.useState('');
  const [era, setEra] = React.useState('all');
  const [pos, setPos] = React.useState('all');
  const [avail, setAvail] = React.useState('all');
  const [sort, setSort] = React.useState(sportCfg.primarySort);

  const featured = sportCfg.players[0];

  const filtered = sportCfg.players.filter((p) => {
    if (q.trim() && !p.name.toLowerCase().includes(q.trim().toLowerCase()))
      return false;
    if (era !== 'all' && p.era !== era) return false;
    if (pos !== 'all' && p.posGroup !== pos) return false;
    if (avail !== 'all' && p.status !== avail) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    const av = typeof a[sort] === 'string' ? parseFloat(a[sort]) : a[sort] || 0;
    const bv = typeof b[sort] === 'string' ? parseFloat(b[sort]) : b[sort] || 0;
    return bv - av;
  });

  const onClear = (k) => {
    if (k === 'all') {
      setQ('');
      setEra('all');
      setPos('all');
      setAvail('all');
    }
    if (k === 'q') setQ('');
    if (k === 'era') setEra('all');
    if (k === 'pos') setPos('all');
    if (k === 'avail') setAvail('all');
  };

  const renderBody = () => {
    if (mockState === 'loading')
      return <LoadingSkeleton view={view} sportCfg={sportCfg} />;
    if (mockState === 'error') return <ErrorState onRetry={() => {}} />;
    if (mockState === 'empty' || sorted.length === 0)
      return <EmptyState onClear={() => onClear('all')} sportCfg={sportCfg} />;
    if (view === 'cards') {
      return (
        <div className="pp-grid">
          {sorted.map((p) => (
            <PlayerCard key={p.id} p={p} />
          ))}
        </div>
      );
    }
    if (view === 'list') {
      return (
        <div className="pp-list">
          {sorted.map((p, i) => (
            <PlayerListRow key={p.id} p={p} idx={i} />
          ))}
        </div>
      );
    }
    return <StatsTable rows={sorted} sportCfg={sportCfg} />;
  };

  return (
    <div className="pp-page" data-screen-label={`Players (${sportCfg.label})`}>
      <div className="pp-head">
        <div>
          <div className="ls-eyebrow">{sportCfg.eyebrow}</div>
          <h1>{sportCfg.title}</h1>
          <div className="pp-head-meta">{sportCfg.meta}</div>
        </div>
        <div className="pp-head-right">
          <span className="pp-count">
            <strong>{sorted.length}</strong> &nbsp;of{' '}
            {filtered.length || sportCfg.players.length} matched
          </span>
        </div>
      </div>

      {showFeatured && mockState === 'populated' && (
        <Featured p={featured} sport={sport} />
      )}

      <div className="pp-filters">
        <div className="pp-search">
          <div className="pp-search-box">
            <span className="pp-search-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              placeholder={sportCfg.searchPlaceholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search players"
            />
          </div>
          <select
            className="pp-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort"
          >
            {sportCfg.sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ViewToggle view={view} setView={setView} />
        </div>

        <FilterRail
          sportCfg={sportCfg}
          era={era}
          setEra={setEra}
          pos={pos}
          setPos={setPos}
          avail={avail}
          setAvail={setAvail}
        />

        <ActiveSummary
          sportCfg={sportCfg}
          era={era}
          pos={pos}
          avail={avail}
          q={q}
          onClear={onClear}
        />
      </div>

      <div className="pp-section-bar">
        <h2>Results</h2>
        <span className="pp-section-meta">
          {mockState === 'loading'
            ? 'Reading the archive…'
            : mockState === 'error'
              ? 'Connection lost'
              : mockState === 'empty' || sorted.length === 0
                ? 'Nothing to show with those filters'
                : `${sorted.length} player${sorted.length === 1 ? '' : 's'} · sorted by ${sportCfg.sortReadable[sort] || sort.toUpperCase()}`}
        </span>
      </div>

      <div className="pp-results">{renderBody()}</div>

      {mockState === 'populated' && sorted.length > 0 && (
        <div className="pp-foot">
          <div className="pp-foot-meta">
            Showing <strong>1–{sorted.length}</strong> of{' '}
            <strong>{sportCfg.total.toLocaleString()}</strong> players in the
            archive
          </div>
          <button className="pp-loadmore">Load 50 More</button>
        </div>
      )}
    </div>
  );
};

const App = () => {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [mockState, setMockState] = React.useState('populated');

  const sport = tweaks.sport;
  const setSport = (v) => setTweak('sport', v);

  const vpId = tweaks.viewport;
  const vpCfg =
    VIEWPORTS.find((v) => v.id === vpId) || VIEWPORTS[VIEWPORTS.length - 1];
  const vpFixed = !!vpCfg.width;

  const frameStyle = vpFixed
    ? { width: `${vpCfg.width}px`, maxWidth: '100%' }
    : { width: '100%' };

  return (
    <>
      <ViewportBar vp={vpId} setVp={(v) => setTweak('viewport', v)} />

      <div className="pp-frame-rail">
        <div
          className={`pp-viewport-frame sport-${sport} ${vpFixed ? 'vp-fixed' : 'vp-fluid'} vp-${vpId}`}
          style={frameStyle}
          data-screen-label={`Viewport ${vpCfg.label} (${vpCfg.width || 'fluid'})`}
        >
          <PageNav sport={sport} setSport={setSport} />
          <div className="pp-page" style={{ paddingBottom: 0 }}>
            <StateSwitch state={mockState} setState={setMockState} />
          </div>
          <PlayersPage
            key={sport}
            sport={sport}
            mockState={mockState}
            view={tweaks.viewMode}
            setView={(v) => setTweak('viewMode', v)}
            showFeatured={tweaks.showFeatured}
          />
        </div>
      </div>

      <TweaksPanel title="Tweaks" defaultPosition={{ right: 24, bottom: 24 }}>
        <TweakSection label="Content">
          <TweakRadio
            label="Sport"
            options={[
              { value: 'baseball', label: 'Baseball' },
              { value: 'football', label: 'Football' },
            ]}
            value={sport}
            onChange={setSport}
          />
        </TweakSection>
        <TweakSection label="Preview">
          <TweakSelect
            label="Viewport"
            options={VIEWPORTS.map((v) => ({
              value: v.id,
              label: `${v.label} (${v.width || 'fluid'})`,
            }))}
            value={vpId}
            onChange={(v) => setTweak('viewport', v)}
          />
        </TweakSection>
        <TweakSection label="Page">
          <TweakRadio
            label="Layout"
            options={[
              { value: 'cards', label: 'Cards' },
              { value: 'list', label: 'List' },
              { value: 'table', label: 'Stats' },
            ]}
            value={tweaks.viewMode}
            onChange={(v) => setTweak('viewMode', v)}
          />
          <TweakToggle
            label="Show featured spotlight"
            value={tweaks.showFeatured}
            onChange={(v) => setTweak('showFeatured', v)}
          />
        </TweakSection>
      </TweaksPanel>
    </>
  );
};

ReactDOM.createRoot(document.getElementById('app')).render(<App />);
