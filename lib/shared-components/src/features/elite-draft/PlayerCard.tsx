import React from 'react';
import { type DraftPlayer } from './types';
import { getPositionColor } from './utils';

// ---------------------------------------------------------------------------
// Player Card Sub-component
// ---------------------------------------------------------------------------

function formatCareerSpan(
  startYear: number | null | undefined,
  endYear: number | null | undefined,
): { years: string; seasons: number | null } | null {
  if (startYear == null) return null;
  const end = endYear ?? startYear;
  const years = end === startYear ? `${startYear}` : `${startYear}–${end}`;
  const seasons = end >= startYear ? end - startYear + 1 : null;
  return { years, seasons };
}

export const PlayerCard = React.memo(function PlayerCard({
  player,
  index,
  isMyPick,
  pickLoading,
  isWatched,
  isQueued,
  onDraft,
  onToggleWatch,
  onToggleQueue,
  onPlayerClick,
}: {
  player: DraftPlayer;
  index: number;
  isMyPick: boolean;
  pickLoading?: boolean;
  isWatched: boolean;
  isQueued?: boolean;
  onDraft: (playerId: number) => void;
  onToggleWatch: (playerId: number) => void;
  onToggleQueue?: (playerId: number) => void;
  onPlayerClick?: (playerId: number) => void;
}) {
  const isDrafting = isMyPick && pickLoading;
  const posColor = getPositionColor('baseball', player.position);
  const secondaryPositions = player.eligiblePositions?.filter(
    (p) => p !== player.position,
  );
  const careerSpan = formatCareerSpan(
    player.careerStartYear,
    player.careerEndYear,
  );

  return (
    <div
      className="d-card"
      style={{ animationDelay: `${index * 0.04}s` }}
      role="group"
      aria-labelledby={`pn-${player.id}`}
    >
      <div className="d-card-accent" style={{ background: posColor }} />
      <div className="d-card-body">
        {/* Header */}
        <div className="d-card-header">
          <div>
            {onPlayerClick ? (
              <button
                type="button"
                className="d-card-name"
                id={`pn-${player.id}`}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onPlayerClick(player.id);
                }}
                style={{ cursor: 'pointer' }}
              >
                {player.name}
              </button>
            ) : (
              <h3 className="d-card-name" id={`pn-${player.id}`}>
                {player.name}
              </h3>
            )}
            <div className="d-card-meta">
              {player.games > 0
                ? `${player.games} G · ${player.hits} H`
                : 'Career stats pending'}
            </div>
            {careerSpan && (
              <div className="d-card-career">
                Career{' '}
                <span className="d-card-career-years">{careerSpan.years}</span>
                {careerSpan.seasons != null &&
                  ` · ${careerSpan.seasons} seasons`}
              </div>
            )}
          </div>
          <div className="d-card-badges">
            <span
              className="d-pos-badge"
              style={{ background: posColor }}
              title="Primary position"
            >
              {player.position}
            </span>
            {secondaryPositions && secondaryPositions.length > 0 && (
              <span
                className="d-pos-alt"
                title="Also eligible"
                aria-label={`Also eligible: ${secondaryPositions.join(', ')}`}
              >
                {secondaryPositions.join(' · ')}
              </span>
            )}
          </div>
        </div>

        {/* Stats — pitcher vs batter */}
        {player.isPitcher ? (
          <>
            <div className="d-stats">
              <div className="d-stat">
                <span className="d-stat-val" style={{ color: '#10b981' }}>
                  {player.era?.toFixed(2) ?? '—'}
                </span>
                <span className="d-stat-lbl">ERA</span>
              </div>
              <div className="d-stat">
                <span className="d-stat-val" style={{ color: '#f59e0b' }}>
                  {player.wins ?? 0}
                </span>
                <span className="d-stat-lbl">W</span>
              </div>
              <div className="d-stat">
                <span className="d-stat-val" style={{ color: '#3b82f6' }}>
                  {player.strikeouts ?? 0}
                </span>
                <span className="d-stat-lbl">K</span>
              </div>
              <div className="d-stat">
                <span className="d-stat-val" style={{ color: '#8b5cf6' }}>
                  {player.saves ?? 0}
                </span>
                <span className="d-stat-lbl">SV</span>
              </div>
            </div>
            <div className="d-stats" style={{ marginTop: 4 }}>
              <div className="d-stat">
                <span className="d-stat-val" style={{ color: '#06b6d4' }}>
                  {player.whip?.toFixed(3) ?? '—'}
                </span>
                <span className="d-stat-lbl">WHIP</span>
              </div>
              <div className="d-stat">
                <span className="d-stat-val" style={{ color: '#ec4899' }}>
                  {player.losses ?? 0}
                </span>
                <span className="d-stat-lbl">L</span>
              </div>
              <div className="d-stat">
                <span className="d-stat-val" style={{ color: '#f97316' }}>
                  {player.gamesStarted ?? 0}
                </span>
                <span className="d-stat-lbl">GS</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="d-stats">
              <div className="d-stat">
                <span className="d-stat-val" style={{ color: '#10b981' }}>
                  {player.avg.toFixed(3)}
                </span>
                <span className="d-stat-lbl">AVG</span>
              </div>
              <div className="d-stat">
                <span className="d-stat-val" style={{ color: '#f59e0b' }}>
                  {player.hr}
                </span>
                <span className="d-stat-lbl">HR</span>
              </div>
              <div className="d-stat">
                <span className="d-stat-val" style={{ color: '#3b82f6' }}>
                  {player.rbi}
                </span>
                <span className="d-stat-lbl">RBI</span>
              </div>
              <div className="d-stat">
                <span className="d-stat-val" style={{ color: '#8b5cf6' }}>
                  {player.sb}
                </span>
                <span className="d-stat-lbl">SB</span>
              </div>
            </div>
            <div className="d-stats" style={{ marginTop: 4 }}>
              <div className="d-stat">
                <span className="d-stat-val" style={{ color: '#06b6d4' }}>
                  {player.obp.toFixed(3)}
                </span>
                <span className="d-stat-lbl">OBP</span>
              </div>
              <div className="d-stat">
                <span className="d-stat-val" style={{ color: '#ec4899' }}>
                  {player.slg.toFixed(3)}
                </span>
                <span className="d-stat-lbl">SLG</span>
              </div>
              <div className="d-stat">
                <span className="d-stat-val" style={{ color: '#f97316' }}>
                  {player.runs}
                </span>
                <span className="d-stat-lbl">R</span>
              </div>
            </div>
          </>
        )}

        {/* Career PPG */}
        {player.ppg != null && (
          <div className="d-ppg-bar">
            <span className="d-ppg-label">Career PPG</span>
            <span className="d-ppg-value">{player.ppg.toFixed(2)}</span>
          </div>
        )}

        {/* Actions */}
        <div className="d-card-actions">
          <button
            className={`d-draft-btn ${isDrafting ? 'drafting' : isMyPick ? 'can-draft' : 'waiting'}`}
            onClick={() => onDraft(player.id)}
            disabled={!isMyPick || isDrafting}
            aria-disabled={!isMyPick || isDrafting}
            aria-label={
              isDrafting
                ? `Drafting ${player.name}…`
                : isMyPick
                  ? `Draft ${player.name} now`
                  : `Waiting for your turn to draft ${player.name}`
            }
          >
            {isDrafting
              ? '⏳ DRAFTING…'
              : isMyPick
                ? '⚡ DRAFT NOW'
                : '⏳ WAITING'}
          </button>
          <button
            className={`d-watch-btn ${isWatched ? 'active' : ''}`}
            onClick={() => onToggleWatch(player.id)}
            aria-pressed={isWatched}
            aria-label={
              isWatched
                ? `Remove ${player.name} from watchlist`
                : `Add ${player.name} to watchlist`
            }
          >
            {isWatched ? '★' : '☆'}
          </button>
          {onToggleQueue && (
            <button
              className={`d-queue-card-btn ${isQueued ? 'active' : ''}`}
              onClick={() => onToggleQueue(player.id)}
              aria-pressed={Boolean(isQueued)}
              aria-label={
                isQueued
                  ? `Remove ${player.name} from draft queue`
                  : `Add ${player.name} to draft queue`
              }
              title={isQueued ? 'Remove from queue' : 'Add to queue'}
            >
              {isQueued ? '📋' : '📄'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
