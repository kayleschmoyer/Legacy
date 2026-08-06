// Disclosure.jsx — "Who Am I?" game with 3 phases
const MYSTERY_PLAYER = {
  name: 'Roy Campanella',
  clues: [
    {
      tier: 'Cold',
      text: 'This player was a three-time MVP, but never finished higher than seventh in single-season home runs.',
    },
    {
      tier: 'Cold',
      text: 'He played his entire 10-year career for one franchise, and appeared in the World Series five times.',
    },
    {
      tier: 'Warm',
      text: 'A catcher. His 41 home runs in 1953 set a record for the position that would stand for more than two decades.',
    },
    {
      tier: 'Warm',
      text: 'He spent nearly a decade in the Negro Leagues and the Mexican League before getting a shot at the majors at age 26.',
    },
    {
      tier: 'Hot',
      text: 'In January 1958, an automobile accident on an icy Long Island road ended his playing career and paralyzed him from the shoulders down.',
    },
    {
      tier: 'Hot',
      text: 'He shares a first name with his manager, Charlie Dressen, who called him "the best catcher I ever saw, and I saw Cochrane."',
    },
    {
      tier: 'Scorching',
      text: 'His signature quote: "You have to be a man to be a big-league ballplayer, but you have to have a lot of little boy in you, too." Elected to the Hall of Fame in 1969.',
    },
  ],
};

const SEARCH_POOL = [
  'Roy Campanella',
  'Yogi Berra',
  'Johnny Bench',
  'Josh Gibson',
  'Bill Dickey',
  'Mickey Cochrane',
  'Gary Carter',
  'Ivan Rodriguez',
  'Carlton Fisk',
  'Mike Piazza',
  'Thurman Munson',
  'Ernie Lombardi',
  'Gabby Hartnett',
  'Buck Ewing',
  'Roger Bresnahan',
];

const BackBtn = ({ onBack, label = 'Back to Games' }) => (
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
    {label}
  </button>
);

// SKELETON: mirrors .dz-idle-card — mark, eyebrow, h1, lede, 3-up rules grid, dual CTAs
const DisclosureLoading = ({ onBack, switcher }) => (
  <div className="dz dz-idle">
    <BackBtn onBack={onBack} />
    {switcher}
    <div className="dz-idle-card" aria-hidden="true">
      <Skel w={104} h={104} r="50%" style={{ margin: '0 auto 24px' }} />
      <Skel w={140} h={12} r={9999} style={{ margin: '0 auto 14px' }} />
      <Skel w={280} h={48} r={8} style={{ margin: '0 auto 18px' }} />
      <Skel w="80%" h={16} r={6} style={{ margin: '0 auto 8px' }} />
      <Skel w="58%" h={16} r={6} style={{ margin: '0 auto 32px' }} />
      <div className="dz-idle-rules">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              padding: '16px 14px',
              background: 'rgba(255,255,255,.03)',
              border: '1px solid var(--outline-subtle)',
              borderRadius: 'var(--radius-4)',
            }}
          >
            <Skel w={30} h={24} r={4} style={{ marginBottom: 10 }} />
            <Skel w="88%" h={12} r={4} />
          </div>
        ))}
      </div>
      <div className="dz-idle-ctas">
        <Skel w={148} h={52} r={9999} />
        <Skel w={112} h={52} r={9999} />
      </div>
    </div>
  </div>
);

