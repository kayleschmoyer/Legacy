// SeasonDraftJoin.jsx — invite link landing
const BackBtn = ({ onBack }) => (
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
);

// SKELETON: mirrors .sdj-ticket-body — game name, host line, detail grid, 6-seat row, code, actions
const SdjSkeleton = () => (
  <div className="sdj-ticket-body" aria-hidden="true">
    <Skel w="62%" h={36} r={6} />
    <Skel w="38%" h={15} r={4} style={{ marginTop: -10 }} />
    <div className="sdj-detail-grid">
      {[0, 1, 2, 3].map((i) => (
        <div key={i}>
          <Skel w={38} h={10} r={4} style={{ marginBottom: 6 }} />
          <Skel w={52} h={16} r={4} />
        </div>
      ))}
    </div>
    <div className="sdj-seats">
      <Skel w={56} h={10} r={4} style={{ marginBottom: 10 }} />
      <div className="sdj-seats-row">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="sdj-seat">
            <Skel w={32} h={32} r="50%" />
            <Skel w={36} h={9} r={4} />
          </div>
        ))}
      </div>
    </div>
    <div className="sdj-code-row">
      <Skel w={78} h={11} r={4} />
      <Skel w={112} h={16} r={4} />
    </div>
    <div className="sdj-actions">
      <Skel w={82} h={44} r={6} />
      <Skel w={156} h={52} r={6} />
    </div>
  </div>
);

const SeasonDraftJoin = ({ onBack, onJoined }) => {
  const [viewState, setViewState] = React.useState('populated');
  const [phase, setPhase] = React.useState('loading');
  const [joining, setJoining] = React.useState(false);
  const [inviteCode] = React.useState('LGCY-HR24-AX');

  React.useEffect(() => {
    const t = setTimeout(() => setPhase('loaded'), 600);
    return () => clearTimeout(t);
  }, []);

  const game = {
    name: 'Dead Ball HR Chase',
    playerType: 'Hitters',
    statKey: 'HR',
    gameMode: 'Season',
    playerCount: 3,
    status: 'setup',
    creator: 'Marcus',
    players: ['Marcus', 'J.Lee', 'Tomás'],
  };

  const join = () => {
    setJoining(true);
    setTimeout(() => {
      setJoining(false);
      onJoined?.();
    }, 700);
  };

  const switcher = (
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
  );

  if (viewState === 'error')
    return (
      <div className="sdj">
        <BackBtn onBack={onBack} />
        {switcher}
        <ErrorCard
          title="Invite link expired"
          message="This invite is no longer valid — it may have expired, or the game may have started without you. Ask the host to send a new link."
          onRetry={() => setViewState('populated')}
          retryLabel="Try Again"
        />
      </div>
    );

  if (viewState === 'empty')
    return (
      <div className="sdj">
        <BackBtn onBack={onBack} />
        {switcher}
        <EmptyCard
          icon={
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
              <path d="M9 15s1.2-6 3-6 3 6 3 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          title="This game is full"
          message="All six seats are taken. Ask the host to open a new game, or head back to the lobby to find another."
          cta="Back to Lobby"
          onCta={onBack}
        />
      </div>
    );

  const showSkeleton = viewState === 'loading' || phase === 'loading';

  return (
    <div className="sdj">
      <BackBtn onBack={onBack} />
      {switcher}

      <div className="sdj-card">
        <div className="sdj-ticket-top">
          <div>
            <div
              className="eyebrow"
              style={{ color: 'var(--brand-gold-light)' }}
            >
              Private Invite
            </div>
            <div className="sdj-ticket-title">You've been invited</div>
          </div>
          <div className="sdj-ticket-logo">
            <img src="../assets/logo.png" alt="" height="34" />
          </div>
        </div>

        <div className="sdj-ticket-perf" />

        {showSkeleton ? (
          <SdjSkeleton />
        ) : (
          <div className="sdj-ticket-body">
            <div className="sdj-game-name">{game.name}</div>
            <div className="sdj-host">
              Hosted by <b>{game.creator}</b>
            </div>

            <div className="sdj-detail-grid">
              <div>
                <span className="label">Stat</span>
                <b>{game.statKey}</b>
              </div>
              <div>
                <span className="label">Pool</span>
                <b>{game.playerType}</b>
              </div>
              <div>
                <span className="label">Mode</span>
                <b>{game.gameMode}</b>
              </div>
              <div>
                <span className="label">Players</span>
                <b>{game.playerCount} / 6</b>
              </div>
            </div>

            <div className="sdj-seats">
              <div className="label" style={{ marginBottom: 10 }}>
                Roster
              </div>
              <div className="sdj-seats-row">
                {Array.from({ length: 6 }).map((_, i) => {
                  const p = game.players[i];
                  const isYou = i === game.players.length;
                  return (
                    <div
                      key={i}
                      className={`sdj-seat ${p ? 'filled' : ''} ${isYou ? 'sdj-seat-you' : ''}`}
                    >
                      <div className="sdj-seat-avatar">
                        {p ? p[0] : isYou ? 'YOU' : ''}
                      </div>
                      <div className="sdj-seat-label">
                        {p || (isYou ? 'You' : 'Empty')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="sdj-code-row">
              <div className="label">Invite Code</div>
              <div className="sdj-code">{inviteCode}</div>
            </div>

            <div className="sdj-actions">
              <button className="btn btn-ghost" onClick={onBack}>
                Cancel
              </button>
              <button
                className="btn btn-gold btn-lg"
                disabled={joining || game.status !== 'setup'}
                onClick={join}
              >
                {joining ? 'Joining…' : 'Claim Your Seat'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { SeasonDraftJoin });
