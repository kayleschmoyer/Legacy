// SeasonDraftGame.jsx — active draft interface
const ROSTER_SLOTS_HITTER = [
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'LF',
  'CF',
  'RF',
  'DH',
];
const ROSTER_SLOTS_PITCHER = ['SP1', 'SP2', 'SP3', 'RP1', 'RP2'];

const INITIAL_STATE = {
  name: 'Dead Ball HR Chase',
  statKey: 'HR',
  statLabel: 'Home Runs',
  playerType: 'Hitter',
  gameMode: 'Season',
  phase: 'drafting', // setup | drafting | completed
  turnIdx: 1, // players[1] is active
  pick: 8,
  totalPicks: 36,
  players: [
    {
      name: 'Marcus',
      score: 168,
      picks: [
        { p: 'Babe Ruth', s: 1927, pos: 'RF', val: 60 },
        { p: 'Hack Wilson', s: 1930, pos: 'CF', val: 56 },
        { p: 'Lou Gehrig', s: 1927, pos: '1B', val: 47 },
        { p: 'Mel Ott', s: 1929, pos: 'DH', val: 42 },
      ],
    },
    {
      name: 'You',
      score: 152,
      picks: [
        { p: 'Jimmie Foxx', s: 1932, pos: '1B', val: 58 },
        { p: 'Willie Mays', s: 1965, pos: 'CF', val: 52 },
        { p: 'Frank Robinson', s: 1966, pos: 'RF', val: 49 },
      ],
      me: true,
    },
    {
      name: 'J.Lee',
      score: 119,
      picks: [
        { p: 'Mickey Mantle', s: 1961, pos: 'CF', val: 54 },
        { p: 'Hank Aaron', s: 1971, pos: 'RF', val: 47 },
      ],
    },
    {
      name: 'Tomás',
      score: 91,
      picks: [
        { p: 'Harmon Killebrew', s: 1964, pos: '3B', val: 49 },
        { p: 'Ernie Banks', s: 1958, pos: 'SS', val: 47 },
      ],
    },
  ],
  history: [
    { n: 1, player: 'Marcus', pick: 'Babe Ruth', s: 1927, pos: 'RF', val: 60 },
    { n: 2, player: 'You', pick: 'Jimmie Foxx', s: 1932, pos: '1B', val: 58 },
    {
      n: 3,
      player: 'J.Lee',
      pick: 'Mickey Mantle',
      s: 1961,
      pos: 'CF',
      val: 54,
    },
    {
      n: 4,
      player: 'Tomás',
      pick: 'Harmon Killebrew',
      s: 1964,
      pos: '3B',
      val: 49,
    },
    { n: 5, player: 'Tomás', pick: 'Ernie Banks', s: 1958, pos: 'SS', val: 47 },
    { n: 6, player: 'J.Lee', pick: 'Hank Aaron', s: 1971, pos: 'RF', val: 47 },
    { n: 7, player: 'You', pick: 'Willie Mays', s: 1965, pos: 'CF', val: 52 },
    {
      n: 8,
      player: 'You',
      pick: 'Frank Robinson',
      s: 1966,
      pos: 'RF',
      val: 49,
    },
    {
      n: 9,
      player: 'Marcus',
      pick: 'Hack Wilson',
      s: 1930,
      pos: 'CF',
      val: 56,
    },
    {
      n: 10,
      player: 'Marcus',
      pick: 'Lou Gehrig',
      s: 1927,
      pos: '1B',
      val: 47,
    },
    { n: 11, player: 'Marcus', pick: 'Mel Ott', s: 1929, pos: 'DH', val: 42 },
  ],
};

const PLAYER_POOL = [
  {
    name: 'Sammy Sosa',
    seasons: [
      { y: 1998, v: 66 },
      { y: 2001, v: 64 },
      { y: 2000, v: 50 },
    ],
  },
  {
    name: 'Mark McGwire',
    seasons: [
      { y: 1998, v: 70 },
      { y: 1999, v: 65 },
      { y: 1996, v: 52 },
    ],
  },
  {
    name: 'Barry Bonds',
    seasons: [
      { y: 2001, v: 73 },
      { y: 2000, v: 49 },
      { y: 2002, v: 46 },
    ],
  },
  {
    name: 'Ken Griffey Jr.',
    seasons: [
      { y: 1997, v: 56 },
      { y: 1998, v: 56 },
      { y: 1999, v: 48 },
    ],
  },
  {
    name: 'Roger Maris',
    seasons: [
      { y: 1961, v: 61 },
      { y: 1960, v: 39 },
    ],
  },
  {
    name: 'Reggie Jackson',
    seasons: [
      { y: 1969, v: 47 },
      { y: 1973, v: 32 },
    ],
  },
  {
    name: 'Mike Schmidt',
    seasons: [
      { y: 1980, v: 48 },
      { y: 1979, v: 45 },
    ],
  },
  {
    name: 'Ralph Kiner',
    seasons: [
      { y: 1949, v: 54 },
      { y: 1947, v: 51 },
    ],
  },
  {
    name: 'Ted Williams',
    seasons: [
      { y: 1949, v: 43 },
      { y: 1946, v: 38 },
    ],
  },
];

