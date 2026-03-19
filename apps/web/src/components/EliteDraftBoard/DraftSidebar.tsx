import React from 'react';
import type {
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
} from './types';
import { getPositionColor } from './utils';
import { CircularTimer } from './CircularTimer';
import { BaseballCard } from './BaseballCard';
import { DraftIntelligence } from './DraftIntelligence';
import { DraftQueuePanel } from './DraftQueuePanel';
import { CurrentPickPanel } from './CurrentPickPanel';
import { PremiumGate } from '../PremiumGate';

interface DraftSidebarProps {
  // Draft status
  draftPaused: boolean;
  currentPick: number;
  round: number;
  timeRemaining: number;
  isMyPick: boolean;
  pickTimeLimitSeconds: number;
  pickDeadline: Date | null;
  // Commissioner
  isCommissioner: boolean;
  isOwner: boolean;
  draftId: number | null;
  commPickMode: boolean;
  autoPickDisabled: boolean;
  // Loading states
  pauseLoading: boolean;
  resumeLoading: boolean;
  commPickLoading: boolean;
  autoPickDisabledLoading: boolean;
  initDraftLoading: boolean;
  // Current pick info
  currentPickInfo: CurrentDraftPickInfo | null;
  currentPickTeamId: number | null;
  currentPickLoadError: string | null;
  myTeamId: number | null;
  onlineTeamIds: ReadonlySet<string>;
  // Roster data
  myTeam: DraftPlayer[];
  myTeamPicks: DraftPickRecord[];
  positionCounts: Record<string, number>;
  isPremium: boolean;
  // Pick history
  pickHistory: DraftPickRecord[];
  statsLookup: Map<number, DraftPlayer>;
  // Chat
  chatOpen: boolean;
  // Callbacks
  onPauseDraft: () => void;
  onResumeDraft: () => void;
  onToggleCommPickMode: () => void;
  onToggleAutoPickDisabled: () => void;
  onInitializeDraft: (order: 'snake' | 'linear') => void;
  onRefresh: () => void;
  onToggleUserAutoPick: () => void;
  isMyTeamAutoPick: boolean;
  toggleAutoPickLoading: boolean;
  onToggleChat: () => void;
  onRetryCurrentPick: () => void;
  onShowToast: (msg: string) => void;
  teamNameById: (teamId: number | null | undefined) => string;
}

