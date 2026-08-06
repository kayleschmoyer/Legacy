// Hub.jsx — game selection page (root)
const GAMES_LIST = [
  {
    id: 'season-draft',
    title: 'Season Draft',
    tag: 'Multiplayer · 2–6 players',
    desc: 'Draft hitters or pitchers across eras. Pick the right season, fill your roster, rack up the counting stats. Last one standing with the biggest number wins.',
    accent: 'navy',
    icon: 'icons/draft.svg',
    stat: { label: 'Games Active', value: '3' },
    meta: ['Pick your stat: HR · SO · RBI · W', 'Season or Career-w/-Team'],
    cta: 'Enter Lobby',
  },
  {
    id: 'disclosure',
    title: 'Who Am I?',
    tag: 'Solo · 2–3 min',
    desc: 'Clues drop one at a time — birthplace, era, quirks, milestones. Name the player with the fewest clues revealed for a higher score.',
    accent: 'seam',
    icon: 'icons/stats.svg',
    stat: { label: 'Your Best', value: '84' },
    meta: ['7 clues per player', 'Hall of Famers to deep cuts'],
    cta: 'Play Now',
  },
];

const HubSkeleton = () => (
  <>
    {/* SKELETON: mirrors .hub-hero's two-column grid (copy + hero-mark) and the stats row */}
    <section className="hub-hero" aria-hidden="true">
      <div className="hub-hero-copy">
        <Skel w={190} h={13} r={9999} style={{ marginBottom: 18 }} />
        <Skel w="72%" h={44} r={8} style={{ marginBottom: 10 }} />
        <Skel w="52%" h={44} r={8} style={{ marginBottom: 20 }} />
        <Skel w="88%" h={16} r={6} style={{ marginBottom: 8 }} />
        <Skel w="58%" h={16} r={6} style={{ marginBottom: 26 }} />
        <div
          style={{
            display: 'flex',
            gap: 22,
            paddingTop: 20,
            borderTop: '1px solid rgba(255,255,255,.08)',
          }}
        >
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Skel w={50} h={22} r={4} style={{ marginBottom: 6 }} />
              <Skel w={72} h={10} r={4} />
            </div>
          ))}
        </div>
      </div>
      <Skel
        w="100%"
        h={220}
        r="50%"
        style={{ maxWidth: 220, justifySelf: 'end', aspectRatio: '1 / 1' }}
      />
    </section>

    {/* SKELETON: mirrors the two .hub-card tiles — icon, tag, title, desc, meta, footer stat+cta */}
    <div className="hub-games" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="hub-card" style={{ cursor: 'default' }}>
          <div className="hub-card-top">
            <Skel w={52} h={52} r={12} />
            <Skel w={92} h={24} r={9999} />
          </div>
          <Skel w="64%" h={38} r={6} style={{ marginTop: 4 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skel w="100%" h={13} r={4} />
            <Skel w="94%" h={13} r={4} />
            <Skel w="55%" h={13} r={4} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skel w="48%" h={12} r={4} />
            <Skel w="38%" h={12} r={4} />
          </div>
          <div className="hub-card-foot">
            <div>
              <Skel w={38} h={22} r={4} style={{ marginBottom: 5 }} />
              <Skel w={68} h={10} r={4} />
            </div>
            <Skel w={104} h={36} r={9999} />
          </div>
        </div>
      ))}
    </div>
  </>
);

