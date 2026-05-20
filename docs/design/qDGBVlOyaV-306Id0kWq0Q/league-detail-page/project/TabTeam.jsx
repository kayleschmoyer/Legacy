// TabTeam.jsx — My Team settings: name, branding, colors.

const { Icons: TMI, Section: TMSection } = window;

const AVATAR_OPTS = ['navy', 'red', 'green', 'brown', 'purple'];
const INITIALS_OPTS = ['BB', 'NY', 'MJ', 'DB', 'HR', 'SS'];

const TabTeam = () => {
  const [name, setName] = React.useState('Bronx Bombers');
  const [draft, setDraft] = React.useState(name);
  const [editing, setEditing] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [primary, setPrimary] = React.useState('#1B3A5C');
  const [secondary, setSecondary] = React.useState('#C5A55A');
  const [avColor, setAvColor] = React.useState('navy');
  const [initials, setInitials] = React.useState('MJ');

  const validHex = (h) => /^#[0-9A-F]{6}$/i.test(h);
  const canSaveColors = validHex(primary) && validHex(secondary);

  const save = () => {
    setName(draft);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <TMSection
        title="Team Identity"
        sub="How your team appears in standings, chat, and the draft room."
      >
        <div className="ls-field">
          <label>Team Name</label>
          {!editing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--outline-subtle)',
                  borderRadius: 'var(--radius-2)',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 18,
                  color: 'var(--fg1-strong)',
                }}
              >
                {name}
                {saved && (
                  <span
                    style={{
                      marginLeft: 12,
                      color: '#6FD39A',
                      fontSize: 12,
                      fontFamily: 'var(--font-body)',
                      fontWeight: 400,
                    }}
                  >
                    <TMI.Check size={12} /> Saved
                  </span>
                )}
              </div>
              <button
                className="ls-btn ls-btn-ghost"
                onClick={() => {
                  setDraft(name);
                  setEditing(true);
                }}
              >
                <TMI.Edit size={12} />
                Edit
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                className="ls-input ls-input-text"
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-display)',
                  fontSize: 18,
                  fontWeight: 700,
                }}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={32}
              />
              <button
                className="ls-btn ls-btn-gold"
                onClick={save}
                disabled={!draft.trim()}
              >
                Save
              </button>
              <button
                className="ls-btn ls-btn-ghost"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          )}
          <div className="hint">
            3–32 characters. Names are visible to all league members.
          </div>
        </div>
      </TMSection>

      <TMSection
        title="Branding & Colors"
        sub="Pick a logo preset and your team's primary & secondary colors."
      >
        <div className="ls-settings-grid">
          <div>
            <label
              className="eyebrow"
              style={{ display: 'block', marginBottom: 12 }}
            >
              Logo Preview
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className={`ls-avatar xl ${avColor}`}>{initials}</div>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: 15,
                    color: 'var(--fg1)',
                  }}
                >
                  {name}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    color: 'var(--fg3)',
                    marginTop: 2,
                  }}
                >
                  This is how your logo appears in standings.
                </div>
                <button
                  className="ls-btn ls-btn-ghost sm"
                  style={{ marginTop: 10 }}
                >
                  <TMI.Upload size={11} />
                  Upload Custom
                </button>
              </div>
            </div>

            <label
              className="eyebrow"
              style={{ display: 'block', marginTop: 20, marginBottom: 8 }}
            >
              Background
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {AVATAR_OPTS.map((c) => (
                <div
                  key={c}
                  className={`ls-avatar-opt ${avColor === c ? 'on' : ''}`}
                  onClick={() => setAvColor(c)}
                  style={{ aspectRatio: '1/1', width: 48, height: 48 }}
                >
                  <div
                    className={`ls-avatar md ${c}`}
                    style={{ width: 36, height: 36, fontSize: 12 }}
                  >
                    {initials}
                  </div>
                </div>
              ))}
            </div>

            <label
              className="eyebrow"
              style={{ display: 'block', marginTop: 16, marginBottom: 8 }}
            >
              Initials
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {INITIALS_OPTS.map((i) => (
                <button
                  key={i}
                  className={`ls-avatar-opt ${initials === i ? 'on' : ''}`}
                  onClick={() => setInitials(i)}
                  style={{ width: 52, height: 52 }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                      fontSize: 14,
                      color: 'var(--fg1)',
                    }}
                  >
                    {i}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              className="eyebrow"
              style={{ display: 'block', marginBottom: 12 }}
            >
              Colors
            </label>
            <div className="ls-field">
              <label>
                Primary ·{' '}
                {validHex(primary) ? (
                  <span style={{ color: '#6FD39A' }}>✓</span>
                ) : (
                  <span style={{ color: '#E63950' }}>invalid</span>
                )}
              </label>
              <div className="ls-color-row">
                <div
                  className="ls-color-swatch"
                  style={{ background: primary }}
                >
                  <input
                    type="color"
                    value={primary}
                    onChange={(e) => setPrimary(e.target.value.toUpperCase())}
                    style={{
                      opacity: 0,
                      width: '100%',
                      height: '100%',
                      cursor: 'pointer',
                    }}
                  />
                </div>
                <input
                  className="ls-input"
                  value={primary}
                  onChange={(e) => setPrimary(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
            <div className="ls-field">
              <label>
                Secondary ·{' '}
                {validHex(secondary) ? (
                  <span style={{ color: '#6FD39A' }}>✓</span>
                ) : (
                  <span style={{ color: '#E63950' }}>invalid</span>
                )}
              </label>
              <div className="ls-color-row">
                <div
                  className="ls-color-swatch"
                  style={{ background: secondary }}
                >
                  <input
                    type="color"
                    value={secondary}
                    onChange={(e) => setSecondary(e.target.value.toUpperCase())}
                    style={{
                      opacity: 0,
                      width: '100%',
                      height: '100%',
                      cursor: 'pointer',
                    }}
                  />
                </div>
                <input
                  className="ls-input"
                  value={secondary}
                  onChange={(e) => setSecondary(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: 18,
                padding: 14,
                borderRadius: 'var(--radius-3)',
                background: `linear-gradient(135deg, ${primary} 0%, ${primary}CC 60%, ${secondary}22 100%)`,
                border: `1px solid ${secondary}55`,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: 14,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: secondary,
                }}
              >
                Preview
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: 24,
                  color: '#fff',
                  marginTop: 6,
                }}
              >
                {name}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'rgba(255,255,255,.7)',
                  marginTop: 4,
                }}
              >
                9-4 · PF 1527.4
              </div>
            </div>

            <button
              className="ls-btn ls-btn-gold block"
              style={{ marginTop: 14 }}
              disabled={!canSaveColors}
            >
              <TMI.Check size={12} />
              Save Branding
            </button>
          </div>
        </div>
      </TMSection>
    </div>
  );
};

Object.assign(window, { TabTeam });
