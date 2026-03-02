import React from 'react';
import { type DraftPlayer } from './types';
import { CONFETTI_COLORS } from './constants';
import { getPositionColor } from './utils';

// ---------------------------------------------------------------------------
// Pick Announcement Sub-component
// ---------------------------------------------------------------------------

export function PickAnnouncement({
  player,
  pickNumber,
  isMyPick,
  isAuto,
  leaving,
  onDismiss,
}: {
  player: DraftPlayer;
  pickNumber: number;
  isMyPick: boolean;
  isAuto: boolean;
  leaving: boolean;
  onDismiss: () => void;
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
          <div className="d-announce-pick">
            Pick #{pickNumber} &middot; Round {Math.ceil(pickNumber / 12)}
          </div>
          <div className="d-announce-name">{player.name}</div>
          <div className="d-announce-details">
            <span className="d-announce-pos" style={{ background: posColor }}>
              {player.position}
            </span>
            <span className="d-announce-team">
              {player.games} G &middot; {player.hits} H
            </span>
          </div>
          <div className="d-announce-stats">
            <div style={{ textAlign: 'center' }}>
              <span
                className="d-announce-stat-val"
                style={{ color: '#10b981' }}
              >
                {player.avg.toFixed(3)}
              </span>
              <span className="d-announce-stat-lbl">AVG</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span
                className="d-announce-stat-val"
                style={{ color: '#f59e0b' }}
              >
                {player.hr}
              </span>
              <span className="d-announce-stat-lbl">HR</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span
                className="d-announce-stat-val"
                style={{ color: '#3b82f6' }}
              >
                {player.rbi}
              </span>
              <span className="d-announce-stat-lbl">RBI</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span
                className="d-announce-stat-val"
                style={{ color: '#8b5cf6' }}
              >
                {player.sb}
              </span>
              <span className="d-announce-stat-lbl">SB</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
