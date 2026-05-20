// Scoreboard.jsx
const GAMES = [
  {
    status: 'live',
    inning: 7,
    half: 'Top',
    away: {
      abbr: 'NYY',
      name: 'Yankees',
      r: 4,
      h: 8,
      e: 0,
      line: [1, 0, 0, 2, 0, 0, 1],
    },
    home: {
      abbr: 'BOS',
      name: 'Red Sox',
      r: 3,
      h: 7,
      e: 1,
      line: [0, 1, 0, 0, 0, 2, 0],
    },
  },
  {
    status: 'live',
    inning: 3,
    half: 'Bot',
    away: { abbr: 'LAD', name: 'Dodgers', r: 2, h: 4, e: 0, line: [0, 1, 1] },
    home: { abbr: 'SF', name: 'Giants', r: 0, h: 2, e: 0, line: [0, 0, 0] },
  },
  {
    status: 'final',
    away: {
      abbr: 'HOU',
      name: 'Astros',
      r: 7,
      h: 12,
      e: 1,
      line: [2, 0, 3, 0, 0, 0, 1, 1, 0],
    },
    home: {
      abbr: 'SEA',
      name: 'Mariners',
      r: 2,
      h: 5,
      e: 2,
      line: [0, 0, 1, 0, 1, 0, 0, 0, 0],
    },
  },
  {
    status: 'scheduled',
    start: '7:05 PM ET',
    away: { abbr: 'ATL', name: 'Braves' },
    home: { abbr: 'NYM', name: 'Mets' },
  },
];

const Scoreboard = () => (
  <div className="ls-page">
    <div className="ls-page-head">
      <div>
        <div className="ls-eyebrow">Today · April 18, 2026</div>
        <h1 className="ls-h2">MLB Scoreboard</h1>
      </div>
      <div className="ls-date-nav">
        <button className="ls-icon-btn">‹</button>
        <span className="ls-mono">Apr 18</span>
        <button className="ls-icon-btn">›</button>
      </div>
    </div>
    <div className="ls-game-grid">
      {GAMES.map((g, i) => (
        <GameCard key={i} g={g} />
      ))}
    </div>
  </div>
);

const GameCard = ({ g }) => {
  const statusLabel =
    g.status === 'live'
      ? `${g.half} ${g.inning}`
      : g.status === 'final'
        ? 'Final'
        : g.start;
  return (
    <div className={`ls-game-card ls-game-${g.status}`}>
      <div className="ls-game-status">
        {g.status === 'live' && (
          <span
            className="ls-dot ls-pulse"
            style={{ background: 'var(--brand-seam-red)' }}
          />
        )}
        {statusLabel}
      </div>
      {['away', 'home'].map((side) => {
        const t = g[side];
        const winner =
          g.status === 'final' &&
          g.away.r !== g.home.r &&
          ((side === 'away' && g.away.r > g.home.r) ||
            (side === 'home' && g.home.r > g.away.r));
        return (
          <div key={side} className={`ls-game-team ${winner ? 'winner' : ''}`}>
            <div className="ls-game-team-l">
              <div className="ls-avatar ls-avatar-sm">{t.abbr.slice(0, 2)}</div>
              <div>
                <div className="ls-team-abbr">{t.abbr}</div>
                <div className="ls-meta">{t.name}</div>
              </div>
            </div>
            <div className="ls-game-score">
              {t.r !== undefined ? (
                <>
                  <span className="ls-score ls-score-md">{t.r}</span>
                  <span className="ls-mono ls-meta">
                    {t.h}H · {t.e}E
                  </span>
                </>
              ) : (
                <span className="ls-meta">—</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
Object.assign(window, { Scoreboard, GameCard });
