// Settings.jsx — owner's settings panel for controlling the public profile

const SettingsView = ({
  person,
  setPerson,
  visibility,
  setVisibility,
  isPublic,
  setIsPublic,
  onPreview,
}) => {
  const [tab, setTab] = React.useState('privacy');

  return (
    <div className="view ls-page-wide" style={{ paddingTop: 32 }}>
      <div
        className="ls-page-head"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div>
          <div className="ls-eyebrow">Settings</div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 44,
              letterSpacing: '-0.01em',
              margin: '6px 0 0',
              color: 'var(--fg1-strong)',
            }}
          >
            Your public profile
          </h1>
          <p
            className="ls-meta"
            style={{ marginTop: 8, maxWidth: 580, fontSize: 14 }}
          >
            Control what other managers see when they land on your page. Changes
            save automatically and update your profile in real time.
          </p>
        </div>
        <button className="ls-btn ls-btn-gold" onClick={onPreview}>
          <BrandIcon name="live" size={14} opacity={0.85} /> View your profile
        </button>
      </div>

      <div className="settings-grid">
        <aside className="settings-side">
          <h3>Settings</h3>
          <button
            className={tab === 'privacy' ? 'on' : ''}
            onClick={() => setTab('privacy')}
          >
            <BrandIcon name="secure" size={16} opacity={0.85} /> Profile
            visibility
          </button>
          <button
            className={tab === 'identity' ? 'on' : ''}
            onClick={() => setTab('identity')}
          >
            <BrandIcon name="commissioner" size={16} opacity={0.85} /> Identity
            &amp; bio
          </button>
          <button
            className={tab === 'favorites' ? 'on' : ''}
            onClick={() => setTab('favorites')}
          >
            <BrandIcon name="baseball" size={16} opacity={0.85} /> Favorites
          </button>
          <div className="divider" />
          <button>
            <BrandIcon name="bell" size={16} opacity={0.5} /> Notifications
          </button>
          <button>
            <BrandIcon name="award" size={16} opacity={0.5} /> Account
          </button>
        </aside>

        <main className="settings-main">
          {tab === 'privacy' && (
            <PrivacyTab
              visibility={visibility}
              setVisibility={setVisibility}
              isPublic={isPublic}
              setIsPublic={setIsPublic}
            />
          )}
          {tab === 'identity' && (
            <IdentityTab person={person} setPerson={setPerson} />
          )}
          {tab === 'favorites' && (
            <FavoritesTab person={person} setPerson={setPerson} />
          )}

          <div className="preview-bar">
            <span className="pulse ls-pulse" />
            <div className="text">
              Changes save automatically.{' '}
              <strong>
                {Object.values(visibility).filter(Boolean).length} of{' '}
                {Object.keys(visibility).length} sections public
              </strong>{' '}
              · profile is {isPublic ? 'live' : 'private'}.
            </div>
            <button
              className="ls-btn ls-btn-ghost ls-btn-sm"
              onClick={onPreview}
            >
              Preview as visitor →
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};

// ── Privacy tab ─────────────────────────────────────────
const PrivacyTab = ({ visibility, setVisibility, isPublic, setIsPublic }) => {
  const sectionRows = [
    {
      key: 'bio',
      label: 'About / Bio',
      hint: 'Your written intro and quick facts (member since, leagues, trophies).',
    },
    {
      key: 'stats',
      label: 'Career stats',
      hint: 'Championships, all-time record, win %, global rank.',
    },
    {
      key: 'trophies',
      label: 'Trophy case',
      hint: 'Your titles, runner-ups, and league finishes.',
    },
    {
      key: 'favorites',
      label: 'Favorites',
      hint: 'Your all-time team and favorite era.',
    },
    {
      key: 'leagues',
      label: 'Active leagues',
      hint: "Leagues you're currently playing in, with your record and rank.",
    },
    {
      key: 'badges',
      label: 'Achievements',
      hint: 'Your unlocked and locked badges.',
    },
  ];
  const metaRows = [
    { key: 'location', label: 'Location' },
    { key: 'pronouns', label: 'Pronouns' },
    { key: 'joinedDate', label: 'Member since date' },
    { key: 'tagline', label: 'Tagline / quote' },
    { key: 'globalRank', label: 'Global rank position' },
  ];

  const update = (key, value) =>
    setVisibility((prev) => ({ ...prev, [key]: value }));

  return (
    <>
      <div
        className="settings-card"
        style={{
          borderColor: isPublic
            ? 'var(--glass-border)'
            : 'var(--warning-border)',
        }}
      >
        <h3>Master switch</h3>
        <p className="desc">
          When private, only your league managers can see your profile. Everyone
          else gets a locked screen.
        </p>
        <div className="setting-row" style={{ paddingTop: 8 }}>
          <div className="row-l">
            <div className="name">
              Profile is public
              {isPublic ? (
                <span
                  className="ls-chip ls-chip-active"
                  style={{ marginLeft: 8 }}
                >
                  <span className="ls-dot"></span>Live
                </span>
              ) : (
                <span className="ls-chip ls-chip-pre" style={{ marginLeft: 8 }}>
                  Private
                </span>
              )}
            </div>
            <div className="hint">
              {isPublic
                ? 'Anyone with the link can see your profile. The per-section controls below take effect.'
                : 'Your profile is locked. The per-section controls below are overridden until you turn this back on.'}
            </div>
          </div>
          <Toggle
            on={isPublic}
            onChange={setIsPublic}
            ariaLabel="Profile is public"
          />
        </div>
      </div>

      <div className="settings-card">
        <h3>Section visibility</h3>
        <p className="desc">
          Choose which blocks appear on your profile. Hidden sections disappear
          for visitors — but you'll still see them with a "Hidden" tag when you
          visit your own page.
        </p>
        {sectionRows.map((row) => (
          <div className="setting-row" key={row.key}>
            <div className="row-l">
              <div className="name">{row.label}</div>
              <div className="hint">{row.hint}</div>
            </div>
            <Toggle
              on={isPublic && visibility[row.key]}
              disabled={!isPublic}
              onChange={(v) => update(row.key, v)}
              ariaLabel={row.label}
            />
          </div>
        ))}
      </div>

      <div className="settings-card">
        <h3>Profile details</h3>
        <p className="desc">
          Granular toggles for the small bits of metadata on your hero block.
        </p>
        {metaRows.map((row) => (
          <div className="setting-row" key={row.key}>
            <div className="row-l">
              <div className="name">{row.label}</div>
            </div>
            <Toggle
              on={isPublic && visibility[row.key]}
              disabled={!isPublic}
              onChange={(v) => update(row.key, v)}
              ariaLabel={row.label}
            />
          </div>
        ))}
      </div>
    </>
  );
};

