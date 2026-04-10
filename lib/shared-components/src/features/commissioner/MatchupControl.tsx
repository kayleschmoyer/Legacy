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
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../utils/colors';
import {
  type Matchup,
  useAutoAdvanceMatchupsMutation,
  useGetMatchupsForLeagueQuery,
} from '../../api/db/graphql.generated';

export interface MatchupControlProps {
  leagueId: number;
  currentMatchup?: Matchup | null;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

/**
 * MatchupControl - Commissioner control for creating and completing matchups
 *
 * Features:
 * - Creates a new matchup if none exists
 * - Completes the current matchup and creates a new one if matchup exists
 * - Intelligently determines next week based on all existing matchups
 */
export function MatchupControl({
  leagueId,
  currentMatchup,
  onSuccess,
  onError,
}: MatchupControlProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [loading, setLoading] = useState(false);

  const [autoAdvanceMatchups] = useAutoAdvanceMatchupsMutation({
    refetchQueries: [
      'GetCurrentWeekForLeague',
      'GetMatchupsForLeague',
      'GetLeagueById',
    ],
    awaitRefetchQueries: true,
  });

  // Get all matchups to determine the next available week
  const { data: allMatchupsData, loading: matchupsLoading } =
    useGetMatchupsForLeagueQuery({
      variables: { leagueId },
      fetchPolicy: 'network-only', // Always get fresh data
    });

  // Find the highest week number that exists in the database
  const highestWeek =
    allMatchupsData?.getMatchupsForLeague?.reduce(
      (max: number, matchup: { weekNumber?: number | null }) => {
        return Math.max(max, matchup.weekNumber ?? 0);
      },
      0,
    ) ?? 0;

  // The next week to create is always highest + 1
  const nextWeek = highestWeek + 1;

  const hasCurrentMatchup = !!currentMatchup && !!currentMatchup.id;
  // Use highestWeek as the current week for display consistency
  const currentWeek = highestWeek;

  const handleButtonClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirm = async () => {
    setShowConfirmDialog(false);
    setLoading(true);

    try {
      // Use the autoAdvanceMatchups mutation which:
      // 1. Completes all current week matchups
      // 2. Creates new matchups for all team pairs
      // 3. Auto-populates players for each matchup
      await autoAdvanceMatchups({
        variables: { leagueId },
      });

      setLoading(false);
      onSuccess?.();
    } catch (err) {
      setLoading(false);
      let errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';

      // Provide more helpful error messages for common issues
      if (errorMessage.includes('at least 2 teams')) {
        errorMessage =
          'Your league needs at least 2 teams to create matchups. Please add more teams first.';
      } else if (
        errorMessage.includes('unique') ||
        errorMessage.includes('duplicate')
      ) {
        errorMessage = `Matchups for week ${nextWeek} already exist. Please check the existing matchups or complete them first.`;
      }

      onError?.(new Error(errorMessage));
    }
  };

  const getButtonText = () => {
    if (loading || matchupsLoading) return 'Processing...';
    return 'Advance League Week';
  };

  const getDialogTitle = () => {
    if (hasCurrentMatchup) {
      return `Advance from Week ${currentWeek} to Week ${nextWeek}?`;
    }
    if (highestWeek > 0) {
      return `Start Week ${nextWeek}?`;
    }
    return 'Start League Week 1?';
  };

  const getDialogMessage = () => {
    if (hasCurrentMatchup) {
      return `This will complete all Week ${currentWeek} matchups and create new matchups for Week ${nextWeek} with all teams paired up. Players will be automatically assigned random historical seasons.`;
    }
    if (highestWeek > 0) {
      return `This will create matchups for Week ${nextWeek}, pairing up all teams in the league. Players will be automatically assigned random historical seasons.`;
    }
    return `This will start your league's first week, creating matchups for all teams. Players will be automatically assigned random historical seasons.`;
  };

  return (
    <>
      <Card
        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
        borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
        padding="$4"
      >
        <YStack space="$3">
          <H4 color={BRAND_GOLD_LIGHT}>Matchup Management</H4>

          {hasCurrentMatchup ? (
            <YStack space="$2">
              <Text color="$gray11" fontSize="$3">
                Current Matchup: Week {currentWeek}
              </Text>
              <Text color="$gray11" fontSize="$3">
                Status: {currentMatchup.status}
              </Text>
            </YStack>
          ) : (
            <Text color="$gray11" fontSize="$3">
              No active matchup found
            </Text>
          )}

          <XStack justifyContent="flex-start" gap="$3">
            <Button
              backgroundColor={BRAND_NAVY_LIGHT}
              color="white"
              pressStyle={{ backgroundColor: BRAND_NAVY_DARK }}
              hoverStyle={{ backgroundColor: BRAND_NAVY }}
              onPress={handleButtonClick}
              disabled={loading || matchupsLoading}
              icon={loading || matchupsLoading ? <Spinner /> : undefined}
            >
              {getButtonText()}
            </Button>
          </XStack>

          <Text fontSize="$2" color="$gray10">
            {hasCurrentMatchup
              ? 'Complete the current matchup and start the next week.'
              : 'Start a new matchup for your league.'}
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
              <Button
                backgroundColor={BRAND_NAVY_LIGHT}
                color="white"
                pressStyle={{ backgroundColor: BRAND_NAVY_DARK }}
                hoverStyle={{ backgroundColor: BRAND_NAVY }}
                onPress={handleConfirm}
              >
                Confirm
              </Button>
            </XStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </>
  );
}