const SeasonDraftGame = ({ onBack }) => {
  const [state, setState] = React.useState(INITIAL_STATE);
  const [phase, setPhase] = React.useState(state.phase); // local toggle via tweak
  const [search, setSearch] = React.useState('');
  const [selectedPlayer, setSelectedPlayer] = React.useState(null); // {name, seasons}
  const [selectedSeason, setSelectedSeason] = React.useState(null); // {y, v}
  const [selectedSlot, setSelectedSlot] = React.useState(null); // e.g. 'DH'
  const [submitting, setSubmitting] = React.useState(false);
  const [inviteCopied, setInviteCopied] = React.useState(false);

  const isMyTurn = state.players[state.turnIdx]?.me === true;
  const activePlayer = state.players[state.turnIdx];
  const me = state.players.find((p) => p.me);
  const myFilled = new Set(me?.picks.map((pk) => pk.pos) || []);
  const openSlots = ROSTER_SLOTS_HITTER.filter((s) => !myFilled.has(s));

  const suggestions =
    search.length >= 2
      ? PLAYER_POOL.filter((p) =>
          p.name.toLowerCase().includes(search.toLowerCase()),
        ).slice(0, 6)
      : [];

  const confirmPick = () => {
    if (!selectedPlayer || !selectedSeason || !selectedSlot) return;
    setSubmitting(true);
    setTimeout(() => {
      setState((s) => {
        const pick = {
          p: selectedPlayer.name,
          s: selectedSeason.y,
          pos: selectedSlot,
          val: selectedSeason.v,
        };
        const players = s.players.map((p, i) =>
          p.me
            ? {
                ...p,
                score: p.score + selectedSeason.v,
                picks: [...p.picks, pick],
              }
            : p,
        );
        const history = [
          ...s.history,
          {
            n: s.pick + 1,
            player: 'You',
            pick: pick.p,
            s: pick.s,
            pos: pick.pos,
            val: pick.val,
          },
        ];
        return {
          ...s,
          players,
          history,
          pick: s.pick + 1,
          turnIdx: (s.turnIdx + 1) % s.players.length,
        };
      });
      setSearch('');
      setSelectedPlayer(null);
      setSelectedSeason(null);
      setSelectedSlot(null);
      setSubmitting(false);
    }, 600);
  };

  const copyInvite = () => {
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 1500);
  };

  return (
    <div className="sdg">
      <div className="sdg-topbar">
        <button
          className="back-btn"
          style={{ marginBottom: 0 }}
          onClick={onBack}
        >
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
        <div className="sdg-topbar-right">
          <PhaseToggle phase={phase} onPhase={setPhase} />
        </div>
      </div>

      <header className="sdg-header">
        <div className="sdg-header-l">
          <div
            className="eyebrow"
            style={{ color: 'var(--brand-seam-red-light)' }}
          >
            ●{' '}
            {phase === 'setup'
              ? 'Waiting Room'
              : phase === 'completed'
                ? 'Game Complete'
                : 'Draft Live'}
          </div>
          <h1>{state.name}</h1>
          <div className="sdg-header-meta">
            <span className="sdl-stat-chip">{state.statKey}</span>
            <span>{state.playerType}s</span>
            <span className="sdg-sep">·</span>
            <span>{state.gameMode}</span>
            <span className="sdg-sep">·</span>
            <span>{state.players.length} players</span>
          </div>
        </div>
        {phase === 'drafting' && (
          <div className="sdg-turn-card">
            <div className="eyebrow">On the Clock</div>
            <div className={`sdg-turn-name ${isMyTurn ? 'sdg-turn-me' : ''}`}>
              {isMyTurn ? 'Your Turn' : activePlayer.name}
            </div>
            <div className="sdg-turn-pick">
              Pick {state.pick + 1} / {state.totalPicks}
            </div>
            <div className="sdg-turn-timer">
              <div className="sdg-timer-bar">
                <span style={{ width: '62%' }} />
              </div>
              <div className="sdg-timer-label">0:47</div>
            </div>
          </div>
        )}
        {phase === 'completed' && (
          <div className="sdg-turn-card sdg-turn-card-win">
            <TrophySmall />
            <div className="eyebrow">Winner</div>
            <div
              className="sdg-turn-name"
              style={{ color: 'var(--brand-gold-light)' }}
            >
              Marcus
            </div>
            <div className="sdg-turn-pick">168 HR · +16 over 2nd</div>
          </div>
        )}
      </header>

      {phase === 'setup' && (
        <SetupPhase
          state={state}
          inviteCopied={inviteCopied}
          onCopy={copyInvite}
          onStart={() => setPhase('drafting')}
        />
      )}

      {phase !== 'setup' && (
        <div className="sdg-grid">
          <div className="sdg-col-main">
            {phase === 'drafting' && isMyTurn && (
              <DraftInterface
                state={state}
                search={search}
                setSearch={setSearch}
                suggestions={suggestions}
                selectedPlayer={selectedPlayer}
                setSelectedPlayer={(p) => {
                  setSelectedPlayer(p);
                  setSelectedSeason(null);
                }}
                selectedSeason={selectedSeason}
                setSelectedSeason={setSelectedSeason}
                selectedSlot={selectedSlot}
                setSelectedSlot={setSelectedSlot}
                openSlots={openSlots}
                submitting={submitting}
                onConfirm={confirmPick}
              />
            )}
            {phase === 'drafting' && !isMyTurn && (
              <div className="sdg-waiting">
                <div className="sdg-waiting-pulse">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="eyebrow">Waiting</div>
                <h3>{activePlayer.name} is picking…</h3>
                <p>
                  You'll be up next. In the meantime, scout who's left on the
                  board.
                </p>
              </div>
            )}

            <RostersCard state={state} />
          </div>

          <aside className="sdg-col-side">
            <ScoreboardCard state={state} />
            <HistoryCard state={state} />
          </aside>
        </div>
      )}
    </div>
  );
};

