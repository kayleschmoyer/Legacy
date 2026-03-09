import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Dialog,
  H4,
  Label,
  RadioGroup,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  type LeagueFragment,
  type Matchup,
  StatsLoadingStatus,
  useAutoAdvanceMatchupsMutation,
  useAutoSelectGamesMutation,
  useGetLeagueDraftQuery,
  useGetMatchupsForLeagueQuery,
  useInitializeDraftMutation,
  useRenewLeagueMutation,
} from '../../api/db/graphql.generated';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';

export interface NextStepControlProps {
  leagueId: number;
  currentMatchup?: Matchup | null;
  gamesPerMatchup: number;
  draftStatus?: string | null;
  /** When true, the "Start Draft" button is blocked because draft settings
   * have unsaved changes that must be saved first. */
  hasPendingSettingsChanges?: boolean;
  leagueName?: string;
  frozenAt?: string | null;
  totalMatchups?: number;
  onSuccess?: (
    actionType?: 'selectGame' | 'advance' | 'draft' | 'createWeek1',
  ) => void;
  onError?: (error: Error) => void;
  onLeagueUpdate?: (league: LeagueFragment) => void;
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
  draftStatus,
  hasPendingSettingsChanges = false,
  leagueName = 'this league',
  frozenAt,
  totalMatchups,
  onSuccess,
  onError,
  onLeagueUpdate: _onLeagueUpdate,
}: NextStepControlProps) {
  const navigate = useNavigate();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showRenewalDialog, setShowRenewalDialog] = useState(false);
  const [keepRosters, setKeepRosters] = useState<'keep' | 'draft'>('draft');
  const [renewalLoading, setRenewalLoading] = useState(false);

  const [renewLeague] = useRenewLeagueMutation();

  const [autoAdvanceMatchups] = useAutoAdvanceMatchupsMutation({
    refetchQueries: [
      'GetCurrentWeekForLeague',
      'GetMatchupsForLeague',
      'GetLeagueById',
    ],
    awaitRefetchQueries: true,
  });
  const [initializeDraft, { loading: initializeDraftLoading }] =
    useInitializeDraftMutation({
      refetchQueries: ['GetLeagueDraft', 'GetLeagueById'],
      awaitRefetchQueries: true,
    });
  const [autoSelectGames] = useAutoSelectGamesMutation({
    refetchQueries: ['GetCurrentWeekForLeague', 'GetMatchupsForLeague'],
    awaitRefetchQueries: true,
  });

  // Get all matchups to determine the next available week
  const { data: allMatchupsData, loading: matchupsLoading } =
    useGetMatchupsForLeagueQuery({
      variables: { leagueId },
      fetchPolicy: 'network-only',
    });

  // Fetch draft settings to determine draft mode (live vs automated)
  const { data: draftData } = useGetLeagueDraftQuery({
    variables: { leagueId },
    fetchPolicy: 'cache-and-network',
  });
  const draftMode = draftData?.getLeagueDraft?.draftMode ?? 'automated';
  const isLiveDraft = draftMode === 'live';

  // Find the highest week number
  const highestWeek =
    allMatchupsData?.getMatchupsForLeague?.reduce(
      (max: number, matchup: { weekNumber?: number | null }) => {
        return Math.max(max, matchup.weekNumber ?? 0);
      },
      0,
    ) ?? 0;

  // LS-702: use gamesPerMatchup from the internal matchups query as the
  // authoritative source. The prop falls back to 1 when the commissioner has
  // no personal team matchup and league.gamesPerMatchup hasn't loaded yet.
  const effectiveGamesPerMatchup =
    allMatchupsData?.getMatchupsForLeague?.find(
      (m: { gamesPerMatchup?: number | null }) => m.gamesPerMatchup != null,
    )?.gamesPerMatchup ?? gamesPerMatchup;

  const hasCurrentMatchup = !!currentMatchup && !!currentMatchup.id;
  // LS-509: derive currentWeek from the actual currentMatchup (which reflects
  // leagues.currentMatchup → week-1 after generation), NOT from max(weekNumber).
  // After createAllMatchupsForLeague pre-creates all 10 weeks, highestWeek = 10
  // which would wrongly display "Current Matchup: Week 10".
  const currentWeek = currentMatchup?.weekNumber ?? highestWeek;
  const nextWeek = currentWeek + 1;

  // Season is fully complete when all scheduled weeks have been played and there
  // is no longer an active matchup.
  const isSeasonComplete =
    draftStatus === 'completed' &&
    !frozenAt &&
    highestWeek > 0 &&
    totalMatchups != null &&
    highestWeek >= totalMatchups &&
    !hasCurrentMatchup;

  const handleRenewalConfirm = async () => {
    setRenewalLoading(true);
    try {
      const result = await renewLeague({
        variables: { leagueId, keepRosters: keepRosters === 'keep' },
        refetchQueries: ['GetUserLeagues'],
        awaitRefetchQueries: true,
      });
      setRenewalLoading(false);
      setShowRenewalDialog(false);
      const newLeagueId = result.data?.renewLeague?.id;
      if (newLeagueId) {
        navigate(`/baseball/league/${newLeagueId}`);
      }
    } catch (err) {
      setRenewalLoading(false);
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';
      onError?.(new Error(errorMessage));
    }
  };

  // Get selected games count from matchup data
  const selectedGamesCount = currentMatchup?.selectedGamesCount ?? 0;
  const nextGameNumber = selectedGamesCount + 1;
  const allGamesSelected = selectedGamesCount >= effectiveGamesPerMatchup;

  // Determine action type:
  // - If no matchups (week 0) and draft not completed -> start draft only
  // - If draft completed but no matchups -> create week 1
  // - If games not all selected -> select next game
  // - If all games selected -> advance week
  const needsDraft = highestWeek === 0 && draftStatus !== 'completed';
  const needsWeek1 = highestWeek === 0 && draftStatus === 'completed';
  const actionType = needsDraft
    ? 'draft'
    : needsWeek1
      ? 'createWeek1'
      : allGamesSelected
        ? 'advance'
        : 'selectGame';

  // Disable draft if already in progress (queued or in-progress) or completed
  const isDraftInProgress =
    draftStatus === 'queued' || draftStatus === 'in-progress';
  const isDraftCompleted = draftStatus === 'completed';

  // Disable game selection if already in progress (queued or loading)
  const isGameSelectionInProgress =
    currentMatchup?.statsLoadingStatus === StatsLoadingStatus.Queued ||
    currentMatchup?.statsLoadingStatus === StatsLoadingStatus.Loading;

  const handleButtonClick = () => {
    // Prevent clicking while game selection is in progress
    if (isGameSelectionInProgress) {
      return;
    }
    // Prevent clicking draft button if draft is already in progress, loading, or completed
    if (
      actionType === 'draft' &&
      (initializeDraftLoading || isDraftInProgress || isDraftCompleted)
    ) {
      return;
    }
    // Prevent starting the draft when draft settings have unsaved changes
    if (actionType === 'draft' && hasPendingSettingsChanges) {
      return;
    }
    setShowConfirmDialog(true);
  };

  const handleConfirm = async () => {
    setShowConfirmDialog(false);
    setLoading(true);

    try {
      if (actionType === 'draft') {
        // Initialize draft — handles both live and automated modes.
        // The mutation reads saved draft settings and branches accordingly.
        await initializeDraft({
          variables: {
            leagueId,
          },
        });

        // The mutation returns a Draft, not a League. The refetchQueries
        // on the hook will re-fetch GetLeagueById to update the parent.

        setLoading(false);
        onSuccess?.('draft');
      } else if (actionType === 'createWeek1') {
        // Create Week 1 matchups after draft is complete
        await autoAdvanceMatchups({
          variables: { leagueId },
        });

        setLoading(false);
        onSuccess?.('createWeek1');
      } else if (actionType === 'selectGame') {
        // Trigger game selection for this league via the scheduled mutation
        await autoSelectGames({
          variables: { leagueId },
        });

        // Wait for refetch to complete (awaitRefetchQueries: true)
        // Then confirm status is updated before re-enabling button
        // The button will stay disabled via isGameSelectionInProgress check
        setLoading(false);
        onSuccess?.('selectGame');
      } else {
        // Advance to next week
        await autoAdvanceMatchups({
          variables: { leagueId },
        });

        setLoading(false);
        onSuccess?.('advance');
      }
    } catch (err) {
      setLoading(false);
      setLoading(false);
      let errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';

      // Provide helpful error messages
      if (actionType === 'draft') {
        if (errorMessage.includes('at least 2 teams')) {
          errorMessage =
            'Your league needs at least 2 teams to start a draft. Please add more teams first.';
        }
      } else if (actionType === 'createWeek1' || actionType === 'advance') {
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
          errorMessage = `Invalid game number. Please select a game between 1 and ${effectiveGamesPerMatchup}.`;
        }
      }

      onError?.(new Error(errorMessage));
    }
  };

  const getButtonText = () => {
    if (loading || initializeDraftLoading || matchupsLoading)
      return 'Processing...';
    if (isGameSelectionInProgress) return 'Game Selection In Progress...';
    if (isDraftInProgress) return 'Draft In Progress...';
    if (isDraftCompleted && actionType === 'draft') return 'Draft Completed';

    if (actionType === 'draft') {
      return initializeDraftLoading ? 'Starting Draft...' : 'Start Draft';
    } else if (actionType === 'createWeek1') {
      return 'Create Week 1 Matchups';
    } else if (actionType === 'selectGame') {
      return `Select Game ${nextGameNumber} of ${effectiveGamesPerMatchup}`;
    } else {
      return 'Advance League Week';
    }
  };

  const getDialogTitle = () => {
    if (actionType === 'draft') {
      return 'Start Draft?';
    } else if (actionType === 'createWeek1') {
      return 'Create Week 1 Matchups?';
    } else if (actionType === 'selectGame') {
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
    if (actionType === 'draft') {
      return 'This will start a random draft to assign players to all teams. Players will be randomly assigned to roster positions. After the draft completes, you can create Week 1 matchups.';
    } else if (actionType === 'createWeek1') {
      return 'This will create Week 1 matchups, pairing up all teams in the league. Players will be automatically assigned random historical seasons for their first matchup.';
    } else if (actionType === 'selectGame') {
      return `This will automatically select game ${nextGameNumber} for all matchups in the current week. The system will choose games based on the configured rules and selected season.`;
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
    if (actionType === 'draft') {
      return 'Start the draft to assign players to team rosters.';
    } else if (actionType === 'createWeek1') {
      return 'Draft complete! Next: Create matchups for Week 1.';
    } else if (actionType === 'selectGame') {
      const draftPrefix = isDraftCompleted
        ? 'Draft complete! All season matchups were created automatically. '
        : '';
      return `${draftPrefix}Next: Select game ${nextGameNumber} of ${effectiveGamesPerMatchup} for all matchups in the current week.`;
    } else {
      return 'All games selected! Next: Advance to the next league week.';
    }
  };

  return (
    <>
      <Card
        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
        borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
        padding="$4"
      >
        <YStack space="$3">
          <H4 color={BRAND_GOLD_LIGHT}>Next Step</H4>

          {hasCurrentMatchup ? (
            <YStack space="$2">
              <Text color="$gray11" fontSize="$3">
                Current Matchup: Week {currentWeek}
              </Text>
              <Text color="$gray11" fontSize="$3">
                Games Selected: {selectedGamesCount} of{' '}
                {effectiveGamesPerMatchup}
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
                          ? withAlpha(BRAND_NAVY_LIGHT, 0.18)
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
                          ? BRAND_NAVY_LIGHT
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
                            ? BRAND_GOLD_LIGHT
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
            {isDraftInProgress && isLiveDraft ? (
              <Link
                to={`/baseball/league/${leagueId}/draft`}
                style={{ textDecoration: 'none' }}
              >
                <Button theme="green">Go to Draft Board</Button>
              </Link>
            ) : (
              <Button
                backgroundColor={BRAND_NAVY_LIGHT}
                color="white"
                pressStyle={{ backgroundColor: BRAND_NAVY_DARK }}
                hoverStyle={{ backgroundColor: BRAND_NAVY }}
                onPress={handleButtonClick}
                disabled={
                  loading ||
                  initializeDraftLoading ||
                  matchupsLoading ||
                  isGameSelectionInProgress ||
                  isDraftInProgress ||
                  (actionType === 'draft' && isDraftCompleted) ||
                  (actionType === 'draft' && hasPendingSettingsChanges)
                }
                icon={
                  loading ||
                  initializeDraftLoading ||
                  matchupsLoading ||
                  isGameSelectionInProgress ||
                  (isDraftInProgress && !isLiveDraft) ? (
                    <Spinner />
                  ) : undefined
                }
              >
                {getButtonText()}
              </Button>
            )}
          </XStack>

          {actionType === 'draft' &&
            hasPendingSettingsChanges &&
            !isDraftInProgress &&
            !isDraftCompleted && (
              <XStack
                alignItems="center"
                gap="$2"
                backgroundColor="$orange3"
                borderColor="$orange8"
                borderWidth={1}
                borderRadius="$3"
                paddingHorizontal="$3"
                paddingVertical="$2"
              >
                <Text color="$orange11" fontWeight="600" fontSize="$3">
                  Save your draft settings before starting the draft.
                </Text>
              </XStack>
            )}

          {isDraftInProgress && !isLiveDraft && (
            <XStack
              alignItems="center"
              gap="$2"
              backgroundColor="$yellow3"
              borderColor="$yellow8"
              borderWidth={1}
              borderRadius="$3"
              paddingHorizontal="$3"
              paddingVertical="$2"
            >
              <Spinner size="small" color="$yellow11" />
              <Text color="$yellow11" fontWeight="600" fontSize="$3">
                Automatic draft is in progress. Players are being assigned to
                teams...
              </Text>
            </XStack>
          )}

          {isDraftInProgress && isLiveDraft && (
            <XStack
              alignItems="center"
              gap="$2"
              backgroundColor="$green3"
              borderColor="$green8"
              borderWidth={1}
              borderRadius="$3"
              paddingHorizontal="$3"
              paddingVertical="$2"
            >
              <Text color="$green11" fontWeight="600" fontSize="$3">
                Live draft is active! Click the button above to join the draft
                board.
              </Text>
            </XStack>
          )}

          <Text fontSize="$2" color="$gray10">
            {getDescriptionText()}
          </Text>

          {isSeasonComplete && (
            <YStack
              gap="$3"
              borderTopWidth={1}
              borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.25)}
              paddingTop="$3"
              marginTop="$1"
            >
              <Text fontWeight="600" fontSize="$3" color={BRAND_GOLD_LIGHT}>
                Season Complete
              </Text>
              <Text color="$gray11" fontSize="$2">
                All weeks have been played. Ready to start a new season? A new
                league will be created preserving all settings and members. This
                league will be archived as a historical record.
              </Text>
              <XStack>
                <Button
                  backgroundColor={BRAND_NAVY_LIGHT}
                  color="white"
                  pressStyle={{ backgroundColor: BRAND_NAVY_DARK }}
                  hoverStyle={{ backgroundColor: BRAND_NAVY }}
                  onPress={() => setShowRenewalDialog(true)}
                >
                  Start New Season
                </Button>
              </XStack>
            </YStack>
          )}
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

      {/* Season Renewal Dialog */}
      <Dialog open={showRenewalDialog} onOpenChange={setShowRenewalDialog}>
        <Dialog.Portal>
          <Dialog.Overlay
            key="renewal-overlay"
            animation="quick"
            opacity={0.5}
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
          />
          <Dialog.Content
            bordered
            elevate
            key="renewal-content"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="season-renewal-title"
            aria-describedby="season-renewal-description"
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
            width={520}
          >
            <Dialog.Title id="season-renewal-title">
              Start New Season for "{leagueName}"?
            </Dialog.Title>
            <Dialog.Description id="season-renewal-description">
              A new league will be created with all settings and members carried
              forward. This league will be frozen and kept as a historical
              record.
            </Dialog.Description>

            <YStack space="$3">
              <Text fontSize="$3" fontWeight="bold">
                How should rosters be handled?
              </Text>
              <RadioGroup
                value={keepRosters}
                onValueChange={(val) => setKeepRosters(val as 'keep' | 'draft')}
              >
                <YStack space="$2">
                  <XStack alignItems="center" gap="$2">
                    <RadioGroup.Item value="draft" id="roster-draft">
                      <RadioGroup.Indicator />
                    </RadioGroup.Item>
                    <Label htmlFor="roster-draft" fontSize="$3">
                      Hold a new draft — start with empty rosters
                    </Label>
                  </XStack>
                  <XStack alignItems="center" gap="$2">
                    <RadioGroup.Item value="keep" id="roster-keep">
                      <RadioGroup.Indicator />
                    </RadioGroup.Item>
                    <Label htmlFor="roster-keep" fontSize="$3">
                      Keep same rosters — carry over all player assignments
                    </Label>
                  </XStack>
                </YStack>
              </RadioGroup>
              <Text fontSize="$2" color="$gray10">
                {keepRosters === 'draft'
                  ? 'All team rosters will be cleared. The commissioner can configure the draft before it begins.'
                  : 'All current player assignments will be copied to the new season. No draft will be needed.'}
              </Text>
            </YStack>

            <XStack gap="$3" justifyContent="flex-end">
              <Dialog.Close displayWhenAdapted asChild>
                <Button theme="alt2" disabled={renewalLoading}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                backgroundColor={BRAND_NAVY_LIGHT}
                color="white"
                pressStyle={{ backgroundColor: BRAND_NAVY_DARK }}
                hoverStyle={{ backgroundColor: BRAND_NAVY }}
                onPress={handleRenewalConfirm}
                disabled={renewalLoading}
                icon={renewalLoading ? <Spinner /> : undefined}
              >
                {renewalLoading
                  ? 'Creating new season...'
                  : 'Confirm New Season'}
              </Button>
            </XStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </>
  );
}
