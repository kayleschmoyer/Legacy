import React from 'react';

import type { CurrentDraftPickInfo } from './types';

interface DraftTopBandProps {
  draftPaused: boolean;
  currentPick: number;
  round: number;
  timeRemaining: number;
  pickTimeLimitSeconds: number;
  isMyPick: boolean;
  currentPickInfo: CurrentDraftPickInfo | null;
  isCommissioner: boolean;
  isOwner: boolean;
  draftId: number | null;
  commPickMode: boolean;
  autoPickDisabled: boolean;
  pauseLoading: boolean;
  resumeLoading: boolean;
  autoPickDisabledLoading: boolean;
  isMyTeamAutoPick: boolean;
  toggleAutoPickLoading: boolean;
  myTeamId: number | null;
  teamNameById: (teamId: number | null | undefined) => string;
  onPauseDraft: () => void;
  onResumeDraft: () => void;
  onToggleCommPickMode: () => void;
  onToggleAutoPickDisabled: () => void;
  onToggleUserAutoPick: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function timerClass(seconds: number, limit: number, paused: boolean): string {
  if (paused) return 'paused';
  const pct = limit > 0 ? seconds / limit : 1;
  if (pct <= 0.2) return 'crit';
  if (pct <= 0.4) return 'warn';
  return 'safe';
}

export function DraftTopBand({
  draftPaused,
  currentPick,
  round,
  timeRemaining,
  pickTimeLimitSeconds,
  isMyPick,
  currentPickInfo,
  isCommissioner,
  isOwner,
  draftId,
  commPickMode,
  autoPickDisabled,
  pauseLoading,
  resumeLoading,
  autoPickDisabledLoading: _autoPickDisabledLoading,
  isMyTeamAutoPick,
  toggleAutoPickLoading,
  myTeamId,
  teamNameById,
  onPauseDraft,
  onResumeDraft,
  onToggleCommPickMode,
  onToggleAutoPickDisabled: _onToggleAutoPickDisabled,
  onToggleUserAutoPick,
}: DraftTopBandProps): React.JSX.Element {
  const tClass = timerClass(timeRemaining, pickTimeLimitSeconds, draftPaused);

  // SVG ring: circumference ~314 for r=50; pct remaining drives dashoffset
  const pct =
    pickTimeLimitSeconds > 0 ? timeRemaining / pickTimeLimitSeconds : 1;
  const clampedPct = Math.max(0, Math.min(1, pct));
  // Ring color
  const strokeColor = draftPaused
    ? 'rgba(255,255,255,0.2)'
    : tClass === 'crit'
      ? '#E63950'
      : tClass === 'warn'
        ? '#C5A55A'
        : 'rgba(255,255,255,0.35)';

  const onClockTeam = currentPickInfo
    ? teamNameById(currentPickInfo.teamId)
    : null;

  const showCommish = (isCommissioner || isOwner) && draftId;
  const showAutopick = draftId !== null && myTeamId !== null;

  return (
    <div className="d-topband" role="banner" aria-label="Draft status">
      {/* Pick status */}
      <div className="d-tb-status">
        <div className="d-tb-live" aria-live="polite">
          <span
            className="d-live-dot"
            style={
              draftPaused ? { animation: 'none', opacity: 0.4 } : undefined
            }
            aria-hidden="true"
          />
          {draftPaused ? 'Paused' : 'Live Draft'}
        </div>
        <div
          className="d-tb-pick-num num"
          aria-label={`Pick ${currentPick}`}
          data-testid="current-pick"
        >
          Pick #{currentPick}
        </div>
        <div className="d-tb-round-meta">
          Round {round} · Pick {currentPickInfo?.pickNumber ?? '—'} of{' '}
          {/* teams count omitted — not available here */}
        </div>
      </div>

      <span className="d-topband-divider" aria-hidden="true" />

      {/* Inline ring timer */}
      <div
        className="d-tb-timer"
        role="timer"
        aria-label="Pick timer"
        aria-live="off"
      >
        <div className="d-tb-ring" aria-hidden="true">
          {/* 58×58 viewBox, r=24 → circumference ≈ 150.8 */}
          <svg width="58" height="58" viewBox="0 0 58 58">
            <circle
              cx="29"
              cy="29"
              r="24"
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="4"
            />
            <circle
              cx="29"
              cy="29"
              r="24"
              fill="none"
              stroke={strokeColor}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 24}`}
              strokeDashoffset={`${2 * Math.PI * 24 * (1 - clampedPct)}`}
              style={{
                transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease',
              }}
            />
          </svg>
          <span
            className={`d-tb-ring-time ${tClass}`}
            aria-label={
              draftPaused
                ? 'Draft paused'
                : `${formatTime(timeRemaining)} remaining`
            }
          >
            {draftPaused ? '⏸' : formatTime(timeRemaining)}
          </span>
        </div>
        <div className="d-tb-timer-info">
          <div className="d-tb-timer-cap">Time left</div>
          <div className="d-tb-timer-of">
            of {formatTime(pickTimeLimitSeconds)}
          </div>
        </div>
      </div>

      {/* On-the-clock slab (stretches to fill) */}
      <div className={`d-tb-clock${isMyPick ? ' my-pick' : ''}`}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="d-tb-clock-eyebrow">
            {isMyPick ? 'Your pick' : 'On the clock'}
          </div>
          <div className="d-tb-clock-who">{onClockTeam ?? 'Waiting…'}</div>
        </div>
      </div>

      {/* Auto-pick toggle */}
      {showAutopick && (
        <div
          className={`d-tb-autopick${isMyTeamAutoPick ? ' on' : ''}`}
          role="switch"
          aria-checked={isMyTeamAutoPick}
          tabIndex={0}
          onClick={onToggleUserAutoPick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleUserAutoPick();
            }
          }}
          title={
            autoPickDisabled
              ? 'Auto-pick has been disabled by the commissioner'
              : isMyTeamAutoPick
                ? 'Auto-pick is ON. Click to disable.'
                : 'Enable auto-pick for your turn'
          }
          style={
            autoPickDisabled
              ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' }
              : { cursor: 'pointer' }
          }
          aria-disabled={toggleAutoPickLoading || autoPickDisabled}
        >
          <div className="d-tb-autopick-label">Auto-pick my turn</div>
          <div className="d-tb-autopick-ctrl">
            <div className="d-tb-sw" aria-hidden="true" />
            <div className="d-tb-autopick-state">
              {isMyTeamAutoPick ? 'ON' : 'OFF'}
            </div>
          </div>
        </div>
      )}

      {/* Commissioner controls */}
      {showCommish && (
        <div className="d-tb-commish">
          {!draftPaused ? (
            <button
              className="d-tb-btn danger"
              onClick={onPauseDraft}
              disabled={pauseLoading}
              aria-label="Pause draft"
            >
              {pauseLoading ? '…' : '⏸ Pause'}
            </button>
          ) : (
            <button
              className="d-tb-btn"
              onClick={onResumeDraft}
              disabled={resumeLoading}
              aria-label="Resume draft"
            >
              {resumeLoading ? '…' : '▶ Resume'}
            </button>
          )}
          <button
            className={`d-tb-btn${commPickMode ? ' active' : ''}`}
            onClick={onToggleCommPickMode}
            aria-pressed={commPickMode}
            style={
              commPickMode
                ? {
                    background: 'rgba(139,92,246,0.18)',
                    borderColor: 'rgba(139,92,246,0.4)',
                    color: '#c4b5fd',
                  }
                : undefined
            }
          >
            Commish…
          </button>
        </div>
      )}
    </div>
  );
}