const HubEmptyGlyph = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M8 13.5q4 3 8 0M9 9.5h.01M15 9.5h.01"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const Hub = ({ onNavigate }) => {
  const [viewState, setViewState] = React.useState('populated');
  return (
    <div className="hub">
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

      {viewState === 'loading' && <HubSkeleton />}

      {viewState === 'error' && (
        <ErrorCard
          title="Can't load the minigames catalog"
          message="The game-selection service didn't respond in time. Your saved progress is safe — try again in a moment."
          onRetry={() => setViewState('populated')}
        />
      )}

      {viewState === 'empty' && (
        <EmptyCard
          icon={<HubEmptyGlyph />}
          title="Rain delay."
          message="Both minigames are between seasons for scheduled maintenance. Check back before first pitch — or browse the archive while you wait."
          cta="Browse Player Stats"
          onCta={() => {}}
        />
      )}

      {viewState === 'populated' && (
        <>
          <section className="hub-hero">
        <div className="hub-hero-copy">
          <div className="eyebrow hub-eyebrow">
            <span className="hub-eyebrow-dot" />
            Minigames · Off-Season
          </div>
          <h1 className="hub-h1">
            The game doesn't stop
            <br />
            <span className="hub-h1-accent">when the season does.</span>
          </h1>
          <p className="hub-lede">
            Quick-draft showdowns and trivia built on 150 years of archived
            statistics. Play with friends or solo against the record book.
          </p>
          <div className="hub-stats-row">
            <div className="hub-stat">
              <div className="hub-stat-n">1.8M</div>
              <div className="hub-stat-l">Player-Seasons</div>
            </div>
            <div className="hub-stat-sep" />
            <div className="hub-stat">
              <div className="hub-stat-n">1871</div>
              <div className="hub-stat-l">Earliest Record</div>
            </div>
            <div className="hub-stat-sep" />
            <div className="hub-stat">
              <div className="hub-stat-n">24,000+</div>
              <div className="hub-stat-l">Players Tracked</div>
            </div>
          </div>
        </div>
        <div className="hub-hero-mark" aria-hidden="true">
          <svg viewBox="0 0 240 240" fill="none">
            <defs>
              <radialGradient id="ballGrad" cx="36%" cy="30%" r="72%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="45%" stopColor="#F4EEDA" />
                <stop offset="100%" stopColor="#A89A76" />
              </radialGradient>
              <radialGradient id="ballShine" cx="32%" cy="26%" r="26%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </radialGradient>
              <radialGradient id="ballShadow" cx="70%" cy="78%" r="50%">
                <stop offset="0%" stopColor="rgba(40,30,15,0.28)" />
                <stop offset="100%" stopColor="rgba(40,30,15,0)" />
              </radialGradient>
            </defs>
            {/* ground shadow */}
            <ellipse cx="120" cy="222" rx="82" ry="8" fill="rgba(0,0,0,0.35)" />
            {/* ball body */}
            <circle cx="120" cy="118" r="100" fill="url(#ballGrad)" />
            <circle cx="120" cy="118" r="100" fill="url(#ballShadow)" />
            <circle cx="120" cy="118" r="100" fill="url(#ballShine)" />
            <circle
              cx="120"
              cy="118"
              r="100"
              fill="none"
              stroke="#6B5F47"
              strokeWidth="1"
              opacity="0.35"
            />
            {(() => {
              // Two symmetric parenthesis-shaped seams — each starts near top,
              // bows TOWARD the center, ends near bottom. Like `) (`.
              // Ball: cx=120, cy=118, r=100
              // Endpoints at ~x=60 and ~x=180 on ball circumference.
              // For circle cx=120 cy=118 r=100: at x=60, y=118±√(10000-3600)=118±80
              const seams = [
                {
                  // LEFT seam — endpoints at x=60, curves to x=95 at midpoint.
                  pts: [
                    [60, 38],
                    [95, 78],
                    [95, 158],
                    [60, 198],
                  ],
                },
                {
                  // RIGHT seam — mirror. endpoints at x=180, curves to x=145.
                  pts: [
                    [180, 38],
                    [145, 78],
                    [145, 158],
                    [180, 198],
                  ],
                },
              ];
              const STITCHES = 22;
              const LEN = 7; // stitch length
              const SLANT = 0.55; // how much it leans along the seam (0=perpendicular, 1=parallel)
              const ARC = 2.2; // bow of the stitch arc
              const els = [];
              seams.forEach((s, si) => {
                const [p0, p1, p2, p3] = s.pts;
                // seam line itself — thin red curve running down the middle
                const d = `M ${p0[0]} ${p0[1]} C ${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]} ${p3[0]} ${p3[1]}`;
                els.push(
                  <path
                    key={'seam' + si}
                    d={d}
                    stroke="#B01E37"
                    strokeWidth="1.6"
                    fill="none"
                    strokeLinecap="round"
                    opacity="0.9"
                  />,
                );
                for (let i = 0; i < STITCHES; i++) {
                  const t = (i + 0.5) / STITCHES;
                  const u = 1 - t;
                  const x =
                    u * u * u * p0[0] +
                    3 * u * u * t * p1[0] +
                    3 * u * t * t * p2[0] +
                    t * t * t * p3[0];
                  const y =
                    u * u * u * p0[1] +
                    3 * u * u * t * p1[1] +
                    3 * u * t * t * p2[1] +
                    t * t * t * p3[1];
                  const tx =
                    3 * u * u * (p1[0] - p0[0]) +
                    6 * u * t * (p2[0] - p1[0]) +
                    3 * t * t * (p3[0] - p2[0]);
                  const ty =
                    3 * u * u * (p1[1] - p0[1]) +
                    6 * u * t * (p2[1] - p1[1]) +
                    3 * t * t * (p3[1] - p2[1]);
                  const L = Math.hypot(tx, ty);
                  const ux = tx / L,
                    uy = ty / L; // along-seam unit
                  let nx = -uy,
                    ny = ux; // perpendicular
                  const towardCenter = Math.sign(
                    (120 - x) * nx + (118 - y) * ny,
                  );
                  if (towardCenter < 0) {
                    nx = -nx;
                    ny = -ny;
                  }
                  // slant alternates, producing the V / zig-zag look of real baseball stitches
                  const slantDir = i % 2 === 0 ? 1 : -1;
                  // stitch vector = perpendicular + a bit of along-seam lean
                  const sx = nx + ux * SLANT * slantDir;
                  const sy = ny + uy * SLANT * slantDir;
                  const sL = Math.hypot(sx, sy);
                  const sux = sx / sL,
                    suy = sy / sL;
                  // stitch endpoints, centered on the seam, shifted slightly outward
                  const ax = x - sux * (LEN / 2) - nx * 0.5;
                  const ay = y - suy * (LEN / 2) - ny * 0.5;
                  const bx = x + sux * (LEN / 2) - nx * 0.5;
                  const by = y + suy * (LEN / 2) - ny * 0.5;
                  // arc control — bow the stitch away from the seam center (outward)
                  const mx = (ax + bx) / 2 - nx * ARC;
                  const my = (ay + by) / 2 - ny * ARC;
                  els.push(
                    <path
                      key={`st${si}-${i}`}
                      d={`M ${ax.toFixed(1)} ${ay.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`}
                      stroke="#8B1A2B"
                      strokeWidth="1.6"
                      fill="none"
                      strokeLinecap="round"
                    />,
                  );
                }
              });
              return els;
            })()}
          </svg>
        </div>
      </section>

      <div className="hub-games">
        {GAMES_LIST.map((g) => (
          <button
            key={g.id}
            className={`hub-card hub-card-${g.accent}`}
            onClick={() => onNavigate(g.id)}
          >
            <div className="hub-card-top">
              <div className={`hub-card-icon hub-card-icon-${g.accent}`}>
                <img src={g.icon} width="26" height="26" alt="" />
              </div>
              <div className="hub-card-tag">{g.tag}</div>
            </div>
            <div className="hub-card-title">{g.title}</div>
            <p className="hub-card-desc">{g.desc}</p>
            <ul className="hub-card-meta">
              {g.meta.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <div className="hub-card-foot">
              <div className="hub-card-stat">
                <div className="hub-card-stat-n">{g.stat.value}</div>
                <div className="hub-card-stat-l">{g.stat.label}</div>
              </div>
              <div className="hub-card-cta">
                {g.cta}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12h14M13 6l6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="hub-footer-note">
        <div>
          <div className="eyebrow" style={{ color: 'var(--fg3)' }}>
            Coming Soon
          </div>
          <div className="hub-footer-title">
            Trade Deadline · Pennant Picks · Box Score Quiz
          </div>
        </div>
        <div className="hub-footer-sub">
          Three more modes in the dugout. Winter is long.
        </div>
      </div>
        </>
      )}
    </div>
  );
};

Object.assign(window, { Hub });
