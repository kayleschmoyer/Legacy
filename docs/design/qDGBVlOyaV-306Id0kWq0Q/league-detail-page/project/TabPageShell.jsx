// TabPageShell.jsx — Shared chrome (RoleBar + LeagueHero + TabBar) for the per-tab pages.
// Each tab page renders <TabPageShell activeTab="..."><MyTabComponent .../></TabPageShell>.
// Tab clicks navigate to the sibling HTML file for that tab.

const { Icons: SI } = window;

// Tab id -> HTML page filename. Keep in sync with the files in the project root.
const TAB_PAGES = {
  overview: 'Tab Overview.html',
  matchup: 'Tab Matchup.html',
  roster: 'Tab Roster.html',
  'free-agents': 'Tab Free Agents.html',
  standings: 'Tab Standings.html',
  trades: 'Tab Trades.html',
  history: 'Tab History.html',
  team: 'Tab Team.html',
  commish: 'Tab Commish.html',
};

const navigateToTab = (id) => {
  const page = TAB_PAGES[id];
  if (page) window.location.href = page;
};

const RoleBarShell = ({ role, setRole, season, setSeason }) => (
  <div className="role-switch-bar">
    <div className="role-switch-inner">
      <div className="brand">
        <span style={{ color: 'var(--brand-seam-red-light)' }}>●</span>
        <span>DEAD BALL ARCHIVE</span>
        <span className="sub">FANTASY</span>
      </div>
      <div className="spacer" />
      <select
        className="season-select"
        value={season}
        onChange={(e) => setSeason(e.target.value)}
      >
        <option value="2026">Season 2026 · Active</option>
        <option value="2025">Season 2025 · Final</option>
        <option value="2024">Season 2024 · Final</option>
      </select>
      <div className="role-switch">
        <button
          className={role === 'commish' ? 'on' : ''}
          onClick={() => setRole('commish')}
        >
          <SI.Shield size={11} />
          Commissioner
        </button>
        <button
          className={role === 'member' ? 'on' : ''}
          onClick={() => setRole('member')}
        >
          <SI.User size={11} />
          Member
        </button>
        <button
          className={role === 'spectator' ? 'on' : ''}
          onClick={() => setRole('spectator')}
        >
          <SI.Eye size={11} />
          Spectator
        </button>
      </div>
    </div>
  </div>
);

const TabPageShell = ({ activeTab, children }) => {
  const [role, setRole] = React.useState(
    () => localStorage.getItem('ls-role') || 'member',
  );
  const [season, setSeason] = React.useState('2026');

  React.useEffect(() => localStorage.setItem('ls-role', role), [role]);
  React.useEffect(() => localStorage.setItem('ls-tab', activeTab), [activeTab]);

  const isCommish = role === 'commish';
  const isMember = role === 'member' || role === 'commish';
  const league = window.LEAGUE;

  return (
    <div>
      <RoleBarShell
        role={role}
        setRole={setRole}
        season={season}
        setSeason={setSeason}
      />
      <div className="ls-page" data-screen-label={`tab-${activeTab}`}>
        <window.LeagueHero
          league={league}
          onBack={() => {}}
          onInvite={() => {}}
          isCommissioner={isCommish}
        />
        <window.TabBar
          active={activeTab}
          onChange={navigateToTab}
          isMember={isMember}
          isCommissioner={isCommish}
        />
        {typeof children === 'function'
          ? children({
              league,
              isCommish,
              isMember,
              onTab: navigateToTab,
              onTeam: () => navigateToTab('standings'),
            })
          : children}
      </div>
    </div>
  );
};

Object.assign(window, { TabPageShell, navigateToTab, TAB_PAGES });
