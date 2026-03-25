/**
 * EliteDraftBoard — web wrapper
 *
 * The implementation lives in @legacy-sports/shared-components. This wrapper
 * provides web-specific navigation (react-router-dom) and environment config.
 */
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EliteDraftBoardScreen } from '@legacy-sports/shared-components';
import type { DraftChatProps } from '@legacy-sports/shared-components';
import { LeagueChatTab } from '../features/baseball/LeagueChatTab';
import { env } from '../config/environment';

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

  return (
    <EliteDraftBoardScreen
      leagueId={leagueId}
      onNavigate={(path) => navigate(path)}
      websocketUrl={env.websocketUrl}
      renderChat={renderChat}
    />
  );
}

// Re-export as the original name for backwards compatibility
export { EliteDraftBoardScreenWrapper as EliteDraftBoardScreen };
