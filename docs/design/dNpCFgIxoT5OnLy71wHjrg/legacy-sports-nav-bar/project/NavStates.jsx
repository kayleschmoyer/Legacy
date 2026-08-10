// NavStates.jsx — data-state variants of every nav surface.
// One switcher drives: desktop nav + ticker, the dropdowns/popovers,
// and the mobile header / bottom bar / drawer.

const NAV_STATES = [
  { id: 'loading', label: 'Loading', hint: 'Skeletons hold the layout; every control is inert and aria-busy.' },
  { id: 'error', label: 'Error', hint: 'Neutral and actionable — a Retry, never an apology.' },
  { id: 'empty', label: 'Empty', hint: 'No leagues yet. The nav turns into an invitation.' },
  { id: 'populated', label: 'Populated', hint: 'The everyday state — one league selected, ticker on.' },
];

const Skel = ({ w = '100%', h = 10, r = 6, style }) => (
  <span className="ls-skel" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />
);

const WarnGlyph = (s = 18) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.3 3.2 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.2a2 2 0 0 0-3.4 0Z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

// ── The switcher ───────────────────────────────────────────
const StateSwitch = ({ value, onChange, idPrefix = 'st' }) => (
  <div className="state-switch" role="radiogroup" aria-label="Nav data state">
    {NAV_STATES.map((s) => (
      <button
        key={s.id}
        id={`${idPrefix}-${s.id}`}
        type="button"
        role="radio"
        aria-checked={value === s.id}
        tabIndex={value === s.id ? 0 : -1}
        className="state-switch-btn"
        data-state={s.id}
        onClick={() => onChange(s.id)}
        onKeyDown={(e) => {
          const i = NAV_STATES.findIndex((x) => x.id === value);
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); onChange(NAV_STATES[(i + 1) % NAV_STATES.length].id); }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); onChange(NAV_STATES[(i - 1 + NAV_STATES.length) % NAV_STATES.length].id); }
        }}
      >
        <span className="sw-dot" aria-hidden="true" />
        {s.label}
      </button>
    ))}
  </div>
);

// ── Shared error / empty block inside a panel ──────────────
const PanelNote = ({ kind, title, body, actionLabel, onAction, secondaryLabel, icon }) => (
  <div className={`ls-panel-note ${kind}`} role={kind === 'error' ? 'alert' : undefined}>
    <span className="pn-icon">{icon || (kind === 'error' ? WarnGlyph(20) : Glyph.bell(20))}</span>
    <div className="pn-title">{title}</div>
    <p className="pn-body">{body}</p>
    {actionLabel && (
      <div className="pn-actions">
        <button type="button" className="ls-btn ls-btn-ghost ls-btn-sm" onClick={onAction}>{actionLabel}</button>
        {secondaryLabel && <button type="button" className="ls-link" style={{ fontSize: 12 }}>{secondaryLabel}</button>}
      </div>
    )}
  </div>
);

// ── Ticker, by state ───────────────────────────────────────
const TickerState = ({ state, onRetry }) => {
  if (state === 'populated') return <Ticker live={true} />;
  if (state === 'loading')
    return (
      <div className="ls-ticker is-skeleton" aria-busy="true" aria-label="Loading scores">
        <div className="ls-ticker-label"><Skel w={44} h={9} r={4} /></div>
        <div className="ls-ticker-scroll" style={{ animation: 'none' }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="ls-ticker-item"><Skel w={28} h={10} r={4} /><Skel w={14} h={12} r={4} /><Skel w={28} h={10} r={4} /><Skel w={14} h={12} r={4} /><Skel w={30} h={8} r={4} /></div>
          ))}
        </div>
      </div>
    );
  if (state === 'error')
    return (
      <div className="ls-ticker is-error" role="alert">
        <div className="ls-ticker-label err">{WarnGlyph(13)} Scores</div>
        <div className="ls-ticker-msg">
          Unable to load today's scores.
          <button type="button" className="ls-btn ls-btn-ghost ls-btn-sm" onClick={onRetry}>Retry</button>
        </div>
      </div>
    );
  return (
    <div className="ls-ticker is-empty">
      <div className="ls-ticker-label">Today</div>
      <div className="ls-ticker-msg muted">No games scheduled today · First pitch Fri 7:05 PM</div>
    </div>
  );
};

