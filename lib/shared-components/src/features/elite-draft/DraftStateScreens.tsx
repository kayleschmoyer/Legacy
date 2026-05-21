import React from 'react';
import { CSS } from './styles';
import { SkeletonCard } from './SkeletonCard';

interface StateScreenProps {
  icon: string;
  iconLabel: string;
  title: string;
  description: string;
  buttonText?: string;
  onButtonClick?: () => void;
}

function StateScreen({
  icon,
  iconLabel,
  title,
  description,
  buttonText,
  onButtonClick,
}: StateScreenProps): React.JSX.Element {
  return (
    <div className="d-root">
      <style>{CSS}</style>
      <div className="d-bg-fx" />
      <div className="d-state-center">
        <div className="d-state-icon">
          <span role="img" aria-label={iconLabel}>
            {icon}
          </span>
        </div>
        <div className="d-state-title">{title}</div>
        <div className="d-state-desc">{description}</div>
        {buttonText && onButtonClick && (
          <button className="d-state-btn" onClick={onButtonClick}>
            {buttonText}
          </button>
        )}
      </div>
    </div>
  );
}

export function NoLeagueScreen({
  onNavigate,
}: {
  onNavigate: (path: string) => void;
}): React.JSX.Element {
  return (
    <StateScreen
      icon="⚾"
      iconLabel="baseball"
      title="Live Draft Board"
      description="Navigate to a league and start a live draft from the commissioner panel."
      buttonText="Go to Leagues"
      onButtonClick={() => onNavigate('/baseball')}
    />
  );
}

// Skeleton primitive — shimmer block sized by inline width/height. Inline
// `borderRadius` overrides the default rectangle radius (e.g. for circles or
// pills). Geometry should mirror the populated element it replaces so the
// loading → populated reveal is a content swap, not a reflow.
function Skel({ style }: { style: React.CSSProperties }): React.JSX.Element {
  return <div className="d-skel-line" style={style} aria-hidden="true" />;
}

