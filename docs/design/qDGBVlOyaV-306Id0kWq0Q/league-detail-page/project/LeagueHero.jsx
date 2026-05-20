// LeagueHero.jsx — Top hero/header + tab bar used across all tabs.

const { Icons: I } = window;

const DraftStatusChip = ({ status }) => {
  const map = {
    'pre-draft': { cls: 'ls-chip-pre', label: 'Pre-Draft' },
    queued: { cls: 'ls-chip-queued', label: 'Draft Queued' },
    drafting: { cls: 'ls-chip-drafting', label: 'Drafting · Live' },
    active: { cls: 'ls-chip-active', label: 'Season Active' },
  }[status] || { cls: 'ls-chip-final', label: status };
  return (
    <span className={`ls-chip ${map.cls}`}>
      {status === 'drafting' && <span className="ls-dot ls-pulse" />}
      {status === 'active' && <span className="ls-dot" />}
      {map.label}
    </span>
  );
};

const LeagueHero = ({ league, onBack, onInvite, isCommissioner }) => {
  const sc = window.SPORT_CONFIG || {
    eyebrowSport: 'Baseball',
    crestIcon: 'Baseball',
  };
  const CrestIcon = I[sc.crestIcon] || I.Shield;
  const isFootball = sc.sport === 'football';
  return (
    <div className="ls-hero" data-screen-label="league-hero">
      <div className="ls-hero-top">
        <button className="ls-backlink" onClick={onBack}>
          <I.ChevronLeft size={14} /> Leagues
        </button>
        <span className="meta" style={{ color: 'var(--fg4)' }}>
          ·
        </span>
        <span
          className="eyebrow"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <CrestIcon size={12} /> {sc.eyebrowSport} · {league.scoring}
        </span>
        {isCommissioner && (
          <span
            className="ls-chip ls-chip-commish"
            style={{ marginLeft: 'auto' }}
          >
            <I.Crown size={12} /> Commissioner
          </span>
        )}
      </div>
      <div className="ls-hero-main">
        <div className={`ls-hero-crest ${isFootball ? 'football' : ''}`}>
          <CrestIcon size={48} style={{ color: 'var(--brand-gold-light)' }} />
        </div>
        <div className="ls-hero-body">
          <h1>{league.name}</h1>
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <DraftStatusChip status={league.draftStatus} />
            <span className="meta">{league.era}</span>
          </div>
          <div className="ls-hero-meta">
            <div className="ls-hero-metaitem">
              <div className="label">Week</div>
              <div className="value mono">
                {league.currentWeek}{' '}
                <span style={{ color: 'var(--fg3)', fontWeight: 400 }}>
                  / {league.totalMatchups}
                </span>
              </div>
            </div>
            <div className="ls-hero-metaitem">
              <div className="label">Teams</div>
              <div className="value mono">{league.teamCount}</div>
            </div>
            <div className="ls-hero-metaitem">
              <div className="label">Scoring</div>
              <div className="value">{league.scoring}</div>
            </div>
            <div className="ls-hero-metaitem">
              <div className="label">Invite</div>
              <div
                className="value mono"
                style={{ color: 'var(--brand-gold-light)' }}
              >
                {league.inviteCode}
              </div>
            </div>
          </div>
        </div>
        <div className="ls-hero-actions">
          <button className="ls-btn ls-btn-gold" onClick={onInvite}>
            <I.Share size={14} /> Invite
          </button>
        </div>
      </div>
    </div>
  );
};

const TAB_DEFS = [
  { id: 'overview', label: 'Overview', icon: 'scoreboard' },
  { id: 'matchup', label: 'Matchup', icon: 'matchup' },
  { id: 'roster', label: 'My Roster', icon: 'roster', memberOnly: true },
  { id: 'free-agents', label: 'Free Agents', icon: 'stats' },
  { id: 'standings', label: 'Standings', icon: 'standings' },
  { id: 'trades', label: 'Trades' },
  { id: 'history', label: 'History' },
  { id: 'team', label: 'My Team', memberOnly: true },
  { id: 'commish', label: 'Commissioner', commishOnly: true },
];

const TabBar = ({ active, onChange, isMember, isCommissioner }) => {
  const visible = TAB_DEFS.filter(
    (t) => (!t.memberOnly || isMember) && (!t.commishOnly || isCommissioner),
  );
  return (
    <nav className="ls-tabbar" role="tablist">
      <div className="ls-tabbar-inner">
        {visible.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            className={active === t.id ? 'on' : ''}
            onClick={() => onChange(t.id)}
          >
            {t.label}
            {t.id === 'trades' && <span className="count">2</span>}
          </button>
        ))}
      </div>
    </nav>
  );
};

Object.assign(window, { LeagueHero, TabBar, DraftStatusChip });
