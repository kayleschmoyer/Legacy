// ProfileSettings.jsx — the full /profile/settings page
// Wraps the page in a container-query host. All breakpoint behaviour
// is driven from styles.css using @container queries on `page`.

const TopNav = ({ active = 'settings' }) => (
  <header className="lg-nav">
    <div className="lg-nav-inner">
      <div className="lg-brand">
        <img src="assets/logo.png" alt="Legacy Sports" />
        <div className="lg-wordmark">
          LEGACY<span>SPORTS</span>
        </div>
      </div>
      <nav className="lg-nav-tabs">
        <a>
          <img
            src="assets/icons/scoreboard.svg"
            width="14"
            height="14"
            alt=""
          />
          Home
        </a>
        <a>
          <img src="assets/icons/live.svg" width="14" height="14" alt="" />
          Scoreboard
        </a>
        <a>
          <img src="assets/icons/league.svg" width="14" height="14" alt="" />
          My League
        </a>
        <a>
          <img src="assets/icons/draft.svg" width="14" height="14" alt="" />
          Draft
        </a>
      </nav>
      <div className="lg-nav-right">
        <button className="lg-burger" aria-label="Menu">
          <span></span>
          <span></span>
          <span></span>
        </button>
        <button className="lg-icon-btn" title="Notifications">
          <img src="assets/icons/bell.svg" width="18" height="18" alt="" />
        </button>
        <div className="lg-nav-avatar">MJ</div>
      </div>
    </div>
  </header>
);

// ── A single toggle row ─────────────────────────────────────────
const ToggleRow = ({ label, hint, on, onChange, disabled, hidden }) => (
  <div className="lg-toggle-row">
    <div className="text">
      <div className="lbl">
        {label}
        {!on && !disabled && hidden && (
          <span className="lg-chip-soft">Hidden on profile</span>
        )}
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
    <button
      className={`lg-sw ${on ? 'on' : ''}`}
      disabled={disabled}
      onClick={() => !disabled && onChange(!on)}
      aria-pressed={on}
    />
  </div>
);

