import React from 'react';
import type { CurrentDraftPickInfo } from './types';

interface CurrentPickPanelProps {
  currentPickInfo: CurrentDraftPickInfo | null;
  currentPickTeamId: number | null;
  currentPickLoadError: string | null;
  isMyPick: boolean;
  isOwner: boolean;
  myTeamId: number | null;
  onlineTeamIds: ReadonlySet<string>;
  initDraftLoading: boolean;
  pickHistoryLength: number;
  teamNameById: (teamId: number | null | undefined) => string;
  onInitializeDraft: (order: 'snake' | 'linear') => void;
  onRetryCurrentPick: () => void;
}

export function CurrentPickPanel({
  currentPickInfo,
  currentPickTeamId,
  currentPickLoadError,
  isMyPick,
  isOwner,
  myTeamId,
  onlineTeamIds,
  initDraftLoading,
  pickHistoryLength,
  teamNameById,
  onInitializeDraft,
  onRetryCurrentPick,
}: CurrentPickPanelProps): React.JSX.Element {
  if (currentPickInfo) {
    return (
      <div
        className="d-panel"
        data-testid="current-pick"
        style={{ textAlign: 'center' }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            marginBottom: 6,
            color: isMyPick ? 'var(--d-success)' : 'var(--d-text-secondary)',
          }}
        >
          {isMyPick ? 'YOUR PICK' : 'ON THE CLOCK'}
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: isMyPick ? 'var(--d-success)' : 'var(--d-text)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {currentPickTeamId !== null && (
            <span
              role="img"
              aria-label={
                onlineTeamIds.has(String(currentPickTeamId))
                  ? 'online'
                  : 'offline'
              }
              title={
                onlineTeamIds.has(String(currentPickTeamId))
                  ? 'Manager is online'
                  : 'Manager is offline'
              }
              style={{
                display: 'inline-block',
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: onlineTeamIds.has(String(currentPickTeamId))
                  ? 'var(--d-success)'
                  : 'var(--d-text-muted)',
                flexShrink: 0,
              }}
            />
          )}
          {teamNameById(currentPickTeamId)}
        </div>
        <div
          style={{ fontSize: 12, color: 'var(--d-text-muted)', marginTop: 4 }}
        >
          Round {currentPickInfo.round} &middot; Pick{' '}
          {currentPickInfo.pickNumber}
        </div>
        {myTeamId === null && (
          <div
            style={{
              marginTop: 8,
              padding: '6px 10px',
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              fontSize: 11,
              color: '#f87171',
              lineHeight: 1.4,
            }}
          >
            <span role="img" aria-label="Warning">
              ⚠️
            </span>{' '}
            Your league membership has no team assigned. Commissioner Pick can
            be used as a workaround.
          </div>
        )}
        {myTeamId !== null && !isMyPick && !currentPickInfo.isComplete && (
          <div
            style={{
              marginTop: 8,
              fontSize: 10,
              color: 'var(--d-text-muted)',
              lineHeight: 1.4,
            }}
          >
            Your team ID: {myTeamId} &middot; On clock: {currentPickTeamId}
          </div>
        )}
      </div>
    );
  }

  if (currentPickLoadError) {
    return (
      <div
        className="d-panel"
        role="alert"
        aria-live="polite"
        style={{ textAlign: 'center' }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            marginBottom: 6,
            color: 'var(--d-error)',
          }}
        >
          Pick Load Error
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--d-text)' }}>
          Failed to load current pick
        </div>
        <div
          style={{ fontSize: 12, color: 'var(--d-text-muted)', marginTop: 6 }}
        >
          There was a problem checking whose turn it is. The draft is still
          running.
        </div>
        <button
          className="d-state-btn"
          style={{ marginTop: 12 }}
          onClick={onRetryCurrentPick}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="d-panel" style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          marginBottom: 6,
          color: 'var(--d-warning)',
        }}
      >
        Draft Order Pending
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--d-text)' }}>
        Waiting for pick order setup
      </div>
      <div style={{ fontSize: 12, color: 'var(--d-text-muted)', marginTop: 6 }}>
        We can&apos;t determine whose turn it is yet.
      </div>
      {isOwner && pickHistoryLength === 0 && (
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          <button
            className="d-state-btn"
            onClick={() => onInitializeDraft('snake')}
            disabled={initDraftLoading}
            style={{ opacity: initDraftLoading ? 0.6 : 1 }}
          >
            {initDraftLoading ? 'Starting...' : 'Generate Snake Order'}
          </button>
          <button
            className="d-state-btn"
            onClick={() => onInitializeDraft('linear')}
            disabled={initDraftLoading}
            style={{
              opacity: initDraftLoading ? 0.6 : 1,
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              boxShadow: '0 4px 16px rgba(59,130,246,0.25)',
            }}
          >
            {initDraftLoading ? 'Starting...' : 'Generate Linear Order'}
          </button>
        </div>
      )}
    </div>
  );
}
