import React, { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Dialog,
  H4,
  Separator,
  Text,
  XStack,
  YStack,
} from 'tamagui';
// import {
//   useAdvanceWeekGamesMutation,
//   useGetMatchupPlayersQuery,
// } from '../../api/db/graphql.generated';

// TODO(LS-53): Placeholders until GraphQL operations are implemented
/* eslint-disable -- LS-53: Temporary placeholders for unimplemented GraphQL operations */
const useAdvanceWeekGamesMutation = (_config?: any) =>
  [
    (_params?: any) => Promise.resolve({ data: { advanceWeekGames: false } }),
    { loading: false },
  ] as const;
const useGetMatchupPlayersQuery = (_params?: any) => ({
  data: { getMatchupPlayers: [] } as any,
  loading: false,
  error: undefined,
});
/* eslint-enable */

export interface GameSelectionControlProps {
  leagueId: number;
  matchupId: number;
  weekNumber: number;
  gamesPerMatchup: number;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

/**
 * GameSelectionControl - Commissioner control for triggering game selection
 * Includes game selection count display, button to trigger, and confirmation dialog
 */
export function GameSelectionControl({
  leagueId,
  matchupId,
  weekNumber,
  gamesPerMatchup,
  onSuccess,
  onError,
}: GameSelectionControlProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Query matchup players to check game selection status
  const { data: playersData, loading: playersLoading } =
    useGetMatchupPlayersQuery({
      variables: { matchupId },
      skip: !matchupId,
    });

  // Mutation to advance week games (select next game for all matchups)
  const [advanceWeekGames, { loading: mutationLoading }] =
    useAdvanceWeekGamesMutation({
      refetchQueries: ['GetMatchupPlayers'],
      awaitRefetchQueries: true,
    });

  // Calculate how many games have been selected
  const selectedGamesCount = useMemo(() => {
    if (!playersData?.getMatchupPlayers) return 0;

    // Count unique game numbers that have been selected
    const gameNums = new Set<number>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- LS-53: using placeholder types
    playersData.getMatchupPlayers.forEach((player: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LS-53: using placeholder types
      player.games?.forEach((game: any) => {
        if (
          (game.battingGameNum !== null ||
            game.fieldingGameNum !== null ||
            game.pitchingGameNum !== null) &&
          game.gameNum !== null &&
          game.gameNum !== undefined
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- LS-53: game placeholder type
          gameNums.add(game.gameNum);
        }
      });
    });

    return gameNums.size;
  }, [playersData]);

  const allGamesSelected = selectedGamesCount >= gamesPerMatchup;
  const loading = playersLoading || mutationLoading;

  const handleTriggerSelection = async () => {
    try {
      const result = await advanceWeekGames({
        variables: {
          leagueId,
          weekNumber,
        },
      });

      if (result.data?.advanceWeekGames) {
        setShowConfirmDialog(false);
        onSuccess?.();
      } else {
        throw new Error('Game selection failed');
      }
    } catch (err) {
      onError?.(err as Error);
      setShowConfirmDialog(false);
    }
  };

  return (
    <Card bordered padding="$4" backgroundColor="$blue2">
      <YStack space="$3">
        <XStack alignItems="center" space="$2">
          <H4>Game Selection</H4>
          <Text fontSize="$2" color="$blue10">
            (Commissioner Only)
          </Text>
        </XStack>

        <Separator />

        <YStack space="$3">
          {/* Game Selection Status */}
          <YStack space="$2">
            <Text fontSize="$3" color="$gray11">
              Games Selected (Current Matchup):
            </Text>
            <XStack space="$2" alignItems="center">
              <Text
                fontSize="$6"
                fontWeight="bold"
                color={allGamesSelected ? '$green11' : '$blue11'}
              >
                {selectedGamesCount} / {gamesPerMatchup}
              </Text>
              {allGamesSelected && (
                <Text fontSize="$3" color="$green11" fontWeight="600">
                  ✓ Complete
                </Text>
              )}
            </XStack>
          </YStack>

          {/* Trigger Button */}
          <XStack space="$2" alignItems="center">
            <Button
              theme="blue"
              onPress={() => setShowConfirmDialog(true)}
              disabled={loading || allGamesSelected}
              opacity={allGamesSelected ? 0.5 : 1}
            >
              {loading
                ? 'Processing...'
                : `Advance Week Games (Week ${weekNumber})`}
            </Button>

            {allGamesSelected && (
              <Text fontSize="$2" color="$gray10">
                All games already selected
              </Text>
            )}
          </XStack>

          <Text fontSize="$2" color="$gray10">
            Selects the next game number for ALL matchups in week {weekNumber}.
            {!allGamesSelected &&
              ' Each click advances one game (game 1, then game 2, etc.).'}
          </Text>
        </YStack>

        {/* Confirmation Dialog */}
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <Dialog.Portal>
            <Dialog.Overlay
              key="overlay"
              animation="quick"
              opacity={0.5}
              enterStyle={{ opacity: 0 }}
              exitStyle={{ opacity: 0 }}
            />
            <Dialog.Content
              bordered
              elevate
              key="content"
              animation={[
                'quick',
                {
                  opacity: {
                    overshootClamping: true,
                  },
                },
              ]}
              enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
              exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
              gap="$3"
              maxWidth={500}
            >
              <Dialog.Title>Confirm Advance Week Games</Dialog.Title>
              <Dialog.Description>
                Are you sure you want to advance games for week {weekNumber}?
                <Text
                  display="block"
                  marginTop="$2"
                  fontWeight="bold"
                  color="$orange11"
                >
                  This will select game {selectedGamesCount + 1} for ALL
                  matchups in week {weekNumber}.
                </Text>
                <Text display="block" marginTop="$2" color="$gray11">
                  Current progress: {selectedGamesCount} of {gamesPerMatchup}{' '}
                  games selected.
                </Text>
              </Dialog.Description>

              <XStack gap="$3" justifyContent="flex-end">
                <Dialog.Close asChild>
                  <Button theme="alt2">Cancel</Button>
                </Dialog.Close>
                <Button
                  theme="blue"
                  onPress={handleTriggerSelection}
                  disabled={loading}
                >
                  {loading ? 'Triggering...' : 'Confirm'}
                </Button>
              </XStack>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>
      </YStack>
    </Card>
  );
}
