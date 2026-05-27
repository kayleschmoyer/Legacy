// PublicProfileHero.jsx — owner viewing their own /u/:handle public profile.
// When sections are toggled OFF in settings, the OWNER (not visitor) still
// sees the slot rendered with a "Hidden" chip so they know what's off.

const PublicProfileHero = ({
  visibility = {
    isPublic: true,
    bio: true,
    stats: true,
    trophies: false,
    favorites: true,
    leagues: true,
    badges: false,
    location: true,
    pronouns: false,
    joinedDate: true,
    tagline: true,
    globalRank: true,
  },
}) => {
  const detailHidden = (k) => !visibility[k];
  return (
    <div className="lg-host">
      <TopNav />
      <main className="lg-pub-host">
        <div className="lg-eyebrow" style={{ marginBottom: 12 }}>
          Your public profile · viewing as owner
        </div>

        <section className="lg-pub-hero">
          <div className="lg-pub-hero-row">
            <div
              className="lg-avatar-xl"
              style={{
                width: 96,
                height: 96,
                fontSize: 38,
                background: 'linear-gradient(135deg,#8B6F47,#1B3A5C)',
              }}
            >
              MJ
            </div>
            <div className="lg-pub-hero-main">
              <div className="lg-pub-handle">/u/marcus-j</div>
              <h1 className="lg-pub-name">Marcus Johnson</h1>
              {!detailHidden('tagline') ? (
                <div className="lg-pub-tagline">
                  "I draft Ruth, Mantle and Trout. Then I let history sort it
                  out."
                </div>
              ) : (
                <div
                  className="lg-pub-tagline"
                  style={{ opacity: 0.42, fontStyle: 'italic' }}
                >
                  Tagline hidden{' '}
                  <span
                    className="lg-chip-hidden lg-chip"
                    style={{ marginLeft: 10 }}
                  >
                    <I.EyeOff w={11} />
                    Hidden
                  </span>
                </div>
              )}
              <div className="lg-pub-meta">
                <div
                  className={`item ${detailHidden('location') ? 'is-hidden' : ''}`}
                >
                  <I.MapPin /> Brooklyn, NY
                  {detailHidden('location') && (
                    <span className="lg-chip-hidden lg-chip">
                      <I.EyeOff w={11} />
                      Hidden
                    </span>
                  )}
                </div>
                <div
                  className={`item ${detailHidden('pronouns') ? 'is-hidden' : ''}`}
                >
                  <I.User /> he/him
                  {detailHidden('pronouns') && (
                    <span className="lg-chip-hidden lg-chip">
                      <I.EyeOff w={11} />
                      Hidden
                    </span>
                  )}
                </div>
                <div
                  className={`item ${detailHidden('joinedDate') ? 'is-hidden' : ''}`}
                >
                  <I.Calendar /> Member since Apr 2023
                  {detailHidden('joinedDate') && (
                    <span className="lg-chip-hidden lg-chip">
                      <I.EyeOff w={11} />
                      Hidden
                    </span>
                  )}
                </div>
              </div>
            </div>
            {!detailHidden('globalRank') ? (
              <div className="lg-pub-rank">
                <div className="label">Global Rank</div>
                <div className="value">#412</div>
                <div className="label" style={{ color: 'var(--fg3)' }}>
                  of 184,210
                </div>
              </div>
            ) : (
              <div
                className="lg-pub-rank"
                style={{
                  opacity: 0.42,
                  borderStyle: 'dashed',
                  boxShadow: 'none',
                  background: 'rgba(255,255,255,.03)',
                }}
              >
                <div className="label">Global Rank</div>
                <div className="value" style={{ color: 'var(--fg4)' }}>
                  —
                </div>
                <span className="lg-chip-hidden lg-chip">
                  <I.EyeOff w={11} />
                  Hidden
                </span>
              </div>
            )}
          </div>

          {/* Section blocks */}
          <div className="lg-pub-grid">
            <PubBlock title="About" hidden={!visibility.bio}>
              <p>
                Long-time A's fan, fantasy commissioner since 2014. Six leagues
                active. Member of three Hall of Fame draft pools. Career W-L
                384-216.
              </p>
            </PubBlock>

            <PubBlock title="Career Stats" hidden={!visibility.stats}>
              <div className="lg-pub-stats">
                <div className="lg-pub-stat">
                  <div className="v">7</div>
                  <div className="k">Championships</div>
                </div>
                <div className="lg-pub-stat">
                  <div className="v">.640</div>
                  <div className="k">Win Rate</div>
                </div>
                <div className="lg-pub-stat">
                  <div className="v">384–216</div>
                  <div className="k">All-Time Record</div>
                </div>
                <div className="lg-pub-stat">
                  <div className="v">#412</div>
                  <div className="k">Global Rank</div>
                </div>
              </div>
            </PubBlock>

            <PubBlock title="Trophy Case" hidden={!visibility.trophies}>
              <p
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  color: 'var(--fg2)',
                }}
              >
                <I.Trophy w={18} /> 7 titles · 4 runner-ups · 12 podium finishes
              </p>
            </PubBlock>

            <PubBlock title="Favorites" hidden={!visibility.favorites}>
              <p>
                <span style={{ color: 'var(--fg3)' }}>All-time team:</span> 1927
                Yankees
              </p>
              <p>
                <span style={{ color: 'var(--fg3)' }}>Favorite era:</span>{' '}
                Live-ball, 1920–1941
              </p>
            </PubBlock>

            <PubBlock title="Active Leagues" hidden={!visibility.leagues}>
              <p>Diamond Dynasty Eight · 8-4 · 2nd</p>
              <p>The Cooperstown Eleven · 9-3 · 1st</p>
              <p>Negro Leagues Honors · 6-6 · 5th</p>
            </PubBlock>

            <PubBlock title="Achievements" hidden={!visibility.badges}>
              <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="lg-chip lg-chip-member">
                  <I.Star w={11} />
                  Three-peat
                </span>
                <span className="lg-chip lg-chip-member">
                  <I.Trophy w={11} />
                  Champion ×7
                </span>
                <span className="lg-chip-soft">+ 14 more</span>
              </p>
            </PubBlock>
          </div>
        </section>
      </main>
    </div>
  );
};

const PubBlock = ({ title, hidden, children }) => (
  <div className={`lg-pub-block ${hidden ? 'is-hidden' : ''}`}>
    <div className="lg-pub-block-head">
      <div className="lg-pub-block-title">{title}</div>
      <div className="lg-pub-block-spacer" />
      {hidden && (
        <span className="lg-chip lg-chip-hidden">
          <I.EyeOff w={11} />
          Hidden
        </span>
      )}
    </div>
    <div className="lg-pub-block-body">{children}</div>
  </div>
);

// ── Visitor's locked screen (master = OFF) ─────────────────────
const VisitorLocked = ({ handle = 'marcus-j' }) => (
  <div className="lg-host">
    <TopNav />
    <main className="lg-pub-host">
      <div className="lg-locked">
        <div className="lg-locked-icon">
          <I.Lock />
        </div>
        <div className="handle">/u/{handle}</div>
        <h2>This profile is private</h2>
        <p>
          The manager has chosen not to share their profile publicly. You can
          still see them on leaderboards and in leagues you share.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="lg-btn lg-btn-ghost">Back to leaderboard</button>
          <button className="lg-btn lg-btn-gold">View shared leagues</button>
        </div>
      </div>
    </main>
  </div>
);

Object.assign(window, { PublicProfileHero, VisitorLocked, PubBlock });
