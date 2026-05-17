import React from 'react';
import { I } from './Icons';

export type DraftStatus = string;

const DraftStatusChip: React.FC<{ status?: DraftStatus | null }> = ({
  status,
}) => {
  if (!status) return null;
  const map: Record<string, { cls: string; label: string }> = {
    'pre-draft': { cls: 'ls-chip-pre', label: 'Pre-Draft' },
    'not-started': { cls: 'ls-chip-pre', label: 'Pre-Draft' },
    queued: { cls: 'ls-chip-queued', label: 'Draft Queued' },
    drafting: { cls: 'ls-chip-drafting', label: 'Drafting · Live' },
    'in-progress': { cls: 'ls-chip-drafting', label: 'Drafting · Live' },
    active: { cls: 'ls-chip-active', label: 'Season Active' },
    completed: { cls: 'ls-chip-active', label: 'Season Active' },
  };
  const def = map[status] ?? { cls: 'ls-chip-final', label: String(status) };
  const showDot =
    def.cls === 'ls-chip-drafting' || def.cls === 'ls-chip-active';
  const pulse = def.cls === 'ls-chip-drafting';
  return (
    <span
      className={`ls-chip ${def.cls}`}
      data-testid="draft-status-chip"
      data-status={status}
    >
      {showDot ? (
        <span className={`ls-dot ${pulse ? 'ls-pulse' : ''}`} />
      ) : null}
      {def.label}
    </span>
  );
};

export interface HeroLeague {
  name: string;
  scoringLabel: string;
  era?: string | null;
  draftStatus?: DraftStatus | null;
  currentWeek?: number | null;
  totalMatchups?: number | null;
  teamCount?: number | null;
  inviteCode?: string | null;
}

export const LeagueHero: React.FC<{
  league: HeroLeague;
  onBack: () => void;
  onInvite?: () => void;
  isCommissioner: boolean;
}> = ({ league, onBack, onInvite, isCommissioner }) => (
  <div className="ls-hero">
    <div className="ls-hero-top">
      <button className="ls-backlink" onClick={onBack} type="button">
        <I.ChevronLeft size={14} /> Leagues
      </button>
      <span className="meta" style={{ color: 'var(--fg4)' }}>
        ·
      </span>
      <span className="eyebrow">Baseball · {league.scoringLabel}</span>
      {isCommissioner ? (
        <span
          className="ls-chip ls-chip-commish"
          style={{ marginLeft: 'auto' }}
        >
          <I.Crown size={12} /> Commissioner
        </span>
      ) : null}
    </div>
    <div className="ls-hero-main">
      <div className="ls-hero-crest">
        <I.Shield size={44} style={{ color: 'var(--brand-gold-light)' }} />
      </div>
      <div className="ls-hero-body">
        <h1 data-testid="league-title">{league.name}</h1>
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <DraftStatusChip status={league.draftStatus} />
          {league.era ? <span className="meta">{league.era}</span> : null}
        </div>
        <div className="ls-hero-meta">
          {league.currentWeek != null ? (
            <div className="ls-hero-metaitem">
              <div className="label">Week</div>
              <div className="value mono">
                {league.currentWeek}
                {league.totalMatchups != null ? (
                  <span style={{ color: 'var(--fg3)', fontWeight: 400 }}>
                    {' '}
                    / {league.totalMatchups}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          {league.teamCount != null ? (
            <div className="ls-hero-metaitem">
              <div className="label">Teams</div>
              <div className="value mono">{league.teamCount}</div>
            </div>
          ) : null}
          <div className="ls-hero-metaitem">
            <div className="label">Scoring</div>
            <div className="value">{league.scoringLabel}</div>
          </div>
          {league.inviteCode ? (
            <div className="ls-hero-metaitem">
              <div className="label">Invite</div>
              <div
                className="value mono"
                style={{ color: 'var(--brand-gold-light)' }}
              >
                {league.inviteCode}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="ls-hero-actions">
        {onInvite ? (
          <button
            className="ls-btn ls-btn-gold"
            onClick={onInvite}
            type="button"
          >
            <I.Share size={14} /> Invite
          </button>
        ) : null}
      </div>
    </div>
  </div>
);
