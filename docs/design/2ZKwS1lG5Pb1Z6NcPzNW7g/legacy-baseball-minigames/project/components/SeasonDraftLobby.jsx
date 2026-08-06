// SeasonDraftLobby.jsx — list of season draft games
const LOBBY_GAMES = [
  {
    id: 'g1',
    name: 'Dead Ball HR Chase',
    status: 'drafting',
    statKey: 'HR',
    playerType: 'Hitter',
    gameMode: 'Season',
    isMyTurn: true,
    pick: 8,
    total: 24,
    players: ['You', 'Marcus', 'J.Lee', 'Tomás'],
  },
  {
    id: 'g2',
    name: 'Strikeout Kings 1998',
    status: 'setup',
    statKey: 'SO',
    playerType: 'Pitcher',
    gameMode: 'Season',
    isMyTurn: false,
    pick: 0,
    total: 18,
    players: ['You', 'Kenji', 'Ana'],
  },
  {
    id: 'g3',
    name: 'RBI Royalty',
    status: 'drafting',
    statKey: 'RBI',
    playerType: 'Hitter',
    gameMode: 'Career w/ Team',
    isMyTurn: false,
    pick: 14,
    total: 30,
    players: ['Priya', 'You', 'Jomo', 'Luca', 'Rey'],
  },
  {
    id: 'g4',
    name: '300 Win Club',
    status: 'completed',
    statKey: 'W',
    playerType: 'Pitcher',
    gameMode: 'Career w/ Team',
    isMyTurn: false,
    winner: 'Kenji',
    players: ['Kenji', 'You', 'Ana', 'Marcus'],
  },
  {
    id: 'g5',
    name: 'Triples Gauntlet',
    status: 'cancelled',
    statKey: 'Triples',
    playerType: 'Hitter',
    gameMode: 'Season',
    isMyTurn: false,
    players: ['You', '—'],
  },
];

// SKELETON: mirrors the "Active" section head + a row of .sdl-card tiles
const SdlSkeleton = () => (
  <>
    <div className="sdl-section-head" aria-hidden="true">
      <Skel w={90} h={20} r={4} />
      <Skel w={48} h={11} r={4} />
    </div>
    <div className="sdl-grid" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="sdl-card" style={{ cursor: 'default' }}>
          <div className="sdl-card-head" style={{ marginTop: 0 }}>
            <Skel w="62%" h={22} r={4} />
            <Skel w={74} h={20} r={9999} style={{ flexShrink: 0 }} />
          </div>
          <div className="sdl-card-stat-row">
            <Skel w={42} h={22} r={6} />
            <Skel w={56} h={12} r={4} />
            <Skel w={70} h={12} r={4} />
          </div>
          <div className="sdl-card-progress">
            <Skel w="100%" h={6} r={3} />
            <Skel w={96} h={11} r={4} />
          </div>
          <div
            style={{
              display: 'flex',
              gap: 6,
              paddingTop: 10,
              borderTop: '1px dashed var(--outline-subtle)',
            }}
          >
            {[0, 1, 2, 3].map((j) => (
              <Skel key={j} w={30} h={30} r="50%" />
            ))}
          </div>
        </div>
      ))}
    </div>
  </>
);

