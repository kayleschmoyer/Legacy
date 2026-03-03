import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@legacy-sports/shared-components';
import { SeasonDraftGameCreate } from '@legacy-sports/shared-components';
import { PageMeta } from '../../components/PageMeta';

/**
 * Season Draft Game Create Page
 *
 * Form to create a new season draft game.
 * Route: /games/season-draft/create
 */
export const SeasonDraftGameCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <>
      <PageMeta
        title="Create Season Draft Game"
        description="Create a new Season Draft Game and invite friends."
      />
      <SeasonDraftGameCreate
        currentUserId={user.id}
        currentUserName={user.username ?? user.email ?? 'You'}
        onCreated={(gameId) => navigate(`/games/season-draft/${gameId}`)}
        onCancel={() => navigate('/games/season-draft')}
      />
    </>
  );
};

export default SeasonDraftGameCreatePage;
