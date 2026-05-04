import React from 'react';
import { I } from './Icons';

export type AvatarColor = 'navy' | 'red' | 'green' | 'brown' | 'purple';
export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const POS_TO_CLASS: Record<string, string> = {
  C: 'catcher',
  SP: 'pitcher',
  RP: 'pitcher',
  P: 'pitcher',
  '1B': 'infield',
  '2B': 'infield',
  '3B': 'infield',
  SS: 'infield',
  IF: 'infield',
  OF: 'outfield',
  LF: 'outfield',
  CF: 'outfield',
  RF: 'outfield',
  UTIL: 'utility',
  DH: 'utility',
};

export const positionClass = (pos?: string | null) =>
  pos ? (POS_TO_CLASS[pos.toUpperCase()] ?? 'utility') : 'utility';

export const colorFromString = (s?: string | null): AvatarColor => {
  if (!s) return 'navy';
  const palette: AvatarColor[] = ['navy', 'red', 'green', 'brown', 'purple'];
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
};

export const initialsFromName = (name?: string | null) => {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const TeamAvatar: React.FC<{
  name: string;
  color?: AvatarColor;
  size?: AvatarSize;
  initials?: string;
  onClick?: () => void;
}> = ({ name, color = 'navy', size = 'md', initials, onClick }) => (
  <div
    className={`ls-avatar ${size} ${color}`}
    onClick={onClick}
    style={onClick ? { cursor: 'pointer' } : undefined}
    title={name}
  >
    {initials ?? initialsFromName(name)}
  </div>
);

export const Rank: React.FC<{ n: number }> = ({ n }) => {
  const cls = n === 1 ? 'gold' : n === 2 ? 'silver' : n === 3 ? 'bronze' : '';
  return <div className={`ls-rank ${cls}`}>{n}</div>;
};

export const Banner: React.FC<{
  kind?: 'live' | 'info' | 'warning' | 'gold' | 'spectator';
  icon?: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ kind = 'info', icon, title, sub, actions }) => (
  <div className={`ls-banner ls-banner-${kind}`}>
    {icon ? <div className="ls-banner-icon">{icon}</div> : null}
    <div className="ls-banner-body">
      <div className="ls-banner-title">{title}</div>
      {sub ? <div className="ls-banner-sub">{sub}</div> : null}
    </div>
    {actions ? <div className="ls-banner-actions">{actions}</div> : null}
  </div>
);

export const Section: React.FC<{
  title: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, sub, right, children, className = '' }) => (
  <div className={`ls-card ${className}`}>
    <div className="ls-card-head">
      <div>
        {/* h2 (not h3) so each Section sits one level below the league
            page's h1 (LeagueHero), satisfying the heading hierarchy a11y
            check (LS-4171). */}
        <h2 className="ls-card-title">{title}</h2>
        {sub ? <p className="ls-card-sub">{sub}</p> : null}
      </div>
      {right}
    </div>
    {children}
  </div>
);

export interface PlayerRowVM {
  id: string;
  name: string;
  slot: string;
  pos?: string | null;
  team?: string | null;
  stat?: string | null;
  era?: number | string | null;
  actual?: number | null;
  proj?: number | null;
  gamesPlayed?: number | null;
  gamesRemaining?: number | null;
  locked?: boolean;
  bench?: boolean;
}

export const PlayerRow: React.FC<{
  p: PlayerRowVM;
  editable?: boolean;
  onSwap?: () => void;
  onMore?: () => void;
  onStats?: () => void;
  best?: boolean;
}> = ({ p, editable, onSwap, onMore, onStats, best }) => {
  const klass = positionClass(p.pos ?? p.slot);
  const showActions = editable || onStats;
  return (
    <div
      className={`ls-player-row ${klass} ${p.locked ? 'locked' : ''} ${
        p.bench ? 'bench' : ''
      }`}
    >
      <div className="ls-player-slot">{p.slot}</div>
      <div className="ls-player-info">
        <div
          className={`ls-avatar sm ${klass === 'pitcher' ? 'red' : klass === 'outfield' ? 'green' : klass === 'infield' ? 'brown' : 'navy'}`}
        >
          {initialsFromName(p.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="ls-player-name">
            {p.pos ? (
              <span className={`ls-pchip ${klass}`}>{p.pos}</span>
            ) : null}
            <span>{p.name}</span>
            {p.locked ? <I.Lock size={11} /> : null}
          </div>
          <div className="ls-player-sub">
            {p.era != null ? <span className="mono-item">{p.era}</span> : null}
            {p.team ? (
              <>
                {' '}
                · <span className="mono-item">{p.team}</span>
              </>
            ) : null}
            {p.stat ? <> · {p.stat}</> : null}
            {p.gamesPlayed != null && p.gamesRemaining != null ? (
              <>
                {' '}
                ·{' '}
                <span className="mono-item">
                  {p.gamesPlayed}/{p.gamesPlayed + p.gamesRemaining} G
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
      <div className={`ls-player-score ${best ? 'best' : ''}`}>
        <div className="actual">{(p.actual ?? 0).toFixed(1)}</div>
        {p.proj != null ? (
          <div className="proj">{p.proj.toFixed(1)} proj</div>
        ) : null}
      </div>
      {showActions ? (
        <div className="ls-player-actions">
          {editable ? (
            <>
              <button className="ls-icon-mini" title="Swap" onClick={onSwap}>
                <I.Swap size={14} />
              </button>
              <button className="ls-icon-mini" title="More" onClick={onMore}>
                <I.MoreVertical size={14} />
              </button>
            </>
          ) : (
            <button className="ls-icon-mini" title="Stats" onClick={onStats}>
              <I.TrendingUp size={14} />
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
};

export const Toggle: React.FC<{
  on: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  sub?: React.ReactNode;
}> = ({ on, onChange, label, sub }) =>
  label ? (
    <div className="ls-toggle-row">
      <div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 13,
            color: 'var(--fg1)',
          }}
        >
          {label}
        </div>
        {sub ? (
          <div style={{ fontSize: 12, color: 'var(--fg3)' }}>{sub}</div>
        ) : null}
      </div>
      <button
        className={`ls-toggle ${on ? 'on' : ''}`}
        onClick={() => onChange(!on)}
        aria-pressed={on}
        type="button"
      />
    </div>
  ) : (
    <button
      className={`ls-toggle ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
      aria-pressed={on}
      type="button"
    />
  );

export const Empty: React.FC<{
  icon?: React.ReactNode;
  title: string;
  sub?: string;
  children?: React.ReactNode;
}> = ({ icon, title, sub, children }) => (
  <div className="ls-empty">
    {icon ? <div className="ls-empty-icon">{icon}</div> : null}
    <h3>{title}</h3>
    {sub ? <p>{sub}</p> : null}
    {children}
  </div>
);
