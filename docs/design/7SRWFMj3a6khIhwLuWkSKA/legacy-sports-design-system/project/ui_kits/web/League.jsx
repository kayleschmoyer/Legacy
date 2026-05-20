// League.jsx — league detail with standings + matchup
const STANDINGS = [
  {
    rank: 1,
    name: 'Bronx Bombers',
    mgr: 'Mickey J.',
    w: 8,
    l: 4,
    t: 0,
    pf: 1488,
    pa: 1301,
  },
  {
    rank: 2,
    name: 'Fenway Faithful',
    mgr: 'Sarah K.',
    w: 7,
    l: 5,
    t: 0,
    pf: 1422,
    pa: 1389,
  },
  {
    rank: 3,
    name: 'Dead Ball Legends',
    mgr: 'Tom B.',
    w: 7,
    l: 5,
    t: 0,
    pf: 1401,
    pa: 1392,
  },
  {
    rank: 4,
    name: 'Chicago Chi-Town',
    mgr: 'Rick D.',
    w: 6,
    l: 5,
    t: 1,
    pf: 1388,
    pa: 1390,
  },
  {
    rank: 5,
    name: 'St. Louis Cardinals',
    mgr: 'Jen M.',
    w: 6,
    l: 6,
    t: 0,
    pf: 1361,
    pa: 1401,
  },
  {
    rank: 6,
    name: 'Sandlot Swingers',
    mgr: 'Paul S.',
    w: 5,
    l: 7,
    t: 0,
    pf: 1342,
    pa: 1455,
  },
];

const ROSTER = [
  {
    pos: 'P',
    posClass: 'pitcher',
    name: 'Randy Johnson',
    era: '1998 · ARI',
    stat: '329 K · 2.48 ERA',
    pts: 24.5,
  },
  {
    pos: 'C',
    posClass: 'catcher',
    name: 'Johnny Bench',
    era: '1972 · CIN',
    stat: '.270 · 40 HR',
    pts: 18.2,
  },
  {
    pos: '1B',
    posClass: 'infield',
    name: 'Lou Gehrig',
    era: '1927 · NYY',
    stat: '.373 · 47 HR',
    pts: 27.8,
  },
  {
    pos: '2B',
    posClass: 'infield',
    name: 'Rogers Hornsby',
    era: '1924 · STL',
    stat: '.424 · 25 HR',
    pts: 26.1,
  },
  {
    pos: 'SS',
    posClass: 'infield',
    name: 'Honus Wagner',
    era: '1908 · PIT',
    stat: '.354 · 10 HR',
    pts: 21.4,
  },
  {
    pos: 'OF',
    posClass: 'outfield',
    name: 'Barry Bonds',
    era: '2001 · SF',
    stat: '.328 · 73 HR',
    pts: 31.2,
  },
  {
    pos: 'OF',
    posClass: 'outfield',
    name: 'Ted Williams',
    era: '1941 · BOS',
    stat: '.406 · 37 HR',
    pts: 28.9,
  },
  {
    pos: 'UTIL',
    posClass: 'utility',
    name: 'Babe Ruth',
    era: '1921 · NYY',
    stat: '.378 · 59 HR',
    pts: 30.4,
  },
];

const League = ({ league }) => {
  const [tab, setTab] = React.useState('matchup');
  return (
    <div className="ls-page">
      <div className="ls-page-head">
        <div>
          <div className="ls-eyebrow">
            League · {league?.era || '1920 – 1930'}
          </div>
          <h1 className="ls-h2">{league?.name || 'Dead Ball Dynasty'}</h1>
          <div className="ls-meta">
            Week 14 of 22 · 12 managers · Head-to-Head scoring
          </div>
        </div>
        <span className="ls-chip ls-chip-active">Active</span>
      </div>

      <div className="ls-subnav">
        {[
          ['matchup', 'Matchup'],
          ['standings', 'Standings'],
          ['roster', 'My Roster'],
          ['scoreboard', 'League Feed'],
        ].map(([id, l]) => (
          <button
            key={id}
            className={tab === id ? 'on' : ''}
            onClick={() => setTab(id)}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'matchup' && <MatchupView />}
      {tab === 'standings' && <StandingsView />}
      {tab === 'roster' && <RosterView />}
      {tab === 'scoreboard' && (
        <div className="ls-empty">League activity feed coming soon.</div>
      )}
    </div>
  );
};

const MatchupView = () => (
  <div className="ls-matchup">
    <div className="ls-matchup-head">
      <div className="ls-matchup-side">
        <div className="ls-avatar ls-avatar-lg">MJ</div>
        <div className="ls-team-abbr" style={{ fontSize: 22 }}>
          Bronx Bombers
        </div>
        <div className="ls-meta">Mickey J. · 8-4</div>
        <div className="ls-score ls-score-xl">127.5</div>
      </div>
      <div className="ls-vs">VS</div>
      <div className="ls-matchup-side">
        <div className="ls-avatar ls-avatar-lg ls-avatar-red">SK</div>
        <div className="ls-team-abbr" style={{ fontSize: 22 }}>
          Fenway Faithful
        </div>
        <div className="ls-meta">Sarah K. · 7-5</div>
        <div className="ls-score ls-score-xl ls-score-muted">112.3</div>
      </div>
    </div>
    <h3 className="ls-h4" style={{ marginTop: 32, marginBottom: 12 }}>
      Your Lineup
    </h3>
    <div className="ls-roster">
      {ROSTER.map((p, i) => (
        <PlayerRow key={i} p={p} />
      ))}
    </div>
  </div>
);

const PlayerRow = ({ p }) => (
  <div className={`ls-player-row ls-pos-${p.posClass}`}>
    <div className="ls-player-l">
      <div className="ls-avatar ls-avatar-md">
        {p.name
          .split(' ')
          .map((s) => s[0])
          .join('')
          .slice(0, 2)}
      </div>
      <div>
        <div className="ls-player-name">
          <span className={`ls-pchip ls-pchip-${p.posClass}`}>{p.pos}</span>
          {p.name}
        </div>
        <div className="ls-meta ls-mono">
          {p.era} · {p.stat}
        </div>
      </div>
    </div>
    <div className="ls-score ls-score-sm">{p.pts.toFixed(1)}</div>
  </div>
);

const StandingsView = () => (
  <table className="ls-table">
    <thead>
      <tr>
        <th>#</th>
        <th>Team</th>
        <th>Manager</th>
        <th>W</th>
        <th>L</th>
        <th>T</th>
        <th>PF</th>
        <th>PA</th>
      </tr>
    </thead>
    <tbody>
      {STANDINGS.map((t) => (
        <tr key={t.rank} className={t.rank === 1 ? 'ls-row-champ' : ''}>
          <td>
            {t.rank === 1 && (
              <img
                src="../../icons/brand/trophy.svg"
                width="18"
                height="18"
                style={{ verticalAlign: 'middle', marginRight: 4 }}
              />
            )}
            {t.rank}
          </td>
          <td className="ls-strong">{t.name}</td>
          <td className="ls-meta">{t.mgr}</td>
          <td className="ls-mono">{t.w}</td>
          <td className="ls-mono">{t.l}</td>
          <td className="ls-mono">{t.t}</td>
          <td className="ls-mono">{t.pf.toLocaleString()}</td>
          <td className="ls-mono ls-meta">{t.pa.toLocaleString()}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const RosterView = () => (
  <div className="ls-roster">
    {ROSTER.map((p, i) => (
      <PlayerRow key={i} p={p} />
    ))}
  </div>
);

Object.assign(window, {
  League,
  MatchupView,
  PlayerRow,
  StandingsView,
  RosterView,
});