// ── Desktop nav, by state ──────────────────────────────────
const NavDesktopState = ({ state, onRetry, pop = null, onPop }) => {
  const loading = state === 'loading', error = state === 'error', empty = state === 'empty';
  const inert = loading || error || empty;

  const switcher = loading ? (
    <div className="ls-league-switcher is-skeleton" aria-hidden="true">
      <Skel w={28} h={28} r={8} />
      <span className="ls-league-label"><Skel w={34} h={7} r={3} /><Skel w={98} h={11} r={4} style={{ marginTop: 5 }} /></span>
    </div>
  ) : error ? (
    <button type="button" className="ls-league-switcher is-error" onClick={onRetry}>
      <span className="crest">{WarnGlyph(15)}</span>
      <span className="ls-league-label"><span className="eyebrow">League</span><span className="name">Unable to load</span></span>
      <span className="sw-retry">Retry</span>
    </button>
  ) : empty ? (
    <button type="button" className="ls-league-switcher is-empty">
      <span className="crest">{Glyph.plus(14)}</span>
      <span className="ls-league-label"><span className="eyebrow">No league yet</span><span className="name">Pick a league</span></span>
      <span className="caret">{Glyph.chevronDown(11)}</span>
    </button>
  ) : (
    <LeagueSwitcher onClick={() => onPop && onPop('league')} active={pop === 'league'} />
  );

  return (
    <>
      <header className="ls-nav" data-state={state} aria-busy={loading || undefined}>
        <div className="ls-nav-inner">
          <Brand />
          {switcher}
          <div style={{ marginLeft: 'auto' }}>
            {loading ? (
              <nav className="ls-tabs is-skeleton" aria-hidden="true">
                {[136, 108].map((w, i) => <Skel key={i} w={w} h={28} r={9999} />)}
              </nav>
            ) : (
              <Tabs current={empty || error ? null : 'players'} disabled={error || empty} />
            )}
          </div>
          <div className="ls-nav-right" style={{ marginLeft: 0 }}>
            {loading ? (
              <>
                <Skel w={38} h={38} r={9999} /><Skel w={38} h={38} r={9999} /><Skel w={38} h={38} r={9999} />
              </>
            ) : (
              <>
                <div style={{ position: 'relative' }}>
                  <IconBtn title="Notifications" count={empty || error ? null : '3'} disabled={error} onClick={() => onPop && onPop('notif')} active={pop === 'notif'}>
                    {Glyph.bell(17)}
                  </IconBtn>
                </div>
                <HelpBtn onClick={() => onPop && onPop('help')} active={pop === 'help'} />
                {empty && <button type="button" className="ls-btn ls-btn-gold ls-btn-sm">Create a League</button>}
                <AvatarBtn onClick={() => onPop && onPop('profile')} active={pop === 'profile'} />
              </>
            )}
          </div>
        </div>
      </header>
      <TickerState state={state} onRetry={onRetry} />
      <div className="slab-content" data-state={state}>
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }} aria-busy="true">
            <Skel w={220} h={14} r={5} /><Skel w={380} h={30} r={7} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginTop: 6 }}>
              <Skel h={86} r={16} /><Skel h={86} r={16} /><Skel h={86} r={16} />
            </div>
          </div>
        )}
        {error && (
          <PanelNote kind="error" title="Unable to load your leagues" body="We couldn't reach the league service. Your roster and lineup are safe — nothing was lost." actionLabel="Retry" onAction={onRetry} secondaryLabel="Check status page" />
        )}
        {empty && (
          <PanelNote kind="empty" icon={Glyph.trophy(20)} title="No leagues yet" body="Create or join your first league. Draft legends from across MLB history and compete on archived statistics." actionLabel="Create a League" onAction={() => {}} secondaryLabel="Browse public leagues" />
        )}
        {state === 'populated' && (
          <div className="placeholder">Week 14 · Legends of Summer — the everyday dashboard.</div>
        )}
      </div>
    </>
  );
};