export function DraftSidebar({
  draftPaused,
  currentPick,
  round,
  timeRemaining,
  isMyPick,
  pickTimeLimitSeconds,
  pickDeadline,
  isCommissioner,
  isOwner,
  draftId,
  commPickMode,
  autoPickDisabled,
  pauseLoading,
  resumeLoading,
  commPickLoading,
  autoPickDisabledLoading,
  initDraftLoading,
  currentPickInfo,
  currentPickTeamId,
  currentPickLoadError,
  myTeamId,
  onlineTeamIds,
  myTeam,
  myTeamPicks,
  positionCounts,
  isPremium,
  pickHistory,
  statsLookup,
  chatOpen,
  onPauseDraft,
  onResumeDraft,
  onToggleCommPickMode,
  onToggleAutoPickDisabled,
  onInitializeDraft,
  onRefresh,
  onToggleUserAutoPick,
  isMyTeamAutoPick,
  toggleAutoPickLoading,
  onToggleChat,
  onRetryCurrentPick,
  onShowToast,
  teamNameById,
}: DraftSidebarProps): React.JSX.Element {
  return (
    <aside className="d-side d-side-l" aria-label="My team and draft controls">
      {/* Draft status */}
      <div
        className="d-status"
        data-testid="draft-status"
        style={
          draftPaused
            ? {
                background:
                  'linear-gradient(135deg, var(--d-warning) 0%, #d97706 100%)',
              }
            : undefined
        }
      >
        <span
          className="d-live-dot"
          style={draftPaused ? { animation: 'none', opacity: 0.5 } : undefined}
        />
        <div className="d-status-info">
          <div className="d-status-title">
            {draftPaused ? (
              <>
                <span role="img" aria-label="paused">
                  ⏸️
                </span>{' '}
                DRAFT PAUSED
              </>
            ) : (
              'LIVE DRAFT'
            )}
          </div>
          <div className="d-status-sub" data-testid="round-indicator">
            Pick #{currentPick} &middot; Round {round}
          </div>
        </div>
      </div>

      {/* Timer */}
      {!draftPaused && (
        <CircularTimer
          seconds={timeRemaining}
          isMyPick={isMyPick}
          pickTimeLimitSeconds={pickTimeLimitSeconds}
          hasDeadline={pickDeadline !== null}
        />
      )}
      {draftPaused && (
        <div
          style={{
            textAlign: 'center',
            padding: '16px 0',
            marginBottom: 20,
            color: 'var(--d-warning)',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <span role="img" aria-label="paused">
            ⏸️
          </span>{' '}
          Timer paused
        </div>
      )}

      {/* Commissioner Controls */}
      {isCommissioner && draftId && (
        <div className="d-comm-controls">
          <div className="d-comm-title">
            <span role="img" aria-label="crown">
              👑
            </span>{' '}
            Commissioner
          </div>
          {!draftPaused ? (
            <button
              className="d-comm-btn danger"
              onClick={onPauseDraft}
              disabled={pauseLoading}
            >
              {pauseLoading ? 'Pausing...' : 'Pause Draft'}
            </button>
          ) : (
            <button
              className="d-comm-btn success"
              onClick={onResumeDraft}
              disabled={resumeLoading}
            >
              {resumeLoading ? 'Resuming...' : 'Resume Draft'}
            </button>
          )}
          <button
            className={`d-comm-btn${commPickMode ? ' success' : ''}`}
            onClick={onToggleCommPickMode}
            disabled={commPickLoading}
          >
            {commPickMode ? 'Commissioner Pick ON' : 'Commissioner Pick'}
          </button>
          <button
            className={`d-comm-btn${autoPickDisabled ? ' danger' : ''}`}
            onClick={onToggleAutoPickDisabled}
            disabled={autoPickDisabledLoading}
            title={
              autoPickDisabled
                ? 'Auto-pick is disabled. Click to re-enable automatic picks when time expires.'
                : 'Click to disable auto-pick for all teams. No picks will be made automatically when time expires.'
            }
          >
            {autoPickDisabledLoading
              ? 'Updating...'
              : autoPickDisabled
                ? 'Auto-Pick DISABLED'
                : 'Disable Auto-Pick'}
          </button>
          {commPickMode && (
            <div
              style={{
                fontSize: 10,
                color: '#a78bfa',
                margin: '-2px 0 4px',
                padding: '4px 8px',
                background: 'rgba(139,92,246,0.08)',
                borderRadius: 4,
              }}
            >
              Click any player&apos;s Draft button to pick on behalf of the
              current team
            </div>
          )}
        </div>
      )}

      {/* Whose Turn */}
      <CurrentPickPanel
        currentPickInfo={currentPickInfo}
        currentPickTeamId={currentPickTeamId}
        currentPickLoadError={currentPickLoadError}
        isMyPick={isMyPick}
        isOwner={isOwner}
        myTeamId={myTeamId}
        onlineTeamIds={onlineTeamIds}
        initDraftLoading={initDraftLoading}
        pickHistoryLength={pickHistory.length}
        teamNameById={teamNameById}
        onInitializeDraft={onInitializeDraft}
        onRetryCurrentPick={onRetryCurrentPick}
      />

      {/* Draft Intelligence */}
      {isMyPick && (
        <PremiumGate
          isPremium={isPremium}
          featureName="Draft Recommendations"
          featureDescription="Get AI-powered player recommendations tailored to your roster's needs on every pick."
        >
          <DraftIntelligence
            draftId={draftId}
            teamId={myTeamId}
            currentOverallPick={currentPickInfo?.overallPick ?? 0}
          />
        </PremiumGate>
      )}

      {/* My Roster */}
      <div className="d-panel">
        <h3 className="d-panel-title a-orange" id="my-roster-heading">
          <span role="img" aria-label="trophy">
            🏆
          </span>{' '}
          MY ROSTER ({myTeam.length})
        </h3>

        <div className="d-roster-grid">
          {(['C', '1B', '2B', '3B', 'SS', 'OF', 'P'] as const).map((pos) => {
            const count = positionCounts[pos] ?? 0;
            return (
              <div className="d-roster-cell" key={pos}>
                <span
                  style={{
                    display: 'inline-block',
                    background: getPositionColor(pos),
                    borderRadius: 4,
                    padding: '1px 5px',
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#fff',
                    marginBottom: 3,
                  }}
                >
                  {pos}
                </span>
                <div
                  style={{
                    fontWeight: 600,
                    color:
                      count > 0 ? 'var(--d-success)' : 'var(--d-text-muted)',
                  }}
                >
                  {count}
                </div>
              </div>
            );
          })}
        </div>

        {myTeam.length > 0 ? (
          <div
            role="region"
            aria-labelledby="my-roster-heading"
            style={{ maxHeight: 320, overflowY: 'auto' }}
          >
            <div className="bc-grid">
              {myTeamPicks.map((pick, i) => {
                const p = myTeam[i];
                if (!p) return null;
                return (
                  <BaseballCard
                    key={pick.id}
                    player={p}
                    round={pick.round}
                    pickNumber={pick.pickNumber}
                    overallPick={pick.overallPick}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div
            style={{
              textAlign: 'center',
              padding: '24px 12px',
              color: 'var(--d-text-muted)',
              fontSize: 13,
            }}
          >
            Draft players to build your roster
          </div>
        )}
      </div>

      {/* Draft Queue */}
      {draftId && myTeamId !== null && (
        <DraftQueuePanel
          draftId={draftId}
          autoPickDisabled={autoPickDisabled}
          onError={(msg) => {
            onShowToast(msg);
          }}
        />
      )}

      {/* Pick History */}
      {pickHistory.length > 0 && (
        <div className="d-panel">
          <h3 className="d-panel-title a-green" id="pick-history-heading">
            <span role="img" aria-label="clipboard">
              📋
            </span>{' '}
            PICK HISTORY ({pickHistory.length})
          </h3>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {pickHistory
              .slice()
              .reverse()
              .map((pick) => {
                const player = statsLookup.get(pick.playerId);
                return (
                  <div
                    key={pick.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 8px',
                      fontSize: 11,
                      borderBottom: '1px solid var(--d-border)',
                      color:
                        pick.teamId === myTeamId
                          ? 'var(--d-success)'
                          : 'var(--d-text-secondary)',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      #{pick.overallPick} —{' '}
                      {player?.name ?? `Unknown (ID: ${pick.playerId})`}
                    </span>
                    <span
                      style={{ color: 'var(--d-text-muted)', fontSize: 10 }}
                    >
                      {teamNameById(pick.teamId)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Actions */}
      <button
        className="d-btn-glass"
        onClick={onToggleChat}
        aria-pressed={chatOpen}
        aria-label={`League chat ${chatOpen ? 'open' : 'closed'}`}
      >
        <span role="img" aria-label="chat">
          💬
        </span>
        &ensp;League Chat
      </button>
      <button className="d-btn-glass" onClick={onRefresh}>
        <span role="img" aria-label="refresh">
          🔄
        </span>
        &ensp;Refresh
      </button>

      {draftId && myTeamId !== null && (
        <button
          className={`d-btn-glass${isMyTeamAutoPick ? ' active' : ''}`}
          onClick={onToggleUserAutoPick}
          disabled={toggleAutoPickLoading || autoPickDisabled}
          aria-pressed={isMyTeamAutoPick}
          title={
            autoPickDisabled
              ? 'Auto-pick has been disabled by the commissioner'
              : isMyTeamAutoPick
                ? 'Auto-pick is ON — the system picks for you. Click to disable.'
                : 'Enable auto-pick — the system will pick from your queue when your turn arrives.'
          }
          style={
            isMyTeamAutoPick
              ? {
                  background:
                    'linear-gradient(135deg, rgba(16,185,129,0.25) 0%, rgba(16,185,129,0.15) 100%)',
                  borderColor: 'rgba(16,185,129,0.5)',
                }
              : undefined
          }
        >
          <span role="img" aria-label="auto-pick">
            🤖
          </span>
          &ensp;{isMyTeamAutoPick ? 'Auto-Pick ON' : 'Enable Auto-Pick'}
        </button>
      )}
    </aside>
  );
}
