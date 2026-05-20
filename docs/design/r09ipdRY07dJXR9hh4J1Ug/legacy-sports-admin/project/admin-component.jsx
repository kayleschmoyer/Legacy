// admin-component.jsx — Admin Console for Legacy Sports
// All states from index.md: auth-check, not-admin, loading, error, empty, populated,
// impersonating, JWT (empty/valid/expired/no-expiry/error)
// Renders inside a shell that adapts to mobile (≤480) and desktop.

const { useState, useMemo, useEffect } = React;

// ───────── fixture data ─────────
const USERS = [
  {
    id: 'usr_8a3c2f',
    username: 'mickey_legend',
    email: 'mickey@legacysports.io',
    accessLevel: 'admin',
    isMe: true,
  },
  {
    id: 'usr_4b1d9e',
    username: 'ruth_bambino',
    email: 'gruth@dynastyleague.com',
    accessLevel: 'none',
  },
  {
    id: 'usr_7f0a55',
    username: 'cobb_tyrus',
    email: 'tyrus.c@oldfield.co',
    accessLevel: 'none',
  },
  {
    id: 'usr_22e8b1',
    username: 'gehrig_iron',
    email: 'lou.gehrig@yankees.dev',
    accessLevel: 'admin',
  },
  {
    id: 'usr_91c4d2',
    username: 'wagner_honus',
    email: null,
    accessLevel: 'none',
  },
  {
    id: 'usr_55a7c8',
    username: 'aaron_hammer',
    email: 'h.aaron@bravesfan.net',
    accessLevel: 'none',
  },
  {
    id: 'usr_03f6e4',
    username: 'mays_say_hey',
    email: 'willie@giants.io',
    accessLevel: 'none',
  },
  {
    id: 'usr_b18d39',
    username: null,
    email: 'newuser+pending@gmail.com',
    accessLevel: 'none',
  },
  {
    id: 'usr_6ec0aa',
    username: 'clemente_pride',
    email: 'r.clemente@pirates.dev',
    accessLevel: 'none',
  },
  {
    id: 'usr_2d44b7',
    username: 'koufax_southpaw',
    email: 'sandy@dodgers.io',
    accessLevel: 'none',
  },
  {
    id: 'usr_e91f23',
    username: 'robinson_jackie',
    email: 'j.robinson42@dodgers.dev',
    accessLevel: 'none',
  },
  {
    id: 'usr_a07258',
    username: 'griffey_jr',
    email: 'ken.griffey@mariners.io',
    accessLevel: 'none',
  },
];

const SAMPLE_JWT_VALID =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfNGIxZDllIiwidXNlcm5hbWUiOiJydXRoX2JhbWJpbm8iLCJhY2Nlc3NMZXZlbCI6Im5vbmUiLCJpYXQiOjE3NDYxNTY4MDAsImV4cCI6MTc0Nzk2NDgwMH0.s8M1nXbCq5_aB7';
const SAMPLE_JWT_EXPIRED =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfMjJlOGIxIiwidXNlcm5hbWUiOiJnZWhyaWdfaXJvbiIsImFjY2Vzc0xldmVsIjoiYWRtaW4iLCJpYXQiOjE3MDgwOTI4MDAsImV4cCI6MTcwOTI5OTIwMH0.expiredsig';

// ───────── tiny svg icons (inline; lucide style 1.8 stroke) ─────────
const Ico = {
  search: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  chev: (
    <svg
      className="chev"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  ),
  arrow: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  ),
  alert: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  ),
  empty: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
      <path d="M8 11h6" opacity="0.4" />
    </svg>
  ),
  shield: (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  lock: (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  ),
  check: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  clock: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  infinity: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18.6 5.4a4 4 0 0 0-5.6 0L12 6.4 11 5.4a4 4 0 1 0 0 5.6l1-1 1 1a4 4 0 1 0 5.6-5.6z" />
    </svg>
  ),
};

// initial-letter avatar logic from spec: first char of username or email
const initial = (u) => {
  const src = u.username || u.email || u.id;
  return (src[0] || '?').toUpperCase();
};

