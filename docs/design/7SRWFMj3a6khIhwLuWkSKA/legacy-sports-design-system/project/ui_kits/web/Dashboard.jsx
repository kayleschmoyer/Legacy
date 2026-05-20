// Dashboard.jsx — post-login home
const LEAGUES = [
  {
    id: 1,
    name: 'Dead Ball Dynasty',
    era: '1920 – 1930',
    week: 14,
    total: 22,
    teams: 12,
    rank: 1,
    rec: '8-4',
    pts: 127.5,
    opp: 'BOS',
    oppPts: 112.3,
    status: 'live',
  },
  {
    id: 2,
    name: 'Steroid Era Showdown',
    era: '1994 – 2004',
    week: 9,
    total: 18,
    teams: 10,
    rank: 3,
    rec: '5-3-1',
    pts: 98.2,
    opp: 'LAD',
    oppPts: 104.7,
    status: 'active',
  },
  {
    id: 3,
    name: 'Modern Metrics',
    era: '2015 – Present',
    week: 0,
    total: 22,
    teams: 12,
    rank: null,
    rec: '—',
    pts: 0,
    opp: null,
    oppPts: 0,
    status: 'pre',
  },
];

const Dashboard = ({ onOpenLeague }) => (
  <div className="ls-page">
    <div className="ls-page-head">
      <div>
        <div className="ls-eyebrow">Welcome back</div>
        <h1 className="ls-h2">Welcome, Mickey</h1>
      </div>
      <button className="ls-btn ls-btn-primary">+ New League</button>
    </div>

    <div className="ls-league-grid">
      {LEAGUES.map((lg) => (
        <div
          key={lg.id}
          className="ls-league-card"
          onClick={() => onOpenLeague(lg)}
        >
          <div className="ls-league-head">
            <div>
              <h3 className="ls-h4">{lg.name}</h3>
              <div className="ls-meta">
                {lg.era} · {lg.teams} teams
              </div>
            </div>
            <StatusChip status={lg.status} />
          </div>
          {lg.status === 'pre' ? (
            <div className="ls-pre-draft">
              <img src="../../icons/brand/draft.svg" width="32" height="32" />
              <div>
                <div className="ls-strong">Draft starts Fri · 8:00 PM</div>
                <div className="ls-meta">7 of 12 managers ready</div>
              </div>
            </div>
          ) : (
            <>
              <div className="ls-score-row">
                <div className="ls-score-team">
                  <div className="ls-avatar ls-avatar-sm">
                    {lg.rec.split('-')[0]}
                  </div>
                  <div>
                    <div className="ls-team-abbr">Your Team</div>
                    <div className="ls-meta">
                      {lg.rec} · Rank #{lg.rank}
                    </div>
                  </div>
                </div>
                <div className="ls-score">{lg.pts.toFixed(1)}</div>
              </div>
              <div className="ls-score-row">
                <div className="ls-score-team">
                  <div className="ls-avatar ls-avatar-sm ls-avatar-red">
                    {lg.opp}
                  </div>
                  <div>
                    <div className="ls-team-abbr">
                      {lg.opp === 'BOS' ? 'Red Sox' : 'Dodgers'}
                    </div>
                    <div className="ls-meta">
                      Week {lg.week}/{lg.total}
                    </div>
                  </div>
                </div>
                <div className="ls-score ls-score-muted">
                  {lg.oppPts.toFixed(1)}
                </div>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  </div>
);

const StatusChip = ({ status }) => {
  const map = {
    live: { label: 'Draft Live', cls: 'ls-chip-live', pulse: true },
    active: { label: 'Active', cls: 'ls-chip-active' },
    pre: { label: 'Pre-Draft', cls: 'ls-chip-pre' },
  }[status];
  return (
    <span className={`ls-chip ${map.cls}`}>
      {map.pulse && <span className="ls-dot ls-pulse" />}
      {map.label}
    </span>
  );
};
Object.assign(window, { Dashboard, StatusChip });
