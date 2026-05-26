import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { SeasonDraftGame } from '@legacy-sports/shared-components/season-draft';
import { Button, Text, YStack } from 'tamagui';
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

  if (isNaN(numericGameId)) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$6">
        <Text color="$brandSeamRedLight">Game not found.</Text>
      </YStack>
    );
  }

  if (!user) {
    return (
      <YStack
        flex={1}
        justifyContent="center"
        alignItems="center"
        padding="$6"
        gap="$4"
      >
        <Text>Please sign in to view this Season Draft Game.</Text>
        <Button onPress={() => navigate('/')}>Sign In</Button>
      </YStack>
    );
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
