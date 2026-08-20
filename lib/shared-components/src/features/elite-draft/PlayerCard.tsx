import React from 'react';
import { type DraftPlayer } from './types';
import { getPositionColor } from './utils';
import { STAT_COLUMNS_BY_SPORT } from './statColumns';
import type { SportKind } from '../../config/sports';

/**
 * Accent colours for the card's stat values, applied by position in the row.
 *
 * Single source for all three stat blocks (football, baseball batter, baseball
 * pitcher). These were previously repeated inline as 19 hardcoded hex literals
 * across the two baseball branches; consolidating them here keeps the rendered
 * colours byte-identical while cutting the file's raw-hex count to the 7 unique
 * values, which the theme-compliance ratchet counts (LS-8518).
 *
 * Not yet Tamagui theme tokens: these are raw-CSS `style` values on the
 * `d-stat-val` spans, and mapping them onto semantic tokens would change the
 * baseball board's appearance — out of scope for this fix.
 */
const STAT_VALUE_COLORS = [
  '#10b981',
  '#f59e0b',
  '#3b82f6',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#f97316',
] as const;

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
  isCommPick,
  pickLoading,
  isWatched,
  isQueued,
  onDraft,
  onToggleWatch,
  onToggleQueue,
  onPlayerClick,
  onDragStartPlayer,
  onDragEndPlayer,
  sport = 'baseball',
}: {
  player: DraftPlayer;
  index: number;
  isMyPick: boolean;
  isCommPick?: boolean;
  pickLoading?: boolean;
  isWatched: boolean;
  isQueued?: boolean;
  onDraft: (playerId: number) => void;
  onToggleWatch: (playerId: number) => void;
  onToggleQueue?: (playerId: number) => void;
  onPlayerClick?: (playerId: number) => void;
  /** Drag-to-draft (LS-8068): notified when this card starts/stops dragging. */
  onDragStartPlayer?: (player: DraftPlayer) => void;
  onDragEndPlayer?: () => void;
  /** League sport — drives the stat block and position colours (LS-9473). */
  sport?: SportKind;
}) {
  const isDrafting = isMyPick && pickLoading;
  const posColor = getPositionColor(sport, player.position);
  const secondaryPositions = player.eligiblePositions?.filter(
    (p) => p !== player.position,
  );
  const careerSpan = formatCareerSpan(
    player.careerStartYear,
    player.careerEndYear,
  );

  // LS-8068: drag-to-draft is only meaningful on the user's pick. Dropping a
  // card onto an eligible roster slot in the rail drafts the player; the rail
  // validates eligibility and the active turn before committing the pick.
  const dragEnabled = isMyPick && !isDrafting && !!onDragStartPlayer;

  return (
    <div
      className={`d-card${dragEnabled ? ' draggable' : ''}`}
      style={{ animationDelay: `${index * 0.04}s` }}
      role="group"
      aria-labelledby={`pn-${player.id}`}
      draggable={dragEnabled}
      onDragStart={
        dragEnabled
          ? (e: React.DragEvent) => {
              // text/plain payload makes the native drag valid in all browsers;
              // the rail reads the dragged player from lifted state, not this.
              e.dataTransfer.setData('text/plain', String(player.id));
              e.dataTransfer.effectAllowed = 'move';
              onDragStartPlayer?.(player);
            }
          : undefined
      }
      onDragEnd={dragEnabled ? () => onDragEndPlayer?.() : undefined}
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

        {/* Stats — football, or baseball's pitcher/batter split.
            Football reuses STAT_COLUMNS_BY_SPORT so the card and the table
            view can never disagree on labels or on what "no data" looks like.
            Those renderers emit an em-dash for an absent stat; the card must
            never fall back to 0, which is what made a football player read as
            `AVG .000 / HR 0 / RBI 0 / SB 0` before LS-9473. */}
        {sport === 'football' ? (
          <>
            <div className="d-stats">
              {STAT_COLUMNS_BY_SPORT.football.slice(0, 3).map((col, i) => (
                <div className="d-stat" key={col.label}>
                  <span
                    className="d-stat-val"
                    style={{ color: STAT_VALUE_COLORS[i] }}
                  >
                    {col.render(player)}
                  </span>
                  <span className="d-stat-lbl">{col.label}</span>
                </div>
              ))}
            </div>
            <div className="d-stats" style={{ marginTop: 4 }}>
              {STAT_COLUMNS_BY_SPORT.football.slice(3).map((col, i) => (
                <div className="d-stat" key={col.label}>
                  <span
                    className="d-stat-val"
                    style={{ color: STAT_VALUE_COLORS[i + 3] }}
                  >
                    {col.render(player)}
                  </span>
                  <span className="d-stat-lbl">{col.label}</span>
                </div>
              ))}
            </div>
          </>
        ) : player.isPitcher ? (
          <>
            <div className="d-stats">
              <div className="d-stat">
                <span
                  className="d-stat-val"
                  style={{ color: STAT_VALUE_COLORS[0] }}
                >
                  {player.era?.toFixed(2) ?? '—'}
                </span>
                <span className="d-stat-lbl">ERA</span>
              </div>
              <div className="d-stat">
                <span
                  className="d-stat-val"
                  style={{ color: STAT_VALUE_COLORS[1] }}
                >
                  {player.wins ?? 0}
                </span>
                <span className="d-stat-lbl">W</span>
              </div>
              <div className="d-stat">
                <span
                  className="d-stat-val"
                  style={{ color: STAT_VALUE_COLORS[2] }}
                >
                  {player.strikeouts ?? 0}
                </span>
                <span className="d-stat-lbl">K</span>
              </div>
              <div className="d-stat">
                <span
                  className="d-stat-val"
                  style={{ color: STAT_VALUE_COLORS[3] }}
                >
                  {player.saves ?? 0}
                </span>
                <span className="d-stat-lbl">SV</span>
              </div>
            </div>
            <div className="d-stats" style={{ marginTop: 4 }}>
              <div className="d-stat">
                <span
                  className="d-stat-val"
                  style={{ color: STAT_VALUE_COLORS[4] }}
                >
                  {player.whip?.toFixed(3) ?? '—'}
                </span>
                <span className="d-stat-lbl">WHIP</span>
              </div>
              <div className="d-stat">
                <span
                  className="d-stat-val"
                  style={{ color: STAT_VALUE_COLORS[5] }}
                >
                  {player.losses ?? 0}
                </span>
                <span className="d-stat-lbl">L</span>
              </div>
              <div className="d-stat">
                <span
                  className="d-stat-val"
                  style={{ color: STAT_VALUE_COLORS[6] }}
                >
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
                <span
                  className="d-stat-val"
                  style={{ color: STAT_VALUE_COLORS[0] }}
                >
                  {player.avg.toFixed(3)}
                </span>
                <span className="d-stat-lbl">AVG</span>
              </div>
              <div className="d-stat">
                <span
                  className="d-stat-val"
                  style={{ color: STAT_VALUE_COLORS[1] }}
                >
                  {player.hr}
                </span>
                <span className="d-stat-lbl">HR</span>
              </div>
              <div className="d-stat">
                <span
                  className="d-stat-val"
                  style={{ color: STAT_VALUE_COLORS[2] }}
                >
                  {player.rbi}
                </span>
                <span className="d-stat-lbl">RBI</span>
              </div>
              <div className="d-stat">
                <span
                  className="d-stat-val"
                  style={{ color: STAT_VALUE_COLORS[3] }}
                >
                  {player.sb}
                </span>
                <span className="d-stat-lbl">SB</span>
              </div>
            </div>
            <div className="d-stats" style={{ marginTop: 4 }}>
              <div className="d-stat">
                <span
                  className="d-stat-val"
                  style={{ color: STAT_VALUE_COLORS[4] }}
                >
                  {player.obp.toFixed(3)}
                </span>
                <span className="d-stat-lbl">OBP</span>
              </div>
              <div className="d-stat">
                <span
                  className="d-stat-val"
                  style={{ color: STAT_VALUE_COLORS[5] }}
                >
                  {player.slg.toFixed(3)}
                </span>
                <span className="d-stat-lbl">SLG</span>
              </div>
              <div className="d-stat">
                <span
                  className="d-stat-val"
                  style={{ color: STAT_VALUE_COLORS[6] }}
                >
                  {player.runs}
                </span>
                <span className="d-stat-lbl">R</span>
              </div>
            </div>
          </>
        )}

        {/* Career Pts/Matchup — computed from the baseball scoring cache
            (hitter/pitching PPG), so it is meaningless for football and is
            withheld there rather than shown as 0.00 (LS-9473). Football gets
            this bar back when LS-9476 lands real projections. */}
        {sport !== 'football' && player.ppg != null && (
          <div className="d-ppg-bar">
            <span className="d-ppg-label">Career Pts/Matchup</span>
            <span className="d-ppg-value">{player.ppg.toFixed(2)}</span>
          </div>
        )}

        {/* Actions */}
        <div className="d-card-actions">
          <button
            className={`d-draft-btn ${isDrafting ? 'drafting' : isMyPick ? (isCommPick ? 'force-pick' : 'can-draft') : 'waiting'}`}
            // Stable, unique handle for the draft action keyed by player.id.
            // The accessible name ("Draft <name> now") is NOT unique — the live
            // player pool spans every era since 1876, so two different players
            // can share a name, which trips a Playwright strict-mode violation
            // when selecting by accessible name (LS-8136). player.id is unique
            // and follows the player across draft-board re-renders.
            data-testid={`draft-now-${player.id}`}
            onClick={() => onDraft(player.id)}
            disabled={!isMyPick || isDrafting}
            aria-disabled={!isMyPick || isDrafting}
            aria-label={
              isDrafting
                ? `Drafting ${player.name}…`
                : isMyPick
                  ? isCommPick
                    ? `Force pick ${player.name} as commissioner`
                    : `Draft ${player.name} now`
                  : `Waiting for your turn to draft ${player.name}`
            }
          >
            {isDrafting
              ? '⏳ DRAFTING…'
              : isMyPick
                ? isCommPick
                  ? '👑 FORCE PICK'
                  : '⚡ DRAFT NOW'
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