export function LoadingScreen(): React.JSX.Element {
  return (
    <div
      className="d-root"
      data-testid="draft-board-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading draft board"
    >
      <style>{CSS}</style>
      <div className="d-bg-fx" />
      <div className="d-layout">
        {/* TOPBAND skeleton — mirrors DraftTopBand's 5-column grid:
            status · divider · timer · current-pick slab · autopick toggle. */}
        <div className="d-topband" aria-hidden="true">
          {/* Pick status block */}
          <div className="d-tb-status">
            <Skel style={{ width: 76, height: 11, marginBottom: 8 }} />
            <Skel style={{ width: 90, height: 20, marginBottom: 6 }} />
            <Skel style={{ width: 130, height: 11 }} />
          </div>
          {/* Vertical divider — real geometry, no shimmer */}
          <span className="d-topband-divider" />
          {/* Inline ring timer + caption */}
          <div className="d-tb-timer">
            <Skel
              style={{
                width: 58,
                height: 58,
                borderRadius: '50%',
                flex: '0 0 58px',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skel style={{ width: 64, height: 10 }} />
              <Skel style={{ width: 48, height: 10 }} />
            </div>
          </div>
          {/* On-the-clock slab — keep real container dimensions */}
          <div
            className="d-tb-clock"
            style={{
              boxShadow: 'none',
              background: 'var(--d-panel)',
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
              }}
            >
              <Skel style={{ width: 92, height: 10 }} />
              <Skel style={{ width: 170, height: 20 }} />
              <Skel style={{ width: 140, height: 11 }} />
            </div>
          </div>
          {/* Auto-pick toggle */}
          <div className="d-tb-autopick" style={{ gap: 8 }}>
            <Skel style={{ width: 110, height: 10 }} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Skel style={{ width: 34, height: 20, borderRadius: 9999 }} />
              <Skel style={{ width: 26, height: 12 }} />
            </div>
            <Skel style={{ width: 118, height: 10 }} />
          </div>
        </div>

        {/* MAIN skeleton — view tabs, controls toolbar, filter pills, card grid. */}
        <section className="d-main">
          <div className="d-view-tabs" style={{ gap: 20 }}>
            <Skel style={{ width: 90, height: 14 }} />
            <Skel style={{ width: 110, height: 14 }} />
            <Skel style={{ width: 108, height: 14 }} />
            <Skel style={{ width: 118, height: 14 }} />
          </div>
          <div className="d-controls">
            <Skel style={{ flex: 1, minWidth: 180, height: 36 }} />
            <Skel style={{ width: 180, height: 36 }} />
          </div>
          <div className="d-pills" style={{ marginBottom: 14 }}>
            <Skel style={{ width: 72, height: 32, borderRadius: 9999 }} />
            <Skel style={{ width: 48, height: 32, borderRadius: 9999 }} />
            <Skel style={{ width: 52, height: 32, borderRadius: 9999 }} />
            <Skel style={{ width: 52, height: 32, borderRadius: 9999 }} />
            <Skel style={{ width: 52, height: 32, borderRadius: 9999 }} />
            <Skel style={{ width: 52, height: 32, borderRadius: 9999 }} />
            <Skel style={{ width: 56, height: 32, borderRadius: 9999 }} />
            <Skel style={{ width: 48, height: 32, borderRadius: 9999 }} />
          </div>
          <div
            className="d-player-grid"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            }}
          >
            {Array.from({ length: 9 }).map((_, i) => (
              <SkeletonCard key={i} delay={i * 0.06} />
            ))}
          </div>
        </section>

        {/* RIGHT RAIL skeleton — intel · queue · roster · history panels. */}
        <aside className="d-rail" aria-hidden="true">
          {/* Draft Intelligence */}
          <div className="d-rail-panel">
            <Skel style={{ width: 160, height: 12, marginBottom: 10 }} />
            <Skel style={{ width: 220, height: 10, marginBottom: 12 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skel style={{ height: 56 }} />
              <Skel style={{ height: 56 }} />
              <Skel style={{ height: 56 }} />
            </div>
          </div>
          {/* Auto-pick Queue */}
          <div className="d-rail-panel">
            <Skel style={{ width: 120, height: 12, marginBottom: 10 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skel style={{ height: 28 }} />
              <Skel style={{ height: 28 }} />
              <Skel style={{ height: 28 }} />
            </div>
          </div>
          {/* My Roster */}
          <div className="d-rail-panel">
            <Skel style={{ width: 110, height: 12, marginBottom: 10 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skel style={{ height: 14 }} />
              <Skel style={{ height: 14 }} />
              <Skel style={{ height: 14 }} />
              <Skel style={{ height: 14 }} />
              <Skel style={{ height: 14 }} />
              <Skel style={{ height: 14 }} />
              <Skel style={{ height: 14 }} />
              <Skel style={{ height: 14 }} />
            </div>
          </div>
          {/* Pick History */}
          <div className="d-rail-panel">
            <Skel style={{ width: 120, height: 12, marginBottom: 10 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skel style={{ height: 36 }} />
              <Skel style={{ height: 36 }} />
              <Skel style={{ height: 36 }} />
              <Skel style={{ height: 36 }} />
              <Skel style={{ height: 36 }} />
            </div>
          </div>
        </aside>
      </div>
      {/* Visually hidden status text so screen readers announce the loading
          state without disturbing the skeleton geometry. */}
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        Loading draft board...
      </span>
    </div>
  );
}

export function LeagueErrorScreen({
  isUnauthorized,
  onNavigate,
}: {
  isUnauthorized: boolean;
  onNavigate: (path: string) => void;
}): React.JSX.Element {
  return (
    <StateScreen
      icon={isUnauthorized ? '🔒' : '⚠️'}
      iconLabel={isUnauthorized ? 'lock' : 'warning'}
      title={isUnauthorized ? 'Access Denied' : 'League Not Found'}
      description={
        isUnauthorized
          ? "You don't have access to this draft room."
          : "This league doesn't exist or the draft room is unavailable."
      }
      buttonText="Back to Leagues"
      onButtonClick={() => onNavigate('/baseball')}
    />
  );
}

export function PlayersErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): React.JSX.Element {
  return (
    <StateScreen
      icon="⚠️"
      iconLabel="warning"
      title="Failed to Load Players"
      description={message || 'An error occurred while fetching player data.'}
      buttonText="Try Again"
      onButtonClick={onRetry}
    />
  );
}

export function AutomatedDraftScreen(): React.JSX.Element {
  return (
    <StateScreen
      icon="⚙️"
      iconLabel="gear"
      title="Draft in Progress"
      description="Results will appear when the automated draft is complete."
    />
  );
}
