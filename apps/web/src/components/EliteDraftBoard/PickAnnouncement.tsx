import React from 'react';
import { type DraftPlayer } from './types';
import { CONFETTI_COLORS } from './constants';
import { getPositionColor } from './utils';
import { BaseballCard } from './BaseballCard';

// ---------------------------------------------------------------------------
// Pick Announcement Sub-component
// ---------------------------------------------------------------------------

export function PickAnnouncement({
  player,
  pickNumber,
  round,
  roundPickNumber,
  isMyPick,
  isAuto,
  autoPickReason,
  leaving,
  onDismiss,
  commentary,
}: {
  player: DraftPlayer;
  pickNumber: number;
  round: number;
  roundPickNumber: number;
  isMyPick: boolean;
  isAuto: boolean;
  autoPickReason?: string | null;
  leaving: boolean;
  onDismiss: () => void;
  commentary?: string;
}) {
  const posColor = getPositionColor(player.position);
  const labelClass = isAuto ? 'auto-pick' : isMyPick ? 'my-pick' : 'opp-pick';
  const labelText = isAuto
    ? '⏱ AUTO-DRAFTED'
    : isMyPick
      ? '🎉 YOUR PICK'
      : '📋 OPPONENT PICK';

  return (
    <div
      className={`d-announce-overlay${leaving ? ' leaving' : ''}`}
      onClick={onDismiss}
      role="alert"
      aria-live="assertive"
    >
      <div
        className={`d-announce${leaving ? ' leaving' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Confetti */}
        <div className="d-confetti">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="d-confetti-bit"
              style={{
                left: `${4 + Math.random() * 92}%`,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${Math.random() * 0.6}s`,
                animationDuration: `${1.4 + Math.random() * 1}s`,
                width: 4 + Math.random() * 4,
                height: 4 + Math.random() * 4,
                borderRadius: Math.random() > 0.5 ? '50%' : '1px',
                transform: `rotate(${Math.random() * 360}deg)`,
              }}
            />
          ))}
        </div>

        {/* Top accent bar */}
        <div
          className="d-announce-accent"
          style={{
            background: `linear-gradient(90deg, ${posColor}, ${posColor}88, ${posColor})`,
          }}
        />
        <div className="d-announce-shine" />

        <div className="d-announce-body">
          <span className={`d-announce-label ${labelClass}`}>{labelText}</span>
          {isAuto && autoPickReason && (
            <div className="d-announce-reason">{autoPickReason}</div>
          )}

          {/* Baseball card */}
          <div className="bc-announce-wrapper">
            <BaseballCard
              player={player}
              round={round}
              pickNumber={roundPickNumber}
              overallPick={pickNumber}
            />
          </div>

          {commentary && (
            <div className="d-announce-commentary">{commentary}</div>
          )}
        </div>
      </div>
    </div>
  );
}
