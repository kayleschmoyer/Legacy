// Profile.jsx — public profile view
// Receives `person`, `visibility`, `isOwner` (true if viewing as owner/preview),
// `isPublic` (whether the profile is public at all), `heroVariant`, `accent`, `trophyStyle`

const ProfileView = ({
  person,
  visibility,
  isOwner,
  isPublic,
  heroVariant = 'centered',
  trophyStyle = 'mantle',
}) => {
  // If the profile is entirely private and we're not the owner, show locked state
  if (!isPublic && !isOwner) {
    return (
      <div className="ls-page" style={{ paddingTop: 80 }}>
        <div className="hidden-section" style={{ padding: '64px 32px' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>
            <BrandIcon name="secure" size={48} />
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: '.04em',
              textTransform: 'uppercase',
              color: 'var(--fg1)',
              marginBottom: 6,
            }}
          >
            This profile is private
          </div>
          <p style={{ maxWidth: 460, margin: '0 auto', color: 'var(--fg3)' }}>
            @{person.handle} has set their profile to private. Only confirmed
            league managers can see their stats.
          </p>
        </div>
      </div>
    );
  }

  const heroClass =
    heroVariant === 'side'
      ? 'hero-side'
      : heroVariant === 'banner'
        ? 'hero-banner'
        : 'hero-centered';
  const championships = parseInt(person.headlineStat.value, 10) || 0;

  return (
    <div className={`view ${heroClass}`} key={`${heroVariant}`}>
      {/* ── HERO ──────────────────────────────────── */}
      <div className="profile-hero-band">
        <div className="profile-hero-inner">
          <div className="profile-avatar-wrap">
            <div className="profile-avatar-inner">
              {person.initials}
              {championships > 0 && <ChampStar count={championships} />}
            </div>
          </div>

          <div className="hero-text">
            <h1 className="profile-name">{person.name}</h1>
            <div className="profile-handle">
              @{person.handle}
              {visibility.pronouns && person.pronouns && (
                <span> · {person.pronouns}</span>
              )}
            </div>

            {visibility.tagline && person.tagline && (
              <div className="profile-tagline">"{person.tagline}"</div>
            )}

            <div className="profile-meta-row">
              {visibility.location && person.location && (
                <span>
                  <BrandIcon name="league" size={14} opacity={0.6} /> &nbsp;
                  {person.location}
                </span>
              )}
              {visibility.location && visibility.joinedDate && (
                <span className="sep">·</span>
              )}
              {visibility.joinedDate && person.joined && (
                <span>Joined {person.joined}</span>
              )}
              {(visibility.location || visibility.joinedDate) &&
                visibility.globalRank &&
                person.altStats[2]?.value?.startsWith('#') && (
                  <span className="sep">·</span>
                )}
              {visibility.globalRank &&
                person.altStats[2]?.value?.startsWith('#') && (
                  <span>
                    Global rank{' '}
                    <span
                      style={{
                        color: 'var(--brand-gold-light)',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 800,
                      }}
                    >
                      {person.altStats[2].value}
                    </span>
                  </span>
                )}
            </div>

            {heroVariant === 'banner' && (
              <div className="hero-inline-stats" style={{ marginTop: 12 }}>
                {person.inlineStats.map((s) => (
                  <div className="hero-inline-stat" key={s.k}>
                    <div className="k">{s.k}</div>
                    <div className="v">{s.v}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="profile-actions">
              <button className="ls-btn ls-btn-gold">
                <BrandIcon name="bell" size={14} opacity={0.85} /> Follow
              </button>
              <button className="ls-btn ls-btn-ghost">Message</button>
              <button
                className="ls-btn ls-btn-ghost ls-btn-sm"
                title="Share profile"
              >
                Share
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── STAT RIBBON (skip when banner variant shows them inline) ── */}
      {heroVariant !== 'banner' && visibility.stats && (
        <div className="stat-ribbon section appear">
          <div className="stat-card hero">
            <div className="label">{person.headlineStat.label}</div>
            <div className="value">{person.headlineStat.value}</div>
            <div className="sub">All-time titles · across every league</div>
            <div className="icon-bg">
              <Trophy size="lg" />
            </div>
          </div>
          {person.altStats.map((s, i) => (
            <div className="stat-card" key={i}>
              <div className="label">{s.label}</div>
              <div className="value">{s.value}</div>
              <div className="sub">{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      <div className="ls-page">
        {/* ── ABOUT ─────────────────────────────────── */}
        {(visibility.bio || isOwner) && (
          <section className="section appear">
            <header className="section-head">
              <h2>About</h2>
              {isOwner && !visibility.bio && (
                <span className="ls-chip ls-chip-muted">
                  Hidden from visitors
                </span>
              )}
            </header>
            {visibility.bio ? (
              <div className="about-card">
                <div className="about-quotebar" aria-hidden="true" />
                <div>
                  {person.bio.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
                <div className="about-side">
                  <div className="about-fact">
                    <div className="k">Member since</div>
                    <div className="v">{person.joined}</div>
                  </div>
                  <div className="about-fact">
                    <div className="k">Active leagues</div>
                    <div className="v gold">{person.leagues.length}</div>
                  </div>
                  <div className="about-fact">
                    <div className="k">Trophies</div>
                    <div className="v gold">{person.trophies.length}</div>
                  </div>
                </div>
              </div>
            ) : (
              <HiddenStub label="About" />
            )}
          </section>
        )}

        {/* ── TROPHY MANTLE ─────────────────────────── */}
        {(visibility.trophies || isOwner) && (
          <section className="section appear">
            <header className="section-head">
              <h2>Trophy case</h2>
              <span className="ls-meta">
                {person.trophies.length === 0
                  ? 'Still chasing their first ring.'
                  : `${person.trophies.length} title${person.trophies.length === 1 ? '' : 's'} · since ${person.joined.split(' ').slice(-1)[0]}`}
                {isOwner && !visibility.trophies && (
                  <span
                    className="ls-chip ls-chip-muted"
                    style={{ marginLeft: 12 }}
                  >
                    Hidden
                  </span>
                )}
              </span>
            </header>
            {visibility.trophies ? (
              person.trophies.length === 0 ? (
                <div
                  className="hidden-section"
                  style={{ background: 'transparent' }}
                >
                  <em style={{ color: 'var(--fg3)' }}>
                    The mantle's still bare. First ring's coming.
                  </em>
                </div>
              ) : (
                <TrophyCase trophies={person.trophies} style={trophyStyle} />
              )
            ) : (
              <HiddenStub label="Trophy case" />
            )}
          </section>
        )}

        {/* ── FAVORITES ─────────────────────────────── */}
        {(visibility.favorites || isOwner) && (
          <section className="section appear">
            <header className="section-head">
              <h2>Favorites</h2>
              {isOwner && !visibility.favorites && (
                <span className="ls-chip ls-chip-muted">Hidden</span>
              )}
            </header>
            {visibility.favorites ? (
              <div className="fav-row">
                <div className="fav-card">
                  <div className="label">All-time team</div>
                  <div className="value">{person.favTeam}</div>
                  <div className="sub">{person.favTeamSub}</div>
                  <div className="bg-glyph">
                    <BaseballGlyph size={160} opacity={0.06} />
                  </div>
                </div>
                <div className="fav-card">
                  <div className="label">Favorite era</div>
                  <div className="value">{person.favEra}</div>
                  <div className="sub">{person.favEraSub}</div>
                  <div className="bg-glyph">
                    <svg
                      width="160"
                      height="160"
                      viewBox="0 0 32 32"
                      style={{ opacity: 0.08 }}
                    >
                      <circle
                        cx="16"
                        cy="16"
                        r="14"
                        stroke="#fff"
                        strokeWidth="1.2"
                        fill="none"
                      />
                      <path
                        d="M16 4 V16 L24 22"
                        stroke="#fff"
                        strokeWidth="1.2"
                        fill="none"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            ) : (
              <HiddenStub label="Favorites" />
            )}
          </section>
        )}

        {/* ── ACTIVE LEAGUES ────────────────────────── */}
        {(visibility.leagues || isOwner) && (
          <section className="section appear">
            <header className="section-head">
              <h2>Active leagues</h2>
              <span className="ls-meta">
                {person.leagues.length} live ·{' '}
                {person.leagues.filter((l) => l.commish).length > 0
                  ? `Commissioner of ${person.leagues.filter((l) => l.commish).length}`
                  : 'Manager'}
                {isOwner && !visibility.leagues && (
                  <span
                    className="ls-chip ls-chip-muted"
                    style={{ marginLeft: 12 }}
                  >
                    Hidden
                  </span>
                )}
              </span>
            </header>
            {visibility.leagues ? (
              <div className="league-grid">
                {person.leagues.map((l, i) => (
                  <LeagueCard key={i} league={l} />
                ))}
              </div>
            ) : (
              <HiddenStub label="Active leagues" />
            )}
          </section>
        )}

        {/* ── BADGES ────────────────────────────────── */}
        {(visibility.badges || isOwner) && (
          <section className="section appear">
            <header className="section-head">
              <h2>Achievements</h2>
              <span className="ls-meta">
                {person.badges.filter((b) => !b.locked).length} of{' '}
                {person.badges.length} unlocked
                {isOwner && !visibility.badges && (
                  <span
                    className="ls-chip ls-chip-muted"
                    style={{ marginLeft: 12 }}
                  >
                    Hidden
                  </span>
                )}
              </span>
            </header>
            {visibility.badges ? (
              <div className="badge-grid">
                {person.badges.map((b, i) => (
                  <BadgeTile key={i} badge={b} />
                ))}
              </div>
            ) : (
              <HiddenStub label="Achievements" />
            )}
          </section>
        )}
      </div>
    </div>
  );
};

const LeagueCard = ({ league }) => (
  <div className={`league-card ${league.status === 'champ' ? 'champ' : ''}`}>
    <div className="league-card-head">
      <div style={{ minWidth: 0 }}>
        <h3 className="league-card-name">{league.name}</h3>
        <div className="league-card-sub">{league.sub}</div>
      </div>
      {league.status === 'champ' ? (
        <span className="ls-chip ls-chip-gold">
          <span className="ls-dot"></span>Champion
        </span>
      ) : (
        <span className="ls-chip ls-chip-active">
          <span className="ls-dot"></span>Active
        </span>
      )}
    </div>
    <div className="league-card-stats">
      <div className="league-stat">
        <div className="k">Record</div>
        <div className="v">{league.record}</div>
      </div>
      <div className="league-stat">
        <div className="k">Rank</div>
        <div className={`v ${league.rank === '1st' ? 'gold' : ''}`}>
          {league.rank}
        </div>
      </div>
      <div className="league-stat">
        <div className="k">Points</div>
        <div className="v muted">{league.points}</div>
      </div>
    </div>
  </div>
);

const BadgeTile = ({ badge }) => (
  <div className={`badge ${badge.kind || ''} ${badge.locked ? 'locked' : ''}`}>
    <div className="badge-icon">{badge.glyph}</div>
    <div className="badge-name">{badge.name}</div>
    <div className="badge-desc">{badge.desc}</div>
    {badge.rare && !badge.locked && (
      <div className="badge-rare">{badge.rare}</div>
    )}
  </div>
);

// Trophy display modes
const TrophyCase = ({ trophies, style }) => {
  if (style === 'grid') {
    return (
      <div
        className="badge-grid"
        style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}
      >
        {trophies.map((t, i) => (
          <div
            key={i}
            className="league-card champ"
            style={{ alignItems: 'center', textAlign: 'center' }}
          >
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Trophy size="md" silver={t.silver} bronze={t.bronze} />
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                color: 'var(--brand-gold-light)',
                fontSize: 15,
                letterSpacing: '.06em',
              }}
            >
              {t.year}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                color: 'var(--fg1)',
                fontWeight: 600,
              }}
            >
              {t.league}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                color: 'var(--fg3)',
                fontStyle: 'italic',
              }}
            >
              {t.finish}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (style === 'timeline') {
    return (
      <div
        style={{
          background: 'var(--surface-card)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-5)',
          padding: '8px 24px',
        }}
      >
        {trophies.map((t, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '88px 1fr auto',
              gap: 20,
              alignItems: 'center',
              padding: '16px 0',
              borderBottom:
                i < trophies.length - 1
                  ? '1px solid var(--outline-subtle)'
                  : 'none',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 32,
                color: 'var(--brand-gold-light)',
                letterSpacing: '.02em',
                lineHeight: 1,
              }}
            >
              {t.year}
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 16,
                  color: 'var(--fg1)',
                  letterSpacing: '.04em',
                }}
              >
                {t.league}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  color: 'var(--fg3)',
                  fontStyle: 'italic',
                  marginTop: 2,
                }}
              >
                {t.finish}
              </div>
            </div>
            <Trophy size="sm" silver={t.silver} bronze={t.bronze} />
          </div>
        ))}
      </div>
    );
  }
  // default: mantle
  return (
    <div className="mantle">
      <div className="mantle-shelf">
        {trophies.map((t, i) => (
          <div className="trophy" key={i}>
            <Trophy size={t.size || 'md'} silver={t.silver} bronze={t.bronze} />
            <div className="caption">
              <div className="year">{t.year}</div>
              <div className="league">{t.league}</div>
              <div className="finish">{t.finish}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mantle-floor" />
    </div>
  );
};

Object.assign(window, { ProfileView, LeagueCard, BadgeTile, TrophyCase });
