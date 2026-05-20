// Landing.jsx — marketing page
const Landing = ({ onEnter }) => (
  <div className="ls-landing">
    <section className="ls-hero">
      <div className="ls-eyebrow">Fantasy Baseball · Year-Round</div>
      <h1 className="ls-h1">
        Build Your Dynasty.
        <br />
        Dominate Your League.
      </h1>
      <p className="ls-lede">
        The only fantasy baseball platform powered by real MLB history — draft
        legends across every era and compete on archived statistics.
      </p>
      <div className="ls-hero-ctas">
        <button className="ls-btn ls-btn-gold" onClick={onEnter}>
          Start Your League
        </button>
        <button className="ls-btn ls-btn-ghost">Watch Demo</button>
      </div>
      <div className="ls-trust">Free to play · No credit card required</div>
    </section>

    <section className="ls-section">
      <div className="ls-eyebrow">Features</div>
      <h2 className="ls-h2">Everything you need to win</h2>
      <div className="ls-feature-grid">
        {[
          [
            'stats',
            'Live Stats',
            'Real-time statistics updated as the game unfolds, so you never miss a move.',
          ],
          [
            'draft',
            'Draft Tools',
            'Rank, queue, and analyze. Our draft board knows every era in the sport.',
          ],
          [
            'zap',
            'Instant Updates',
            'Lineup moves, trades, and injuries land the moment they happen.',
          ],
          [
            'secure',
            'Secure Leagues',
            'Private invite-only leagues with commissioner controls you can trust.',
          ],
        ].map(([icon, title, copy]) => (
          <div className="ls-feature" key={icon}>
            <div className="ls-feature-icon">
              <img
                src={`../../icons/brand/${icon}.svg`}
                width="32"
                height="32"
                alt=""
              />
            </div>
            <h3 className="ls-h4">{title}</h3>
            <p>{copy}</p>
          </div>
        ))}
      </div>
    </section>

    <section className="ls-section">
      <div className="ls-eyebrow">All Sports</div>
      <h2 className="ls-h2">Pick your sport</h2>
      <div className="ls-sport-grid">
        <button className="ls-sport-card ls-sport-bb" onClick={onEnter}>
          <img
            src="../../icons/brand/baseball.svg"
            width="48"
            height="48"
            alt=""
          />
          <div className="ls-sport-title">Baseball</div>
          <div className="ls-sport-sub">162 games · Every era since 1876</div>
          <span className="ls-chip ls-chip-active">Active</span>
        </button>
        <div className="ls-sport-card ls-sport-fb ls-disabled">
          <img
            src="../../icons/brand/football.svg"
            width="48"
            height="48"
            alt=""
          />
          <div className="ls-sport-title">Football</div>
          <div className="ls-sport-sub">
            17 games · Coming for the 2026 season
          </div>
          <span className="ls-chip ls-chip-soon">Coming Soon</span>
        </div>
      </div>
    </section>

    <section className="ls-cta">
      <h2 className="ls-h2">Ready to play?</h2>
      <p className="ls-lede">
        Join thousands of commissioners running year-round leagues.
      </p>
      <button className="ls-btn ls-btn-gold" onClick={onEnter}>
        Create Your First League
      </button>
    </section>
  </div>
);
Object.assign(window, { Landing });
