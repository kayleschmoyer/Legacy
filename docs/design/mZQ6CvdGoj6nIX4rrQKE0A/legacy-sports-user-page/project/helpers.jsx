// helpers.jsx — Trophy SVG, avatars, small UI atoms

const Trophy = ({ size = 'md', silver = false, bronze = false }) => {
  const dims =
    size === 'lg'
      ? { w: 96, h: 132 }
      : size === 'sm'
        ? { w: 68, h: 96 }
        : { w: 80, h: 112 };
  const palette = silver
    ? { hi: '#E8EAEE', mid: '#B8BEC9', lo: '#7C8794', deep: '#4E5663' }
    : bronze
      ? { hi: '#D9A574', mid: '#A87248', lo: '#7A4F30', deep: '#3F2A19' }
      : { hi: '#EAD28A', mid: '#C5A55A', lo: '#8A6F3A', deep: '#4B3A1C' };
  const id = `t-${size}-${silver ? 's' : bronze ? 'b' : 'g'}`;
  return (
    <svg viewBox="0 0 80 112" width={dims.w} height={dims.h} className="glow">
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor={palette.hi} />
          <stop offset=".45" stopColor={palette.mid} />
          <stop offset="1" stopColor={palette.lo} />
        </linearGradient>
        <linearGradient id={`${id}-base`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.mid} />
          <stop offset="1" stopColor={palette.deep} />
        </linearGradient>
      </defs>
      {/* Cup body */}
      <path
        d="M16 14 H64 V42 Q64 64 40 64 Q16 64 16 42 Z"
        fill={`url(#${id}-body)`}
        stroke={palette.lo}
        strokeWidth="1"
      />
      {/* Handles */}
      <path
        d="M16 18 Q4 22 4 36 Q4 50 18 50"
        fill="none"
        stroke={`url(#${id}-body)`}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M64 18 Q76 22 76 36 Q76 50 62 50"
        fill="none"
        stroke={`url(#${id}-body)`}
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Rim highlight */}
      <rect
        x="16"
        y="14"
        width="48"
        height="3"
        fill={palette.hi}
        opacity="0.7"
      />
      {/* Inner highlight */}
      <path
        d="M22 20 Q22 50 32 56"
        stroke={palette.hi}
        strokeOpacity="0.5"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      {/* Star on cup */}
      <path
        d="M40 30 L42.5 36 L49 36 L43.7 39.7 L45.8 46 L40 42.3 L34.2 46 L36.3 39.7 L31 36 L37.5 36 Z"
        fill={palette.deep}
        opacity="0.55"
      />
      {/* Stem */}
      <rect x="34" y="64" width="12" height="14" fill={`url(#${id}-base)`} />
      {/* Plate */}
      <rect
        x="22"
        y="78"
        width="36"
        height="8"
        rx="1.5"
        fill={`url(#${id}-base)`}
      />
      {/* Plinth */}
      <rect
        x="16"
        y="86"
        width="48"
        height="14"
        rx="2.5"
        fill={`url(#${id}-base)`}
        stroke={palette.deep}
      />
      {/* Engraving line */}
      <rect
        x="22"
        y="92"
        width="36"
        height="2.5"
        rx="1"
        fill={palette.deep}
        opacity="0.55"
      />
      {/* Shadow under plinth */}
      <ellipse cx="40" cy="104" rx="34" ry="3.5" fill="#000" opacity="0.45" />
    </svg>
  );
};

const Avatar = ({ initials, size = 'md', tone = 'navy' }) => {
  const cls = `ls-avatar ls-avatar-${size}`;
  const style =
    tone === 'red'
      ? { background: 'linear-gradient(135deg, #8B1A2B, #C41E3A)' }
      : tone === 'gold'
        ? {
            background: 'linear-gradient(135deg, #C5A55A, #8A6F3A)',
            color: '#1a1407',
          }
        : undefined;
  return (
    <div className={cls} style={style}>
      {initials}
    </div>
  );
};

// Star marker for champion badge
const ChampStar = ({ count }) => (
  <div
    className="profile-avatar-star"
    title={`${count} championship${count === 1 ? '' : 's'}`}
  >
    ★
  </div>
);

// Inline brand icon by name from /design-system/icons/brand/
const BrandIcon = ({ name, size = 18, opacity = 1, className = '' }) => (
  <img
    src={`design-system/icons/brand/${name}.svg`}
    width={size}
    height={size}
    alt=""
    style={{ opacity }}
    className={className}
  />
);

// Tiny baseball glyph for background flourishes
const BaseballGlyph = ({ size = 120, opacity = 0.08 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" style={{ opacity }}>
    <circle cx="16" cy="16" r="14" fill="#fff" />
    <path
      d="M6 10 Q16 6 26 10"
      stroke="#C41E3A"
      strokeWidth="1.4"
      fill="none"
    />
    <path
      d="M6 22 Q16 26 26 22"
      stroke="#C41E3A"
      strokeWidth="1.4"
      fill="none"
    />
    <path
      d="M8 11.5 L9 12.5 M10 10.8 L11 11.8 M12 10.2 L13 11.2 M14 9.9 L15 10.9 M16 9.8 L17 10.8 M18 9.9 L19 10.9 M20 10.2 L21 11.2 M22 10.8 L23 11.8 M24 11.5 L25 12.5"
      stroke="#C41E3A"
      strokeWidth="0.7"
    />
    <path
      d="M8 20.5 L9 19.5 M10 21.2 L11 20.2 M12 21.8 L13 20.8 M14 22.1 L15 21.1 M16 22.2 L17 21.2 M18 22.1 L19 21.1 M20 21.8 L21 20.8 M22 21.2 L23 20.2 M24 20.5 L25 19.5"
      stroke="#C41E3A"
      strokeWidth="0.7"
    />
  </svg>
);

// Toggle switch
const Toggle = ({ on, onChange, disabled, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={ariaLabel}
    disabled={disabled}
    className={`toggle ${on ? 'on' : ''}`}
    onClick={() => onChange(!on)}
  />
);

// A "this section is hidden" placeholder (only visible when previewing-as-owner)
const HiddenStub = ({ label }) => (
  <div className="hidden-section">
    <strong style={{ color: 'var(--fg2)', fontWeight: 600 }}>
      {label} is hidden
    </strong>
    {' — '}only you can see this placeholder. Visitors see nothing here.
  </div>
);

Object.assign(window, {
  Trophy,
  Avatar,
  ChampStar,
  BrandIcon,
  BaseballGlyph,
  Toggle,
  HiddenStub,
});
