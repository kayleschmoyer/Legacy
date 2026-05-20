// Draft.jsx — live draft board
const DRAFT_PICKS = [
  [1, 1, 'Babe Ruth', 'OF', '1921 · NYY', 'Bronx Bombers'],
  [1, 2, 'Willie Mays', 'OF', '1965 · SF', 'Fenway Faithful'],
  [1, 3, 'Ted Williams', 'OF', '1941 · BOS', 'Dead Ball Legends'],
  [1, 4, 'Hank Aaron', 'OF', '1971 · ATL', 'Chicago Chi-Town'],
  [1, 5, 'Mickey Mantle', 'OF', '1956 · NYY', 'St. Louis Cardinals'],
  [1, 6, 'Lou Gehrig', '1B', '1927 · NYY', 'Sandlot Swingers'],
  [2, 7, 'Rogers Hornsby', '2B', '1924 · STL', 'Sandlot Swingers'],
  [2, 8, 'Honus Wagner', 'SS', '1908 · PIT', 'St. Louis Cardinals'],
  [2, 9, 'Randy Johnson', 'P', '1998 · ARI', 'Chicago Chi-Town'],
  [2, 10, 'Sandy Koufax', 'P', '1965 · LAD', 'Dead Ball Legends'],
];

const AVAILABLE = [
  {
    pos: 'P',
    posClass: 'pitcher',
    name: 'Pedro Martinez',
    era: '1999 · BOS',
    stat: '313 K · 2.07 ERA',
    adp: 14,
  },
  {
    pos: 'P',
    posClass: 'pitcher',
    name: 'Greg Maddux',
    era: '1995 · ATL',
    stat: '181 K · 1.63 ERA',
    adp: 15,
  },
  {
    pos: 'C',
    posClass: 'catcher',
    name: 'Johnny Bench',
    era: '1972 · CIN',
    stat: '.270 · 40 HR',
    adp: 16,
  },
  {
    pos: '1B',
    posClass: 'infield',
    name: 'Jimmie Foxx',
    era: '1932 · PHI',
    stat: '.364 · 58 HR',
    adp: 17,
  },
  {
    pos: 'SS',
    posClass: 'infield',
    name: 'Cal Ripken Jr.',
    era: '1991 · BAL',
    stat: '.323 · 34 HR',
    adp: 18,
  },
];

const DraftBoard = () => (
  <div className="ls-page ls-draft-page">
    <div className="ls-page-head">
      <div>
        <div className="ls-eyebrow">
          <span
            className="ls-dot ls-pulse"
            style={{ background: 'var(--brand-seam-red)', marginRight: 6 }}
          />
          Draft Live · On the Clock
        </div>
        <h1 className="ls-h2">Dead Ball Dynasty · Draft</h1>
        <div className="ls-meta">
          Round 2 · Pick 11 of 12 · Fenway Faithful up next
        </div>
      </div>
      <div className="ls-clock">
        <div
          className="ls-score ls-score-xl"
          style={{ color: 'var(--brand-seam-red-light)' }}
        >
          0:47
        </div>
        <div className="ls-eyebrow">Time remaining</div>
      </div>
    </div>

    <div className="ls-draft-grid">
      <div className="ls-draft-left">
        <h3 className="ls-h4">Available · Best by ADP</h3>
        <div className="ls-roster" style={{ marginTop: 10 }}>
          {AVAILABLE.map((p, i) => (
            <div key={i} className={`ls-player-row ls-pos-${p.posClass}`}>
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
                    <span className={`ls-pchip ls-pchip-${p.posClass}`}>
                      {p.pos}
                    </span>
                    {p.name}
                  </div>
                  <div className="ls-meta ls-mono">
                    {p.era} · {p.stat}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="ls-meta ls-mono">ADP {p.adp}</div>
                <button
                  className="ls-btn ls-btn-primary"
                  style={{ padding: '8px 14px', fontSize: 12 }}
                >
                  Draft
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ls-draft-right">
        <h3 className="ls-h4">Recent Picks</h3>
        <div className="ls-pick-list">
          {DRAFT_PICKS.slice()
            .reverse()
            .map(([r, p, name, pos, era, team]) => (
              <div key={`${r}-${p}`} className="ls-pick">
                <div className="ls-pick-num">
                  {r}.{String(p).padStart(2, '0')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ls-strong" style={{ fontSize: 13 }}>
                    {name}{' '}
                    <span className="ls-meta" style={{ fontWeight: 400 }}>
                      · {pos}
                    </span>
                  </div>
                  <div className="ls-meta ls-mono" style={{ fontSize: 11 }}>
                    {era} → {team}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  </div>
);
Object.assign(window, { DraftBoard });
