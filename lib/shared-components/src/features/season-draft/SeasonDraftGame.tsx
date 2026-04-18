import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LOGGER } from '@legacy-sports/logging';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Button,
  Card,
  Dialog,
  H2,
  H3,
  Input,
  Paragraph,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  SeasonDraftGameMode,
  SeasonDraftPlayerType,
  useCancelSeasonDraftGameMutation,
  useGetSeasonDraftGamePlayerOptionsLazyQuery,
  useGetSeasonDraftGameQuery,
  useGetSeasonDraftGameStatValueLazyQuery,
  useMakeSeasonDraftPickMutation,
  useSearchPlayersForDraftLazyQuery,
  useStartSeasonDraftGameMutation,
  useTriggerSeasonDraftStatLoadingMutation,
} from '../../api/db/graphql.generated';
import { useWebSocket } from '../../hooks/useWebSocket';

/**
 * Season Draft Game Component
 *
 * Turn-based drafting game where players select baseball player + season
 * (or career-with-team) combinations to fill their roster.
 *
 * Features:
 * - Configurable stat key (HR, H, RBI, SB, etc. for hitters; W, SO, SV, etc. for pitchers)
 * - Season mode (player+year) or career_team mode (player+team)
 * - Hitter or pitcher drafts with different roster layouts
 * - On-demand stat loading with WebSocket-based loading state
 * - Turn-based drafting with real-time scoring
 */

/** Human-readable labels for stat keys */
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

interface Player {
  id: number;
  firstName: string;
  lastName: string;
  statsLastFetchedAt?: string | null;
}

interface RosterSlot {
  id: number;
  position: string;
  slotNumber: number;
  isFilled: boolean;
  pick?: {
    playerName: string;
    season: number;
    statValue: number;
    team?: string | null;
  };
}

interface GamePlayer {
  id: number;
  userId: number;
  playerName: string;
  draftOrder: number;
  totalScore: number;
  roster: RosterSlot[];
}

interface GameState {
  id: number;
  name: string;
  status: 'setup' | 'drafting' | 'completed' | 'cancelled';
  currentTurn: number;
  createdBy: number;
  statKey: string;
  gameMode: SeasonDraftGameMode;
  playerType: SeasonDraftPlayerType;
  inviteCode?: string | null;
  players: GamePlayer[];
  picks: Array<{
    pickNumber: number;
    playerName: string;
    baseballPlayerName: string;
    season: number;
    position: string;
    statValue: number;
    team?: string | null;
    pickedAt: string;
  }>;
}

interface SeasonDraftGameProps {
  gameId: number;
  currentUserId: number;
  websocketUrl?: string;
  websocketToken?: string;
  onBack?: () => void;
}

/**
 * Main Season Draft Game Component
 */