// ── Page ────────────────────────────────────────────────────────
const ProfileSettings = ({
  initialPublic = {
    isPublic: true,
    bio: true,
    stats: true,
    trophies: true,
    favorites: true,
    leagues: true,
    badges: true,
    location: true,
    pronouns: true,
    joinedDate: true,
    tagline: true,
    globalRank: true,
  },
  user = {
    name: 'Marcus Johnson',
    email: 'marcus.johnson@gmail.com',
    handle: 'marcus-j',
    username: 'marcusj42',
    access: 'Member',
    userId: 'usr_8f7a4c1d-3e22-4b91-a8f6-d2c0e91f7b25',
    photo: true,
    initials: 'MJ',
  },
  initialDiscord = { state: 'not_connected', username: null }, // not_connected · connected · disconnecting · error
  initialUsernameMode = 'view', // view · edit · saving · error
  initialAvatarSaving = false,
  initialStickyBar = 'hidden', // hidden · default · saved · all-hidden
}) => {
  const [pub, setPub] = React.useState(initialPublic);
  const [discord, setDiscord] = React.useState(initialDiscord);
  const [umode, setUmode] = React.useState(initialUsernameMode);
  const [usernameDraft, setUsernameDraft] = React.useState(user.username);
  const [avatar, setAvatar] = React.useState({
    idx: 0,
    saving: initialAvatarSaving,
  });
  const [stickyBar, setStickyBar] = React.useState(initialStickyBar);
  const stickyFlashRef = React.useRef(null);

  const setPubKey = (k, v) => {
    setPub((p) => ({ ...p, [k]: v }));
    // surface sticky bar after any change
    setStickyBar('saved');
    if (stickyFlashRef.current) clearTimeout(stickyFlashRef.current);
    stickyFlashRef.current = setTimeout(() => setStickyBar('default'), 1100);
  };

  const sectionKeys = [
    'bio',
    'stats',
    'trophies',
    'favorites',
    'leagues',
    'badges',
  ];
  const sectionsOn = sectionKeys.filter((k) => pub[k]).length;
  const allOff = pub.isPublic && sectionsOn === 0;

  const usernameValid = /^[a-zA-Z0-9_.-]{3,50}$/.test(usernameDraft);
  const usernameError =
    umode === 'error' || (umode === 'edit' && !usernameValid);

  return (
    <div className="lg-host">
      <TopNav />
      <main className="lg-page">
        {/* ── Page header ─────────────────────────────── */}
        <div className="lg-page-head">
          <div className="lg-eyebrow">Account</div>
          <h1 className="lg-h1">Profile Settings</h1>
          <p className="lg-sub">
            Manage your account information and preferences.
          </p>
        </div>

        {/* ── 2. Profile hero card ────────────────────── */}
        <div className="lg-hero-card">
          <div className="lg-hero-row">
            {user.photo ? (
              <div
                className="lg-avatar-xl"
                style={{
                  background: 'linear-gradient(135deg,#8B6F47,#1B3A5C)',
                }}
              >
                {user.initials}
              </div>
            ) : (
              <div className="lg-avatar-xl">{user.initials}</div>
            )}
            <div className="lg-hero-text">
              <h2 className="lg-display-name">{user.name}</h2>
              <div className="lg-hero-email">{user.email}</div>
              <div className="lg-hero-badges">
                <span
                  className={`lg-chip lg-chip-${user.access.toLowerCase()}`}
                >
                  {user.access === 'Administrator' && (
                    <span className="lg-dot" />
                  )}
                  {user.access}
                </span>
                <span className="lg-chip-soft">Joined Apr 2023</span>
              </div>
            </div>
          </div>

          {/* Field list */}
          <div className="lg-divider" style={{ margin: '22px -4px' }} />
          <div className="lg-fields">
            {/* Username — inline editable */}
            <div className="lg-field">
              <div className="lg-field-label">Username</div>
              <div className="lg-field-row">
                {umode === 'view' && (
                  <>
                    <div className="lg-field-value">{usernameDraft}</div>
                    <div className="lg-field-actions">
                      <button
                        className="lg-btn lg-btn-ghost"
                        onClick={() => setUmode('edit')}
                      >
                        <I.Edit w={13} />
                        Edit
                      </button>
                    </div>
                  </>
                )}
                {umode === 'edit' && (
                  <>
                    <input
                      className={`lg-input ${usernameError ? 'lg-input-err' : ''}`}
                      value={usernameDraft}
                      onChange={(e) => setUsernameDraft(e.target.value)}
                      placeholder="3–50 chars · a-z 0-9 _ . -"
                      autoFocus
                    />
                    <div className="lg-field-actions">
                      <button
                        className="lg-btn lg-btn-ghost lg-btn-sm"
                        onClick={() => {
                          setUsernameDraft(user.username);
                          setUmode('view');
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        className="lg-btn lg-btn-gold lg-btn-sm"
                        disabled={!usernameValid}
                        onClick={() => {
                          setUmode('saving');
                          setTimeout(() => setUmode('view'), 900);
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </>
                )}
                {umode === 'saving' && (
                  <>
                    <input
                      className="lg-input"
                      value={usernameDraft}
                      disabled
                    />
                    <div className="lg-field-actions">
                      <button className="lg-btn lg-btn-gold lg-btn-sm" disabled>
                        <span className="lg-spinner" />
                        Saving…
                      </button>
                    </div>
                  </>
                )}
              </div>
              {umode === 'edit' && !usernameValid && (
                <div className="lg-err">
                  <I.Alert w={13} />
                  3–50 characters. Letters, numbers, underscore, period or dash.
                </div>
              )}
              {umode === 'error' && (
                <div className="lg-err">
                  <I.Alert w={13} />
                  That username is already taken.
                </div>
              )}
            </div>

            <div className="lg-field">
              <div className="lg-field-label">Email</div>
              <div className="lg-field-row">
                <div className="lg-field-value">
                  <GoogleG size={14} /> {user.email}
                  <span className="lg-chip-soft">Managed by Google</span>
                </div>
              </div>
            </div>

            <div className="lg-field">
              <div className="lg-field-label">Access Level</div>
              <div className="lg-field-row">
                <div className="lg-field-value">
                  <span
                    className={`lg-chip lg-chip-${user.access.toLowerCase()}`}
                  >
                    {user.access}
                  </span>
                </div>
              </div>
            </div>

            <div className="lg-field">
              <div className="lg-field-label">User ID</div>
              <div className="lg-field-row">
                <div className="lg-field-value lg-mono">{user.userId}</div>
              </div>
            </div>
          </div>

          {/* Info banner */}
          <div className="lg-info-banner">
            <I.Info w={18} />
            <p>
              Your email and Google profile photo are managed through Google. To
              change them, update your Google account. Discord username and
              avatar are managed in
              <span style={{ color: 'var(--brand-gold-light)' }}>
                {' '}
                Connected Accounts
              </span>{' '}
              below.
            </p>
          </div>
        </div>

        {/* ── 3. App Avatar ───────────────────────────── */}
        <SectionCard
          icon={<I.Camera />}
          title="App Avatar"
          subtitle="Shown in chat, leagues and on the scoreboard — separate from your Google photo."
        >
          <div className="lg-avatar-picker">
            {[
              { bg: 'linear-gradient(135deg,#C41E3A,#8B1A2B)', l: 'P' },
              { bg: 'linear-gradient(135deg,#7C8794,#1B3A5C)', l: 'C' },
              { bg: 'linear-gradient(135deg,#8B6F47,#1B3A5C)', l: 'IF' },
              { bg: 'linear-gradient(135deg,#2D6A4F,#1B3A5C)', l: 'OF' },
              { bg: 'var(--grad-gold)', l: 'U', color: '#111' },
              { bg: 'var(--grad-navy)', l: 'MJ' },
            ].map((o, i) => (
              <button
                key={i}
                className={`lg-avatar-opt ${avatar.idx === i ? 'sel' : ''} ${avatar.saving && avatar.idx === i ? 'uploading' : ''}`}
                style={{ background: o.bg, color: o.color || '#fff' }}
                onClick={() => {
                  setAvatar({ idx: i, saving: true });
                  setTimeout(() => setAvatar({ idx: i, saving: false }), 700);
                }}
              >
                {o.l}
              </button>
            ))}
            <button className="lg-avatar-opt lg-avatar-upload" title="Upload">
              <I.Camera w={22} />
            </button>
          </div>
        </SectionCard>

        {/* ── 4. Account & Security ───────────────────── */}
        <SectionCard
          icon={<I.Shield />}
          title="Account & Security"
          subtitle="Read-only today. More sign-in methods coming soon."
        >
          <div className="lg-row">
            <div className="lg-row-icon lg-row-icon-google">
              <GoogleG size={18} />
            </div>
            <div className="lg-row-text">
              <div className="name">Sign-in Method</div>
              <div className="meta">Google OAuth · {user.email}</div>
            </div>
            <div className="lg-row-action">
              <span className="lg-chip-soft">Primary</span>
            </div>
          </div>

          <div className="lg-row">
            <div className="lg-row-icon lg-row-icon-session">
              <span
                className="lg-dot lg-pulse"
                style={{ width: 8, height: 8 }}
              />
            </div>
            <div className="lg-row-text">
              <div className="name">Session</div>
              <div className="meta">
                Active · Chrome on macOS · last signed in 12 min ago
              </div>
            </div>
            <div className="lg-row-action">
              <span className="lg-chip lg-chip-live">
                <span className="lg-dot lg-pulse" />
                Active
              </span>
            </div>
          </div>

          <div className="lg-row lg-row-future">
            <div className="lg-row-icon lg-row-icon-future">
              <I.Lock w={16} />
            </div>
            <div className="lg-row-text">
              <div className="name">Email &amp; Password</div>
              <div className="meta">Add an alternate sign-in method.</div>
            </div>
            <div className="lg-row-action">
              <span className="lg-chip-soft">Coming Soon</span>
            </div>
          </div>
        </SectionCard>

        {/* ── 5. Connected Accounts ───────────────────── */}
        <SectionCard
          icon={<I.Link />}
          title="Connected Accounts"
          subtitle="Link other services so your league mates can find and DM you."
        >
          <div className="lg-row">
            <div className="lg-row-icon lg-row-icon-discord">
              <DiscordIcon size={20} />
            </div>
            <div className="lg-row-text">
              <div className="name">Discord</div>
              <div className="meta">
                {discord.state === 'connected' && (
                  <>
                    Connected as{' '}
                    <span style={{ color: 'var(--fg1)' }}>
                      {discord.username || 'marcusj#4271'}
                    </span>
                  </>
                )}
                {discord.state === 'not_connected' &&
                  'Not connected · link to receive draft pings'}
                {discord.state === 'disconnecting' && 'Disconnecting Discord…'}
                {discord.state === 'error' && (
                  <>
                    Connected as{' '}
                    <span style={{ color: 'var(--fg1)' }}>
                      {discord.username || 'marcusj#4271'}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="lg-row-action">
              {discord.state === 'not_connected' && (
                <button
                  className="lg-btn lg-btn-discord"
                  onClick={() =>
                    setDiscord({ state: 'connected', username: 'marcusj#4271' })
                  }
                >
                  <DiscordIcon size={14} />
                  Connect Discord
                </button>
              )}
              {discord.state === 'connected' && (
                <button
                  className="lg-btn lg-btn-danger"
                  onClick={() => {
                    setDiscord({ ...discord, state: 'disconnecting' });
                    setTimeout(
                      () =>
                        setDiscord({ state: 'not_connected', username: null }),
                      900,
                    );
                  }}
                >
                  Disconnect
                </button>
              )}
              {discord.state === 'disconnecting' && (
                <button className="lg-btn lg-btn-danger" disabled>
                  <span className="lg-spinner" />
                  Disconnecting…
                </button>
              )}
              {discord.state === 'error' && (
                <button className="lg-btn lg-btn-danger">Disconnect</button>
              )}
            </div>
          </div>
          {discord.state === 'error' && (
            <div className="lg-row-err">
              <I.Alert w={14} />
              <div>
                We couldn't reach Discord. Try again in a moment — your link is
                still active.
              </div>
            </div>
          )}

          <div className="lg-row lg-row-future" style={{ marginTop: 10 }}>
            <div className="lg-row-icon lg-row-icon-future">
              <I.Link w={16} />
            </div>
            <div className="lg-row-text">
              <div className="name">Twitch / X</div>
              <div className="meta">Link your streaming or social handles.</div>
            </div>
            <div className="lg-row-action">
              <span className="lg-chip-soft">Coming Soon</span>
            </div>
          </div>
        </SectionCard>

        {/* ── 6. Public Profile ───────────────────────── */}
        <SectionCard
          icon={<I.Eye />}
          title="Public Profile"
          subtitle={
            <>
              Controls what other managers see at{' '}
              <span
                className="lg-mono"
                style={{ color: 'var(--brand-gold-light)' }}
              >
                /u/{user.handle}
              </span>
              .
            </>
          }
          action={
            <a className="lg-btn lg-btn-ghost" href={`#/u/${user.handle}`}>
              <I.ArrowRight w={13} />
              View your profile
            </a>
          }
        >
          {/* Master toggle */}
          <div className={`lg-master ${pub.isPublic ? '' : 'off'}`}>
            <div className="text">
              <div className="lbl">
                Profile is public
                {pub.isPublic ? (
                  <span className="lg-chip lg-chip-live">
                    <span className="lg-dot lg-pulse" />
                    Live
                  </span>
                ) : (
                  <span className="lg-chip lg-chip-private">
                    <I.Lock w={11} />
                    Private
                  </span>
                )}
              </div>
              <div className="hint">
                {pub.isPublic
                  ? 'Anyone can view your profile. Per-section controls below take effect.'
                  : 'Visitors see a locked screen. Your section choices are remembered.'}
              </div>
            </div>
            <button
              className={`lg-sw ${pub.isPublic ? 'on' : ''}`}
              onClick={() => setPubKey('isPublic', !pub.isPublic)}
            />
          </div>

          {/* Section visibility */}
          <div className={`lg-subsection ${!pub.isPublic ? 'lg-dimmed' : ''}`}>
            <div className="lg-subsection-head">
              <div className="lg-subsection-title">Section visibility</div>
              <div className="lg-subsection-sub">
                {sectionsOn} of 6 sections public
              </div>
            </div>
            <div className="lg-subsection-body">
              <ToggleRow
                label="About / Bio"
                hint="Your written intro and quick facts (member since, leagues, trophies)."
                on={pub.bio}
                onChange={(v) => setPubKey('bio', v)}
              />
              <ToggleRow
                label="Career stats"
                hint="Championships, all-time record, win %, global rank."
                on={pub.stats}
                onChange={(v) => setPubKey('stats', v)}
              />
              <ToggleRow
                label="Trophy case"
                hint="Your titles, runner-ups, and league finishes."
                on={pub.trophies}
                onChange={(v) => setPubKey('trophies', v)}
              />
              <ToggleRow
                label="Favorites"
                hint="Your all-time team and favorite era."
                on={pub.favorites}
                onChange={(v) => setPubKey('favorites', v)}
              />
              <ToggleRow
                label="Active leagues"
                hint="Leagues you're currently playing in, with record and rank."
                on={pub.leagues}
                onChange={(v) => setPubKey('leagues', v)}
              />
              <ToggleRow
                label="Achievements"
                hint="Your unlocked and locked badges."
                on={pub.badges}
                onChange={(v) => setPubKey('badges', v)}
              />
            </div>
          </div>

          {/* Profile details */}
          <div className={`lg-subsection ${!pub.isPublic ? 'lg-dimmed' : ''}`}>
            <div className="lg-subsection-head">
              <div className="lg-subsection-title">Profile details</div>
              <div className="lg-subsection-sub">
                Metadata shown in your hero block.
              </div>
            </div>
            <div className="lg-subsection-body">
              <ToggleRow
                label="Location"
                on={pub.location}
                onChange={(v) => setPubKey('location', v)}
              />
              <ToggleRow
                label="Pronouns"
                on={pub.pronouns}
                onChange={(v) => setPubKey('pronouns', v)}
              />
              <ToggleRow
                label="Member since date"
                on={pub.joinedDate}
                onChange={(v) => setPubKey('joinedDate', v)}
              />
              <ToggleRow
                label="Tagline / quote"
                on={pub.tagline}
                onChange={(v) => setPubKey('tagline', v)}
              />
              <ToggleRow
                label="Global rank position"
                on={pub.globalRank}
                onChange={(v) => setPubKey('globalRank', v)}
              />
            </div>
          </div>
        </SectionCard>

        {/* ── 7. Danger zone ──────────────────────────── */}
        <SectionCard
          icon={<I.LogOut />}
          iconDanger
          danger
          title="Session"
          subtitle="End your session on this device, or close your Legacy Sports account."
        >
          <div className="lg-danger-body">
            <div className="lg-danger-row">
              <div className="text">
                <div className="name">Sign out</div>
                <div className="meta">
                  You'll be returned to the landing page. Your draft picks and
                  saved lineups are kept.
                </div>
              </div>
              <button className="lg-btn lg-btn-danger lg-btn-lg">
                <I.LogOut w={13} />
                Sign Out
              </button>
            </div>
            <div className="lg-danger-row lg-danger-row-future">
              <div className="text">
                <div className="name">Delete account</div>
                <div className="meta">
                  Permanently remove your profile, history and connected
                  services.
                </div>
              </div>
              <span className="lg-chip-soft">Coming Soon</span>
            </div>
          </div>
        </SectionCard>
      </main>

      {/* Sticky confirmation bar */}
      {stickyBar !== 'hidden' && (
        <div className="lg-stickybar-anchor">
          <div className="lg-stickybar-bg" />
          <div
            className={`lg-stickybar ${stickyBar === 'saved' ? 'saved' : ''}`}
          >
            <div className="lg-stickybar-icon">
              {stickyBar === 'saved' ? (
                <I.Check w={16} />
              ) : pub.isPublic ? (
                <I.Eye w={16} />
              ) : (
                <I.Lock w={16} />
              )}
            </div>
            <div className="lg-stickybar-text">
              <div className="lg-stickybar-title">
                {stickyBar === 'saved'
                  ? 'Saved'
                  : allOff
                    ? '0 of 6 sections public'
                    : `${sectionsOn} of 6 sections public`}
                <span style={{ color: 'var(--fg3)', fontWeight: 500 }}>
                  {' '}
                  · profile is {pub.isPublic ? 'live' : 'private'}
                </span>
              </div>
              <div className="lg-stickybar-meta">
                {stickyBar === 'saved'
                  ? 'Your changes are auto-saved.'
                  : allOff
                    ? 'All sections hidden. Visitors will see just your name and badges.'
                    : 'Changes auto-save. Toggle anything above to update.'}
              </div>
            </div>
            <div className="lg-stickybar-cta">
              <a className="lg-stickybar-link" href={`#/u/${user.handle}`}>
                Preview as visitor <I.ArrowRight w={13} />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── SectionCard helper ───────────────────────────────────────────
const SectionCard = ({
  icon,
  title,
  subtitle,
  action,
  children,
  danger,
  iconDanger,
}) => (
  <section className={`lg-card ${danger ? 'lg-card-danger' : ''}`}>
    <div className="lg-card-head">
      <div
        className={`lg-card-icon ${iconDanger ? 'lg-card-icon-danger' : ''}`}
      >
        {icon}
      </div>
      <div className="lg-card-htext">
        <h3 className="lg-card-title">{title}</h3>
        {subtitle && <div className="lg-card-sub">{subtitle}</div>}
      </div>
      {action && <div className="lg-card-head-action">{action}</div>}
    </div>
    <div className="lg-card-body">{children}</div>
  </section>
);

Object.assign(window, { ProfileSettings, SectionCard, ToggleRow, TopNav });
