import React from 'react';
import type { NotablePlaySummary } from './types';

// ---------------------------------------------------------------------------
// PickSplashStatGraphic — animated Statcast stat graphic for the spectator
// pick splash (LS-9095).
//
// Renders the drafted player's cached most-notable play as a lightweight
// animated SVG: a drawn hit-trajectory arc with exit-velo / launch-angle /
// distance chips for batters, a radiating pitch-speed burst for pitchers.
// All animation is CSS keyframes (styles.ts) tuned to finish within ~2s so
// the graphic reads fully even in the 4s catch-up splash window.
//
// ToS note (spike LS-8945): this renders numbers we computed from feed data —
// no MLB video is embedded, proxied, or rehosted. The optional "Watch on MLB
// Film Room" affordance is a plain user-initiated link-out to MLB's own site.
// ---------------------------------------------------------------------------

/** Human label for the MLB eventType codes the scorer emits. */
const EVENT_LABELS: Record<string, string> = {
  home_run: 'HOME RUN',
  grand_slam: 'GRAND SLAM',
  triple: 'TRIPLE',
  double: 'DOUBLE',
  single: 'SINGLE',
  sac_fly: 'SAC FLY',
  strikeout: 'STRIKEOUT',
  strike_out: 'STRIKEOUT',
  field_out: 'HARD-HIT OUT',
};

function eventLabel(play: NotablePlaySummary): string {
  return (
    EVENT_LABELS[play.eventType] ??
    play.eventType.replace(/_/g, ' ').toUpperCase()
  );
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * Stylized hit-trajectory path for the batter graphic. The launch angle sets
 * the apex height; the arc always spans the full stage width so short singles
 * still read as a satisfying flight.
 */
function trajectoryPath(launchAngle: number | null): {
  path: string;
  endX: number;
  endY: number;
} {
  const startX = 16;
  const startY = 104;
  const endX = 264;
  const endY = 96;
  const angle = clamp(launchAngle ?? 25, 8, 50);
  const apexY = startY - 10 - (angle / 50) * 78;
  const path = `M ${startX} ${startY} Q 140 ${apexY} ${endX} ${endY}`;
  return { path, endX, endY };
}

function BatterGraphic({ play }: { play: NotablePlaySummary }) {
  const { path, endX, endY } = trajectoryPath(play.launchAngle);
  const chips = [
    play.exitVelocity != null && {
      label: 'EXIT VELO',
      value: `${play.exitVelocity.toFixed(1)} MPH`,
    },
    play.launchAngle != null && {
      label: 'LAUNCH',
      value: `${Math.round(play.launchAngle)}°`,
    },
    play.hitDistance != null && {
      label: 'DISTANCE',
      value: `${Math.round(play.hitDistance)} FT`,
    },
  ].filter((c): c is { label: string; value: string } => Boolean(c));

  return (
    <>
      <svg
        className="d-stat-svg"
        viewBox="0 0 280 120"
        role="img"
        aria-label={`Notable play: ${play.description}`}
      >
        <defs>
          <linearGradient id="statTraj" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: 'var(--d-warning)' }} />
            <stop
              offset="100%"
              style={{ stopColor: 'var(--d-accent-light)' }}
            />
          </linearGradient>
        </defs>
        {/* Ground line */}
        <line className="d-stat-ground" x1="8" y1="112" x2="272" y2="112" />
        <path className="d-stat-traj" d={path} stroke="url(#statTraj)" />
        <circle className="d-stat-ball" cx={endX} cy={endY} r="5" />
      </svg>
      {chips.length > 0 && (
        <div className="d-stat-chips">
          {chips.map((chip, i) => (
            <div
              key={chip.label}
              className="d-stat-chip"
              style={{ animationDelay: `${0.9 + i * 0.35}s` }}
            >
              <span className="d-stat-chip-value">{chip.value}</span>
              <span className="d-stat-chip-label">{chip.label}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function PitcherGraphic({ play }: { play: NotablePlaySummary }) {
  return (
    <div
      className="d-stat-pitch"
      role="img"
      aria-label={`Notable play: ${play.description}`}
    >
      <div className="d-stat-pitch-k" aria-hidden="true">
        K
      </div>
      {play.pitchSpeed != null && (
        <div className="d-stat-chip" style={{ animationDelay: '0.6s' }}>
          <span className="d-stat-chip-value">
            {play.pitchSpeed.toFixed(1)} MPH
          </span>
          <span className="d-stat-chip-label">
            {play.pitchType?.toUpperCase() ?? 'PUT-AWAY PITCH'}
          </span>
        </div>
      )}
    </div>
  );
}

export interface PickSplashStatGraphicProps {
  /** Cached notable play for the drafted player — null renders nothing. */
  play: NotablePlaySummary | null;
}

/**
 * Web-only, like the rest of the splash chrome — the native spectator screen
 * keeps its own deliberately separate announcement tree.
 */
export function PickSplashStatGraphic({
  play,
}: PickSplashStatGraphicProps): React.JSX.Element | null {
  if (!play) return null;

  const hasBatterMetrics =
    play.playerRole === 'batter' &&
    (play.exitVelocity != null || play.launchAngle != null);
  const hasPitcherMetrics = play.playerRole === 'pitcher';

  return (
    <div className="d-splash-stat" data-testid="splash-stat-graphic">
      <div className="d-stat-event">{eventLabel(play)}</div>
      {hasBatterMetrics ? (
        <BatterGraphic play={play} />
      ) : hasPitcherMetrics ? (
        <PitcherGraphic play={play} />
      ) : (
        <div className="d-stat-desc">{play.description}</div>
      )}
      {play.filmRoomUrl && (
        <a
          className="d-stat-filmroom"
          href={play.filmRoomUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Watch on MLB Film Room ↗
        </a>
      )}
    </div>
  );
}
