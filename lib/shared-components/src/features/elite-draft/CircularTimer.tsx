import React from 'react';
import { TIMER_CIRCUMFERENCE, TIMER_RADIUS } from './constants';

// ---------------------------------------------------------------------------
// Circular Timer Sub-component
// ---------------------------------------------------------------------------

export function CircularTimer({
  seconds,
  isMyPick,
  pickTimeLimitSeconds,
  hasDeadline,
}: {
  seconds: number;
  isMyPick: boolean;
  pickTimeLimitSeconds: number;
  hasDeadline: boolean;
}) {
  const noLimit = !hasDeadline || pickTimeLimitSeconds <= 0;
  const progress = noLimit ? 1 : seconds / pickTimeLimitSeconds;
  const offset = TIMER_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)));
  const stroke = noLimit
    ? 'url(#timerSafe)'
    : seconds <= 10
      ? 'url(#timerDanger)'
      : seconds <= 30
        ? 'url(#timerWarn)'
        : 'url(#timerSafe)';
  // Format display: show hours for slow-mode timers (>= 1 hour)
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const isSlowMode = pickTimeLimitSeconds >= 3600;
  const timeDisplay = noLimit
    ? '∞'
    : isSlowMode
      ? `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${Math.floor(seconds / 60)}:${secs.toString().padStart(2, '0')}`;

  return (
    <div
      className={`d-timer-wrap${!noLimit && seconds <= 10 ? ' warn' : ''}`}
      data-testid="pick-timer"
    >
      <svg
        viewBox="0 0 120 120"
        width="140"
        height="140"
        className="d-timer-svg"
        role="timer"
        aria-label={
          isMyPick ? 'Your pick timer' : 'Waiting for other teams timer'
        }
      >
        <defs>
          <linearGradient id="timerSafe" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="timerWarn" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="timerDanger" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>
        <circle className="d-timer-track" cx="60" cy="60" r={TIMER_RADIUS} />
        <circle
          className="d-timer-fill"
          cx="60"
          cy="60"
          r={TIMER_RADIUS}
          stroke={stroke}
          strokeDasharray={TIMER_CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
        />
        <text className="d-timer-text" x="60" y="56">
          {timeDisplay}
        </text>
        <text className="d-timer-label" x="60" y="74">
          {isMyPick ? 'YOUR PICK' : 'WAITING'}
        </text>
      </svg>
    </div>
  );
}
