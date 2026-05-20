// Shared.jsx — reusable bits used across multiple tabs.

const { Icons: S_I } = window;

const TeamAvatar = ({ team, size = 'md', clickable = false, onClick }) => {
  if (!team) return null;
  const cls = `ls-avatar ${size} ${team.color || 'navy'}`;
  return (
    <div
      className={cls}
      onClick={onClick}
      style={clickable ? { cursor: 'pointer' } : undefined}
      title={team.name}
    >
      {team.mgrInitials ||
        (team.name || '')
          .split(' ')
          .map((s) => s[0])
          .slice(0, 2)
          .join('')}
    </div>
  );
};

const Rank = ({ n }) => {
  const cls = n === 1 ? 'gold' : n === 2 ? 'silver' : n === 3 ? 'bronze' : '';
  return <div className={`ls-rank ${cls}`}>{n}</div>;
};

const Banner = ({ kind = 'info', icon, title, sub, actions }) => (
  <div className={`ls-banner ls-banner-${kind}`}>
    {icon && <div className="ls-banner-icon">{icon}</div>}
    <div className="ls-banner-body">
      <div className="ls-banner-title">{title}</div>
      {sub && <div className="ls-banner-sub">{sub}</div>}
    </div>
    {actions && <div className="ls-banner-actions">{actions}</div>}
  </div>
);

const Section = ({ title, sub, right, children, className = '' }) => (
  <div className={`ls-card ${className}`}>
    <div className="ls-card-head">
      <div>
        <h3 className="ls-card-title">{title}</h3>
        {sub && <p className="ls-card-sub">{sub}</p>}
      </div>
      {right}
    </div>
    {children}
  </div>
);

// posClass → avatar color tone
const AVATAR_TONE = {
  pitcher: 'red',
  catcher: 'navy',
  infield: 'brown',
  outfield: 'green',
  utility: 'navy',
  qb: 'red',
  rb: 'green',
  wr: 'navy',
  te: 'brown',
  k: 'navy',
  def: 'navy',
  flex: 'purple',
};

// Position abbreviation → posClass (works for both sports)
const posClassOf = (pos) => {
  if (!pos) return 'utility';
  if (pos === 'C') return 'catcher';
  if (['1B', '2B', '3B', 'SS'].includes(pos)) return 'infield';
  if (['OF', 'DH'].includes(pos)) return 'outfield';
  if (['SP', 'RP'].includes(pos)) return 'pitcher';
  if (pos === 'UTIL') return 'utility';
  if (pos === 'PICK') return 'utility';
  if (pos === 'QB') return 'qb';
  if (pos === 'RB') return 'rb';
  if (pos === 'WR') return 'wr';
  if (pos === 'TE') return 'te';
  if (pos === 'K') return 'k';
  if (pos === 'DEF') return 'def';
  if (pos === 'FLEX') return 'flex';
  return 'utility';
};

// Player row used on roster + matchup tabs
const PlayerRow = ({
  p,
  editable,
  onSwap,
  showActions = true,
  best = false,
}) => {
  const initials = p.name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('');
  const tone = AVATAR_TONE[p.posClass] || 'navy';
  return (
    <div
      className={`ls-player-row ${p.posClass || ''} ${p.lock ? 'locked' : ''} ${p.slot === 'BN' ? 'bench' : ''}`}
    >
      <div className="ls-player-slot">{p.slot}</div>
      <div className="ls-player-info">
        <div className={`ls-avatar sm ${tone}`}>{initials}</div>
        <div style={{ minWidth: 0 }}>
          <div className="ls-player-name">
            {p.pos && <span className={`ls-pchip ${p.posClass}`}>{p.pos}</span>}
            <span>{p.name}</span>
            {p.lock && <S_I.Lock size={11} style={{ color: 'var(--fg4)' }} />}
          </div>
          <div className="ls-player-sub">
            <span className="mono-item">{p.era}</span>
            {p.team && (
              <>
                {' '}
                · <span className="mono-item">{p.team}</span>
              </>
            )}
            {p.stat && <> · {p.stat}</>}
            {p.gp !== undefined && (
              <>
                {' '}
                ·{' '}
                <span className="mono-item" style={{ color: 'var(--fg2)' }}>
                  {p.gp}/{p.gp + p.gr} G
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className={`ls-player-score ${best ? 'best' : ''}`}>
        <div
          className="actual"
          style={(() => {
            if (p.proj === undefined || p.actual === undefined)
              return undefined;
            // Pace target: projected score scaled by fraction of games played.
            // Lock-only rows (no gp/gr) use full proj as the target.
            const total =
              p.gp !== undefined && p.gr !== undefined ? p.gp + p.gr : 0;
            const frac = total > 0 ? p.gp / total : 1;
            if (frac === 0) return undefined; // no games played yet, don't tint
            const target = p.proj * frac;
            if (target <= 0) return undefined;
            const ratio = (p.actual - target) / target;
            if (ratio >= 0.1) return { color: 'var(--success-fg)' };
            if (ratio <= -0.1) return { color: 'var(--danger-fg)' };
            return undefined;
          })()}
        >
          {(p.actual ?? 0).toFixed(1)}
        </div>
        {p.proj !== undefined && (
          <div className="proj">{p.proj.toFixed(1)} proj</div>
        )}
      </div>
      {showActions && (
        <div className="ls-player-actions">
          {editable ? (
            <>
              <button className="ls-icon-mini" title="Swap" onClick={onSwap}>
                <S_I.Swap size={14} />
              </button>
              <button className="ls-icon-mini" title="More">
                <S_I.MoreVertical size={14} />
              </button>
            </>
          ) : (
            <button className="ls-icon-mini" title="Stats">
              <S_I.TrendingUp size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

Object.assign(window, {
  TeamAvatar,
  Rank,
  Banner,
  Section,
  PlayerRow,
  posClassOf,
});
