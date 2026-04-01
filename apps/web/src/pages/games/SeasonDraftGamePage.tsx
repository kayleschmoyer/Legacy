import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { SeasonDraftGame } from '@legacy-sports/shared-components/season-draft';
import { PageMeta } from '../../components/PageMeta';

/**
 * Season Draft Game Page
 *
 * Web page wrapper for the shared SeasonDraftGame component.
 * Route: /games/season-draft/:gameId
 */
export const SeasonDraftGamePage: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const numericGameId = gameId ? parseInt(gameId, 10) : NaN;

  if (!user || isNaN(numericGameId)) {
    return null;
  }

  return (
    <>
      <PageMeta
        title="Season Draft Game"
        description="Draft players by their season stats in a turn-based fantasy game."
      />
      <SeasonDraftGame
        gameId={numericGameId}
        currentUserId={user.id}
        onBack={() => navigate(-1)}
      />
    </>
  );
};

export default SeasonDraftGamePage;