// ── Identity tab ─────────────────────────────────────────
const IdentityTab = ({ person, setPerson }) => {
  const upd = (k, v) => setPerson((prev) => ({ ...prev, [k]: v }));
  const updBio = (idx, v) =>
    setPerson((prev) => ({
      ...prev,
      bio: prev.bio.map((p, i) => (i === idx ? v : p)),
    }));

  return (
    <>
      <div className="settings-card">
        <h3>Profile header</h3>
        <p className="desc">
          Your display name, handle, and the line under your avatar.
        </p>

        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Display name</label>
            <input
              className="ls-input"
              value={person.name}
              onChange={(e) => upd('name', e.target.value)}
            />
          </div>
          <div className="field-group">
            <label className="field-label">Handle</label>
            <input
              className="ls-input"
              value={person.handle}
              onChange={(e) => upd('handle', e.target.value)}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Pronouns</label>
            <input
              className="ls-input"
              value={person.pronouns || ''}
              onChange={(e) => upd('pronouns', e.target.value)}
              placeholder="e.g. he/him"
            />
          </div>
          <div className="field-group">
            <label className="field-label">Location</label>
            <input
              className="ls-input"
              value={person.location || ''}
              onChange={(e) => upd('location', e.target.value)}
            />
          </div>
        </div>
        <div className="field-group">
          <label className="field-label">Tagline</label>
          <input
            className="ls-input"
            value={person.tagline || ''}
            onChange={(e) => upd('tagline', e.target.value)}
            maxLength={90}
          />
          <div className="ls-meta" style={{ marginTop: 6, fontSize: 12 }}>
            {(person.tagline || '').length}/90 — appears in italics under your
            name
          </div>
        </div>
      </div>

      <div className="settings-card">
        <h3>About</h3>
        <p className="desc">
          A two-paragraph intro. Editorial, second-person, no need to oversell
          it.
        </p>
        {person.bio.map((p, i) => (
          <div className="field-group" key={i}>
            <label className="field-label">Paragraph {i + 1}</label>
            <textarea
              className="ls-textarea"
              value={p}
              onChange={(e) => updBio(i, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="settings-card">
        <h3>Avatar</h3>
        <p className="desc">
          Right now we're using your initials on a generated gradient. Upload a
          photo for a sharper look.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            className="profile-avatar-wrap"
            style={{ width: 84, height: 84, padding: 3 }}
          >
            <div className="profile-avatar-inner" style={{ fontSize: 30 }}>
              {person.initials}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="ls-btn ls-btn-ghost ls-btn-sm">
              Upload photo
            </button>
            <span className="ls-meta" style={{ fontSize: 12 }}>
              JPG / PNG · square · at least 256px
            </span>
          </div>
        </div>
      </div>
    </>
  );
};

// ── Favorites tab ────────────────────────────────────────
const FavoritesTab = ({ person, setPerson }) => {
  const upd = (k, v) => setPerson((prev) => ({ ...prev, [k]: v }));

  const TEAMS = [
    'New York Yankees',
    'Boston Red Sox',
    'Chicago Cubs',
    'Los Angeles Dodgers',
    'San Francisco Giants',
    'Oakland Athletics',
    'Seattle Mariners',
    'St. Louis Cardinals',
    'Atlanta Braves',
    'Houston Astros',
    'Philadelphia Phillies',
    'Detroit Tigers',
    'Cleveland Guardians',
    'Cincinnati Reds',
    'Pittsburgh Pirates',
  ];
  const ERAS = [
    'Dead Ball Era',
    'Live Ball Era',
    'Integration Era',
    'Expansion Era',
    'Free Agency Era',
    'Steroid Era',
    'Modern Era',
    'All Eras',
  ];

  return (
    <>
      <div className="settings-card">
        <h3>All-time team</h3>
        <p className="desc">
          The franchise you'd build a dynasty around. Shows in your Favorites
          block.
        </p>
        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Team</label>
            <select
              className="ls-select"
              value={person.favTeam}
              onChange={(e) => upd('favTeam', e.target.value)}
            >
              {TEAMS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label className="field-label">Caption</label>
            <input
              className="ls-input"
              value={person.favTeamSub}
              onChange={(e) => upd('favTeamSub', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="settings-card">
        <h3>Favorite era</h3>
        <p className="desc">
          The slice of baseball history you keep drafting from.
        </p>
        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Era</label>
            <select
              className="ls-select"
              value={person.favEra}
              onChange={(e) => upd('favEra', e.target.value)}
            >
              {ERAS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label className="field-label">Caption</label>
            <input
              className="ls-input"
              value={person.favEraSub}
              onChange={(e) => upd('favEraSub', e.target.value)}
            />
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { SettingsView, PrivacyTab, IdentityTab, FavoritesTab });