export const SeasonDraftGame: React.FC<SeasonDraftGameProps> = ({
  gameId,
  currentUserId,
  websocketUrl,
  websocketToken,
  onBack,
}) => {
  const [playerSearch, setPlayerSearch] = useState('');
  const [selectedOption, setSelectedOption] = useState(''); // team or year
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<string>('');
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [statsLoadingPlayerIds, setStatsLoadingPlayerIds] = useState<
    Set<number>
  >(new Set());
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  // Query game state — polling is managed via startPolling/stopPolling below
  const {
    data: gameData,
    loading,
    error: queryError,
    refetch: refetchGame,
    startPolling,
    stopPolling,
  } = useGetSeasonDraftGameQuery({
    variables: { gameId },
  });
  const gameState = useMemo(
    () => (gameData?.seasonDraftGame as GameState | undefined) ?? null,
    [gameData?.seasonDraftGame],
  );

  // Poll only while the game is active (drafting/setup). Stop when the game
  // ends, is not found, or the query errors persistently. Using
  // startPolling/stopPolling in an effect avoids stale-ref issues when
  // gameId changes without unmounting (React Router param change).
  const gameStatus = gameState?.status;
  useEffect(() => {
    const shouldPoll =
      !queryError &&
      !!gameState &&
      (gameStatus === 'drafting' || gameStatus === 'setup');
    if (shouldPoll) {
      startPolling(5000);
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [gameState, gameStatus, queryError, startPolling, stopPolling]);

  // Lazy query for player search
  const [searchPlayersQuery, { data: searchData }] =
    useSearchPlayersForDraftLazyQuery();
  const playerSuggestions = (searchData?.players ?? []) as Player[];

  // Lazy query for team/season options after a player is selected
  const [
    fetchPlayerOptions,
    { data: playerOptionsData, loading: optionsLoading },
  ] = useGetSeasonDraftGamePlayerOptionsLazyQuery();
  const playerOptions: string[] =
    playerOptionsData?.seasonDraftGamePlayerOptions ?? [];

  // Lazy query for stat preview
  const [previewQuery, { data: previewData }] =
    useGetSeasonDraftGameStatValueLazyQuery();
  const previewStatValue: number | null =
    previewData?.seasonDraftGamePlayerSeasonStatValue ?? null;

  // Mutations
  const [makePickMutation] = useMakeSeasonDraftPickMutation();
  const [triggerStatLoading] = useTriggerSeasonDraftStatLoadingMutation();
  const [startGameMutation] = useStartSeasonDraftGameMutation();
  const [cancelGameMutation] = useCancelSeasonDraftGameMutation();

  // WebSocket for real-time stat loading notifications
  const selectedPlayerRef = useRef(selectedPlayer);
  selectedPlayerRef.current = selectedPlayer;
  useWebSocket({
    url: websocketUrl,
    token: websocketToken,
    autoConnect: !!websocketUrl && !!websocketToken,
    onPlayerStatsUpdated: (notification) => {
      setStatsLoadingPlayerIds((prev) => {
        const next = new Set(prev);
        next.delete(notification.playerId);
        return next;
      });
      // Refetch game data when stats are loaded (stat values may have changed)
      void refetchGame();
    },
  });

  const isMostTeamsMode = gameState?.gameMode === SeasonDraftGameMode.MostTeams;
  const statLabel = gameState
    ? isMostTeamsMode
      ? 'Teams'
      : (STAT_LABELS[gameState.statKey] ?? gameState.statKey)
    : '';
  const isCareerTeamMode =
    gameState?.gameMode === SeasonDraftGameMode.CareerTeam;
  const isPitcherDraft =
    gameState?.playerType === SeasonDraftPlayerType.Pitcher;

  // Get current player
  const currentPlayer = gameState?.players.find(
    (p) => p.draftOrder === gameState.currentTurn,
  );
  const isMyTurn = currentPlayer?.userId === currentUserId;
  const isCreator = gameState?.createdBy === currentUserId;

  // Start game (creator only)
  const handleStartGame = async () => {
    if (!gameState || isStartingGame) return;
    setIsStartingGame(true);
    try {
      await startGameMutation({ variables: { gameId } });
      await refetchGame();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      LOGGER.error('Failed to start game', err);
      setErrorMessage('Failed to start game.');
    } finally {
      setIsStartingGame(false);
    }
  };

  const handleCopyInviteLink = () => {
    if (!gameState?.inviteCode) return;
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/games/season-draft/join/${gameState.inviteCode}`;
    void navigator.clipboard.writeText(url).then(() => {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    });
  };

  // Cancel game (creator only) — opens the confirmation dialog
  const handleCancelGame = () => {
    if (!gameState) return;
    setCancelConfirmOpen(true);
  };

  // Performs the actual cancellation after user confirms
  const handleConfirmCancel = () => {
    void cancelGameMutation({ variables: { gameId } }).then(
      () => {
        setCancelConfirmOpen(false);
        if (onBack) {
          onBack();
        } else {
          void refetchGame();
        }
      },
      (error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        LOGGER.error('Failed to cancel game', err);
        setCancelConfirmOpen(false);
        setErrorMessage('Failed to cancel game.');
      },
    );
  };

  // Search for players
  const searchPlayers = useCallback(
    (searchTerm: string) => {
      if (searchTerm.length < 2) {
        return;
      }
      void searchPlayersQuery({
        variables: { search: searchTerm, limit: 10 },
      });
    },
    [searchPlayersQuery],
  );

  // Trigger stat loading for a player
  const handleTriggerStatLoading = useCallback(
    async (player: Player) => {
      if (statsLoadingPlayerIds.has(player.id)) return; // Already loading

      setStatsLoadingPlayerIds((prev) => {
        const next = new Set(prev);
        next.add(player.id);
        return next;
      });

      try {
        await triggerStatLoading({
          variables: { playerId: player.id },
        });
        // Stats have been loaded (or were already present on the server).
        // Clear the loading state here so the draft form becomes usable.
        // The WebSocket notification also does this cleanup, but it requires
        // websocketUrl/websocketToken to be connected — clearing here ensures
        // correct behaviour when WebSocket is unavailable.
        setStatsLoadingPlayerIds((prev) => {
          const next = new Set(prev);
          next.delete(player.id);
          return next;
        });
        // Only refetch when WebSocket is not connected; when WS is connected,
        // onPlayerStatsUpdated will trigger the refetch to avoid duplicate calls.
        if (!websocketUrl || !websocketToken) {
          void refetchGame();
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        LOGGER.error('Failed to trigger stat loading', err);
        setStatsLoadingPlayerIds((prev) => {
          const next = new Set(prev);
          next.delete(player.id);
          return next;
        });
        Alert.alert(
          'Stats Unavailable',
          'Could not load stats for this player. They may not have a Baseball Reference page. You can still draft them, but their stat value will be 0.',
        );
      }
    },
    [
      triggerStatLoading,
      statsLoadingPlayerIds,
      refetchGame,
      websocketUrl,
      websocketToken,
    ],
  );

  // Preview stat value for selection
  const previewSelection = useCallback(() => {
    if (!selectedPlayer || !selectedPosition) {
      return;
    }

    if (isMostTeamsMode) {
      // most_teams mode: no team/season needed
      void previewQuery({
        variables: {
          playerId: selectedPlayer.id,
          season: 0,
          position: selectedPosition,
          statKey: 'teams_played',
          playerType: gameState?.playerType,
          gameMode: 'most_teams',
        },
      });
    } else if (isCareerTeamMode) {
      if (!selectedOption) return;
      void previewQuery({
        variables: {
          playerId: selectedPlayer.id,
          season: 0, // Not used in career_team mode
          position: selectedPosition,
          statKey: gameState?.statKey,
          playerType: gameState?.playerType,
          gameMode: 'career_team',
          team: selectedOption,
        },
      });
    } else {
      if (!selectedOption) return;
      const year = parseInt(selectedOption);
      if (isNaN(year) || year < 1900 || year > new Date().getFullYear()) return;
      void previewQuery({
        variables: {
          playerId: selectedPlayer.id,
          season: year,
          position: selectedPosition,
          statKey: gameState?.statKey,
          playerType: gameState?.playerType,
          gameMode: 'season',
        },
      });
    }
  }, [
    selectedPlayer,
    selectedOption,
    selectedPosition,
    previewQuery,
    isMostTeamsMode,
    isCareerTeamMode,
    gameState,
  ]);

  // Make a draft pick
  const makePick = async () => {
    if (!selectedPlayer || !selectedSlotId || !selectedPosition) {
      setErrorMessage('Please complete all fields');
      return;
    }

    if (!isMostTeamsMode) {
      if (isCareerTeamMode) {
        if (!selectedOption) {
          setErrorMessage('Please enter a team abbreviation (e.g., NYY)');
          return;
        }
      } else {
        const year = parseInt(selectedOption);
        if (isNaN(year) || year < 1900 || year > new Date().getFullYear()) {
          setErrorMessage('Please enter a valid 4-digit year');
          return;
        }
      }
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);

      await makePickMutation({
        variables: {
          gameId,
          rosterSlotId: selectedSlotId,
          playerId: selectedPlayer.id,
          season: isMostTeamsMode
            ? 0
            : isCareerTeamMode
              ? 0
              : parseInt(selectedOption),
          position: selectedPosition,
          team: isCareerTeamMode ? selectedOption : undefined,
        },
      });

      // Clear selection
      setSelectedPlayer(null);
      setPlayerSearch('');
      setSelectedOption('');
      setSelectedPosition('');
      setSelectedSlotId(null);

      // Reload game state
      await refetchGame();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      LOGGER.error('Failed to make pick', err);
      setErrorMessage('Failed to make pick. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle player selection
  useEffect(() => {
    const delaySearch = setTimeout(() => {
      if (playerSearch) {
        void searchPlayers(playerSearch);
      }
    }, 300);

    return () => clearTimeout(delaySearch);
  }, [playerSearch, searchPlayers]);

  // Preview selection when all fields are filled
  useEffect(() => {
    void previewSelection();
  }, [previewSelection]);

  // Re-fetch player options when the selected player's stats finish loading
  const prevStatsLoadingRef = useRef(statsLoadingPlayerIds);
  useEffect(() => {
    const prevLoading = prevStatsLoadingRef.current;
    prevStatsLoadingRef.current = statsLoadingPlayerIds;
    const player = selectedPlayerRef.current;
    if (
      player &&
      gameState &&
      !isMostTeamsMode &&
      playerOptions.length === 0 &&
      !statsLoadingPlayerIds.has(player.id) &&
      prevLoading.has(player.id)
    ) {
      void fetchPlayerOptions({
        variables: {
          playerId: player.id,
          gameMode: gameState.gameMode,
          playerType: gameState.playerType,
        },
      });
    }
  }, [
    statsLoadingPlayerIds,
    gameState,
    fetchPlayerOptions,
    playerOptions.length,
    isMostTeamsMode,
  ]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text>Loading game...</Text>
      </View>
    );
  }

  if (!gameState) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Game not found</Text>
        {onBack && <Button onPress={onBack}>Go Back</Button>}
      </View>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$background">
      {/* Cancel Game Confirmation Dialog */}
      <Dialog
        modal
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
      >
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
            role="alertdialog"
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
            x={0}
            scale={1}
            opacity={1}
            y={0}
            maxWidth={400}
            padding="$4"
          >
            <YStack space="$3">
              <Dialog.Title>Cancel Game</Dialog.Title>
              <Dialog.Description>
                Are you sure you want to cancel this game? This cannot be
                undone.
              </Dialog.Description>
              <XStack space="$3" justifyContent="flex-end">
                <Dialog.Close asChild>
                  <Button>No, Keep Playing</Button>
                </Dialog.Close>
                <Button theme="red" onPress={handleConfirmCancel}>
                  Yes, Cancel Game
                </Button>
              </XStack>
            </YStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>

      {/* Inline error message */}
      {errorMessage !== null && (
        <Card
          margin="$4"
          padding="$3"
          backgroundColor="$red3"
          borderColor="$red6"
          bordered
        >
          <XStack justifyContent="space-between" alignItems="center">
            <Paragraph color="$red11">{errorMessage}</Paragraph>
            <Button
              size="$2"
              chromeless
              aria-label="Dismiss error"
              accessibilityLabel="Dismiss error"
              onPress={() => setErrorMessage(null)}
            >
              ✕
            </Button>
          </XStack>
        </Card>
      )}

      {/* Header */}
      <XStack
        padding="$4"
        backgroundColor="$blue10"
        justifyContent="space-between"
        alignItems="center"
      >
        {onBack && (
          <Button size="$3" onPress={onBack}>
            ← Back
          </Button>
        )}
        <YStack alignItems="center" flex={1}>
          <H2 color="white">{gameState.name}</H2>
          <XStack space="$2">
            <Text color="$blue3" fontSize="$2">
              {isPitcherDraft ? 'Pitcher' : 'Hitter'} Draft
            </Text>
            <Text color="$blue3" fontSize="$2">
              •
            </Text>
            <Text color="$blue3" fontSize="$2">
              {statLabel}
            </Text>
            <Text color="$blue3" fontSize="$2">
              •
            </Text>
            <Text color="$blue3" fontSize="$2">
              {isMostTeamsMode
                ? 'Most Teams'
                : isCareerTeamMode
                  ? 'Career w/ Team'
                  : 'Season'}
            </Text>
          </XStack>
        </YStack>
        <Text style={{ color: 'white' }}>
          {gameState.status === 'drafting'
            ? `Turn: ${currentPlayer?.playerName}`
            : gameState.status}
        </Text>
      </XStack>

      <ScrollView>
        {/* Setup Phase — Invite Link + Start / Cancel */}
        {gameState.status === 'setup' && (
          <Card margin="$4" padding="$4" backgroundColor="$yellow3">
            <H3 marginBottom="$2">Game Setup</H3>

            {/* Invite Link Section */}
            {gameState.inviteCode && (
              <YStack marginBottom="$4" space="$2">
                <Text fontWeight="600">Invite players via link:</Text>
                <XStack space="$2" alignItems="center" flexWrap="wrap">
                  <Text
                    flex={1}
                    fontSize="$3"
                    color="$gray11"
                    numberOfLines={1}
                    style={{ fontFamily: 'monospace' }}
                  >
                    {typeof window !== 'undefined'
                      ? `${window.location.origin}/games/season-draft/join/${gameState.inviteCode}`
                      : `/games/season-draft/join/${gameState.inviteCode}`}
                  </Text>
                  <Button
                    size="$3"
                    backgroundColor={inviteCopied ? '$green10' : '$blue10'}
                    color="white"
                    onPress={handleCopyInviteLink}
                  >
                    {inviteCopied ? 'Copied!' : 'Copy Link'}
                  </Button>
                </XStack>
              </YStack>
            )}

            <Text marginBottom="$2">
              Players: {gameState.players.map((p) => p.playerName).join(', ')} (
              {gameState.players.length}/6)
            </Text>

            {isCreator && gameState.players.length < 2 && (
              <Text marginBottom="$3" color="$orange10" fontSize="$3">
                Share the invite link above. You need at least 2 players to
                start.
              </Text>
            )}

            {!isCreator && (
              <Text marginBottom="$3" color="$gray10">
                Waiting for the game creator to start the draft.
              </Text>
            )}

            {isCreator && (
              <XStack space="$3">
                <Button
                  flex={1}
                  size="$4"
                  backgroundColor="$green10"
                  color="white"
                  disabled={isStartingGame || gameState.players.length < 2}
                  opacity={
                    isStartingGame || gameState.players.length < 2 ? 0.5 : 1
                  }
                  onPress={() => void handleStartGame()}
                >
                  {isStartingGame ? 'Starting...' : 'Start Draft'}
                </Button>
                <Button
                  flex={1}
                  size="$4"
                  backgroundColor="$red10"
                  color="white"
                  onPress={() => void handleCancelGame()}
                >
                  Cancel Game
                </Button>
              </XStack>
            )}
          </Card>
        )}

        {/* Cancelled State */}
        {gameState.status === 'cancelled' && (
          <Card margin="$4" padding="$4" backgroundColor="$red3">
            <H3>Game Cancelled</H3>
            <Text marginTop="$2" color="$gray10">
              This game has been cancelled.
            </Text>
          </Card>
        )}

        {/* Cancel button during drafting (creator only) */}
        {gameState.status === 'drafting' && isCreator && (
          <XStack margin="$4" justifyContent="flex-end">
            <Button
              size="$3"
              backgroundColor="$red10"
              color="white"
              onPress={() => void handleCancelGame()}
            >
              Cancel Game
            </Button>
          </XStack>
        )}

        {/* Current Turn Indicator */}
        {gameState.status === 'drafting' && (
          <Card
            margin="$4"
            padding="$4"
            backgroundColor={isMyTurn ? '$green3' : '$gray3'}
          >
            <H3>
              {isMyTurn
                ? 'Your Turn!'
                : `Waiting for ${currentPlayer?.playerName}...`}
            </H3>
          </Card>
        )}

        {/* Draft Interface (only show if it's your turn) */}
        {isMyTurn && gameState.status === 'drafting' && (
          <Card margin="$4" padding="$4">
            <H3 marginBottom="$3">Make Your Pick</H3>

            {/* Player Search */}
            <YStack marginBottom="$3">
              <Text fontWeight="bold" marginBottom="$2">
                Baseball Player:
              </Text>
              <Input
                placeholder="Search player name..."
                value={playerSearch}
                onChangeText={setPlayerSearch}
                size="$4"
              />
              {playerSuggestions.length > 0 && (
                <ScrollView
                  style={{
                    maxHeight: 200,
                    borderWidth: 1,
                    borderColor: '#ccc',
                    marginTop: 8,
                  }}
                >
                  {playerSuggestions.map((player) => {
                    const isLoading = statsLoadingPlayerIds.has(player.id);
                    const needsStats = !player.statsLastFetchedAt;

                    return (
                      <TouchableOpacity
                        key={player.id}
                        onPress={() => {
                          setSelectedPlayer(player);
                          setSelectedOption('');
                          setPlayerSearch(
                            `${player.firstName} ${player.lastName}`,
                          );
                          // Fetch available teams/seasons for this player (skip in most_teams mode)
                          if (gameState && !isMostTeamsMode) {
                            void fetchPlayerOptions({
                              variables: {
                                playerId: player.id,
                                gameMode: gameState.gameMode,
                                playerType: gameState.playerType,
                              },
                            });
                          }
                          // Auto-trigger stat loading if needed
                          if (needsStats && !isLoading) {
                            void handleTriggerStatLoading(player);
                          }
                        }}
                        style={{
                          padding: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: '#eee',
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Text>
                          {player.firstName} {player.lastName}
                        </Text>
                        {isLoading && (
                          <XStack space="$1" alignItems="center">
                            <ActivityIndicator size="small" />
                            <Text fontSize="$2" color="$orange10">
                              Loading stats...
                            </Text>
                          </XStack>
                        )}
                        {needsStats && !isLoading && (
                          <Text fontSize="$2" color="$yellow10">
                            Stats not loaded
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </YStack>

            {/* Selected player stats loading indicator */}
            {selectedPlayer && statsLoadingPlayerIds.has(selectedPlayer.id) && (
              <Card backgroundColor="$orange2" padding="$3" marginBottom="$3">
                <XStack space="$2" alignItems="center">
                  <ActivityIndicator size="small" />
                  <Text color="$orange10">
                    Loading stats for {selectedPlayer.firstName}{' '}
                    {selectedPlayer.lastName}... Please wait before making your
                    pick.
                  </Text>
                </XStack>
              </Card>
            )}

            {/* Team / Season Picker (hidden for most_teams — no selection needed) */}
            {selectedPlayer && !isMostTeamsMode && (
              <YStack marginBottom="$3">
                <Text fontWeight="bold" marginBottom="$2">
                  {isCareerTeamMode ? 'Select Team:' : 'Select Season:'}
                </Text>
                {playerOptions.length === 0 ? (
                  <Text fontSize="$3" color="$gray9">
                    {optionsLoading
                      ? 'Loading options...'
                      : statsLoadingPlayerIds.has(selectedPlayer.id)
                        ? 'Loading stats — options will appear once stats are loaded'
                        : 'No stats available for this player'}
                  </Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <XStack space="$2" flexWrap="wrap">
                      {playerOptions.map((option) => {
                        const isSelected = selectedOption === option;
                        return (
                          <Button
                            key={option}
                            size="$3"
                            marginBottom="$1"
                            variant={isSelected ? undefined : 'outlined'}
                            theme={isSelected ? 'active' : undefined}
                            onPress={() => setSelectedOption(option)}
                          >
                            {option}
                          </Button>
                        );
                      })}
                    </XStack>
                  </ScrollView>
                )}
              </YStack>
            )}

            {/* Position Selection */}
            <YStack marginBottom="$3">
              <Text fontWeight="bold" marginBottom="$2">
                {isPitcherDraft ? 'Pitcher Slot:' : 'Position to Fill:'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <XStack space="$2">
                  {currentPlayer?.roster
                    .filter((slot) => !slot.isFilled)
                    .map((slot) => {
                      const label =
                        slot.slotNumber > 0
                          ? `${slot.position} ${slot.slotNumber + 1}`
                          : slot.position;
                      const isSelected = selectedSlotId === slot.id;

                      return (
                        <Button
                          key={slot.id}
                          size="$3"
                          variant={isSelected ? undefined : 'outlined'}
                          theme={isSelected ? 'active' : undefined}
                          onPress={() => {
                            setSelectedSlotId(slot.id);
                            setSelectedPosition(slot.position);
                          }}
                        >
                          {label}
                        </Button>
                      );
                    })}
                </XStack>
              </ScrollView>
            </YStack>

            {/* Preview */}
            {previewStatValue !== null && (
              <Card backgroundColor="$blue2" padding="$3" marginBottom="$3">
                <Text fontSize="$5" fontWeight="bold">
                  Preview: {previewStatValue} {statLabel}
                </Text>
                {previewStatValue === 0 && (
                  <Text fontSize="$3" color="$red10">
                    Warning:{' '}
                    {isMostTeamsMode
                      ? 'Player has no recorded teams'
                      : isPitcherDraft
                        ? `Player had 0 ${statLabel.toLowerCase()} in this ${isCareerTeamMode ? 'franchise' : 'season'}`
                        : `Player had no eligibility at this position in ${isCareerTeamMode ? 'this franchise' : selectedOption}, or had 0 ${statLabel.toLowerCase()}`}
                  </Text>
                )}
              </Card>
            )}

            {/* Submit Button */}
            <Button
              size="$5"
              backgroundColor="$green10"
              onPress={() => void makePick()}
              disabled={
                !selectedPlayer ||
                !selectedSlotId ||
                (!isMostTeamsMode && !selectedOption) ||
                submitting ||
                (selectedPlayer && statsLoadingPlayerIds.has(selectedPlayer.id))
              }
            >
              {submitting ? 'Making Pick...' : 'Confirm Pick'}
            </Button>
          </Card>
        )}

        {/* Scoreboard */}
        <Card margin="$4" padding="$4">
          <H3 marginBottom="$3">Scoreboard</H3>
          {[...gameState.players]
            .sort((a, b) => b.totalScore - a.totalScore)
            .map((player, index) => (
              <XStack
                key={player.id}
                justifyContent="space-between"
                marginBottom="$2"
                padding="$2"
                backgroundColor={
                  player.userId === currentUserId ? '$blue2' : '$gray2'
                }
              >
                <Text fontWeight="bold">
                  {index + 1}. {player.playerName}
                </Text>
                <Text fontWeight="bold">
                  {player.totalScore} {statLabel}
                </Text>
              </XStack>
            ))}
        </Card>

        {/* Rosters */}
        <Card margin="$4" padding="$4">
          <H3 marginBottom="$3">Rosters</H3>
          {gameState.players.map((player) => (
            <YStack
              key={player.id}
              marginBottom="$4"
              padding="$3"
              backgroundColor="$gray1"
              borderRadius="$4"
            >
              <XStack justifyContent="space-between" marginBottom="$2">
                <Text fontSize="$6" fontWeight="bold">
                  {player.playerName}
                </Text>
                <Text fontSize="$5" color="$blue10">
                  {player.totalScore} {statLabel}
                </Text>
              </XStack>

              {player.roster.map((slot) => {
                const label =
                  slot.slotNumber > 0
                    ? `${slot.position} ${slot.slotNumber + 1}`
                    : slot.position;

                return (
                  <XStack
                    key={slot.id}
                    justifyContent="space-between"
                    padding="$2"
                    marginBottom="$1"
                    backgroundColor={slot.isFilled ? '$green2' : '$gray3'}
                  >
                    <Text fontWeight="600" minWidth={60}>
                      {label}
                    </Text>
                    {slot.pick ? (
                      <XStack
                        space="$2"
                        flex={1}
                        justifyContent="space-between"
                      >
                        <Text>
                          {slot.pick.playerName}
                          {isMostTeamsMode
                            ? ''
                            : isCareerTeamMode && slot.pick.team
                              ? ` (${slot.pick.team})`
                              : ` (${slot.pick.season})`}
                        </Text>
                        <Text fontWeight="bold">
                          {slot.pick.statValue} {statLabel}
                        </Text>
                      </XStack>
                    ) : (
                      <Text color="$gray10" fontStyle="italic">
                        Empty
                      </Text>
                    )}
                  </XStack>
                );
              })}
            </YStack>
          ))}
        </Card>

        {/* Pick History */}
        <Card margin="$4" padding="$4">
          <H3 marginBottom="$3">Draft History</H3>
          {gameState.picks.map((pick) => (
            <XStack
              key={pick.pickNumber}
              padding="$2"
              marginBottom="$1"
              backgroundColor="$gray2"
            >
              <Text fontWeight="600" minWidth={40}>
                #{pick.pickNumber + 1}
              </Text>
              <Text flex={1}>
                {pick.playerName} selected {pick.baseballPlayerName}
                {isMostTeamsMode
                  ? ''
                  : isCareerTeamMode && pick.team
                    ? ` (${pick.team})`
                    : ` (${pick.season})`}
                {!isPitcherDraft && ` @ ${pick.position}`} - {pick.statValue}{' '}
                {statLabel}
              </Text>
            </XStack>
          ))}
          {gameState.picks.length === 0 && (
            <Text color="$gray10" fontStyle="italic">
              No picks yet
            </Text>
          )}
        </Card>
      </ScrollView>
    </YStack>
  );
};

export default SeasonDraftGame;