const PhaseToggle = ({ phase, onPhase }) => (
  <div className="sdg-phase-toggle" title="Preview phase (design tool)">
    <span className="label">Phase</span>
    <div className="toggle-group">
      {['setup', 'drafting', 'completed'].map((p) => (
        <button
          key={p}
          className={phase === p ? 'on' : ''}
          onClick={() => onPhase(p)}
        >
          {p}
        </button>
      ))}
    </div>
  </div>
);

const SetupPhase = ({ state, inviteCopied, onCopy, onStart }) => (
  <div className="sdg-setup">
    <div className="sdg-setup-main card card-elevated">
      <div className="eyebrow">Invite Link</div>
      <div className="sdg-invite">
        <code>legacysports.app/games/draft/LGCY-HR24-AX</code>
        <button className="btn btn-ghost btn-sm" onClick={onCopy}>
          {inviteCopied ? '✓ Copied!' : 'Copy Link'}
        </button>
      </div>
      <p className="sdg-setup-note">
        Share the link above. Draft starts when you're ready — minimum 2
        players.
      </p>
      <div className="sdg-setup-seats">
        {Array.from({ length: 6 }).map((_, i) => {
          const p = state.players[i];
          return (
            <div key={i} className={`sdg-setup-seat ${p ? 'on' : ''}`}>
              <div className="sdg-setup-seat-avatar">{p ? p.name[0] : '+'}</div>
              <div className="sdg-setup-seat-name">
                {p ? (p.me ? 'You' : p.name) : 'Open'}
              </div>
              {i === 0 && <span className="sdg-host-badge">HOST</span>}
            </div>
          );
        })}
      </div>
      <div className="sdg-setup-actions">
        <button className="btn btn-danger">Cancel Game</button>
        <button className="btn btn-gold btn-lg" onClick={onStart}>
          Start Draft →
        </button>
      </div>
    </div>
  </div>
);