// ── Notification tray, by state ────────────────────────────
const NotifTrayState = ({ state, onRetry }) => {
  if (state === 'populated') return <NotifTray />;
  return (
    <div className="ls-dropdown ls-notif-tray ls-dropdown--static" data-state={state} aria-busy={state === 'loading' || undefined}>
      <div className="ls-dropdown-head">
        <span className="eyebrow">Notifications</span>
        <button type="button" className="ls-link" style={{ fontSize: 12 }} disabled>Mark all read</button>
      </div>
      {state === 'loading' && [0, 1, 2, 3].map((i) => (
        <div key={i} className="ls-notif-row is-skeleton" aria-hidden="true">
          <Skel w={36} h={36} r={10} />
          <div className="ls-notif-body"><Skel w={i % 2 ? '72%' : '92%'} h={11} r={4} /><Skel w={110} h={9} r={4} style={{ marginTop: 8 }} /></div>
        </div>
      ))}
      {state === 'error' && (
        <PanelNote kind="error" title="Unable to load notifications" body="The activity feed didn't respond. Nothing has been marked read." actionLabel="Retry" onAction={onRetry} />
      )}
      {state === 'empty' && (
        <PanelNote kind="empty" title="You're all caught up" body="Draft picks, waiver claims, and scoring swings from your leagues land here." />
      )}
    </div>
  );
};

// ── League dropdown, by state ──────────────────────────────
const LeagueDropdownState = ({ state, onRetry }) => {
  if (state === 'populated') return <LeagueDropdown />;
  return (
    <div className="ls-dropdown ls-league-dropdown ls-dropdown--static" data-state={state} style={{ width: 340, padding: 6 }} aria-busy={state === 'loading' || undefined}>
      <div style={{ display: 'flex', gap: 4, padding: '6px 6px 10px 6px' }}>
        {['Baseball', 'Football'].map((l, i) => (
          <button key={l} type="button" className="ls-sport-pill" data-active={i === 0 && state !== 'loading'} disabled={state !== 'empty'}>
            <span>{l}</span>
            {state === 'loading' ? <Skel w={16} h={12} r={9999} /> : <span className="count">{state === 'empty' ? 0 : '—'}</span>}
          </button>
        ))}
      </div>
      {state === 'loading' && (
        <>
          <div className="ls-dropdown-group"><Skel w={120} h={9} r={4} /></div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="ls-league-row is-skeleton" aria-hidden="true">
              <Skel w={36} h={36} r={10} />
              <div style={{ flex: 1 }}><Skel w={i === 1 ? '58%' : '74%'} h={12} r={4} /><Skel w={130} h={9} r={4} style={{ marginTop: 7 }} /></div>
            </div>
          ))}
        </>
      )}
      {state === 'error' && <PanelNote kind="error" title="Unable to load your leagues" body="Try again — your league memberships are unaffected." actionLabel="Retry" onAction={onRetry} />}
      {state === 'empty' && (
        <>
          <PanelNote kind="empty" icon={Glyph.compass(20)} title="No leagues on your card" body="Join a public lobby, redeem an invite code, or start your own dynasty." />
          <div className="ls-menu-divider" />
          <button type="button" className="ls-menu-item">{Glyph.compass(14)}<span style={{ flex: 1, textAlign: 'left' }}>Browse public leagues</span><span className="ls-menu-hint">Open lobby</span></button>
          <button type="button" className="ls-menu-item">{Glyph.ticket(14)}<span style={{ flex: 1, textAlign: 'left' }}>Join with invite code</span></button>
          <button type="button" className="ls-menu-item" style={{ color: 'var(--brand-gold-light)' }}>{Glyph.plus(14)}<span style={{ flex: 1, textAlign: 'left' }}>Create a new league</span></button>
        </>
      )}
    </div>
  );
};

