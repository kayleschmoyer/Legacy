// StateSwitcher.jsx — shared conditional-state preview controls + skeleton/error/empty primitives.
// Reused by every screen (Hub, Disclosure, Season Draft Lobby/Create/Join/Game) so each one can
// expose a visible state switcher (button tabs) toggling loading/error/empty/populated, plus
// page-specific states, per docs/agents/pages/PROMPT.md "Conditional States". Visual language
// matches the pre-existing .sdg-phase-toggle preview control in SeasonDraftGame.jsx.

const StateSwitcher = ({ value, onChange, states, label = 'Preview' }) => (
  <div className="state-switcher" role="tablist" aria-label={`${label} state`}>
    <span className="state-switcher-label">{label}</span>
    <div className="toggle-group">
      {states.map((s) => (
        <button
          key={s.value}
          type="button"
          role="tab"
          aria-selected={value === s.value}
          className={value === s.value ? 'on' : ''}
          onClick={() => onChange(s.value)}
        >
          {s.label}
        </button>
      ))}
    </div>
  </div>
);

// COMPONENT: skel — shimmer block; pass w/h/r (width/height/border-radius) to trace real geometry.
const Skel = ({ w, h, r, className = '', style }) => (
  <div
    className={`skel ${className}`}
    style={{ width: w, height: h, borderRadius: r, ...style }}
  />
);

// COMPONENT: state-error-card — reused whenever a screen's data fetch fails.
const ErrorCard = ({ title, message, onRetry, retryLabel = 'Retry' }) => (
  <div className="state-error-card" role="alert" aria-live="assertive">
    <div className="state-error-icon" aria-hidden="true">
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z" />
        <path d="M12 9v4" />
        <path d="M12 17.01V17" />
      </svg>
    </div>
    <div className="state-error-body">
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-ghost" type="button" onClick={onRetry}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          {retryLabel}
        </button>
      )}
    </div>
  </div>
);

// COMPONENT: state-empty-card — reused whenever a screen has zero data to show.
const EmptyCard = ({ icon, title, message, cta, onCta }) => (
  <div className="state-empty-card">
    {icon && (
      <div className="state-empty-icon" aria-hidden="true">
        {icon}
      </div>
    )}
    <h3>{title}</h3>
    <p>{message}</p>
    {cta && onCta && (
      <button className="btn btn-gold" type="button" onClick={onCta}>
        {cta}
      </button>
    )}
  </div>
);

Object.assign(window, { StateSwitcher, Skel, ErrorCard, EmptyCard });
