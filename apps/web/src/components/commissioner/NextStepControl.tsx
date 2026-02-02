/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents -- LS-53: File contains placeholders for unimplemented GraphQL operations */
import React, { useState } from 'react';
import {
  Button,
  Card,
  Dialog,
  H4,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  type Matchup,
  StatsLoadingStatus,
  // useAdvanceLeagueWeekMutation,
  useGetMatchupsForLeagueQuery,
  useTriggerGameSelectionMutation,
} from '../../api/db/graphql.generated';

// TODO(LS-53): Placeholder until advanceLeagueWeek mutation is implemented
const useAdvanceLeagueWeekMutation = () =>
  [
    (_params?: any) => Promise.reject(new Error('Not implemented')),
    { loading: false },
  ] as const;

export interface NextStepControlProps {
  leagueId: number;
  currentMatchup?: Matchup | null;
  gamesPerMatchup: number;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

/**
 * NextStepControl - Unified commissioner control that intelligently determines next action
 *
 * Logic:
 * - If no games selected yet → Select next game
 * - If all games selected → Advance to next week
 *
 * This prevents actions from being performed in the wrong order.
 */
export function NextStepControl({
  leagueId,
  currentMatchup,
  gamesPerMatchup,
  onSuccess,
  onError,
}: NextStepControlProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [loading, setLoading] = useState(false);

  const [advanceLeagueWeek] = useAdvanceLeagueWeekMutation();
  const [triggerGameSelection] = useTriggerGameSelectionMutation({
    refetchQueries: ['GetCurrentMatchupForLeague', 'GetMatchupsForLeague'],
    awaitRefetchQueries: true,
  });

  // Get all matchups to determine the next available week
  const { data: allMatchupsData, loading: matchupsLoading } =
    useGetMatchupsForLeagueQuery({
      variables: { leagueId },
      fetchPolicy: 'network-only',
    });

  // Find the highest week number
  const highestWeek =
    allMatchupsData?.getMatchupsForLeague?.reduce((max, matchup) => {
      return Math.max(max, matchup.weekNumber ?? 0);
    }, 0) ?? 0;

  const nextWeek = highestWeek + 1;
  const hasCurrentMatchup = !!currentMatchup && !!currentMatchup.id;
  const currentWeek = currentMatchup?.weekNumber ?? 0;

  // Get selected games count from matchup data
  const selectedGamesCount = currentMatchup?.selectedGamesCount ?? 0;
  const nextGameNumber = selectedGamesCount + 1;
  const allGamesSelected = selectedGamesCount >= gamesPerMatchup;

  const actionType = allGamesSelected ? 'advance' : 'selectGame';

  // Disable game selection if already in progress (queued or loading)
  const isGameSelectionInProgress =
    currentMatchup?.statsLoadingStatus === StatsLoadingStatus.Queued ||
    currentMatchup?.statsLoadingStatus === StatsLoadingStatus.Loading;

  const handleButtonClick = () => {
    if (isGameSelectionInProgress) {
      return; // Prevent clicking while queued or loading
    }
    setShowConfirmDialog(true);
  };

  const handleConfirm = async () => {
    setShowConfirmDialog(false);
    setLoading(true);

    try {
      if (actionType === 'selectGame') {
        // Trigger the game-selection lambda via SQS
        await triggerGameSelection({
          variables: {
            matchupId:
              typeof currentMatchup?.id === 'string'
                ? parseInt(currentMatchup.id, 10)
                : (currentMatchup?.id ?? 0),
            gameNumber: nextGameNumber,
          },
        });

        // Wait for refetch to complete (awaitRefetchQueries: true)
        // Then confirm status is updated before re-enabling button
        // The button will stay disabled via isGameSelectionInProgress check
        setLoading(false);
        onSuccess?.();
      } else {
        // Advance to next week
        await advanceLeagueWeek({
          variables: { leagueId },
        });

        setLoading(false);
        onSuccess?.();
      }
    } catch (err) {
      setLoading(false);
      setLoading(false);
      let errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';

      // Provide helpful error messages
      if (actionType === 'advance') {
        if (errorMessage.includes('at least 2 teams')) {
          errorMessage =
            'Your league needs at least 2 teams to create matchups. Please add more teams first.';
        } else if (
          errorMessage.includes('unique') ||
          errorMessage.includes('duplicate')
        ) {
          errorMessage = `Matchups for week ${nextWeek} already exist. Please check the existing matchups or complete them first.`;
        }
      } else {
        if (errorMessage.includes('Game number must be between')) {
          errorMessage = `Invalid game number. Please select a game between 1 and ${gamesPerMatchup}.`;
        }
      }

      onError?.(new Error(errorMessage));
    }
  };

  const getButtonText = () => {
    if (loading || matchupsLoading) return 'Processing...';
    if (isGameSelectionInProgress) return 'Game Selection In Progress...';

    if (actionType === 'selectGame') {
      return `Select Game ${nextGameNumber} of ${gamesPerMatchup}`;
    } else {
      return 'Advance League Week';
    }
  };

  const getDialogTitle = () => {
    if (actionType === 'selectGame') {
      return `Select Game ${nextGameNumber}?`;
    }

    if (hasCurrentMatchup) {
      return `Advance from Week ${currentWeek} to Week ${nextWeek}?`;
    }
    if (highestWeek > 0) {
      return `Start Week ${nextWeek}?`;
    }
    return 'Start League Week 1?';
  };

  const getDialogMessage = () => {
    if (actionType === 'selectGame') {
      return `This will automatically select game ${nextGameNumber} for all teams in the current matchup. The system will choose games based on the configured rules and selected season.`;
    }

    if (hasCurrentMatchup) {
      return `This will complete all Week ${currentWeek} matchups and create new matchups for Week ${nextWeek} with all teams paired up. Players will be automatically assigned random historical seasons.`;
    }
    if (highestWeek > 0) {
      return `This will create matchups for Week ${nextWeek}, pairing up all teams in the league. Players will be automatically assigned random historical seasons.`;
    }
    return `This will start your league's first week, creating matchups for all teams. Players will be automatically assigned random historical seasons.`;
  };

  const getDescriptionText = () => {
    if (actionType === 'selectGame') {
      return `Next: Select game ${nextGameNumber} of ${gamesPerMatchup} for all teams in the current matchup.`;
    } else {
      return 'All games selected! Next: Advance to the next league week.';
    }
  };

  return (
    <>
      <Card backgroundColor="$blue2" borderColor="$blue6" padding="$4">
        <YStack space="$3">
          <H4 color="$blue11">Next Step</H4>

          {hasCurrentMatchup ? (
            <YStack space="$2">
              <Text color="$gray11" fontSize="$3">
                Current Matchup: Week {currentWeek}
              </Text>
              <Text color="$gray11" fontSize="$3">
                Games Selected: {selectedGamesCount} of {gamesPerMatchup}
              </Text>
              <Text color="$gray11" fontSize="$3">
                Status: {currentMatchup.status}
              </Text>
              {currentMatchup.statsLoadingStatus &&
                currentMatchup.statsLoadingStatus !==
                  StatsLoadingStatus.NotStarted && (
                  <XStack alignItems="center" space="$2">
                    <Text color="$gray11" fontSize="$3">
                      Game Selection:
                    </Text>
                    <XStack
                      backgroundColor={
                        currentMatchup.statsLoadingStatus ===
                        StatsLoadingStatus.Queued
                          ? '$blue3'
                          : currentMatchup.statsLoadingStatus ===
                              StatsLoadingStatus.Loading
                            ? '$yellow3'
                            : currentMatchup.statsLoadingStatus ===
                                StatsLoadingStatus.Completed
                              ? '$green3'
                              : '$red3'
                      }
                      borderColor={
                        currentMatchup.statsLoadingStatus ===
                        StatsLoadingStatus.Queued
                          ? '$blue8'
                          : currentMatchup.statsLoadingStatus ===
                              StatsLoadingStatus.Loading
                            ? '$yellow8'
                            : currentMatchup.statsLoadingStatus ===
                                StatsLoadingStatus.Completed
                              ? '$green8'
                              : '$red8'
                      }
                      borderWidth={1}
                      borderRadius="$3"
                      paddingHorizontal="$2"
                      paddingVertical="$1"
                    >
                      <Text
                        color={
                          currentMatchup.statsLoadingStatus ===
                          StatsLoadingStatus.Queued
                            ? '$blue11'
                            : currentMatchup.statsLoadingStatus ===
                                StatsLoadingStatus.Loading
                              ? '$yellow11'
                              : currentMatchup.statsLoadingStatus ===
                                  StatsLoadingStatus.Completed
                                ? '$green11'
                                : '$red11'
                        }
                        fontWeight="600"
                        fontSize="$2"
                        textTransform="capitalize"
                      >
                        {currentMatchup.statsLoadingStatus.replace('_', ' ')}
                      </Text>
                    </XStack>
                  </XStack>
                )}
            </YStack>
          ) : (
            <Text color="$gray11" fontSize="$3">
              No active matchup found
            </Text>
          )}

          <XStack justifyContent="flex-start" gap="$3">
            <Button
              theme="blue"
              onPress={handleButtonClick}
              disabled={loading || matchupsLoading || isGameSelectionInProgress}
              icon={
                loading || matchupsLoading || isGameSelectionInProgress ? (
                  <Spinner />
                ) : undefined
              }
            >
              {getButtonText()}
            </Button>
          </XStack>

          <Text fontSize="$2" color="$gray10">
            {getDescriptionText()}
          </Text>
        </YStack>
      </Card>

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
            animateOnly={['transform', 'opacity']}
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
            gap="$4"
            padding="$4"
          >
            <Dialog.Title>{getDialogTitle()}</Dialog.Title>
            <Dialog.Description>{getDialogMessage()}</Dialog.Description>

            <XStack gap="$3" justifyContent="flex-end">
              <Dialog.Close displayWhenAdapted asChild>
                <Button theme="alt2">Cancel</Button>
              </Dialog.Close>
              <Button theme="blue" onPress={handleConfirm}>
                Confirm
              </Button>
            </XStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </>
  );
}
