// NavPopovers.jsx — notif tray, profile menu, league dropdown, search results, command palette

const NotifTray = () => {
  const items = [
    {
      unread: true,
      kind: 'red',
      icon: 'live',
      t: (
        <>
          <em>Draft is live</em> in Legends of Summer. You're on the clock in 2
          picks.
        </>
      ),
      ts: '2m ago · Draft',
    },
    {
      unread: true,
      kind: 'gold',
      icon: 'trophy',
      t: (
        <>
          Your team <em>Brooklyn Bombers</em> clinched a playoff spot.
        </>
      ),
      ts: '14m ago · Standings',
    },
    {
      unread: true,
      kind: '',
      icon: 'matchup',
      t: (
        <>
          Ken Griffey Jr. hit a 3-run home run — <em>+14.5 pts</em>.
        </>
      ),
      ts: '38m ago · Scoring',
    },
    {
      unread: false,
      kind: '',
      icon: 'commissioner',
      t: (
        <>
          Waiver claim accepted: <em>Tom Seaver (1969)</em> → pitching rotation.
        </>
      ),
      ts: 'Yesterday',
    },
    {
      unread: false,
      kind: '',
      icon: 'standings',
      t: <>Weekly recap posted for Week 13. Scoring summary ready.</>,
      ts: 'Yesterday',
    },
  ];
  return (
    <div
      className="ls-dropdown ls-notif-tray"
      style={{ right: 0, top: 'calc(100% + 8px)' }}
    >
      <div className="ls-dropdown-head">
        <span className="eyebrow">Notifications · 3 New</span>
        <button className="ls-link" style={{ fontSize: 12 }}>
          Mark all read
        </button>
      </div>
      {items.map((it, i) => (
        <div key={i} className={`ls-notif-row ${it.unread ? 'unread' : ''}`}>
          <div className={`ls-notif-icon ${it.kind}`}>
            <img src={ICON(it.icon)} width="18" height="18" alt="" />
          </div>
          <div className="ls-notif-body">
            <div className="t">{it.t}</div>
            <div className="ts">{it.ts}</div>
          </div>
        </div>
      ))}
      <div
        style={{
          padding: '10px 12px 6px',
          borderTop: '1px solid var(--outline-subtle)',
          marginTop: 6,
        }}
      >
        <button
          className="ls-link"
          style={{
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          View all activity {Glyph.chevronRight(12)}
        </button>
      </div>
    </div>
  );
};

const ProfileMenu = () => (
  <div
    className="ls-dropdown ls-profile-menu"
    style={{ right: 0, top: 'calc(100% + 8px)' }}
  >
    <div className="ls-profile-head">
      <div className="avatar-lg">MJ</div>
      <div style={{ minWidth: 0 }}>
        <div className="name">Miguel Jennings</div>
        <div className="sub">commissioner · 3 leagues</div>
      </div>
    </div>
    <div className="ls-menu-list">
      <button className="ls-menu-item">{Glyph.user(16)} My Profile</button>
      <button className="ls-menu-item">
        {Glyph.roster(16)} My Teams <span className="badge">3</span>
      </button>
      <button className="ls-menu-item">{Glyph.trophy(16)} Trophy Case</button>
      <div className="ls-menu-divider" />
      <button className="ls-menu-item">{Glyph.settings(16)} Settings</button>
      <div className="ls-menu-divider" />
      <button className="ls-menu-item">{Glyph.logout(16)} Sign out</button>
    </div>
  </div>
);

const LeagueDropdown = () => {
  const [sport, setSport] = React.useState('baseball');
  const all = [
    {
      initials: 'LS',
      name: 'Legends of Summer',
      meta: ['12 teams', 'Week 14 / 22'],
      sport: 'baseball',
      current: true,
    },
    {
      initials: 'DE',
      name: 'Dead-Ball Era Club',
      meta: ['10 teams', 'Draft: Fri'],
      sport: 'baseball',
      current: false,
    },
    {
      initials: 'HR',
      name: 'Home Run Heroes',
      meta: ['8 teams', 'Pre-season'],
      sport: 'baseball',
      current: false,
    },
    {
      initials: 'IP',
      name: 'Iron Pigskin',
      meta: ['14 teams', 'Week 5 / 17'],
      sport: 'football',
      current: false,
    },
    {
      initials: 'FF',
      name: 'Fourth & Forever',
      meta: ['10 teams', 'Preseason'],
      sport: 'football',
      current: false,
    },
  ];
  const leagues = all.filter((l) => l.sport === sport);
  return (
    <div
      className="ls-dropdown ls-league-dropdown"
      style={{ left: 0, top: 'calc(100% + 8px)', padding: 6, width: 340 }}
    >
      {/* Sport segmented control */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 6px 10px 6px' }}>
        {[
          {
            id: 'baseball',
            label: 'Baseball',
            count: all.filter((l) => l.sport === 'baseball').length,
          },
          {
            id: 'football',
            label: 'Football',
            count: all.filter((l) => l.sport === 'football').length,
          },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => setSport(s.id)}
            className="ls-sport-pill"
            data-active={sport === s.id}
          >
            <img src={ICON(s.id)} width="14" height="14" alt="" />
            <span>{s.label}</span>
            <span className="count">{s.count}</span>
          </button>
        ))}
      </div>
      <div className="ls-dropdown-group">Your leagues · {leagues.length}</div>
      {leagues.map((l, i) => (
        <div key={i} className={`ls-league-row ${l.current ? 'current' : ''}`}>
          <span className="crest-lg">{l.initials}</span>
          <div style={{ minWidth: 0 }}>
            <div className="name">{l.name}</div>
            <div className="meta">
              {l.meta.map((m, j) => (
                <React.Fragment key={j}>
                  {j > 0 && <span>·</span>}
                  <span>{m}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
          {l.current && <span className="check">{Glyph.check(16)}</span>}
        </div>
      ))}
      <div className="ls-menu-divider" />
      <div className="ls-dropdown-group">Find a league</div>
      <button className="ls-menu-item">
        {Glyph.compass(14)}
        <span style={{ flex: 1, textAlign: 'left' }}>
          Browse public leagues
        </span>
        <span className="ls-menu-hint">Open lobby</span>
      </button>
      <button className="ls-menu-item">
        {Glyph.ticket(14)}
        <span style={{ flex: 1, textAlign: 'left' }}>
          Join with invite code
        </span>
      </button>
      <button
        className="ls-menu-item"
        style={{ color: 'var(--brand-gold-light)' }}
      >
        {Glyph.plus(14)}
        <span style={{ flex: 1, textAlign: 'left' }}>Create a new league</span>
      </button>
    </div>
  );
};

const SearchResults = () => (
  <div
    className="ls-dropdown"
    style={{ left: 0, right: 0, top: 'calc(100% + 8px)', width: 380 }}
  >
    <div className="ls-dropdown-group">Players</div>
    <div className="ls-dropdown-row active">
      <span className="avatar red">BR</span>
      <div>
        <div className="title">
          Babe Ruth{' '}
          <span style={{ color: 'var(--fg3)', fontWeight: 400, fontSize: 12 }}>
            1927 NYY
          </span>
        </div>
        <div className="meta">
          <span>OF</span>
          <span className="sep">·</span>
          <span>.356 BA · 60 HR</span>
        </div>
      </div>
      <span className="trailing">Free Agent</span>
    </div>
    <div className="ls-dropdown-row">
      <span className="avatar">BO</span>
      <div>
        <div className="title">
          Barry Bonds{' '}
          <span style={{ color: 'var(--fg3)', fontWeight: 400, fontSize: 12 }}>
            2001 SF
          </span>
        </div>
        <div className="meta">
          <span>OF</span>
          <span className="sep">·</span>
          <span>.328 · 73 HR</span>
        </div>
      </div>
      <span className="trailing">Rostered</span>
    </div>
    <div className="ls-dropdown-group">Leagues</div>
    <div className="ls-dropdown-row">
      <span className="avatar gold">LS</span>
      <div>
        <div className="title">Legends of Summer</div>
        <div className="meta">
          <span>12 teams</span>
          <span className="sep">·</span>
          <span>Week 14 / 22</span>
        </div>
      </div>
    </div>
    <div className="ls-dropdown-group">Quick actions</div>
    <div className="ls-dropdown-row">
      <span
        className="avatar"
        style={{
          background: 'rgba(197,165,90,0.15)',
          borderColor: 'rgba(197,165,90,0.35)',
          color: 'var(--brand-gold-light)',
        }}
      >
        ⌘
      </span>
      <div>
        <div className="title">Open command palette</div>
        <div className="meta">Press ⌘K anywhere</div>
      </div>
    </div>
  </div>
);

const HelpMenu = () => (
  <div
    className="ls-dropdown"
    style={{ right: 0, top: 'calc(100% + 8px)', width: 280, padding: 6 }}
  >
    <div className="ls-dropdown-group">Help & Support</div>
    <div className="ls-menu-list">
      <button className="ls-menu-item">
        {Glyph.help(16)} League Rules & FAQ
      </button>
      <button className="ls-menu-item">{Glyph.bug(16)} Report a bug</button>
      <button className="ls-menu-item">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Contact support
      </button>
      <div className="ls-menu-divider" />
      <button
        className="ls-menu-item"
        style={{ justifyContent: 'space-between' }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10" />
          </svg>
          Keyboard shortcuts
        </span>
        <span style={{ display: 'inline-flex', gap: 3 }}>
          <span className="kbd">⌘</span>
          <span className="kbd">/</span>
        </span>
      </button>
      <button className="ls-menu-item">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" />
        </svg>
        What's new
        <span
          className="badge"
          style={{
            marginLeft: 'auto',
            background: 'var(--brand-seam-red)',
            color: '#fff',
          }}
        >
          3
        </span>
      </button>
    </div>
    <div
      className="ls-dropdown-foot"
      style={{
        padding: '10px 12px',
        fontSize: 11,
        color: 'var(--fg3)',
        borderTop: '1px solid var(--outline-subtle)',
        marginTop: 4,
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      <span>v4.12 · Season 2026</span>
      <a style={{ color: 'var(--brand-gold-light)', cursor: 'pointer' }}>
        Changelog
      </a>
    </div>
  </div>
);

const CommandPalette = () => (
  <div className="ls-palette">
    <div className="ls-palette-input">
      {Glyph.search(18)}
      <input
        placeholder="Search players, teams, commands…"
        defaultValue="babe r"
        autoFocus
        readOnly
      />
      <span className="kbd">ESC</span>
    </div>
    <div className="ls-palette-body">
      <div className="ls-dropdown-group" style={{ padding: '10px 10px 4px' }}>
        Players · Historical
      </div>
      <div className="ls-dropdown-row active">
        <span className="avatar red">BR</span>
        <div>
          <div className="title">
            Babe Ruth{' '}
            <span
              style={{ color: 'var(--fg3)', fontWeight: 400, fontSize: 12 }}
            >
              1927 · NYY
            </span>
          </div>
          <div className="meta">
            <span>OF</span>
            <span className="sep">·</span>
            <span>.356 BA · 60 HR · 164 RBI</span>
          </div>
        </div>
        <span className="trailing">Draft →</span>
      </div>
      <div className="ls-dropdown-row">
        <span className="avatar red">BR</span>
        <div>
          <div className="title">
            Babe Ruth{' '}
            <span
              style={{ color: 'var(--fg3)', fontWeight: 400, fontSize: 12 }}
            >
              1921 · NYY
            </span>
          </div>
          <div className="meta">
            <span>OF</span>
            <span className="sep">·</span>
            <span>.378 · 59 HR · 168 RBI</span>
          </div>
        </div>
        <span className="trailing">Draft →</span>
      </div>
      <div className="ls-dropdown-group" style={{ padding: '10px 10px 4px' }}>
        Teams
      </div>
      <div className="ls-dropdown-row">
        <span className="avatar">BB</span>
        <div>
          <div className="title">Brooklyn Bombers</div>
          <div className="meta">
            <span>Legends of Summer</span>
            <span className="sep">·</span>
            <span>8–4, 2nd</span>
          </div>
        </div>
      </div>
      <div className="ls-dropdown-group" style={{ padding: '10px 10px 4px' }}>
        Commands
      </div>
      <div className="ls-dropdown-row">
        <span className="avatar" style={{ background: 'rgba(27,58,92,0.5)' }}>
          {Glyph.plus(14)}
        </span>
        <div>
          <div className="title">Create new league</div>
          <div className="meta">Opens the league wizard</div>
        </div>
        <span className="trailing">⌘ N</span>
      </div>
    </div>
    <div className="ls-palette-foot">
      <span>
        <span className="kbd">↵</span>Open
      </span>
      <span>
        <span className="kbd">↑↓</span>Navigate
      </span>
      <span style={{ marginLeft: 'auto' }}>
        Powered by{' '}
        <span style={{ color: 'var(--brand-gold-light)' }}>Legacy Search</span>
      </span>
    </div>
  </div>
);

Object.assign(window, {
  NotifTray,
  ProfileMenu,
  LeagueDropdown,
  SearchResults,
  CommandPalette,
  HelpMenu,
});
