import React from 'react';
import { type DraftPlayer } from './types';
import { getPositionColor } from './utils';

// ---------------------------------------------------------------------------
// BaseballCard – baseball card look-alike display for a drafted player (LS-628)
// ---------------------------------------------------------------------------

interface BaseballCardProps {
  player: DraftPlayer;
  /** Draft round this player was selected in */
  round: number;
  /** Pick number within the round */
  pickNumber: number;
  /** Overall pick number across all rounds */
  overallPick: number;
}

export function BaseballCard({
  player,
  round,
  pickNumber,
  overallPick,
}: BaseballCardProps): React.JSX.Element {
  const posColor = getPositionColor(player.position);

  return (
    <div
      className="bc-card"
      role="group"
      aria-label={`${player.name}, ${player.position}, round ${round} pick ${pickNumber}`}
    >
      {/* Position-colored header band */}
      <div className="bc-header" style={{ background: posColor }}>
        <span className="bc-pos-badge">{player.position}</span>
        <span className="bc-pick-badge">
          R{round}
          <br />#{overallPick}
        </span>
      </div>

      {/* Legacy Sports brand micro-text */}
      <div className="bc-brand">
        <span role="img" aria-label="baseball">
          ⚾
        </span>{' '}
        LEGACY SPORTS{' '}
        <span role="img" aria-label="baseball">
          ⚾
        </span>
      </div>

      {/* Card body */}
      <div className="bc-body">
        <div className="bc-overall">PICK #{overallPick}</div>
        <h4 className="bc-name">{player.name}</h4>

        {/* Secondary eligible positions */}
        {player.eligiblePositions && player.eligiblePositions.length > 1 && (
          <div className="bc-elig">
            {player.eligiblePositions
              .filter((p) => p !== player.position)
              .map((p) => (
                <span
                  key={p}
                  className="bc-elig-badge"
                  style={{ background: getPositionColor(p) }}
                >
                  {p}
                </span>
              ))}
          </div>
        )}

        <div className="bc-divider" />

        {/* Stats – pitcher vs batter layout */}
        {player.isPitcher ? (
          <div className="bc-stats">
            <div className="bc-stat">
              <span className="bc-stat-val">
                {player.era?.toFixed(2) ?? '—'}
              </span>
              <span className="bc-stat-lbl">ERA</span>
            </div>
            <div className="bc-stat">
              <span className="bc-stat-val">{player.wins ?? 0}</span>
              <span className="bc-stat-lbl">W</span>
            </div>
            <div className="bc-stat">
              <span className="bc-stat-val">{player.strikeouts ?? 0}</span>
              <span className="bc-stat-lbl">K</span>
            </div>
            <div className="bc-stat">
              <span className="bc-stat-val">{player.saves ?? 0}</span>
              <span className="bc-stat-lbl">SV</span>
            </div>
          </div>
        ) : (
          <div className="bc-stats">
            <div className="bc-stat">
              <span className="bc-stat-val">{player.avg.toFixed(3)}</span>
              <span className="bc-stat-lbl">AVG</span>
            </div>
            <div className="bc-stat">
              <span className="bc-stat-val">{player.hr}</span>
              <span className="bc-stat-lbl">HR</span>
            </div>
            <div className="bc-stat">
              <span className="bc-stat-val">{player.rbi}</span>
              <span className="bc-stat-lbl">RBI</span>
            </div>
            <div className="bc-stat">
              <span className="bc-stat-val">{player.sb}</span>
              <span className="bc-stat-lbl">SB</span>
            </div>
          </div>
        )}

        {/* PPG footer */}
        {player.ppg != null && (
          <div className="bc-ppg">
            <span className="bc-ppg-lbl">PPG</span>
            <span className="bc-ppg-val">{player.ppg.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Hover shine sweep */}
      <div className="bc-shine" aria-hidden="true" />
    </div>
  );
}