const Disclosure = ({ onBack }) => {
  const [viewState, setViewState] = React.useState('populated');
  const [phase, setPhase] = React.useState('idle'); // idle | playing | result
  const [revealed, setRevealed] = React.useState(0);
  const [guess, setGuess] = React.useState('');
  const [selectedPlayer, setSelectedPlayer] = React.useState(null);
  const [errorMsg, setErrorMsg] = React.useState('');
  const [result, setResult] = React.useState(null); // {outcome, score, used, correctName}
  const [loading, setLoading] = React.useState('');
  const feedRef = React.useRef(null);

  const total = MYSTERY_PLAYER.clues.length;
  const canReveal = revealed < total;

  const reveal = () => {
    setLoading('reveal');
    setTimeout(() => {
      setRevealed((r) => Math.min(r + 1, total));
      setLoading('');
      setErrorMsg('');
      if (revealed + 1 >= total) {
      } // out of clues state handled on submit
    }, 380);
  };
  const start = () => {
    setPhase('playing');
    setRevealed(0);
    setGuess('');
    setSelectedPlayer(null);
    setErrorMsg('');
    setResult(null);
    setTimeout(reveal, 120);
  };
  const submit = () => {
    if (!selectedPlayer) return;
    setLoading('submit');
    setTimeout(() => {
      setLoading('');
      if (selectedPlayer.toLowerCase() === MYSTERY_PLAYER.name.toLowerCase()) {
        const score = Math.max(
          5,
          (total - revealed + 1) * 15 - 5 * (revealed - 1),
        );
        setResult({
          outcome: 'won',
          score: Math.round(score),
          used: revealed,
          correctName: MYSTERY_PLAYER.name,
        });
        setPhase('result');
      } else {
        setErrorMsg('Wrong guess — reveal more clues and try again.');
        setGuess('');
        setSelectedPlayer(null);
      }
    }, 500);
  };
  const giveUp = () => {
    setLoading('giveup');
    setTimeout(() => {
      setLoading('');
      setResult({
        outcome: 'given_up',
        used: revealed,
        correctName: MYSTERY_PLAYER.name,
      });
      setPhase('result');
    }, 400);
  };
  const outOfClues = () => {
    setResult({
      outcome: 'lost',
      used: revealed,
      correctName: MYSTERY_PLAYER.name,
    });
    setPhase('result');
  };

  React.useEffect(() => {
    if (feedRef.current)
      feedRef.current.scrollTo({
        top: feedRef.current.scrollHeight,
        behavior: 'smooth',
      });
  }, [revealed]);

  const suggestions =
    guess.length >= 2
      ? SEARCH_POOL.filter((n) =>
          n.toLowerCase().includes(guess.toLowerCase()),
        ).slice(0, 6)
      : [];

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

  if (viewState === 'loading') return <DisclosureLoading onBack={onBack} switcher={switcher} />;

  if (viewState === 'error')
    return (
      <div className="dz dz-idle">
        <BackBtn onBack={onBack} />
        {switcher}
        <ErrorCard
          title="Can't load today's mystery player"
          message="The trivia service didn't respond in time. Nothing was lost — your best score is still saved."
          onRetry={() => setViewState('populated')}
        />
      </div>
    );

  if (viewState === 'empty')
    return (
      <div className="dz dz-idle">
        <BackBtn onBack={onBack} />
        {switcher}
        <EmptyCard
          icon={
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
              <path d="M9.5 9a2.5 2.5 0 0 1 4.6-1.4c.5.8.2 1.5-.6 2.1-.7.5-1.5 1-1.5 2.3M12 16h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          }
          title="No mystery player today"
          message="Every deep cut in the archive has already been guessed for today's rotation. Check back tomorrow for a fresh case."
          cta="Back to Games"
          onCta={onBack}
        />
      </div>
    );

  if (phase === 'idle')
    return <DisclosureIdle onBack={onBack} onStart={start} switcher={switcher} />;
  if (phase === 'result')
    return (
      <DisclosureResult
        onBack={onBack}
        result={result}
        total={total}
        onPlayAgain={start}
        switcher={switcher}
      />
    );
  return (
    <div className="dz">
      <BackBtn onBack={onBack} />
      {switcher}
      <div className="dz-shell">
        <header className="dz-header">
          <div>
            <div
              className="eyebrow"
              style={{ color: 'var(--brand-seam-red-light)' }}
            >
              ● Session Live
            </div>
            <h1 className="dz-h1">Who Am I?</h1>
          </div>
          <div className="dz-counter">
            <div className="dz-counter-n">
              {revealed}
              <span>/{total}</span>
            </div>
            <div className="dz-counter-l">Clues</div>
            <div className="dz-counter-bar">
              {Array.from({ length: total }).map((_, i) => (
                <span key={i} className={i < revealed ? 'on' : ''} />
              ))}
            </div>
          </div>
        </header>

        <main className="dz-main">
          <section className="dz-feed-wrap">
            <div className="dz-feed" ref={feedRef}>
              {revealed === 0 ? (
                <div className="dz-feed-empty">
                  <div className="dz-feed-empty-mark">?</div>
                  <div className="dz-feed-empty-h">
                    Reveal the first clue to begin.
                  </div>
                  <p>
                    You'll get up to {total} clues. Fewer clues used, higher
                    your score.
                  </p>
                </div>
              ) : (
                MYSTERY_PLAYER.clues.slice(0, revealed).map((c, i) => (
                  <article key={i} className="dz-clue">
                    <div className="dz-clue-head">
                      <span className="dz-clue-num">
                        Clue {String(i + 1).padStart(2, '0')}
                      </span>
                      <span
                        className={`dz-clue-tier dz-tier-${c.tier.toLowerCase()}`}
                      >
                        {c.tier}
                      </span>
                    </div>
                    <p>{c.text}</p>
                  </article>
                ))
              )}
            </div>
            {errorMsg && <div className="dz-err">{errorMsg}</div>}
          </section>

          <aside className="dz-side">
            <div className="dz-side-block">
              <div className="label">Next Step</div>
              {canReveal ? (
                <button
                  className="btn btn-ghost dz-reveal"
                  onClick={reveal}
                  disabled={loading === 'reveal'}
                >
                  {loading === 'reveal' ? 'Revealing…' : 'Reveal Next Clue'}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 5v14M5 12l7 7 7-7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ) : (
                <button
                  className="btn btn-ghost dz-reveal"
                  onClick={outOfClues}
                >
                  All Clues Revealed — Submit or Give Up
                </button>
              )}
            </div>

            <div className="dz-side-block">
              <div className="label">Your Guess</div>
              <div className="dz-guess">
                <input
                  className="input"
                  placeholder="Type player name…"
                  value={guess}
                  onChange={(e) => {
                    setGuess(e.target.value);
                    setSelectedPlayer(null);
                    setErrorMsg('');
                  }}
                  disabled={revealed === 0}
                />
                {suggestions.length > 0 && !selectedPlayer && (
                  <div className="dz-sugg">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setSelectedPlayer(s);
                          setGuess(s);
                        }}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            cx="12"
                            cy="12"
                            r="8"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          />
                          <path
                            d="M7 10q5 4 10 0"
                            stroke="#C41E3A"
                            strokeWidth="1.2"
                            fill="none"
                          />
                          <path
                            d="M7 14q5 -4 10 0"
                            stroke="#C41E3A"
                            strokeWidth="1.2"
                            fill="none"
                          />
                        </svg>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="btn btn-gold dz-submit"
                onClick={submit}
                disabled={!selectedPlayer || loading === 'submit'}
              >
                {loading === 'submit' ? 'Checking…' : 'Submit Guess'}
              </button>
            </div>

            {revealed > 0 && (
              <button
                className="btn btn-danger dz-giveup"
                onClick={giveUp}
                disabled={loading === 'giveup'}
              >
                {loading === 'giveup' ? 'Giving up…' : '⚑ Give Up'}
              </button>
            )}

            <div className="dz-side-tip">
              <div className="eyebrow">Scoring</div>
              <div className="dz-side-tip-grid">
                <span>1 clue</span>
                <b>100 pts</b>
                <span>2–3 clues</span>
                <b>70–85 pts</b>
                <span>4–5 clues</span>
                <b>40–55 pts</b>
                <span>6–7 clues</span>
                <b>15–25 pts</b>
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
};

const DisclosureIdle = ({ onBack, onStart, switcher }) => (
  <div className="dz dz-idle">
    <BackBtn onBack={onBack} />
    {switcher}
    <div className="dz-idle-card">
      <div className="dz-idle-mark">?</div>
      <div className="eyebrow" style={{ color: 'var(--brand-seam-red-light)' }}>
        Solo · Trivia
      </div>
      <h1>Who Am I?</h1>
      <p className="dz-idle-lede">
        Seven clues. One player from the record book. Guess early for a bigger
        score — but guess wrong and you keep revealing.
      </p>
      <div className="dz-idle-rules">
        <div>
          <b>01</b> Reveal a clue
        </div>
        <div>
          <b>02</b> Guess (or reveal another)
        </div>
        <div>
          <b>03</b> Fewer clues = higher score
        </div>
      </div>
      <div className="dz-idle-ctas">
        <button className="btn btn-gold btn-lg" onClick={onStart}>
          Start Game
        </button>
        <button className="btn btn-ghost btn-lg" onClick={onBack}>
          Not Now
        </button>
      </div>
    </div>
  </div>
);

const DisclosureResult = ({ onBack, result, total, onPlayAgain, switcher }) => {
  const titleMap = {
    won: {
      icon: <TrophySvg />,
      title: 'Correct.',
      sub: 'You named them.',
      accent: 'gold',
    },
    given_up: {
      icon: <FlagSvg />,
      title: 'Flag raised.',
      sub: 'Better luck next clue.',
      accent: 'muted',
    },
    lost: {
      icon: <XSvg />,
      title: 'Out of clues.',
      sub: 'The record book keeps its secret.',
      accent: 'seam',
    },
  }[result.outcome];
  return (
    <div className="dz">
      <BackBtn onBack={onBack} />
      {switcher}
      <div className={`dz-result dz-result-${titleMap.accent}`}>
        <div className="dz-result-mark">{titleMap.icon}</div>
        <div className="eyebrow">{titleMap.sub}</div>
        <h1>{titleMap.title}</h1>
        {result.outcome === 'won' && (
          <div className="dz-score-block">
            <div className="dz-score-n">{result.score}</div>
            <div className="dz-score-l">Points</div>
          </div>
        )}
        <div className="dz-result-reveal">
          <div className="eyebrow">The Player</div>
          <div className="dz-result-name">{result.correctName}</div>
        </div>
        <div className="dz-result-grid">
          <div>
            <b>{result.used}</b>
            <small>Clues Used</small>
          </div>
          <div>
            <b>{total - result.used}</b>
            <small>Unseen</small>
          </div>
          <div>
            <b>{result.outcome === 'won' ? 'Yes' : 'No'}</b>
            <small>Correct</small>
          </div>
        </div>
        <div className="dz-idle-ctas">
          <button className="btn btn-gold btn-lg" onClick={onPlayAgain}>
            Play Again
          </button>
          <button className="btn btn-ghost btn-lg" onClick={onBack}>
            Back to Games
          </button>
        </div>
      </div>
    </div>
  );
};

const TrophySvg = () => (
  <svg width="64" height="64" viewBox="0 0 32 32" fill="none">
    <path d="M10 6h12v6a6 6 0 0 1-12 0V6z" stroke="#C5A55A" strokeWidth="1.8" />
    <path
      d="M10 8H6a3 3 0 0 0 4 4M22 8h4a3 3 0 0 1-4 4"
      stroke="#C5A55A"
      strokeWidth="1.8"
    />
    <path
      d="M14 18v4M18 18v4M11 24h10v2H11z"
      stroke="#C5A55A"
      strokeWidth="1.8"
    />
    <path
      d="M13 9l1 2 2 .3-1.4 1.3.3 2L13 13.6 11.1 14.6l.3-2L10 11.3l2-.3z"
      fill="#C41E3A"
    />
  </svg>
);
const FlagSvg = () => (
  <svg width="64" height="64" viewBox="0 0 32 32" fill="none">
    <path
      d="M7 4v24"
      stroke="#9CAAC5"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <path d="M7 5h16l-3 5 3 5H7z" stroke="#9CAAC5" strokeWidth="1.8" />
  </svg>
);
const XSvg = () => (
  <svg width="64" height="64" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="12" stroke="#E63950" strokeWidth="1.8" />
    <path
      d="M11 11l10 10M21 11L11 21"
      stroke="#E63950"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

Object.assign(window, { Disclosure });
