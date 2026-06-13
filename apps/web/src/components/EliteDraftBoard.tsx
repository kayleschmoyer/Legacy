/**
 * EliteDraftBoard — web wrapper
 *
 * The implementation lives in @legacy-sports/shared-components. This wrapper
 * provides web-specific navigation (react-router-dom) and environment config.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { EliteDraftBoardScreen } from '@legacy-sports/shared-components/elite-draft';
import type { DraftChatProps } from '@legacy-sports/shared-components/elite-draft';
import { LeagueChatTab } from '../features/baseball/LeagueChatTab';
import { env } from '../config/environment';
import { trackPlayerSelected } from '../utils/analytics';

const DIALOG_OVERLAY: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(10,15,26,0.75)',
  backdropFilter: 'blur(4px)',
  zIndex: 10000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const DIALOG_CARD: React.CSSProperties = {
  background: '#141B2D',
  border: '1px solid rgba(197,165,90,0.3)',
  borderRadius: 16,
  padding: '28px 32px',
  maxWidth: 400,
  width: 'calc(100% - 32px)',
  boxShadow: '0 24px 48px rgba(8,12,20,0.8)',
  textAlign: 'center',
};

function renderChat({ leagueId, userId, mentionableTeams }: DraftChatProps) {
  return (
    <LeagueChatTab
      leagueId={leagueId}
      userId={userId}
      mentionableTeams={mentionableTeams}
    />
  );
}

export function EliteDraftBoardScreenWrapper(): React.JSX.Element {
  const { id: leagueIdParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const leagueId = leagueIdParam ? parseInt(leagueIdParam, 10) : null;
  const [isDraftActive, setIsDraftActive] = useState(false);

  // Block in-app navigation (including browser/Android back button) while a
  // draft is actively running (LS-4986).
  const blocker = useBlocker(isDraftActive);

  // Also block page unload (tab close, hard refresh, external URL) during an
  // active draft — useBlocker only covers react-router navigations.
  useEffect(() => {
    if (!isDraftActive) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDraftActive]);

  const handleProceed = useCallback(() => {
    if (blocker.state === 'blocked') blocker.proceed();
  }, [blocker]);

  const handleReset = useCallback(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);

  return (
    <>
      {blocker.state === 'blocked' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="draft-exit-title"
          style={DIALOG_OVERLAY}
        >
          <div style={DIALOG_CARD}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>
              <span role="img" aria-label="warning">
                ⚠️
              </span>
            </div>
            <div
              id="draft-exit-title"
              style={{
                fontFamily: "'Big Shoulders Display', sans-serif",
                fontSize: 24,
                color: '#F8FAFC',
                letterSpacing: '0.06em',
                marginBottom: 12,
              }}
            >
              LEAVE DRAFT?
            </div>
            <p
              style={{
                color: '#9CAAC5',
                fontSize: 14,
                lineHeight: 1.5,
                margin: '0 0 24px',
              }}
            >
              Your draft is still in progress. Leaving now will not forfeit your
              picks — auto-pick will fill in while you&apos;re away — but you
              may miss your turn.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={handleReset}
                style={{
                  flex: 1,
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid rgba(197,165,90,0.4)',
                  background: 'transparent',
                  color: '#C5A55A',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Stay in Draft
              </button>
              <button
                onClick={handleProceed}
                style={{
                  flex: 1,
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 0,
                  background: 'rgba(197,165,90,0.15)',
                  color: '#DEE6FF',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Leave Anyway
              </button>
            </div>
          </div>
        </div>
      )}
      <EliteDraftBoardScreen
        leagueId={leagueId}
        onNavigate={(path) => navigate(path)}
        websocketUrl={env.websocketUrl}
        renderChat={renderChat}
        onPlayerDrafted={trackPlayerSelected}
        onActiveDraftChange={setIsDraftActive}
      />
    </>
  );
}

// Re-export as the original name for backwards compatibility
export { EliteDraftBoardScreenWrapper as EliteDraftBoardScreen };