const DraftInterface = ({
  state,
  search,
  setSearch,
  suggestions,
  selectedPlayer,
  setSelectedPlayer,
  selectedSeason,
  setSelectedSeason,
  selectedSlot,
  setSelectedSlot,
  openSlots,
  submitting,
  onConfirm,
}) => {
  return (
    <div className="sdg-draft card">
      <div className="sdg-your-turn">
        <div className="sdg-your-turn-badge">Your Turn</div>
        <h3>Make your pick.</h3>
      </div>

      <div className="sdg-draft-step">
        <div className="sdg-step-num">1</div>
        <div className="sdg-step-body">
          <div className="label">Find a {state.playerType}</div>
          <div className="sdg-search">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              className="sdg-search-icon"
            >
              <circle
                cx="11"
                cy="11"
                r="7"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M20 20l-4-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <input
              className="input"
              placeholder="Search player name…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedPlayer(null);
              }}
            />
            {suggestions.length > 0 && !selectedPlayer && (
              <div className="sdg-sugg">
                {suggestions.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => {
                      setSelectedPlayer(s);
                      setSearch(s.name);
                    }}
                  >
                    <span className="sdg-sugg-ball">
                      <Baseball28 />
                    </span>
                    <span>{s.name}</span>
                    <small>{s.seasons.length} available</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedPlayer && (
        <div className="sdg-draft-step">
          <div className="sdg-step-num">2</div>
          <div className="sdg-step-body">
            <div className="label">Choose a Season</div>
            <div className="sdg-season-row">
              {selectedPlayer.seasons.map((sn) => (
                <button
                  key={sn.y}
                  className={`sdg-season ${selectedSeason?.y === sn.y ? 'on' : ''}`}
                  onClick={() => setSelectedSeason(sn)}
                >
                  <div className="sdg-season-y">{sn.y}</div>
                  <div className="sdg-season-v">
                    {sn.v} <span>{state.statKey}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedSeason && (
        <div className="sdg-draft-step">
          <div className="sdg-step-num">3</div>
          <div className="sdg-step-body">
            <div className="label">Assign Position</div>
            <div className="sdg-slots">
              {openSlots.map((s) => (
                <button
                  key={s}
                  className={`sdg-slot ${selectedSlot === s ? 'on' : ''}`}
                  onClick={() => setSelectedSlot(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedPlayer && selectedSeason && selectedSlot && (
        <div className="sdg-preview-card">
          <div>
            <div
              className="eyebrow"
              style={{ color: 'var(--brand-gold-light)' }}
            >
              Preview Pick
            </div>
            <div className="sdg-preview-name">{selectedPlayer.name}</div>
            <div className="sdg-preview-sub">
              {selectedSeason.y} · {selectedSlot}
            </div>
          </div>
          <div className="sdg-preview-score">
            <div className="sdg-preview-val">+{selectedSeason.v}</div>
            <div className="sdg-preview-lab">{state.statKey}</div>
          </div>
        </div>
      )}

      <button
        className="btn btn-gold btn-lg sdg-confirm"
        disabled={
          !selectedPlayer || !selectedSeason || !selectedSlot || submitting
        }
        onClick={onConfirm}
      >
        {submitting ? 'Locking Pick…' : 'Confirm Pick'}
      </button>
    </div>
  );
};

const RostersCard = ({ state }) => (
  <div className="card">
    <div className="sdg-card-head">
      <h3>Rosters</h3>
      <span className="sdl-count">{state.players.length} teams</span>
    </div>
    <div className="sdg-rosters">
      {state.players.map((p, i) => (
        <div
          key={p.name}
          className={`sdg-roster ${p.me ? 'sdg-roster-me' : ''}`}
        >
          <div className="sdg-roster-head">
            <div className="sdg-roster-name">{p.me ? 'You' : p.name}</div>
            <div className="sdg-roster-total">
              {p.score} <span>{state.statKey}</span>
            </div>
          </div>
          <div className="sdg-roster-slots">
            {p.picks.map((pk, idx) => (
              <div key={idx} className="sdg-roster-slot filled">
                <span className="sdg-pos-tag">{pk.pos}</span>
                <div className="sdg-roster-slot-body">
                  <div className="sdg-roster-slot-name">{pk.p}</div>
                  <div className="sdg-roster-slot-meta">{pk.s}</div>
                </div>
                <div className="sdg-roster-slot-val">{pk.val}</div>
              </div>
            ))}
            {Array.from({ length: Math.max(0, 9 - p.picks.length) }).map(
              (_, idx) => (
                <div key={'e' + idx} className="sdg-roster-slot empty">
                  <span className="sdg-pos-tag sdg-pos-empty">—</span>
                  <div className="sdg-roster-slot-body">
                    <div
                      className="sdg-roster-slot-name"
                      style={{ color: 'var(--fg4)' }}
                    >
                      Empty
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const ScoreboardCard = ({ state }) => {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const max = sorted[0].score;
  return (
    <div className="card">
      <div className="sdg-card-head">
        <h3>Scoreboard</h3>
        <span className="sdl-count">Live</span>
      </div>
      <div className="sdg-scoreboard">
        {sorted.map((p, i) => (
          <div
            key={p.name}
            className={`sdg-score-row ${p.me ? 'me' : ''} ${i === 0 ? 'lead' : ''}`}
          >
            <div className="sdg-score-rank">{i + 1}</div>
            <div className="sdg-score-name">{p.me ? 'You' : p.name}</div>
            <div className="sdg-score-bar">
              <span style={{ width: `${(p.score / max) * 100}%` }} />
            </div>
            <div className="sdg-score-n">{p.score}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const HistoryCard = ({ state }) => (
  <div className="card">
    <div className="sdg-card-head">
      <h3>Picks</h3>
      <span className="sdl-count">{state.history.length} made</span>
    </div>
    <div className="sdg-history">
      {state.history
        .slice()
        .reverse()
        .slice(0, 8)
        .map((h) => (
          <div
            key={h.n}
            className={`sdg-hist ${h.player === 'You' ? 'me' : ''}`}
          >
            <div className="sdg-hist-num">{String(h.n).padStart(2, '0')}</div>
            <div className="sdg-hist-body">
              <div className="sdg-hist-name">{h.pick}</div>
              <div className="sdg-hist-meta">
                {h.player} · {h.s} · {h.pos}
              </div>
            </div>
            <div className="sdg-hist-val">+{h.val}</div>
          </div>
        ))}
    </div>
  </div>
);

const Baseball28 = () => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <radialGradient id="bb-body" cx="38%" cy="36%" r="68%">
        <stop offset="0%" stopColor="#FBFAF5" />
        <stop offset="55%" stopColor="#ECE7D6" />
        <stop offset="100%" stopColor="#B8AE90" />
      </radialGradient>
      <radialGradient id="bb-hl" cx="34%" cy="30%" r="30%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.7)" />
        <stop offset="100%" stopColor="rgba(255,255,255,0)" />
      </radialGradient>
    </defs>
    <circle
      cx="20"
      cy="20"
      r="13"
      fill="url(#bb-body)"
      stroke="#8A7F63"
      strokeWidth="0.6"
    />
    <circle cx="20" cy="20" r="13" fill="url(#bb-hl)" />
    {/* Left seam curve */}
    <path
      d="M11 10.5 Q 7.5 20 11 29.5"
      stroke="#B01E37"
      strokeWidth="1.3"
      fill="none"
      strokeLinecap="round"
    />
    {/* Right seam curve */}
    <path
      d="M29 10.5 Q 32.5 20 29 29.5"
      stroke="#B01E37"
      strokeWidth="1.3"
      fill="none"
      strokeLinecap="round"
    />
    {/* Left stitches */}
    <g stroke="#B01E37" strokeWidth="0.9" strokeLinecap="round">
      <path d="M8.8 13.2 l1.6 -0.9" />
      <path d="M8.0 15.8 l1.6 -0.6" />
      <path d="M7.6 18.6 l1.7 -0.3" />
      <path d="M7.6 21.4 l1.7 0.3" />
      <path d="M8.0 24.2 l1.6 0.6" />
      <path d="M8.8 26.8 l1.6 0.9" />
    </g>
    {/* Right stitches */}
    <g stroke="#B01E37" strokeWidth="0.9" strokeLinecap="round">
      <path d="M31.2 13.2 l-1.6 -0.9" />
      <path d="M32.0 15.8 l-1.6 -0.6" />
      <path d="M32.4 18.6 l-1.7 -0.3" />
      <path d="M32.4 21.4 l-1.7 0.3" />
      <path d="M32.0 24.2 l-1.6 0.6" />
      <path d="M31.2 26.8 l-1.6 0.9" />
    </g>
  </svg>
);

const TrophySmall = () => (
  <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
    <path d="M10 6h12v6a6 6 0 0 1-12 0V6z" stroke="#C5A55A" strokeWidth="2" />
    <path
      d="M10 8H6a3 3 0 0 0 4 4M22 8h4a3 3 0 0 1-4 4"
      stroke="#C5A55A"
      strokeWidth="2"
    />
    <path d="M14 18v4M11 24h10v2H11z" stroke="#C5A55A" strokeWidth="2" />
  </svg>
);

Object.assign(window, { SeasonDraftGame });
