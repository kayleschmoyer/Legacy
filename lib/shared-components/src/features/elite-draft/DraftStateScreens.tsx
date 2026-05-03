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

export function LoadingScreen(): React.JSX.Element {
  return (
    <div className="d-root">
      <style>{CSS}</style>
      <div className="d-bg-fx" />
      <div className="d-skeleton-wrap">
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div
            style={{
              width: 48,
              height: 48,
              border: '3px solid var(--d-accent-dim)',
              borderTopColor: 'var(--d-accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }}
          />
          <div
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: 'var(--d-text-secondary)',
            }}
          >
            Loading draft board...
          </div>
        </div>
        <div className="d-skeleton-grid">
          {Array.from({ length: 9 }).map((_, i) => (
            <SkeletonCard key={i} delay={i * 0.08} />
          ))}
        </div>
      </div>
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