const SeasonDraftLobby = ({ onBack, onCreate, onOpenGame, onJoin }) => {
  const [viewState, setViewState] = React.useState('populated');
  const active = LOBBY_GAMES.filter(
    (g) => g.status === 'drafting' || g.status === 'setup',
  );
  const past = LOBBY_GAMES.filter(
    (g) => g.status === 'completed' || g.status === 'cancelled',
  );
  return (
    <div className="sdl">
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
        Back to Games
      </button>

      <StateSwitcher
        value={viewState}
        onChange={setViewState}
        states={[
          { value: 'populated', label: 'Populated' },
          { value: 'loading', label: 'Loading' },
          { value: 'error', label: 'Error' },
          { value: 'empty', label: 'Empty' },
        ]}
      />

      <header className="sdl-head">
        <div>
          <div className="eyebrow" style={{ color: 'var(--brand-gold-light)' }}>
            Multiplayer · Season Draft
          </div>
          <h1>Season Draft Games</h1>
          <p>
            Draft hitters or pitchers, pick the right season, rack up the
            counting stats. Last one standing with the biggest number wins.
          </p>
        </div>
        <div className="sdl-head-actions">
          <button className="btn btn-ghost" onClick={onJoin}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M14 4h6v6M10 14L20 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Join by Invite
          </button>
          <button className="btn btn-gold" onClick={onCreate}>
            + New Game
          </button>
        </div>
      </header>

      {viewState === 'loading' && <SdlSkeleton />}

      {viewState === 'error' && (
        <ErrorCard
          title="Can't load your Season Draft games"
          message="The games service didn't respond in time. Anything already in progress is unaffected — try again in a moment."
          onRetry={() => setViewState('populated')}
        />
      )}

      {viewState === 'empty' && (
        <div className="sdl-empty">
          <img src="../icons/trophy.svg" width="56" height="56" alt="" />
          <h3>No games yet</h3>
          <p>Start your first season draft and invite up to 5 friends.</p>
          <button className="btn btn-gold btn-lg" onClick={onCreate}>
            Create First Game
          </button>
        </div>
      )}

      {viewState === 'populated' && (
        <>
          <div className="sdl-section-head">
            <h2>Active</h2>
            <span className="sdl-count">{active.length} live</span>
          </div>
          <div className="sdl-grid">
            {active.map((g) => (
              <LobbyCard key={g.id} g={g} onOpen={() => onOpenGame(g.id)} />
            ))}
          </div>
          {past.length > 0 && (
            <>
              <div className="sdl-section-head sdl-section-head-past">
                <h2>Past</h2>
                <span className="sdl-count">{past.length}</span>
              </div>
              <div className="sdl-grid sdl-grid-past">
                {past.map((g) => (
                  <LobbyCard key={g.id} g={g} onOpen={() => onOpenGame(g.id)} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

const LobbyCard = ({ g, onOpen }) => {
  const phaseColor = {
    setup: 'setup',
    drafting: 'active',
    completed: 'completed',
    cancelled: 'cancelled',
  }[g.status];
  const phaseLabel = {
    setup: 'Setup',
    drafting: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }[g.status];
  return (
    <button className={`sdl-card sdl-card-${g.status}`} onClick={onOpen}>
      {g.isMyTurn && g.status === 'drafting' && (
        <div className="sdl-card-turn">
          <span className="chip-dot pulse" />
          Your Turn
        </div>
      )}
      <div className="sdl-card-head">
        <div className="sdl-card-title">{g.name}</div>
        <span className={`chip chip-${phaseColor}`}>
          {g.status === 'drafting' && <span className="chip-dot pulse" />}
          {phaseLabel}
        </span>
      </div>
      <div className="sdl-card-stat-row">
        <div className="sdl-stat-chip">{g.statKey}</div>
        <span className="sdl-meta-dot">·</span>
        <span>{g.playerType}s</span>
        <span className="sdl-meta-dot">·</span>
        <span>{g.gameMode}</span>
      </div>
      {g.status === 'completed' && (
        <div className="sdl-winner-line">
          <TrophyMini />{' '}
          <span>
            Won by <b>{g.winner}</b>
          </span>
        </div>
      )}
      {g.status === 'cancelled' && (
        <div className="sdl-cancel-line">Game was cancelled.</div>
      )}
      {(g.status === 'drafting' || g.status === 'setup') && (
        <div className="sdl-card-progress">
          <div className="sdl-progress-bar">
            <span
              style={{
                width: `${g.status === 'drafting' ? (g.pick / g.total) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="sdl-progress-label">
            {g.status === 'drafting' ? (
              <>
                Pick <b>{g.pick}</b>/{g.total}
              </>
            ) : (
              <>Waiting · {g.players.length}/6 joined</>
            )}
          </div>
        </div>
      )}
      <div className="sdl-players">
        {g.players.map((p, i) => (
          <div
            key={i}
            className={`sdl-avatar ${p === 'You' ? 'sdl-avatar-me' : ''}`}
          >
            {p === '—' ? '?' : p[0]}
          </div>
        ))}
        {g.players.length < 6 && g.status === 'setup' && (
          <div className="sdl-avatar sdl-avatar-empty">+</div>
        )}
      </div>
    </button>
  );
};

const TrophyMini = () => (
  <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
    <path d="M10 6h12v6a6 6 0 0 1-12 0V6z" stroke="#C5A55A" strokeWidth="2" />
    <path d="M14 18v4M11 24h10v2H11z" stroke="#C5A55A" strokeWidth="2" />
  </svg>
);

Object.assign(window, { SeasonDraftLobby });
