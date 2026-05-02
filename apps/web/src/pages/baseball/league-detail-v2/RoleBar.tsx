import React from 'react';
import { I } from './Icons';

export type LeagueRole = 'commish' | 'member' | 'spectator';

export interface SeasonOption {
  value: string;
  label: string;
}

export const RoleBar: React.FC<{
  role: LeagueRole;
  setRole: (r: LeagueRole) => void;
  season: string;
  setSeason: (s: string) => void;
  seasons: readonly SeasonOption[];
  isCommissioner: boolean;
  isMember: boolean;
  leagueName?: string | null;
}> = ({
  role,
  setRole,
  season,
  setSeason,
  seasons,
  isCommissioner,
  isMember,
  leagueName,
}) => (
  <div className="ls-role-bar">
    <div className="ls-role-bar-inner">
      <div className="brand">
        <span style={{ color: 'var(--brand-seam-red-light)' }}>●</span>
        <span>{leagueName ?? 'LEGACY SPORTS'}</span>
        <span className="sub">FANTASY</span>
      </div>
      <div className="spacer" />
      {seasons.length > 1 ? (
        <select
          className="ls-season-select"
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          aria-label="Select season"
        >
          {seasons.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      ) : null}
      <div className="ls-role-switch" role="tablist" aria-label="View role">
        {isCommissioner ? (
          <button
            type="button"
            className={role === 'commish' ? 'on' : ''}
            onClick={() => setRole('commish')}
            role="tab"
            aria-selected={role === 'commish'}
          >
            <I.Shield size={11} /> Commissioner
          </button>
        ) : null}
        {isMember ? (
          <button
            type="button"
            className={role === 'member' ? 'on' : ''}
            onClick={() => setRole('member')}
            role="tab"
            aria-selected={role === 'member'}
          >
            <I.User size={11} /> Member
          </button>
        ) : null}
        <button
          type="button"
          className={role === 'spectator' ? 'on' : ''}
          onClick={() => setRole('spectator')}
          role="tab"
          aria-selected={role === 'spectator'}
        >
          <I.Eye size={11} /> Spectator
        </button>
      </div>
    </div>
  </div>
);
