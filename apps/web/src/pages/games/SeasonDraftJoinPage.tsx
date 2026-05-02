import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { SeasonDraftJoin } from '@legacy-sports/shared-components/season-draft';
import { Text, YStack } from 'tamagui';
import { PageMeta } from '../../components/PageMeta';

/**
 * Season Draft Join Page
 *
 * Web page wrapper for the shared `SeasonDraftJoin` component.
 * Route: /games/season-draft/join/:inviteCode
 */
export const SeasonDraftJoinPage: React.FC = () => {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  if (!inviteCode) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$6">
        <Text color="$brandSeamRedLight">Invalid invite link.</Text>
      </YStack>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      <PageMeta
        title="Join Season Draft Game"
        description="Join a Season Draft Game via invite link."
      />
      <SeasonDraftJoin
        inviteCode={inviteCode}
        viewerName={user.username ?? user.email ?? undefined}
        onJoined={(gameId) => navigate(`/games/season-draft/${gameId}`)}
        onCancel={() => navigate('/games/season-draft')}
        onBrowseGames={() => navigate('/games/season-draft')}
      />
    </>
  );
};

export default SeasonDraftJoinPage;
