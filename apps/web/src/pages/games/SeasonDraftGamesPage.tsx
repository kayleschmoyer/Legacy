import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { SeasonDraftGameLobby } from '@legacy-sports/shared-components/season-draft';
import { Text, YStack } from 'tamagui';
import { PageMeta } from '../../components/PageMeta';

/**
 * Season Draft Games Lobby Page
 *
 * Lists all season draft games for the current user.
 * Route: /games/season-draft
 */
export const SeasonDraftGamesPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  if (!user) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$6">
        <Text>Please sign in to view your Season Draft Games.</Text>
      </YStack>
    );
  }

  return (
    <>
      <PageMeta
        title="Season Draft Games"
        description="View and manage your Season Draft Games."
      />
      <SeasonDraftGameLobby
        onSelectGame={(gameId) => navigate(`/games/season-draft/${gameId}`)}
        onCreateGame={() => navigate('/games/season-draft/create')}
        onBack={() => navigate('/')}
      />
    </>
  );
};

export default SeasonDraftGamesPage;