// ── Mobile surfaces, by state ──────────────────────────────
const MobileHeaderState = ({ state }) => {
  const loading = state === 'loading';
  return (
    <div className="ls-mob-header" data-state={state} aria-busy={loading || undefined}>
      <button type="button" className="icon-btn" aria-label="Menu" disabled={loading}>{Glyph.menu(20)}</button>
      {loading ? (
        <div className="ls-league-switcher is-skeleton" style={{ maxWidth: 200, padding: '5px 8px 5px 6px' }} aria-hidden="true">
          <Skel w={24} h={24} r={7} /><span className="ls-league-label"><Skel w={28} h={6} r={3} /><Skel w={84} h={10} r={4} style={{ marginTop: 4 }} /></span>
        </div>
      ) : state === 'error' ? (
        <button type="button" className="ls-league-switcher is-error" style={{ maxWidth: 200, padding: '5px 8px 5px 6px' }}>
          <span className="crest" style={{ width: 24, height: 24 }}>{WarnGlyph(13)}</span>
          <span className="ls-league-label"><span className="eyebrow" style={{ fontSize: 8 }}>League</span><span className="name" style={{ fontSize: 12 }}>Unable to load</span></span>
        </button>
      ) : state === 'empty' ? (
        <button type="button" className="ls-league-switcher is-empty" style={{ maxWidth: 200, padding: '5px 8px 5px 6px' }}>
          <span className="crest" style={{ width: 24, height: 24 }}>{Glyph.plus(12)}</span>
          <span className="ls-league-label"><span className="eyebrow" style={{ fontSize: 8 }}>No league yet</span><span className="name" style={{ fontSize: 12 }}>Pick a league</span></span>
        </button>
      ) : (
        <button type="button" className="ls-league-switcher" style={{ maxWidth: 200, padding: '5px 8px 5px 6px' }}>
          <span className="crest" style={{ width: 24, height: 24, fontSize: 10 }}>LS</span>
          <span className="ls-league-label"><span className="eyebrow" style={{ fontSize: 8 }}>League</span><span className="name" style={{ fontSize: 12, maxWidth: 110 }}>Legends of Summer</span></span>
          <span className="caret">{Glyph.chevronDown(11)}</span>
        </button>
      )}
      <div className="spacer" />
      <button type="button" className="icon-btn" aria-label="Help &amp; support" disabled={loading}>{Glyph.help(18)}</button>
      <button type="button" className="icon-btn" aria-label="Notifications" disabled={loading}>{Glyph.bell(18)}</button>
    </div>
  );
};

const MobileBottomBarState = ({ state }) => {
  const tabs = [
    { id: 'home', label: 'Home', icon: 'scoreboard' },
    { id: 'leagues', label: 'Leagues', icon: 'league' },
    { id: 'players', label: 'Players', icon: 'roster' },
    { id: 'games', label: 'Games', icon: 'baseball' },
    { id: 'you', label: 'You', icon: 'roster', avatar: true },
  ];
  const loading = state === 'loading';
  // With no league loaded, only Home and You stay reachable.
  const enabled = (id) => state === 'populated' || id === 'you' || (state === 'empty' && id === 'home');
  return (
    <div className="ls-mob-bottom" data-state={state} aria-busy={loading || undefined}>
      {tabs.map((t) => {
        if (loading) return (
          <div key={t.id} className="ls-mob-tab is-skeleton" aria-hidden="true"><Skel w={40} h={28} r={9999} /><Skel w={38} h={8} r={3} style={{ marginTop: 6 }} /></div>
        );
        const on = state === 'populated' ? t.id === 'home' : state === 'empty' && t.id === 'home';
        return (
          <button key={t.id} type="button" className={`ls-mob-tab ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined} disabled={!enabled(t.id)}>
            <span className="ls-mob-tab-icon">
              {t.avatar ? (
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--grad-avatar)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 9, color: '#fff' }}>MJ</span>
              ) : (
                <img src={ICON(t.icon)} width="18" height="18" alt="" />
              )}
              {state === 'populated' && t.id === 'games' && (
                <span className="tab-dot" title="Games in progress" />
              )}
            </span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
};

const PhoneMockState = ({ state, onRetry }) => (
  <div className="phone-frame" style={{ height: 640 }}>
    <IosStatusBar />
    <MobileHeaderState state={state} />
    <div className="phone-content" style={{ flex: 1 }}>
      {state === 'loading' && (
        <div className="phone-fake-content" aria-busy="true" style={{ opacity: 1 }}>
          {[0, 1, 2, 3].map((i) => <Skel key={i} h={80} r={14} />)}
        </div>
      )}
      {state === 'error' && (
        <div style={{ padding: 16 }}>
          <PanelNote kind="error" title="Unable to load your leagues" body="Check your connection and try again." actionLabel="Retry" onAction={onRetry} />
        </div>
      )}
      {state === 'empty' && (
        <div style={{ padding: 16 }}>
          <PanelNote kind="empty" icon={Glyph.trophy(20)} title="No leagues yet" body="Create or join your first league to start drafting." actionLabel="Create a League" onAction={() => {}} />
        </div>
      )}
      {state === 'populated' && (
        <div className="phone-fake-content"><div className="card" /><div className="card" /><div className="card" /><div className="card" /></div>
      )}
    </div>
    <MobileBottomBarState state={state} />
  </div>
);

Object.assign(window, {
  NAV_STATES, Skel, StateSwitch, PanelNote, TickerState,
  NavDesktopState, NotifTrayState, LeagueDropdownState,
  MobileHeaderState, MobileBottomBarState, PhoneMockState, WarnGlyph,
});
