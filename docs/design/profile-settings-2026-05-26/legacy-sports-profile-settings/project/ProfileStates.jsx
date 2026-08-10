// ProfileStates.jsx — loading-skeleton + empty states.
//
// The skeleton renders the ACTUAL <ProfileSettings/> tree inside `.lg-skeleton`.
// Geometry (card order, tops, heights, wrapping, container queries) is therefore
// identical to the populated state by construction — styles.css only blanks the
// paint: text runs become per-line bars (background sized in `lh` units, so a
// string that wraps to 3 lines yields 3 bars), icons/avatars/switches/buttons
// become flat fills. Nothing is re-measured or hand-sized.

// Emits a real HTML comment into the DOM documenting the (unimplemented) shimmer.
const ShimmerNote = () => (
  <div style={{ display: "none" }} dangerouslySetInnerHTML={{ __html:
    "<!-- shimmer: 1.5s ease-in-out infinite · highlight band sweeps translateX(-100%) → translateX(100%) across each fill, gradient stop rgba(255,255,255,.09) · staggered 60ms per card · disabled under prefers-reduced-motion -->"
  }}/>
);

const ProfileSettingsSkeleton = (props) => (
  <div className="lg-skeleton" aria-busy="true" aria-label="Loading profile settings" inert="">
    <ShimmerNote/>
    <ProfileSettings {...props}/>
  </div>
);

// ── Empty state: profile is public, but zero sections enabled ───
const PublicProfileEmpty = ({ viewer = "owner", handle = "marcus-j" }) => {
  const owner = viewer === "owner";
  return (
    <div className="lg-host">
      <TopNav/>
      <main className="lg-pub-host">
        {owner && (
          <div className="lg-eyebrow" style={{ marginBottom: 12 }}>
            Your public profile · viewing as owner
          </div>
        )}

        {/* Hero keeps its shell so the page never collapses to nothing */}
        <section className="lg-pub-hero">
          <div className="lg-pub-hero-row">
            <div className="lg-avatar-xl" style={{ width: 96, height: 96, fontSize: 38, background: "linear-gradient(135deg,#8B6F47,#1B3A5C)" }}>MJ</div>
            <div className="lg-pub-hero-main">
              <div className="lg-pub-handle">/u/{handle}</div>
              <h1 className="lg-pub-name">Marcus Johnson</h1>
              <div className="lg-pub-meta">
                <div className="item"><I.Eye/> Profile is public · no sections shared</div>
              </div>
            </div>
          </div>

          <div className="lg-empty">
            <div className="lg-empty-icon"><I.EyeOff/></div>
            <h2>{owner ? "Nothing on your profile yet" : "Nothing to show here yet"}</h2>
            <p>
              {owner
                ? "Your profile is live, but every section is switched off — visitors see only your name and handle. Turn on a section to start showing your record."
                : "This manager hasn't shared any sections yet. Check back after their next league — or find them on the leaderboard."}
            </p>

            {owner && (
              <div className="lg-empty-suggest">
                <div className="lg-empty-suggest-head">Start with</div>
                <div className="lg-empty-chips">
                  <span className="lg-chip lg-chip-member"><I.User w={11}/>About / Bio</span>
                  <span className="lg-chip lg-chip-member"><I.Star w={11}/>Career stats</span>
                  <span className="lg-chip lg-chip-member"><I.Trophy w={11}/>Trophy case</span>
                </div>
              </div>
            )}

            <div className="lg-empty-cta">
              {owner ? (
                <>
                  <button className="lg-btn lg-btn-gold lg-btn-lg"><I.Eye w={13}/>Enable a section</button>
                  <button className="lg-btn lg-btn-ghost lg-btn-lg">Back to settings</button>
                </>
              ) : (
                <>
                  <button className="lg-btn lg-btn-ghost lg-btn-lg">Back to leaderboard</button>
                  <button className="lg-btn lg-btn-gold lg-btn-lg">View shared leagues</button>
                </>
              )}
            </div>
            {owner && <div className="lg-empty-foot">0 of 6 sections public · changes auto-save</div>}
          </div>
        </section>
      </main>
    </div>
  );
};

Object.assign(window, { ProfileSettingsSkeleton, PublicProfileEmpty, ShimmerNote });
