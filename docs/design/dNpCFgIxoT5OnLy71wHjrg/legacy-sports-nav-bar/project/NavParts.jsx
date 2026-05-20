// NavParts.jsx — shared building blocks for all nav variants
// Exports: Brand, Tabs, IconBtn, AvatarBtn, LeagueSwitcher, Search, BugBtn,
// plus SVG glyphs for bell, search, chevron, etc.

const LOGO = 'assets/logo.png';
const ICON = (n) => `assets/icons/brand/${n}.svg`;

// ─── Inline SVG glyphs (Lucide-flavored) ──────────────────────
const Glyph = {
  search: (s = 16) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  bell: (s = 18) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  chevronDown: (s = 12) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  chevronRight: (s = 14) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  bug: (s = 18) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="8" y="6" width="8" height="14" rx="4" />
      <path d="M12 2v4M4.5 8.5l3 1.5M19.5 8.5l-3 1.5M3 14h5M16 14h5M5 19l3-1M19 19l-3-1" />
    </svg>
  ),
  menu: (s = 20) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="14" y2="17" />
    </svg>
  ),
  close: (s = 20) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  ),
  settings: (s = 16) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  user: (s = 16) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  logout: (s = 16) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  check: (s = 16) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  plus: (s = 14) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  sun: (s = 16) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  ),
  moon: (s = 16) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
  help: (s = 16) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  roster: (s = 16) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  trophy: (s = 16) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
    </svg>
  ),
  compass: (s = 14) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  ),
  ticket: (s = 14) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7z" />
      <line x1="13" y1="5" x2="13" y2="7" />
      <line x1="13" y1="11" x2="13" y2="13" />
      <line x1="13" y1="17" x2="13" y2="19" />
    </svg>
  ),
};

// ─── Brand: logo + wordmark ────────────────────────────────
const Brand = ({ compact = false }) => (
  <a className="ls-brand" title="Home" style={{ cursor: 'pointer' }}>
    <img src={LOGO} alt="Legacy Sports — Home" />
    {!compact && (
      <div className="ls-wordmark">
        LEGACY<span>SPORTS</span>
      </div>
    )}
  </a>
);

// ─── Pill tabs ─────────────────────────────────────────────
const Tabs = ({ current = 'home', draftLive = false, items }) => {
  const tabs = items || [
    { id: 'players', label: 'Players', icon: 'league' },
    { id: 'stats', label: 'Stats', icon: 'stats' },
    { id: 'minigames', label: 'Minigames', icon: 'zap' },
  ];
  return (
    <nav className="ls-tabs">
      {tabs.map((t) => {
        return (
          <button key={t.id} className={`${current === t.id ? 'on' : ''}`}>
            <img src={ICON(t.icon)} width="14" height="14" alt="" />
            {t.label}
            {t.liveDot && current !== t.id && <span className="tab-dot" />}
          </button>
        );
      })}
    </nav>
  );
};

// ─── Icon button with optional count / dot ─────────────────
const IconBtn = ({ children, count, dot, title, onClick, active }) => (
  <button
    className={`ls-icon-btn ${active ? 'on' : ''}`}
    title={title}
    onClick={onClick}
    style={
      active
        ? {
            borderColor: 'var(--brand-gold)',
            background: 'rgba(197,165,90,0.1)',
            color: 'var(--brand-gold-light)',
          }
        : {}
    }
  >
    {children}
    {count && <span className="notif-count">{count}</span>}
    {dot && <span className="status-dot" />}
  </button>
);

// ─── Avatar button ─────────────────────────────────────────
const AvatarBtn = ({ initials = 'MJ', onClick, active }) => (
  <button
    className="ls-avatar-btn"
    onClick={onClick}
    style={active ? { borderColor: 'var(--brand-gold)' } : {}}
  >
    <div className="ls-avatar">{initials}</div>
  </button>
);

// ─── League switcher chip ──────────────────────────────────
const LeagueSwitcher = ({
  name = 'Legends of Summer',
  initials = 'LS',
  onClick,
  active,
  draftLive = false,
}) => (
  <button
    className={`ls-league-switcher ${draftLive ? 'draft-live' : ''}`}
    onClick={onClick}
    style={
      active
        ? {
            borderColor: 'var(--brand-gold)',
            background: 'rgba(197,165,90,0.08)',
          }
        : {}
    }
  >
    <span className="crest">{initials}</span>
    <span className="ls-league-label">
      <span className="eyebrow">
        {draftLive ? (
          <span
            style={{
              color: 'var(--brand-seam-red)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--brand-seam-red)',
                display: 'inline-block',
                animation: 'pulse 1.4s ease-in-out infinite',
              }}
            />
            Draft live
          </span>
        ) : (
          'League'
        )}
      </span>
      <span className="name">{name}</span>
    </span>
    <span className="caret">{Glyph.chevronDown(11)}</span>
  </button>
);

// ─── Inline search (desktop) ───────────────────────────────
const Search = ({ focused, value = '', onClick }) => (
  <div
    className={`ls-search ${focused ? 'focused' : ''}`}
    onClick={onClick}
    style={{ cursor: 'text' }}
  >
    {Glyph.search(15)}
    <input
      placeholder="Search players, teams, leagues…"
      defaultValue={value}
      readOnly
    />
    <span className="kbd">⌘K</span>
  </div>
);

// ─── Help button + menu (right cluster) ─────────────────────
const HelpBtn = ({ onClick, active }) => (
  <IconBtn title="Help & support" onClick={onClick} active={active}>
    {Glyph.help(17)}
  </IconBtn>
);

Object.assign(window, {
  Glyph,
  Brand,
  Tabs,
  IconBtn,
  AvatarBtn,
  LeagueSwitcher,
  Search,
  HelpBtn,
  ICON,
  LOGO,
});