// ───────── User card ─────────
function UserCard({ u, busy, isImpersonating, onImpersonate, compact }) {
  const canImpersonate = !u.isMe && u.accessLevel !== 'admin';
  return (
    <div
      className={`user-card ${u.isMe ? 'is-me' : ''} ${u.accessLevel === 'admin' ? 'is-admin' : ''}`}
    >
      <div className="av">{initial(u)}</div>
      <div className="body">
        <div className="row1">
          {u.username ? (
            <span className="uname">{u.username}</span>
          ) : (
            <span className="uname empty">(no username)</span>
          )}
          {u.isMe && <span className="lv lv-you">You</span>}
          <span
            className={`lv lv-${u.accessLevel === 'admin' ? 'admin' : 'none'}`}
          >
            {u.accessLevel}
          </span>
        </div>
        <span className={`email ${!u.email ? 'empty' : ''}`}>
          {u.email || '—'}
        </span>
        {!compact && <span className="id">{u.id}</span>}
      </div>
      {canImpersonate && (
        <div className="actions">
          {/* MOTION: button hover translateY(-1px), 150ms; press scale(0.98) */}
          <button
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={onImpersonate}
          >
            {isImpersonating ? (
              <>
                <span className="spinner" />
                Starting…
              </>
            ) : (
              <>Impersonate</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ───────── Skeleton row ─────────
function SkeletonRow() {
  return (
    <div className="sk-card">
      <div className="sk sk-av" />
      <div className="sk-lines">
        <div className="sk" style={{ height: 14, width: '46%' }} />
        <div className="sk" style={{ height: 11, width: '68%' }} />
      </div>
      <div className="sk" style={{ height: 28, width: 86, borderRadius: 12 }} />
    </div>
  );
}

// ───────── Section (accordion) ─────────
function Section({ num, title, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`section ${open ? 'open' : ''}`}>
      {/* MOTION: chevron rotate 90deg on toggle, 200ms ease-standard */}
      <header className="section-head" onClick={() => setOpen((o) => !o)}>
        <span className="num">{num}</span>
        <h2>{title}</h2>
        {count != null && <span className="count">{count}</span>}
        {Ico.chev}
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

// ───────── Users section by state ─────────
function UsersSection({
  state,
  query,
  setQuery,
  impersonatingId,
  setImpersonatingId,
  compact,
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return USERS;
    return USERS.filter(
      (u) =>
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q),
    );
  }, [query]);

  const showAs =
    state === 'populated' || state === 'impersonating'
      ? filtered.length === 0
        ? 'no-results'
        : 'list'
      : state === 'empty-search'
        ? 'no-results-forced'
        : state;

  return (
    <Section
      num="01"
      title="Users"
      count={
        state === 'populated' || state === 'impersonating'
          ? filtered.length
          : undefined
      }
    >
      {/* search bar — present in any state where users would be listed */}
      {(state === 'populated' ||
        state === 'impersonating' ||
        state === 'empty-search' ||
        state === 'users-loading') && (
        <div className="search">
          <span className="icon">{Ico.search}</span>
          {/* MOTION: results crossfade 140ms on each keystroke */}
          <input
            type="text"
            placeholder="Search by name, email, or ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={state === 'users-loading'}
            aria-label="Search users"
          />
        </div>
      )}

      {showAs === 'list' && (
        <div className="user-list">
          {filtered.map((u) => (
            <UserCard
              key={u.id}
              u={u}
              compact={compact}
              busy={impersonatingId !== null}
              isImpersonating={impersonatingId === u.id}
              onImpersonate={() => setImpersonatingId(u.id)}
            />
          ))}
        </div>
      )}

      {showAs === 'users-loading' && (
        <div className="user-list">
          {/* MOTION: shimmer 1.4s linear infinite — geometry mirrors the populated row */}
          {[0, 1, 2, 3, 4].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      )}

      {showAs === 'users-error' && (
        <div className="error-card">
          <span className="icon">{Ico.alert}</span>
          <div className="body">
            <h3>Unable to load users</h3>
            <p>
              Failed to load users:{' '}
              <code>NetworkError: GraphQL endpoint unreachable (504)</code>
            </p>
          </div>
          <button className="btn btn-ghost btn-sm">Retry</button>
        </div>
      )}

      {(showAs === 'no-results' || showAs === 'no-results-forced') && (
        <div className="callout">
          <div className="callout-icon empty">{Ico.empty}</div>
          <h3>No users found</h3>
          <p>
            No matches for{' '}
            <span className="term">"{query || 'griffey42'}"</span>. Try a
            different name, email, or user ID.
          </p>
        </div>
      )}
    </Section>
  );
}

// ───────── JWT decoder ─────────
function JwtSection({ state }) {
  const [open, setOpen] = useState(state.startsWith('jwt-'));
  useEffect(() => {
    if (state.startsWith('jwt-')) setOpen(true);
  }, [state]);

  // Pre-baked decode results per state
  const sample = {
    'jwt-empty': { input: '', decoded: null, error: null },
    'jwt-valid': {
      input: SAMPLE_JWT_VALID,
      decoded: {
        header: { alg: 'HS256', typ: 'JWT' },
        payload: {
          sub: 'usr_4b1d9e',
          username: 'ruth_bambino',
          accessLevel: 'none',
          iat: 1746156800,
          exp: 1747964800,
        },
        expiry: { kind: 'valid', date: 'May 23, 2026 · 9:13 AM' },
      },
      error: null,
    },
    'jwt-expired': {
      input: SAMPLE_JWT_EXPIRED,
      decoded: {
        header: { alg: 'HS256', typ: 'JWT' },
        payload: {
          sub: 'usr_22e8b1',
          username: 'gehrig_iron',
          accessLevel: 'admin',
          iat: 1708092800,
          exp: 1709299200,
        },
        expiry: { kind: 'expired', date: 'Mar 1, 2024 · 4:00 PM' },
      },
      error: null,
    },
    'jwt-noexp': {
      input:
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c3JfYTA3MjU4Iiwicm9sZSI6InNlcnZpY2UifQ.no_exp',
      decoded: {
        header: { alg: 'HS256', typ: 'JWT' },
        payload: { sub: 'usr_a07258', role: 'service' },
        expiry: { kind: 'none' },
      },
      error: null,
    },
    'jwt-error': {
      input: 'not.a.real.token-haha',
      decoded: null,
      error:
        'Invalid JWT: token must contain three base64url segments separated by "."',
    },
  };

  // when user is in another state, JWT collapsed (per spec) and shows blank
  const data = sample[state] || sample['jwt-empty'];

  return (
    <section className={`section ${open ? 'open' : ''}`}>
      <header className="section-head" onClick={() => setOpen((o) => !o)}>
        <span className="num">02</span>
        <h2>JWT Decoder</h2>
        {Ico.chev}
      </header>
      {open && (
        <div className="section-body">
          <textarea
            className="jwt-input"
            placeholder="Paste JWT here…"
            defaultValue={data.input}
            spellCheck={false}
          />
          <div className="jwt-actions">
            {/* MOTION: button hover translateY(-1px), 150ms */}
            <button className="btn btn-primary">Decode</button>
            {data.input && <button className="btn btn-ghost">Clear</button>}
          </div>

          {data.error && (
            <div className="jwt-result">
              <div className="jwt-error">
                {Ico.alert}
                <span>{data.error}</span>
              </div>
            </div>
          )}

          {data.decoded && (
            <div className="jwt-result">
              <ExpiryBanner k={data.decoded.expiry} />
              <JsonBlock
                title="Header"
                obj={data.decoded.header}
                alg={data.decoded.header.alg}
              />
              <JsonBlock title="Payload" obj={data.decoded.payload} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ExpiryBanner({ k }) {
  if (k.kind === 'valid')
    return (
      <div className="expiry expiry-valid">
        <span className="ico">{Ico.check}</span>
        <div className="body">
          <span className="label">Token valid</span>
          <span className="when">Expires {k.date}</span>
        </div>
      </div>
    );
  if (k.kind === 'expired')
    return (
      <div className="expiry expiry-expired">
        <span className="ico">{Ico.clock}</span>
        <div className="body">
          <span className="label">Token expired</span>
          <span className="when">Expired at {k.date}</span>
        </div>
      </div>
    );
  return (
    <div className="expiry expiry-none">
      <span className="ico">{Ico.infinity}</span>
      <div className="body">
        <span className="label">No expiry</span>
        <span className="when">
          exp claim is absent — token will not expire
        </span>
      </div>
    </div>
  );
}

// Crude JSON pretty-print with token classes
function JsonBlock({ title, obj, alg }) {
  const formatted = formatJson(obj);
  return (
    <div className="json-block">
      <div className="head">
        <span className="label">{title}</span>
        {alg && <span className="alg">alg: {alg}</span>}
      </div>
      <pre dangerouslySetInnerHTML={{ __html: formatted }} />
    </div>
  );
}
function formatJson(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);
  if (obj === null) return '<span class="p">null</span>';
  if (typeof obj === 'string')
    return `<span class="s">"${escapeHtml(obj)}"</span>`;
  if (typeof obj === 'number') return `<span class="n">${obj}</span>`;
  if (typeof obj === 'boolean') return `<span class="b">${obj}</span>`;
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return (
      '[\n' +
      obj.map((v) => padIn + formatJson(v, indent + 1)).join(',\n') +
      '\n' +
      pad +
      ']'
    );
  }
  const entries = Object.entries(obj);
  if (entries.length === 0) return '{}';
  return (
    '{\n' +
    entries
      .map(
        ([k, v]) =>
          `${padIn}<span class="k">"${escapeHtml(k)}"</span>: ${formatJson(v, indent + 1)}`,
      )
      .join(',\n') +
    '\n' +
    pad +
    '}'
  );
}
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
}

// ───────── Auth-check / not-admin overlays ─────────
function AuthCheckScreen() {
  return (
    <div className="auth-check">
      {/* MOTION: rotating ring, 900ms linear infinite */}
      <div className="ring" />
      <p>Verifying your access…</p>
    </div>
  );
}

function NotAdminScreen() {
  return (
    <div className="not-admin">
      <div className="seal">{Ico.lock}</div>
      <h2>Admin access required</h2>
      <p>
        This area is reserved for league commissioners and platform staff. We're
        sending you back to your dashboard.
      </p>
      {/* MOTION: redirecting indicator pulses while router transitions, 280ms ease-out-quart */}
      <div className="redirecting">
        <span className="ring" />
        Redirecting to home
      </div>
    </div>
  );
}

// ───────── Page ─────────
function AdminPage({ state, compact }) {
  const [query, setQuery] = useState('');
  const [impersonatingId, setImpersonatingId] = useState(
    state === 'impersonating' ? 'usr_4b1d9e' : null,
  );

  // For dedicated forced-empty-search state, prefill an unmatched query
  useEffect(() => {
    if (state === 'empty-search') setQuery('griffey42');
    else if (state !== 'populated' && state !== 'impersonating') setQuery('');
  }, [state]);
  useEffect(() => {
    setImpersonatingId(state === 'impersonating' ? 'usr_4b1d9e' : null);
  }, [state]);

  if (state === 'auth-check')
    return (
      <div className={`admin-root ${compact ? 'mobile-shell' : ''}`}>
        <AdminNav compact={compact} />
        <main className="admin-main">
          <AuthCheckScreen />
        </main>
      </div>
    );
  if (state === 'not-admin')
    return (
      <div className={`admin-root ${compact ? 'mobile-shell' : ''}`}>
        <AdminNav compact={compact} />
        <main className="admin-main">
          <NotAdminScreen />
        </main>
      </div>
    );

  return (
    <div className={`admin-root ${compact ? 'mobile-shell' : ''}`}>
      <AdminNav compact={compact} />
      <main className="admin-main">
        <header className="page-head">
          <span className="eyebrow">Backstage</span>
          <h1>Admin Console</h1>
          <p>
            Manage users and impersonate accounts for debugging. Every action is
            logged to the audit trail.
          </p>
          {/* MOTION: hover gold underline grows from 0 → 24px, 150ms */}
          <a className="quick-link" href="#">
            Revenue Analytics {Ico.arrow}
          </a>
        </header>

        <div className="sep" />

        <UsersSection
          state={state}
          query={query}
          setQuery={setQuery}
          impersonatingId={impersonatingId}
          setImpersonatingId={setImpersonatingId}
          compact={compact}
        />
        <JwtSection state={state} />
      </main>
    </div>
  );
}

function AdminNav({ compact }) {
  return (
    <header className="admin-nav">
      <a className="brand">
        <img src="design_system/assets/logo.png" alt="Legacy Sports" />
        {!compact && (
          <div className="brand-mark">
            LEGACY<span>SPORTS</span>
          </div>
        )}
      </a>
      <span className="crumb">
        <span className="sep">/</span>
        <span className="here">Admin</span>
      </span>
      <span className="grow" />
      <div className="me">
        <span className="av">MJ</span>
        <span className="who">Mickey J.</span>
      </div>
    </header>
  );
}

window.AdminPage = AdminPage;
