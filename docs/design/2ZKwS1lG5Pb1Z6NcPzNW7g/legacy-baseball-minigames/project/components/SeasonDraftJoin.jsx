// SeasonDraftJoin.jsx — invite link landing
const SeasonDraftJoin = ({ onBack, onJoined }) => {
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

  return (
    <div className="sdj">
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

        {phase === 'loading' ? (
          <div className="sdj-loading">
            <div className="sdj-spinner" />
            <div>Loading game info…</div>
          </div>
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
