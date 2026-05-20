// SeasonDraftCreate.jsx — create new game form
const HITTER_STATS = [
  { k: 'hr', label: 'HR', name: 'Home Runs' },
  { k: 'h', label: 'H', name: 'Hits' },
  { k: 'rbi', label: 'RBI', name: 'Runs Batted In' },
  { k: 'sb', label: 'SB', name: 'Stolen Bases' },
  { k: 'r', label: 'R', name: 'Runs Scored' },
  { k: 'doubles', label: '2B', name: 'Doubles' },
  { k: 'triples', label: '3B', name: 'Triples' },
  { k: 'bb', label: 'BB', name: 'Walks' },
  { k: 'tb', label: 'TB', name: 'Total Bases' },
];
const PITCHER_STATS = [
  { k: 'w', label: 'W', name: 'Wins' },
  { k: 'so', label: 'SO', name: 'Strikeouts' },
  { k: 'sv', label: 'SV', name: 'Saves' },
  { k: 'sho', label: 'SHO', name: 'Shutouts' },
  { k: 'cg', label: 'CG', name: 'Complete Games' },
];

const SeasonDraftCreate = ({ onBack, onCreated }) => {
  const [name, setName] = React.useState('');
  const [playerType, setPlayerType] = React.useState('Hitter');
  const [gameMode, setGameMode] = React.useState('Season');
  const [statKey, setStatKey] = React.useState('hr');
  const [submitting, setSubmitting] = React.useState(false);
  const stats = playerType === 'Hitter' ? HITTER_STATS : PITCHER_STATS;
  const current = stats.find((s) => s.k === statKey) || stats[0];

  const setType = (t) => {
    setPlayerType(t);
    setStatKey(t === 'Hitter' ? 'hr' : 'w');
  };

  const submit = () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      onCreated?.();
    }, 650);
  };

  return (
    <div className="sdc">
      <button className="back-btn" onClick={onBack}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M15 18l-6-6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back to Lobby
      </button>

      <div className="sdc-shell">
        <aside className="sdc-preview">
          <div className="eyebrow" style={{ color: 'var(--brand-gold-light)' }}>
            Live Preview
          </div>
          <div className="sdc-prev-card">
            <div className="sdc-prev-name">
              {name.trim() || 'Untitled Game'}
            </div>
            <div className="sdc-prev-stat-row">
              <div className="sdc-prev-stat">
                <div className="sdc-prev-stat-k">{current.label}</div>
                <div className="sdc-prev-stat-n">{current.name}</div>
              </div>
            </div>
            <div className="sdc-prev-meta">
              <div>
                <span className="label">Pool</span>
                <b>{playerType}s</b>
              </div>
              <div>
                <span className="label">Mode</span>
                <b>{gameMode}</b>
              </div>
              <div>
                <span className="label">Seats</span>
                <b>Up to 6</b>
              </div>
            </div>
            <div className="sdc-prev-illus" aria-hidden="true">
              <img src="../icons/draft.svg" width="64" height="64" alt="" />
            </div>
          </div>
          <p className="sdc-prev-note">
            Once you create, you'll get an invite link. Share it with up to five
            others — draft starts when everyone's in and you hit Go.
          </p>
        </aside>

        <section className="sdc-form card">
          <div className="eyebrow">New Game · Settings</div>
          <h1>Build a draft.</h1>
          <p className="sdc-form-sub">
            Pick a pool, pick a stat, name it. You can tune everything else once
            players join.
          </p>

          <div className="sdc-field">
            <label className="label" htmlFor="gname">
              Game Name <span className="sdc-req">Required</span>
            </label>
            <input
              id="gname"
              className="input"
              placeholder="e.g., HR Challenge 2025"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="sdc-row">
            <div className="sdc-field">
              <div className="label">Player Pool</div>
              <div className="toggle-group">
                <button
                  className={playerType === 'Hitter' ? 'on' : ''}
                  onClick={() => setType('Hitter')}
                >
                  Hitters
                </button>
                <button
                  className={playerType === 'Pitcher' ? 'on' : ''}
                  onClick={() => setType('Pitcher')}
                >
                  Pitchers
                </button>
              </div>
              <div className="sdc-helper">
                Drafted players come from this pool only.
              </div>
            </div>

            <div className="sdc-field">
              <div className="label">Game Mode</div>
              <div className="toggle-group">
                <button
                  className={gameMode === 'Season' ? 'on' : ''}
                  onClick={() => setGameMode('Season')}
                >
                  Season
                </button>
                <button
                  className={gameMode === 'Career w/ Team' ? 'on' : ''}
                  onClick={() => setGameMode('Career w/ Team')}
                >
                  Career w/ Team
                </button>
              </div>
              <div className="sdc-helper">
                {gameMode === 'Season'
                  ? 'Pick a specific year. Stats from that one season count.'
                  : 'Pick a team. Career totals while on that team count.'}
              </div>
            </div>
          </div>

          <div className="sdc-field">
            <div className="label">Stat Being Drafted</div>
            <div className="stat-picker">
              {stats.map((s) => (
                <button
                  key={s.k}
                  className={statKey === s.k ? 'on' : ''}
                  onClick={() => setStatKey(s.k)}
                  title={s.name}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="sdc-helper">
              {current.name} — the stat you'll compete on.
            </div>
          </div>

          <div className="sdc-actions">
            <button className="btn btn-ghost" onClick={onBack}>
              Cancel
            </button>
            <button
              className="btn btn-gold btn-lg"
              disabled={!name.trim() || submitting}
              onClick={submit}
            >
              {submitting ? 'Creating…' : 'Create Game →'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

Object.assign(window, { SeasonDraftCreate });
