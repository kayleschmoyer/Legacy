// LeagueDetailPage.jsx — Top-level page; uses existing LeagueHero + TabBar from LeagueHero.jsx.

const { Icons: LI } = window;

const RoleBar = ({
  role,
  setRole,
  season,
  setSeason,
  sport,
  setSportLocal,
}) => (
  <div className="role-switch-bar">
    <div className="role-switch-inner">
      <div className="brand">
        <span style={{ color: 'var(--brand-seam-red-light)' }}>●</span>
        <span>DEAD BALL ARCHIVE</span>
        <span className="sub">FANTASY</span>
      </div>
      <div className="spacer" />
      <div className="sport-switch" role="tablist" aria-label="Sport">
        <button
          className={sport === 'baseball' ? 'on' : ''}
          onClick={() => setSportLocal('baseball')}
        >
          <LI.Baseball size={12} /> Baseball
        </button>
        <button
          className={sport === 'football' ? 'on' : ''}
          onClick={() => setSportLocal('football')}
        >
          <LI.Football size={12} /> Football
        </button>
      </div>
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
          <LI.Shield size={11} />
          Commissioner
        </button>
        <button
          className={role === 'member' ? 'on' : ''}
          onClick={() => setRole('member')}
        >
          <LI.User size={11} />
          Member
        </button>
        <button
          className={role === 'spectator' ? 'on' : ''}
          onClick={() => setRole('spectator')}
        >
          <LI.Eye size={11} />
          Spectator
        </button>
      </div>
    </div>
  </div>
);

const TABS = [
  'overview',
  'matchup',
  'roster',
  'free-agents',
  'standings',
  'trades',
  'history',
  'team',
  'commish',
];

const LeagueDetailPage = () => {
  const [role, setRole] = React.useState(
    () => localStorage.getItem('ls-role') || 'member',
  );
  const [tab, setTab] = React.useState(
    () => localStorage.getItem('ls-tab') || 'overview',
  );
  const [season, setSeason] = React.useState('2026');
  const [sport, setSportState] = React.useState(
    () => localStorage.getItem('ls-sport') || 'baseball',
  );

  // Apply the sport's data bundle to window.* synchronously during render so
  // children read fresh data on first paint after a switch.
  if (window.SPORT !== sport) window.setSport(sport);

  React.useEffect(() => {
    localStorage.setItem('ls-sport', sport);
  }, [sport]);

  React.useEffect(() => localStorage.setItem('ls-role', role), [role]);
  React.useEffect(() => localStorage.setItem('ls-tab', tab), [tab]);

  const isCommish = role === 'commish';
  const isMember = role === 'member' || role === 'commish';

  React.useEffect(() => {
    if (tab === 'commish' && !isCommish) setTab('overview');
    if ((tab === 'roster' || tab === 'team' || tab === 'trades') && !isMember)
      setTab('overview');
  }, [role]);

  const league = window.LEAGUE;
  const onTeam = () => setTab('standings');

  return (
    <div>
      <RoleBar
        role={role}
        setRole={setRole}
        season={season}
        setSeason={setSeason}
        sport={sport}
        setSportLocal={setSportState}
      />
      {/* Re-mount the entire page when sport changes so all tabs read fresh window.* data */}
      <div className="ls-page" key={sport}>
        <window.LeagueHero
          league={league}
          onBack={() => {}}
          onInvite={() => {}}
          isCommissioner={isCommish}
        />
        <window.TabBar
          active={tab}
          onChange={setTab}
          isMember={isMember}
          isCommissioner={isCommish}
        />

        {tab === 'overview' && (
          <window.TabOverview
            league={league}
            isCommissioner={isCommish}
            onTab={setTab}
            onTeam={onTeam}
          />
        )}
        {tab === 'matchup' && (
          <window.TabMatchup league={league} onTeam={onTeam} />
        )}
        {tab === 'roster' && isMember && <window.TabRoster league={league} />}
        {tab === 'free-agents' && <window.TabFreeAgents isMember={isMember} />}
        {tab === 'standings' && (
          <window.TabStandings league={league} onTeam={onTeam} />
        )}
        {tab === 'trades' && <window.TabTrades isMember={isMember} />}
        {tab === 'history' && <window.TabHistory />}
        {tab === 'team' && isMember && <window.TabTeam />}
        {tab === 'commish' && isCommish && (
          <window.TabCommish league={league} />
        )}
      </div>
    </div>
  );
};

Object.assign(window, { LeagueDetailPage });
