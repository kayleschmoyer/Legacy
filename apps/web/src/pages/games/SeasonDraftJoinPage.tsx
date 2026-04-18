import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LOGGER } from '@legacy-sports/logging';
import { Button, Card, H1, H2, Spinner, Text, XStack, YStack } from 'tamagui';
import { PageMeta } from '../../components/PageMeta';
import {
  SeasonDraftGameMode,
  SeasonDraftGameStatus,
  SeasonDraftPlayerType,
  useGetSeasonDraftGameByInviteCodeQuery,
  useJoinSeasonDraftGameMutation,
} from '../../api/db/graphql.generated';
import {
  BRAND_GOLD,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
} from '../../constants/colors';

const STAT_LABELS: Record<string, string> = {
  hr: 'Home Runs',
  h: 'Hits',
  rbi: 'RBI',
  sb: 'Stolen Bases',
  r: 'Runs',
  doubles: 'Doubles',
  triples: 'Triples',
  bb: 'Walks',
  tb: 'Total Bases',
  w: 'Wins',
  so: 'Strikeouts',
  sv: 'Saves',
  sho: 'Shutouts',
  cg: 'Complete Games',
};

export const SeasonDraftJoinPage: React.FC = () => {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const [joinError, setJoinError] = useState<string | null>(null);

  const { data, loading: loadingGame } = useGetSeasonDraftGameByInviteCodeQuery(
    {
      variables: { inviteCode: inviteCode ?? '' },
      skip: !inviteCode,
    },
  );

  const [joinGame, { loading: joining }] = useJoinSeasonDraftGameMutation();

  const gameInfo = data?.seasonDraftGameByInviteCode;

  const handleJoin = async () => {
    if (!inviteCode) return;
    setJoinError(null);

    try {
      const result = await joinGame({ variables: { inviteCode } });
      const gameId = result.data?.joinSeasonDraftGame;
      if (gameId) {
        navigate(`/games/season-draft/${gameId}`);
      } else {
        setJoinError('Failed to join game. Please try again.');
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      LOGGER.error('Failed to join season draft game', err);
      setJoinError(
        err.message.includes('already started')
          ? 'This game has already started and is no longer accepting players.'
          : err.message.includes('full')
            ? 'This game is already full.'
            : 'Failed to join game. Please try again.',
      );
    }
  };

  if (!inviteCode) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$6">
        <Text color="$red10">Invalid invite link.</Text>
      </YStack>
    );
  }

  return (
    <YStack
      padding="$6"
      $sm={{ padding: '$3' }}
      space="$6"
      maxWidth={480}
      alignSelf="center"
      width="100%"
    >
      <PageMeta
        title="Join Season Draft Game"
        description="Join a Season Draft Game via invite link."
      />

      <YStack alignItems="center" space="$3">
        <H1 size="$8" color="$color" textAlign="center">
          <span role="img" aria-label="trophy">
            🏆
          </span>{' '}
          Join Season Draft
        </H1>
      </YStack>

      <Card
        elevate
        size="$4"
        bordered
        backgroundColor="$color2"
        borderColor="$borderColor"
      >
        <Card.Header padded>
          <H2 size="$6" color="$color">
            Game Details
          </H2>
        </Card.Header>

        <YStack padding="$4" space="$4">
          {loadingGame && (
            <YStack alignItems="center" padding="$4">
              <Spinner size="large" color="$brandGold" />
              <Text color="$gray11" marginTop="$2">
                Loading game info…
              </Text>
            </YStack>
          )}

          {!loadingGame && !gameInfo && (
            <YStack space="$3" alignItems="center" padding="$4">
              <Text color="$red10" textAlign="center">
                This invite link is invalid or the game no longer exists.
              </Text>
              <Button
                size="$4"
                onPress={() => navigate('/games/season-draft')}
                backgroundColor={BRAND_NAVY_LIGHT}
                color={BRAND_GOLD}
              >
                Browse Games
              </Button>
            </YStack>
          )}

          {!loadingGame && gameInfo && (
            <YStack space="$4">
              <YStack space="$2">
                <Text size="$6" fontWeight="700" color="$color">
                  {gameInfo.name}
                </Text>
                <XStack space="$3" flexWrap="wrap">
                  <Text size="$3" color="$gray11">
                    {gameInfo.playerType === SeasonDraftPlayerType.Pitcher
                      ? 'Pitchers'
                      : 'Hitters'}
                  </Text>
                  <Text size="$3" color="$gray11">
                    ·
                  </Text>
                  <Text size="$3" color="$gray11">
                    {gameInfo.statKey
                      ? (STAT_LABELS[gameInfo.statKey] ?? gameInfo.statKey)
                      : ''}
                  </Text>
                  <Text size="$3" color="$gray11">
                    ·
                  </Text>
                  <Text size="$3" color="$gray11">
                    {gameInfo.gameMode === SeasonDraftGameMode.CareerTeam
                      ? 'Career'
                      : 'Season'}
                  </Text>
                </XStack>
                <Text size="$3" color="$gray11">
                  {gameInfo.playerCount} of 6 players joined
                </Text>
              </YStack>

              {gameInfo.status !== SeasonDraftGameStatus.Setup && (
                <Text color="$amber10" size="$3">
                  {gameInfo.status === SeasonDraftGameStatus.Drafting
                    ? 'This game has already started.'
                    : 'This game is no longer accepting players.'}
                </Text>
              )}

              {joinError && (
                <Text color="$red10" size="$3">
                  {joinError}
                </Text>
              )}

              <XStack space="$3" justifyContent="flex-end">
                <Button
                  size="$4"
                  variant="outlined"
                  onPress={() => navigate('/games/season-draft')}
                  disabled={joining}
                >
                  Cancel
                </Button>
                <Button
                  size="$4"
                  backgroundColor={BRAND_NAVY_LIGHT}
                  color={BRAND_GOLD}
                  borderColor={BRAND_NAVY_LIGHT}
                  hoverStyle={{ backgroundColor: BRAND_NAVY }}
                  pressStyle={{ scale: 0.97, backgroundColor: BRAND_NAVY }}
                  disabled={
                    joining || gameInfo.status !== SeasonDraftGameStatus.Setup
                  }
                  onPress={() => void handleJoin()}
                >
                  {joining ? 'Joining…' : 'Join Game'}
                </Button>
              </XStack>
            </YStack>
          )}
        </YStack>
      </Card>
    </YStack>
  );
};

export default SeasonDraftJoinPage;
