import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { Alert, TouchableOpacity } from 'react-native';
import {
  Button,
  Dialog,
  H1,
  H3,
  Input,
  Paragraph,
  ScrollView,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Circle, Stack } from './primitives';
import { SPORT_LOBBY_CHROME, type SportKind, toSportKind } from './sportChrome';
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
import { BRAND_GOLD, BRAND_SEAM_RED, withAlpha } from '../../utils/colors';

/**
 * Season Draft Game
 *
 * Turn-based drafting game where players select baseball player + season
 * (or career-with-team) combinations to fill their roster.
 *
 * Phases: setup (invite + start) | drafting (pick UI / waiting) | completed.
 * Cross-platform Tamagui implementation.
 */

const STAT_LABELS: Record<string, string> = {
  hr: 'HR',
  h: 'H',
  rbi: 'RBI',
  sb: 'SB',
  r: 'R',
  doubles: '2B',
  triples: '3B',
  bb: 'BB',
  tb: 'TB',
  w: 'W',
  so: 'SO',
  sv: 'SV',
  sho: 'SHO',
  cg: 'CG',
};

const STAT_LABELS_LONG: Record<string, string> = {
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
  sport?: SportKind | null;
  inviteCode?: string | null;
  pickDeadlineSeconds?: number | null;
  currentPickDeadline?: string | null;
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

export const SeasonDraftGame: React.FC<SeasonDraftGameProps> = ({
  gameId,
  currentUserId,
  websocketUrl,
  websocketToken,
  onBack,
}) => {
  // ── State ────────────────────────────────────────────────────────────────
  const [playerSearch, setPlayerSearch] = useState('');
  const [selectedOption, setSelectedOption] = useState('');
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

  // ── Data ─────────────────────────────────────────────────────────────────
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

  const gameStatus = gameState?.status;
  useEffect(() => {
    const shouldPoll =
      !queryError && (gameStatus === 'drafting' || gameStatus === 'setup');
    if (shouldPoll) {
      startPolling(5000);
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [gameStatus, queryError, startPolling, stopPolling]);

  const [searchPlayersQuery, { data: searchData }] =
    useSearchPlayersForDraftLazyQuery();
  const playerSuggestions = (searchData?.players ?? []) as Player[];

  const [
    fetchPlayerOptions,
    { data: playerOptionsData, loading: optionsLoading },
  ] = useGetSeasonDraftGamePlayerOptionsLazyQuery();
  const playerOptions: string[] =
    playerOptionsData?.seasonDraftGamePlayerOptions ?? [];

  const [previewQuery, { data: previewData }] =
    useGetSeasonDraftGameStatValueLazyQuery();
  const previewStatValue: number | null =
    previewData?.seasonDraftGamePlayerSeasonStatValue ?? null;

  const [makePickMutation] = useMakeSeasonDraftPickMutation();
  const [triggerStatLoading] = useTriggerSeasonDraftStatLoadingMutation();
  const [startGameMutation] = useStartSeasonDraftGameMutation();
  const [cancelGameMutation] = useCancelSeasonDraftGameMutation();

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
      void refetchGame();
    },
  });

  // ── Derived ──────────────────────────────────────────────────────────────
  const isMostTeamsMode = gameState?.gameMode === SeasonDraftGameMode.MostTeams;
  const isCareerTeamMode =
    gameState?.gameMode === SeasonDraftGameMode.CareerTeam;
  const isPitcherDraft =
    gameState?.playerType === SeasonDraftPlayerType.Pitcher;
  const sport: SportKind = toSportKind(gameState?.sport);
  const sportChrome = SPORT_LOBBY_CHROME[sport];

  // `gameState.statKey` is nullable in the generated types — coalesce
  // before any string operations so older rows / partial cache entries
  // don't throw at runtime.
  const rawStatKey = gameState?.statKey ?? '';
  const statKeyShort = gameState
    ? isMostTeamsMode
      ? 'TM'
      : (STAT_LABELS[rawStatKey] ?? rawStatKey.toUpperCase() ?? '—')
    : '';
  const statLabelLong = gameState
    ? isMostTeamsMode
      ? 'Teams'
      : (STAT_LABELS_LONG[rawStatKey] ?? rawStatKey)
    : '';

  const currentPlayer = gameState?.players.find(
    (p) => p.draftOrder === gameState.currentTurn,
  );
  const isMyTurn = currentPlayer?.userId === currentUserId;
  const isCreator = gameState?.createdBy === currentUserId;
  const meAsPlayer = gameState?.players.find((p) => p.userId === currentUserId);

  const totalSlots = gameState
    ? gameState.players.reduce((sum, p) => sum + p.roster.length, 0)
    : 0;
  const filledSlots = gameState
    ? gameState.players.reduce(
        (sum, p) => sum + p.roster.filter((s) => s.isFilled).length,
        0,
      )
    : 0;

  const winner = useMemo(() => {
    if (!gameState || gameState.status !== 'completed') return null;
    return [...gameState.players].sort(
      (a, b) => b.totalScore - a.totalScore,
    )[0];
  }, [gameState]);
  const runnerUp = useMemo(() => {
    if (!gameState || gameState.status !== 'completed') return null;
    const sorted = [...gameState.players].sort(
      (a, b) => b.totalScore - a.totalScore,
    );
    return sorted[1] ?? null;
  }, [gameState]);

  // ── Actions ──────────────────────────────────────────────────────────────
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

  const inviteUrl = useMemo(() => {
    if (!gameState?.inviteCode) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/games/season-draft/join/${gameState.inviteCode}`;
  }, [gameState?.inviteCode]);

  const handleCopyInviteLink = () => {
    if (!gameState?.inviteCode) return;
    // `navigator.clipboard` is undefined in non-secure contexts (HTTP, some
    // sandboxed iframes) and on React Native — bail safely so we don't throw.
    const writeText =
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.writeText.bind(navigator.clipboard);
    if (!writeText) {
      setErrorMessage(
        'Clipboard unavailable in this browser — copy the link manually.',
      );
      return;
    }
    void writeText(inviteUrl).then(
      () => {
        setInviteCopied(true);
        setTimeout(() => setInviteCopied(false), 2000);
      },
      (error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        LOGGER.error('Failed to copy invite link', err);
        setErrorMessage('Could not copy invite link. Please try again.');
      },
    );
  };

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

  const searchPlayers = useCallback(
    (searchTerm: string) => {
      if (searchTerm.length < 2) return;
      void searchPlayersQuery({
        variables: { search: searchTerm, limit: 10 },
      });
    },
    [searchPlayersQuery],
  );

  const handleTriggerStatLoading = useCallback(
    async (player: Player) => {
      if (statsLoadingPlayerIds.has(player.id)) return;
      setStatsLoadingPlayerIds((prev) => {
        const next = new Set(prev);
        next.add(player.id);
        return next;
      });
      try {
        await triggerStatLoading({ variables: { playerId: player.id } });
        setStatsLoadingPlayerIds((prev) => {
          const next = new Set(prev);
          next.delete(player.id);
          return next;
        });
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

  const previewSelection = useCallback(() => {
    if (!selectedPlayer || !selectedPosition) return;
    if (isMostTeamsMode) {
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
          season: 0,
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
      setSelectedPlayer(null);
      setPlayerSearch('');
      setSelectedOption('');
      setSelectedPosition('');
      setSelectedSlotId(null);
      await refetchGame();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      LOGGER.error('Failed to make pick', err);
      setErrorMessage('Failed to make pick. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const delaySearch = setTimeout(() => {
      if (playerSearch) void searchPlayers(playerSearch);
    }, 300);
    return () => clearTimeout(delaySearch);
  }, [playerSearch, searchPlayers]);

  useEffect(() => {
    void previewSelection();
  }, [previewSelection]);

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

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading && !gameData) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
        <Spinner size="large" color="$brandGold" />
        <Text color="$textMuted">Loading game…</Text>
      </YStack>
    );
  }

  if (!gameState) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
        <Text color="$color">Game not found</Text>
        {onBack && (
          <Button
            backgroundColor="$brandGold"
            color="$brandNavy"
            onPress={onBack}
          >
            Go Back
          </Button>
        )}
      </YStack>
    );
  }

  const phaseLabel =
    gameState.status === 'setup'
      ? 'Waiting Room'
      : gameState.status === 'completed'
        ? 'Game Complete'
        : gameState.status === 'cancelled'
          ? 'Game Cancelled'
          : 'Draft Live';

  return (
    <ScrollView flex={1} backgroundColor="$background">
      {/* Cancel Confirmation Dialog */}
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
            animation={['quick', { opacity: { overshootClamping: true } }]}
            enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
            exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
            x={0}
            scale={1}
            opacity={1}
            y={0}
            maxWidth={400}
            padding="$4"
            backgroundColor="$surfaceCard"
          >
            <YStack gap="$3">
              <Dialog.Title color="$color">Cancel Game</Dialog.Title>
              <Dialog.Description color="$textMuted">
                Are you sure you want to cancel this game? This cannot be
                undone.
              </Dialog.Description>
              <XStack gap="$2" justifyContent="flex-end">
                <Dialog.Close asChild>
                  <Button
                    variant="outlined"
                    borderColor="$surfacePanelBorder"
                    color="$color"
                  >
                    No, Keep Playing
                  </Button>
                </Dialog.Close>
                <Button
                  backgroundColor="$brandSeamRed"
                  color="$color"
                  onPress={handleConfirmCancel}
                >
                  Yes, Cancel Game
                </Button>
              </XStack>
            </YStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>

      <YStack
        width="100%"
        maxWidth={1200}
        alignSelf="center"
        padding="$5"
        $sm={{ padding: '$3' }}
        gap="$5"
      >
        {/* Top bar */}
        {onBack && (
          <Button
            chromeless
            size="$2"
            alignSelf="flex-start"
            color="$textMuted"
            onPress={onBack}
            pressStyle={{ opacity: 0.7 }}
          >
            ← Back to Lobby
          </Button>
        )}

        {/* Inline error */}
        {errorMessage !== null && (
          <XStack
            padding="$3"
            borderRadius="$3"
            backgroundColor={withAlpha(BRAND_SEAM_RED, 0.15)}
            borderWidth={1}
            borderColor="$brandSeamRed"
            justifyContent="space-between"
            alignItems="center"
            gap="$3"
          >
            <Text color="$brandSeamRedLight" flex={1}>
              {errorMessage}
            </Text>
            <Button
              size="$2"
              chromeless
              color="$brandSeamRedLight"
              aria-label="Dismiss error"
              accessibilityLabel="Dismiss error"
              onPress={() => setErrorMessage(null)}
            >
              ✕
            </Button>
          </XStack>
        )}

        {/* Header: phase eyebrow, name, meta + turn card */}
        <XStack
          gap="$4"
          alignItems="flex-start"
          justifyContent="space-between"
          flexWrap="wrap"
        >
          <YStack flex={1} flexBasis={320} gap="$2" data-sport={sport}>
            <XStack alignItems="center" gap="$2">
              <Circle
                size={8}
                backgroundColor={
                  gameState.status === 'drafting'
                    ? '$brandSeamRedLight'
                    : gameState.status === 'completed'
                      ? '$brandGoldLight'
                      : '$textMuted'
                }
              />
              <Eyebrow
                color={
                  gameState.status === 'drafting'
                    ? '$brandSeamRedLight'
                    : '$brandGoldLight'
                }
              >
                {phaseLabel}
              </Eyebrow>
              <Text
                fontSize={14}
                role="img"
                accessibilityLabel={sportChrome.iconLabel}
              >
                {sportChrome.icon}
              </Text>
              <Text
                data-testid="sport-strapline"
                fontSize={11}
                color="$brandGoldLight"
                letterSpacing={1.6}
                textTransform="uppercase"
                fontWeight="700"
              >
                {sportChrome.strapline}
              </Text>
            </XStack>
            <H1
              color="$color"
              fontSize={36}
              lineHeight={36}
              fontWeight="800"
              letterSpacing={-1}
            >
              {gameState.name}
            </H1>
            <XStack alignItems="center" gap="$2" flexWrap="wrap">
              <StatChip>{statKeyShort}</StatChip>
              <Text color="$textMuted" fontSize={13}>
                {sport === 'football'
                  ? 'Gridiron'
                  : isPitcherDraft
                    ? 'Pitchers'
                    : 'Hitters'}
              </Text>
              <Text color="$textMuted" fontSize={13}>
                ·
              </Text>
              <Text color="$textMuted" fontSize={13}>
                {isMostTeamsMode
                  ? 'Most Teams'
                  : isCareerTeamMode
                    ? 'Career w/ Team'
                    : 'Season'}
              </Text>
              <Text color="$textMuted" fontSize={13}>
                ·
              </Text>
              <Text color="$textMuted" fontSize={13}>
                {gameState.players.length} players
              </Text>
            </XStack>
          </YStack>

          {gameState.status === 'drafting' && currentPlayer && (
            <YStack
              backgroundColor="$surfaceCard"
              borderRadius="$4"
              borderWidth={1}
              borderColor={isMyTurn ? '$brandGold' : '$surfacePanelBorder'}
              padding="$3"
              minWidth={220}
              gap="$1"
            >
              <Eyebrow>On the Clock</Eyebrow>
              <Text
                fontSize={22}
                fontWeight="800"
                color={isMyTurn ? '$brandGoldLight' : '$color'}
              >
                {isMyTurn ? 'Your Turn' : currentPlayer.playerName}
              </Text>
              <Text color="$textMuted" fontSize={12}>
                Pick {filledSlots + 1} / {totalSlots}
              </Text>
              {gameState.currentPickDeadline &&
                gameState.pickDeadlineSeconds != null && (
                  <PickDeadlineCountdown
                    deadline={gameState.currentPickDeadline}
                    totalSeconds={gameState.pickDeadlineSeconds}
                  />
                )}
            </YStack>
          )}

          {gameState.status === 'completed' && winner && (
            <YStack
              backgroundColor="$surfaceCard"
              borderRadius="$4"
              borderWidth={1}
              borderColor="$brandGold"
              padding="$3"
              minWidth={220}
              gap="$1"
            >
              <Text fontSize={28} role="img" accessibilityLabel="trophy">
                {'\u{1F3C6}'}
              </Text>
              <Eyebrow color="$brandGoldLight">Winner</Eyebrow>
              <Text fontSize={22} fontWeight="800" color="$brandGoldLight">
                {winner.playerName}
              </Text>
              <Text color="$textMuted" fontSize={12}>
                {winner.totalScore} {statKeyShort}
                {runnerUp != null && winner.totalScore > runnerUp.totalScore
                  ? ` · +${winner.totalScore - runnerUp.totalScore} over 2nd`
                  : ''}
              </Text>
            </YStack>
          )}
        </XStack>

        {gameState.status === 'cancelled' && (
          <YStack
            backgroundColor={withAlpha(BRAND_SEAM_RED, 0.1)}
            borderColor="$brandSeamRed"
            borderWidth={1}
            borderRadius="$4"
            padding="$4"
          >
            <Text color="$color" fontSize={16} fontWeight="700">
              Game Cancelled
            </Text>
            <Text color="$textMuted" marginTop="$1">
              This game has been cancelled.
            </Text>
          </YStack>
        )}

        {/* Setup phase */}
        {gameState.status === 'setup' && (
          <SetupPanel
            gameState={gameState}
            inviteUrl={inviteUrl}
            inviteCopied={inviteCopied}
            onCopy={handleCopyInviteLink}
            isCreator={isCreator}
            isStarting={isStartingGame}
            onStart={() => void handleStartGame()}
            onCancelGame={() => setCancelConfirmOpen(true)}
            currentUserId={currentUserId}
          />
        )}

        {/* Drafting / completed: main + side columns */}
        {gameState.status !== 'setup' && gameState.status !== 'cancelled' && (
          <XStack gap="$4" flexWrap="wrap" alignItems="flex-start">
            <YStack flex={2} flexBasis={420} minWidth={300} gap="$4">
              {gameState.status === 'drafting' && isMyTurn && (
                <DraftPickPanel
                  gameState={gameState}
                  currentPlayer={currentPlayer}
                  isCareerTeamMode={isCareerTeamMode}
                  isMostTeamsMode={isMostTeamsMode}
                  isPitcherDraft={isPitcherDraft}
                  statKeyShort={statKeyShort}
                  statLabelLong={statLabelLong}
                  playerSearch={playerSearch}
                  setPlayerSearch={setPlayerSearch}
                  playerSuggestions={playerSuggestions}
                  statsLoadingPlayerIds={statsLoadingPlayerIds}
                  onSelectPlayer={(player) => {
                    setSelectedPlayer(player);
                    setSelectedOption('');
                    setPlayerSearch(`${player.firstName} ${player.lastName}`);
                    if (gameState && !isMostTeamsMode) {
                      void fetchPlayerOptions({
                        variables: {
                          playerId: player.id,
                          gameMode: gameState.gameMode,
                          playerType: gameState.playerType,
                        },
                      });
                    }
                    if (!player.statsLastFetchedAt) {
                      void handleTriggerStatLoading(player);
                    }
                  }}
                  selectedPlayer={selectedPlayer}
                  playerOptions={playerOptions}
                  optionsLoading={optionsLoading}
                  selectedOption={selectedOption}
                  setSelectedOption={setSelectedOption}
                  selectedSlotId={selectedSlotId}
                  onSelectSlot={(slot) => {
                    setSelectedSlotId(slot.id);
                    setSelectedPosition(slot.position);
                  }}
                  previewStatValue={previewStatValue}
                  submitting={submitting}
                  canSubmit={
                    !!selectedPlayer &&
                    !!selectedSlotId &&
                    (isMostTeamsMode || !!selectedOption) &&
                    !submitting &&
                    !(
                      selectedPlayer &&
                      statsLoadingPlayerIds.has(selectedPlayer.id)
                    )
                  }
                  onConfirm={() => void makePick()}
                />
              )}
              {gameState.status === 'drafting' && !isMyTurn && (
                <WaitingPanel activeName={currentPlayer?.playerName ?? '—'} />
              )}

              <RostersCard
                gameState={gameState}
                statKeyShort={statKeyShort}
                isMostTeamsMode={isMostTeamsMode}
                isCareerTeamMode={isCareerTeamMode}
                meId={meAsPlayer?.id}
              />
            </YStack>

            <YStack flex={1} flexBasis={280} minWidth={260} gap="$4">
              <ScoreboardCard
                gameState={gameState}
                statKeyShort={statKeyShort}
                meId={meAsPlayer?.id}
              />
              <HistoryCard
                gameState={gameState}
                statKeyShort={statKeyShort}
                isMostTeamsMode={isMostTeamsMode}
                isCareerTeamMode={isCareerTeamMode}
                meName={meAsPlayer?.playerName}
              />

              {gameState.status === 'drafting' && isCreator && (
                <Button
                  variant="outlined"
                  borderColor="$brandSeamRed"
                  color="$brandSeamRedLight"
                  onPress={() => setCancelConfirmOpen(true)}
                >
                  Cancel Game
                </Button>
              )}
            </YStack>
          </XStack>
        )}
      </YStack>
    </ScrollView>
  );
};

// ── Setup phase ──────────────────────────────────────────────────────────────

interface SetupPanelProps {
  gameState: GameState;
  inviteUrl: string;
  inviteCopied: boolean;
  onCopy: () => void;
  isCreator: boolean;
  isStarting: boolean;
  onStart: () => void;
  onCancelGame: () => void;
  currentUserId: number;
}

function SetupPanel({
  gameState,
  inviteUrl,
  inviteCopied,
  onCopy,
  isCreator,
  isStarting,
  onStart,
  onCancelGame,
  currentUserId,
}: SetupPanelProps): React.JSX.Element {
  const seats = Array.from({ length: 6 }).map((_, i) => gameState.players[i]);

  return (
    <YStack
      backgroundColor="$surfaceCard"
      borderRadius="$4"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      padding="$5"
      gap="$4"
    >
      <Eyebrow>Invite Link</Eyebrow>
      {gameState.inviteCode ? (
        <XStack
          gap="$2"
          padding="$3"
          borderRadius="$3"
          backgroundColor="$background"
          borderWidth={1}
          borderColor="$surfacePanelBorder"
          borderStyle="dashed"
          alignItems="center"
          flexWrap="wrap"
        >
          <Text
            flex={1}
            color="$brandGoldLight"
            fontFamily="$mono"
            fontSize={13}
            numberOfLines={1}
          >
            {inviteUrl || `/games/season-draft/join/${gameState.inviteCode}`}
          </Text>
          <Button
            size="$3"
            backgroundColor={inviteCopied ? '$green9' : '$brandNavyLight'}
            color="$color"
            onPress={onCopy}
          >
            {inviteCopied ? '✓ Copied!' : 'Copy Link'}
          </Button>
        </XStack>
      ) : (
        <Text color="$textMuted" fontSize={13}>
          Invite code unavailable.
        </Text>
      )}
      <Paragraph color="$textMuted">
        Share the link above. Draft starts when you're ready — minimum 2
        players.
      </Paragraph>

      <XStack flexWrap="wrap" gap="$2">
        {seats.map((p, i) => {
          const isMe = p?.userId === currentUserId;
          return (
            <YStack
              key={p?.id ?? `empty-${i}`}
              alignItems="center"
              gap="$1"
              width={88}
              padding="$2"
              borderRadius="$3"
              borderWidth={1}
              borderStyle={p ? undefined : 'dashed'}
              borderColor={p ? '$surfacePanelBorder' : '$surfacePanelBorder'}
              backgroundColor={p ? '$background' : 'transparent'}
            >
              <Circle
                size={36}
                backgroundColor={
                  p
                    ? isMe
                      ? '$brandGold'
                      : '$surfacePanelBorder'
                    : 'transparent'
                }
                borderWidth={p ? 0 : 1}
                borderColor="$surfacePanelBorder"
                borderStyle={p ? undefined : 'dashed'}
              >
                <Text
                  fontWeight="800"
                  color={p ? (isMe ? '$brandNavy' : '$color') : '$textMuted'}
                >
                  {p ? p.playerName.charAt(0).toUpperCase() : '+'}
                </Text>
              </Circle>
              <Text
                fontSize={11}
                color="$textMuted"
                numberOfLines={1}
                textAlign="center"
              >
                {p ? (isMe ? 'You' : p.playerName) : 'Open'}
              </Text>
              {i === 0 && p && (
                <Stack
                  paddingHorizontal="$1.5"
                  paddingVertical="$0.5"
                  borderRadius={999}
                  backgroundColor={withAlpha(BRAND_GOLD, 0.18)}
                >
                  <Text
                    fontSize={9}
                    color="$brandGoldLight"
                    fontWeight="800"
                    letterSpacing={1}
                  >
                    HOST
                  </Text>
                </Stack>
              )}
            </YStack>
          );
        })}
      </XStack>

      {isCreator && gameState.players.length < 2 && (
        <Text color="$brandGoldLight" fontSize={13}>
          You need at least 2 players to start the draft.
        </Text>
      )}
      {!isCreator && (
        <Text color="$textMuted" fontSize={13}>
          Waiting for the game creator to start the draft.
        </Text>
      )}

      {isCreator && (
        <XStack gap="$2" justifyContent="flex-end">
          <Button
            variant="outlined"
            borderColor="$brandSeamRed"
            color="$brandSeamRedLight"
            onPress={onCancelGame}
          >
            Cancel Game
          </Button>
          <Button
            size="$4"
            backgroundColor="$brandGold"
            color="$brandNavy"
            fontWeight="800"
            disabled={isStarting || gameState.players.length < 2}
            opacity={isStarting || gameState.players.length < 2 ? 0.5 : 1}
            onPress={onStart}
            pressStyle={{ backgroundColor: '$brandGoldDark' }}
          >
            {isStarting ? 'Starting…' : 'Start Draft →'}
          </Button>
        </XStack>
      )}
    </YStack>
  );
}

// ── Pick UI ─────────────────────────────────────────────────────────────────

interface DraftPickPanelProps {
  gameState: GameState;
  currentPlayer: GamePlayer | undefined;
  isCareerTeamMode: boolean;
  isMostTeamsMode: boolean;
  isPitcherDraft: boolean;
  statKeyShort: string;
  statLabelLong: string;
  playerSearch: string;
  setPlayerSearch: (s: string) => void;
  playerSuggestions: Player[];
  statsLoadingPlayerIds: Set<number>;
  onSelectPlayer: (p: Player) => void;
  selectedPlayer: Player | null;
  playerOptions: string[];
  optionsLoading: boolean;
  selectedOption: string;
  setSelectedOption: (o: string) => void;
  selectedSlotId: number | null;
  onSelectSlot: (slot: RosterSlot) => void;
  previewStatValue: number | null;
  submitting: boolean;
  canSubmit: boolean;
  onConfirm: () => void;
}

function DraftPickPanel({
  currentPlayer,
  isCareerTeamMode,
  isMostTeamsMode,
  isPitcherDraft,
  statKeyShort,
  statLabelLong,
  playerSearch,
  setPlayerSearch,
  playerSuggestions,
  statsLoadingPlayerIds,
  onSelectPlayer,
  selectedPlayer,
  playerOptions,
  optionsLoading,
  selectedOption,
  setSelectedOption,
  selectedSlotId,
  onSelectSlot,
  previewStatValue,
  submitting,
  canSubmit,
  onConfirm,
}: DraftPickPanelProps): React.JSX.Element {
  const openSlots = (currentPlayer?.roster ?? []).filter((s) => !s.isFilled);

  return (
    <YStack
      backgroundColor="$surfaceCard"
      borderRadius="$4"
      borderWidth={1}
      borderColor="$brandGold"
      padding="$5"
      gap="$4"
    >
      <YStack gap="$1">
        <Stack
          data-testid="your-turn-badge"
          alignSelf="flex-start"
          paddingHorizontal="$2"
          paddingVertical="$1"
          borderRadius={999}
          backgroundColor={withAlpha(BRAND_GOLD, 0.18)}
        >
          <Text
            fontSize={11}
            color="$brandGoldLight"
            fontWeight="800"
            letterSpacing={1.4}
            textTransform="uppercase"
          >
            Your Turn
          </Text>
        </Stack>
        <H1 color="$color" fontSize={26} fontWeight="800">
          Make your pick.
        </H1>
      </YStack>

      <Step n="1">
        <FieldLabel>
          {`Find a ${isPitcherDraft ? 'Pitcher' : 'Hitter'}`}
        </FieldLabel>
        <Input
          value={playerSearch}
          onChangeText={(t: string) => {
            setPlayerSearch(t);
          }}
          placeholder="Search player name…"
          size="$4"
          backgroundColor="$background"
          borderColor="$surfacePanelBorder"
        />
        {playerSuggestions.length > 0 && !selectedPlayer && (
          <YStack
            marginTop="$2"
            backgroundColor="$background"
            borderWidth={1}
            borderColor="$surfacePanelBorder"
            borderRadius="$3"
            maxHeight={240}
            overflow="hidden"
          >
            <ScrollView>
              {playerSuggestions.map((p) => {
                const isLoading = statsLoadingPlayerIds.has(p.id);
                const needsStats = !p.statsLastFetchedAt;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => onSelectPlayer(p)}
                    accessibilityRole="button"
                  >
                    <XStack
                      padding="$3"
                      gap="$2"
                      alignItems="center"
                      justifyContent="space-between"
                      borderBottomWidth={1}
                      borderBottomColor="$surfacePanelBorder"
                    >
                      <XStack gap="$2" alignItems="center" flex={1}>
                        <Circle size={28} backgroundColor="$surfacePanelBorder">
                          <Text fontSize={12} fontWeight="800" color="$color">
                            {p.firstName.charAt(0).toUpperCase()}
                          </Text>
                        </Circle>
                        <Text color="$color" fontWeight="700">
                          {p.firstName} {p.lastName}
                        </Text>
                      </XStack>
                      {isLoading && (
                        <XStack gap="$1" alignItems="center">
                          <Spinner size="small" color="$brandGoldLight" />
                          <Text fontSize={11} color="$brandGoldLight">
                            Loading…
                          </Text>
                        </XStack>
                      )}
                      {needsStats && !isLoading && (
                        <Text fontSize={11} color="$textMuted">
                          Stats not loaded
                        </Text>
                      )}
                    </XStack>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </YStack>
        )}
        {selectedPlayer && statsLoadingPlayerIds.has(selectedPlayer.id) && (
          <XStack
            marginTop="$2"
            padding="$2"
            gap="$2"
            alignItems="center"
            borderRadius="$3"
            backgroundColor={withAlpha(BRAND_GOLD, 0.12)}
            borderWidth={1}
            borderColor={withAlpha(BRAND_GOLD, 0.3)}
          >
            <Spinner size="small" color="$brandGoldLight" />
            <Text color="$brandGoldLight" fontSize={13}>
              Loading stats for {selectedPlayer.firstName}{' '}
              {selectedPlayer.lastName}…
            </Text>
          </XStack>
        )}
      </Step>

      {selectedPlayer && !isMostTeamsMode && (
        <Step n="2">
          <FieldLabel>
            {isCareerTeamMode ? 'Choose a Team' : 'Choose a Season'}
          </FieldLabel>
          {playerOptions.length === 0 ? (
            <Text color="$textMuted" fontSize={13}>
              {optionsLoading
                ? 'Loading options…'
                : statsLoadingPlayerIds.has(selectedPlayer.id)
                  ? 'Loading stats — options will appear once stats are loaded'
                  : 'No stats available for this player'}
            </Text>
          ) : (
            <XStack flexWrap="wrap" gap="$2">
              {playerOptions.map((option) => (
                <PillButton
                  key={option}
                  active={selectedOption === option}
                  onPress={() => setSelectedOption(option)}
                >
                  {option}
                </PillButton>
              ))}
            </XStack>
          )}
        </Step>
      )}

      {selectedPlayer && (isMostTeamsMode || selectedOption) && (
        <Step n={isMostTeamsMode ? '2' : '3'}>
          <FieldLabel>
            {isPitcherDraft ? 'Assign Slot' : 'Assign Position'}
          </FieldLabel>
          <XStack flexWrap="wrap" gap="$2">
            {openSlots.map((slot) => {
              const label =
                slot.slotNumber > 0
                  ? `${slot.position} ${slot.slotNumber + 1}`
                  : slot.position;
              return (
                <PillButton
                  key={slot.id}
                  active={selectedSlotId === slot.id}
                  onPress={() => onSelectSlot(slot)}
                >
                  {label}
                </PillButton>
              );
            })}
          </XStack>
        </Step>
      )}

      {selectedPlayer && previewStatValue !== null && (
        <XStack
          padding="$3"
          borderRadius="$3"
          backgroundColor={withAlpha(BRAND_GOLD, 0.1)}
          borderWidth={1}
          borderColor={withAlpha(BRAND_GOLD, 0.4)}
          alignItems="center"
          justifyContent="space-between"
          gap="$3"
        >
          <YStack flex={1}>
            <Eyebrow color="$brandGoldLight">Preview Pick</Eyebrow>
            <Text color="$color" fontWeight="800" fontSize={18}>
              {selectedPlayer.firstName} {selectedPlayer.lastName}
            </Text>
            <Text color="$textMuted" fontSize={13}>
              {selectedOption ? `${selectedOption} · ` : ''}
              {selectedSlotId ? `slot selected` : 'choose a slot'}
            </Text>
            {previewStatValue === 0 && (
              <Text fontSize={11} color="$brandSeamRedLight" marginTop="$1">
                Warning: stat value is 0 for this selection.
              </Text>
            )}
          </YStack>
          <YStack alignItems="flex-end">
            <Text color="$brandGoldLight" fontWeight="800" fontSize={28}>
              +{previewStatValue}
            </Text>
            <Text color="$textMuted" fontSize={11} letterSpacing={1.4}>
              {statKeyShort}
            </Text>
          </YStack>
        </XStack>
      )}

      <Button
        size="$4"
        backgroundColor="$brandGold"
        color="$brandNavy"
        fontWeight="800"
        disabled={!canSubmit}
        opacity={canSubmit ? 1 : 0.5}
        onPress={onConfirm}
        pressStyle={{ backgroundColor: '$brandGoldDark' }}
      >
        {submitting ? 'Locking Pick…' : `Confirm Pick · ${statLabelLong}`}
      </Button>
    </YStack>
  );
}

// ── Waiting ─────────────────────────────────────────────────────────────────

function WaitingPanel({
  activeName,
}: {
  activeName: string;
}): React.JSX.Element {
  return (
    <YStack
      backgroundColor="$surfaceCard"
      borderRadius="$4"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      padding="$5"
      gap="$2"
      alignItems="center"
    >
      <Spinner size="large" color="$brandGoldLight" />
      <Eyebrow>Waiting</Eyebrow>
      <H3 color="$color">{activeName} is picking…</H3>
      <Paragraph color="$textMuted" textAlign="center">
        You'll be up next. In the meantime, scout who's left on the board.
      </Paragraph>
    </YStack>
  );
}

// ── Rosters ─────────────────────────────────────────────────────────────────

interface RostersCardProps {
  gameState: GameState;
  statKeyShort: string;
  isMostTeamsMode: boolean;
  isCareerTeamMode: boolean;
  meId: number | undefined;
}

function RostersCard({
  gameState,
  statKeyShort,
  isMostTeamsMode,
  isCareerTeamMode,
  meId,
}: RostersCardProps): React.JSX.Element {
  return (
    <YStack
      backgroundColor="$surfaceCard"
      borderRadius="$4"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      padding="$4"
      gap="$3"
    >
      <CardHead
        title="Rosters"
        trailing={`${gameState.players.length} teams`}
      />
      <YStack gap="$3">
        {gameState.players.map((p) => {
          const isMe = p.id === meId;
          return (
            <YStack
              key={p.id}
              padding="$3"
              borderRadius="$3"
              borderWidth={1}
              borderColor={isMe ? '$brandGold' : '$surfacePanelBorder'}
              backgroundColor={
                isMe ? withAlpha(BRAND_GOLD, 0.06) : '$background'
              }
              gap="$2"
            >
              <XStack justifyContent="space-between" alignItems="center">
                <Text fontWeight="800" color="$color">
                  {isMe ? 'You' : p.playerName}
                </Text>
                <Text color="$brandGoldLight" fontWeight="800">
                  {p.totalScore}{' '}
                  <Text color="$textMuted" fontWeight="600" fontSize={11}>
                    {statKeyShort}
                  </Text>
                </Text>
              </XStack>
              <YStack gap="$1">
                {p.roster.map((slot) => {
                  const label =
                    slot.slotNumber > 0
                      ? `${slot.position} ${slot.slotNumber + 1}`
                      : slot.position;
                  return (
                    <XStack
                      key={slot.id}
                      gap="$2"
                      alignItems="center"
                      paddingVertical="$1.5"
                      paddingHorizontal="$2"
                      borderRadius="$2"
                      backgroundColor={
                        slot.isFilled ? '$surfaceCard' : 'transparent'
                      }
                    >
                      <Stack
                        minWidth={36}
                        paddingHorizontal="$1.5"
                        paddingVertical="$0.5"
                        borderRadius="$2"
                        backgroundColor={
                          slot.isFilled
                            ? withAlpha(BRAND_GOLD, 0.18)
                            : '$surfacePanelBorder'
                        }
                      >
                        <Text
                          fontSize={11}
                          color={
                            slot.isFilled ? '$brandGoldLight' : '$textMuted'
                          }
                          fontWeight="800"
                          textAlign="center"
                          letterSpacing={1}
                        >
                          {label}
                        </Text>
                      </Stack>
                      {slot.pick ? (
                        <XStack
                          flex={1}
                          justifyContent="space-between"
                          gap="$2"
                        >
                          <YStack flex={1}>
                            <Text color="$color" numberOfLines={1}>
                              {slot.pick.playerName}
                            </Text>
                            <Text color="$textMuted" fontSize={11}>
                              {isMostTeamsMode
                                ? ''
                                : isCareerTeamMode && slot.pick.team
                                  ? slot.pick.team
                                  : slot.pick.season}
                            </Text>
                          </YStack>
                          <Text color="$color" fontWeight="700">
                            {slot.pick.statValue}
                          </Text>
                        </XStack>
                      ) : (
                        <Text
                          color="$textMuted"
                          fontStyle="italic"
                          fontSize={12}
                        >
                          Empty
                        </Text>
                      )}
                    </XStack>
                  );
                })}
              </YStack>
            </YStack>
          );
        })}
      </YStack>
    </YStack>
  );
}

// ── Scoreboard ──────────────────────────────────────────────────────────────

interface ScoreboardProps {
  gameState: GameState;
  statKeyShort: string;
  meId: number | undefined;
}

function ScoreboardCard({
  gameState,
  statKeyShort,
  meId,
}: ScoreboardProps): React.JSX.Element {
  const sorted = [...gameState.players].sort(
    (a, b) => b.totalScore - a.totalScore,
  );
  const max = sorted[0]?.totalScore ?? 1;
  return (
    <YStack
      backgroundColor="$surfaceCard"
      borderRadius="$4"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      padding="$4"
      gap="$3"
    >
      <CardHead title="Scoreboard" trailing="Live" />
      <YStack gap="$2">
        {sorted.map((p, i) => {
          const isMe = p.id === meId;
          const pct = max > 0 ? (p.totalScore / max) * 100 : 0;
          return (
            <XStack
              key={p.id}
              alignItems="center"
              gap="$2"
              padding="$2"
              borderRadius="$2"
              backgroundColor={
                isMe ? withAlpha(BRAND_GOLD, 0.1) : 'transparent'
              }
            >
              <Text
                color={i === 0 ? '$brandGoldLight' : '$textMuted'}
                fontWeight="800"
                width={18}
              >
                {i + 1}
              </Text>
              <Text color="$color" fontWeight="700" flex={1}>
                {isMe ? 'You' : p.playerName}
              </Text>
              <YStack flex={1.2} gap="$1">
                <Stack
                  height={3}
                  borderRadius={999}
                  backgroundColor="$surfacePanelBorder"
                  overflow="hidden"
                >
                  <Stack
                    height="100%"
                    width={`${Math.max(2, pct)}%`}
                    backgroundColor={i === 0 ? '$brandGold' : '$brandNavyLight'}
                  />
                </Stack>
              </YStack>
              <Text
                color="$color"
                fontWeight="800"
                minWidth={36}
                textAlign="right"
              >
                {p.totalScore}
              </Text>
              <Text color="$textMuted" fontSize={11}>
                {statKeyShort}
              </Text>
            </XStack>
          );
        })}
      </YStack>
    </YStack>
  );
}

// ── History ─────────────────────────────────────────────────────────────────

interface HistoryProps {
  gameState: GameState;
  statKeyShort: string;
  isMostTeamsMode: boolean;
  isCareerTeamMode: boolean;
  meName: string | undefined;
}

function HistoryCard({
  gameState,
  statKeyShort,
  isMostTeamsMode,
  isCareerTeamMode,
  meName,
}: HistoryProps): React.JSX.Element {
  const recent = [...gameState.picks].slice().reverse().slice(0, 8);
  return (
    <YStack
      backgroundColor="$surfaceCard"
      borderRadius="$4"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      padding="$4"
      gap="$3"
    >
      <CardHead title="Picks" trailing={`${gameState.picks.length} made`} />
      <YStack gap="$2">
        {recent.length === 0 && (
          <Text color="$textMuted" fontStyle="italic" fontSize={13}>
            No picks yet
          </Text>
        )}
        {recent.map((h) => {
          const isMe = meName != null && h.playerName === meName;
          return (
            <XStack
              key={h.pickNumber}
              alignItems="center"
              gap="$2"
              padding="$2"
              borderRadius="$2"
              backgroundColor={
                isMe ? withAlpha(BRAND_GOLD, 0.1) : 'transparent'
              }
            >
              <Text color="$textMuted" fontWeight="800" width={28}>
                {String(h.pickNumber + 1).padStart(2, '0')}
              </Text>
              <YStack flex={1}>
                <Text color="$color" fontWeight="700" numberOfLines={1}>
                  {h.baseballPlayerName}
                </Text>
                <Text color="$textMuted" fontSize={11} numberOfLines={1}>
                  {isMe ? 'You' : h.playerName} ·{' '}
                  {isMostTeamsMode
                    ? '—'
                    : isCareerTeamMode && h.team
                      ? h.team
                      : h.season}{' '}
                  · {h.position}
                </Text>
              </YStack>
              <Text color="$brandGoldLight" fontWeight="800">
                +{h.statValue}{' '}
                <Text color="$textMuted" fontWeight="600" fontSize={10}>
                  {statKeyShort}
                </Text>
              </Text>
            </XStack>
          );
        })}
      </YStack>
    </YStack>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function Eyebrow({
  children,
  color = '$textMuted',
}: {
  children: React.ReactNode;
  color?: string;
}): React.JSX.Element {
  return (
    <Text
      fontSize={11}
      letterSpacing={1.6}
      textTransform="uppercase"
      color={color}
      fontWeight="700"
    >
      {children}
    </Text>
  );
}

function StatChip({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Stack
      paddingHorizontal="$2"
      paddingVertical="$1"
      backgroundColor={withAlpha(BRAND_GOLD, 0.14)}
      borderWidth={1}
      borderColor={withAlpha(BRAND_GOLD, 0.4)}
      borderRadius="$2"
    >
      <Text
        fontSize={11}
        color="$brandGoldLight"
        fontWeight="800"
        letterSpacing={1}
      >
        {children}
      </Text>
    </Stack>
  );
}

function FieldLabel({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Text
      fontSize={11}
      color="$textMuted"
      letterSpacing={1.4}
      textTransform="uppercase"
      fontWeight="700"
    >
      {children}
    </Text>
  );
}

function Step({
  n,
  children,
}: {
  n: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <XStack gap="$3" alignItems="flex-start">
      <Circle size={26} backgroundColor="$brandGold">
        <Text fontWeight="800" color="$brandNavy" fontSize={13}>
          {n}
        </Text>
      </Circle>
      <YStack flex={1} gap="$2">
        {children}
      </YStack>
    </XStack>
  );
}

function PillButton({
  active,
  onPress,
  children,
}: {
  active: boolean;
  onPress: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Button
      size="$3"
      backgroundColor={active ? '$brandGold' : 'transparent'}
      color={active ? '$brandNavy' : '$color'}
      borderWidth={1}
      borderColor={active ? '$brandGold' : '$surfacePanelBorder'}
      fontWeight="800"
      onPress={onPress}
      hoverStyle={{ borderColor: '$brandGoldLight' }}
    >
      {children}
    </Button>
  );
}

interface PickDeadlineCountdownProps {
  deadline: string;
  totalSeconds: number;
}

function PickDeadlineCountdown({
  deadline,
  totalSeconds,
}: PickDeadlineCountdownProps): React.JSX.Element {
  const [remaining, setRemaining] = useState(() => {
    const end = new Date(deadline).getTime();
    return Math.max(0, Math.ceil((end - Date.now()) / 1000));
  });

  useEffect(() => {
    const tick = () => {
      const end = new Date(deadline).getTime();
      setRemaining(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    };
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline]);

  const pct = totalSeconds > 0 ? Math.min(1, remaining / totalSeconds) : 0;
  const isLow = remaining <= 10;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const label = `${mins}:${String(secs).padStart(2, '0')}`;

  return (
    <YStack gap="$1" marginTop="$1">
      <Text
        fontSize={18}
        fontWeight="800"
        color={isLow ? '$brandSeamRedLight' : '$textMuted'}
      >
        {label}
      </Text>
      <Stack
        height={3}
        borderRadius={999}
        backgroundColor="$surfacePanelBorder"
        overflow="hidden"
      >
        <Stack
          height="100%"
          width={`${Math.max(0, Math.round(pct * 100))}%`}
          backgroundColor={isLow ? '$brandSeamRed' : '$brandGold'}
        />
      </Stack>
    </YStack>
  );
}

function CardHead({
  title,
  trailing,
}: {
  title: string;
  trailing?: string;
}): React.JSX.Element {
  return (
    <XStack alignItems="baseline" justifyContent="space-between" gap="$2">
      <Text fontSize={16} fontWeight="800" color="$color">
        {title}
      </Text>
      {trailing && (
        <Text fontSize={11} color="$textMuted" letterSpacing={1.2}>
          {trailing}
        </Text>
      )}
    </XStack>
  );
}

export default SeasonDraftGame;
