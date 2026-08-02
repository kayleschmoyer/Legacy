import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { Input, ScrollView, Spinner, Text, XStack, YStack } from 'tamagui';
import type { DraftChatRenderer } from './DraftChatOverlay';
import type { DraftPickRecord, DraftPlayer, LeagueTeam } from './types';
import { getPositionColor } from './utils';
import {
  useDraftActions,
  useDraftEffects,
  useDraftQueries,
  useDraftTimer,
  useDraftUIState,
  useDraftWebSocket,
  usePlayerData,
} from './hooks';
import { DraftClockRing } from './DraftClockRing.native';
import { DraftMiniBoard } from './DraftMiniBoard.native';
import { DraftPickAnnouncement } from './DraftPickAnnouncement.native';
import { DraftSquadStrip } from './DraftSquadStrip.native';
import { useDraftPalette } from './nativeDraftPalette';
import {
  MIN_BOARD_ROUNDS,
  resolveBoardRounds,
  statLineFor,
} from './nativeDraftBoard';
import { useAuth } from '../../features/auth';
import { PositionBadge } from '../../components/PositionBadge';
import { withAlpha } from '../../utils/colors';
import { hasErrorCode } from '../../utils/graphql-errors';

const POSITION_FILTERS = [
  'ALL',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'OF',
  'SP',
  'RP',
  'DH',
] as const;

type SortKey = 'adp' | 'pts';

// ---------------------------------------------------------------------------
// Props (same interface as the web version)
// ---------------------------------------------------------------------------
export interface EliteDraftBoardScreenProps {
  leagueId: number | null;
  onNavigate: (path: string) => void;
  websocketUrl: string;
  /** Auth token for WebSocket authentication. */
  websocketToken?: string;
  /**
   * Chat renderer — web-only. Native does not render an inline chat panel
   * (the mobile UX uses a separate chat screen accessible from the league tab).
   */
  renderChat?: DraftChatRenderer;
}

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

/** Uppercase, wide-tracked label used above every headline on this screen. */
function Eyebrow({
  children,
  color = '$fg4',
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <Text
      fontSize={9.5}
      fontWeight="700"
      letterSpacing={2}
      textTransform="uppercase"
      color={color}
    >
      {children}
    </Text>
  );
}

/** The gold lozenge used for every primary action on the draft surfaces. */
function GoldButton({
  label,
  onPress,
  disabled,
  size = 'lg',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  size?: 'lg' | 'sm';
}) {
  const large = size === 'lg';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
    >
      <YStack
        backgroundColor="$brandGold"
        borderRadius={999}
        paddingVertical={large ? 15 : 8}
        paddingHorizontal={large ? 34 : 12}
        opacity={disabled ? 0.55 : 1}
      >
        <Text
          fontFamily="$heading"
          fontSize={large ? 19 : 11.5}
          fontWeight="800"
          letterSpacing={large ? 1.5 : 0.5}
          color="$textOnAccent"
        >
          {label}
        </Text>
      </YStack>
    </Pressable>
  );
}

function CenteredMessage({
  icon,
  title,
  description,
  buttonText,
  onPress,
}: {
  icon: string;
  title: string;
  description: string;
  buttonText?: string;
  onPress?: () => void;
}) {
  return (
    <YStack
      flex={1}
      backgroundColor="$background"
      justifyContent="center"
      alignItems="center"
      padding="$6"
      gap="$3"
    >
      <Text fontSize={48} accessibilityRole="image" accessibilityLabel={title}>
        {icon}
      </Text>
      <Text
        fontFamily="$heading"
        fontSize={28}
        fontWeight="800"
        color="$color"
        textAlign="center"
      >
        {title.toUpperCase()}
      </Text>
      <Text
        color="$textMuted"
        textAlign="center"
        fontSize={13.5}
        maxWidth={300}
      >
        {description}
      </Text>
      {buttonText && onPress && (
        <GoldButton label={buttonText.toUpperCase()} onPress={onPress} />
      )}
    </YStack>
  );
}

/** Outlined, low-emphasis action (Back to League, commissioner toggles). */
function GhostButton({
  label,
  onPress,
  tone = 'neutral',
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone?: 'neutral' | 'active';
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
    >
      <YStack
        borderWidth={1}
        borderRadius={999}
        paddingVertical={7}
        paddingHorizontal={13}
        opacity={disabled ? 0.55 : 1}
        borderColor={tone === 'active' ? '$brandGold' : '$outlineDefault'}
        backgroundColor={tone === 'active' ? '$accentMuted' : 'transparent'}
      >
        <Text
          fontSize={11}
          fontWeight="700"
          letterSpacing={0.5}
          color={tone === 'active' ? '$brandGoldLight' : '$textMuted'}
        >
          {label}
        </Text>
      </YStack>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Pre-Draft Lobby (native) — "THE BOARD IS SET"
// ---------------------------------------------------------------------------
function NativePreDraftLobby({
  league,
  leagueTeams,
  myTeamId,
  isCommissioner,
  onlineTeamIds,
  initError,
  initDraftLoading,
  onInitializeDraft,
}: {
  league:
    | { name?: string | null; draftStatus?: string | null }
    | null
    | undefined;
  leagueTeams: LeagueTeam[];
  myTeamId: number | null;
  isCommissioner: boolean;
  onlineTeamIds: ReadonlySet<string>;
  initError: string | null;
  initDraftLoading: boolean;
  onInitializeDraft: (order: 'snake' | 'linear') => Promise<void>;
}) {
  const palette = useDraftPalette();
  // Decorative teaser board: two rounds wide, a scattering of cells pre-lit so
  // the empty grid still reads as a draft board.
  const teaserColumns = Math.max(leagueTeams.length, 4);
  const teaser = Array.from(
    { length: teaserColumns * 2 },
    (_, i) => i % 3 === 1 || i % 7 === 4,
  );

  return (
    <ScrollView flex={1} backgroundColor="$background">
      <YStack padding="$4" alignItems="center" gap="$4">
        <XStack flexWrap="wrap" justifyContent="center" gap={3} maxWidth={260}>
          {teaser.map((lit, i) => (
            <YStack
              key={i}
              width={26}
              height={17}
              borderRadius={3}
              borderWidth={1}
              borderColor="$surfacePanelBorder"
              backgroundColor={
                lit ? withAlpha(palette.gold.gold, 0.35) : '$surfacePanel'
              }
            />
          ))}
        </XStack>

        <YStack alignItems="center" gap="$2">
          {league?.name && (
            <Eyebrow color="$brandGoldLight">{league.name}</Eyebrow>
          )}
          <Text
            fontFamily="$heading"
            fontSize={34}
            fontWeight="800"
            lineHeight={36}
            color="$color"
            textAlign="center"
          >
            THE BOARD{'\n'}IS SET
          </Text>
          <Text
            color="$textMuted"
            fontSize={13.5}
            textAlign="center"
            maxWidth={280}
          >
            {leagueTeams.length > 0
              ? `${leagueTeams.length} teams, one board. Watch it fill in live.`
              : 'One board, live picks. Teams are still joining.'}
          </Text>
          <Text color="$fg4" fontSize={12} textAlign="center">
            {leagueTeams.length < 2
              ? 'At least 2 teams are required to start a draft.'
              : isCommissioner
                ? 'You’re the commissioner — start when everyone’s in.'
                : 'Waiting for the commissioner to start the draft.'}
          </Text>
        </YStack>

        {isCommissioner && leagueTeams.length >= 2 && (
          <XStack gap="$3" flexWrap="wrap" justifyContent="center">
            <GoldButton
              label={initDraftLoading ? 'STARTING…' : 'START SNAKE DRAFT'}
              disabled={initDraftLoading}
              onPress={() => void onInitializeDraft('snake')}
            />
            <GhostButton
              label={initDraftLoading ? 'STARTING…' : 'LINEAR ORDER'}
              disabled={initDraftLoading}
              onPress={() => void onInitializeDraft('linear')}
            />
          </XStack>
        )}

        {initError && (
          <YStack
            width="100%"
            maxWidth={360}
            padding="$3"
            borderRadius={12}
            borderWidth={1}
            backgroundColor="$statusDangerBg"
            borderColor="$statusDangerBorder"
          >
            <Text color="$statusDangerFg" fontSize={13}>
              {initError}
            </Text>
          </YStack>
        )}

        {leagueTeams.length > 0 && (
          <YStack width="100%" maxWidth={360} gap="$2">
            <Eyebrow>Draft order · {leagueTeams.length} teams</Eyebrow>
            {leagueTeams.map((team, idx) => {
              const isMine = String(team.id) === String(myTeamId);
              return (
                <XStack
                  key={team.id}
                  alignItems="center"
                  gap="$2"
                  paddingVertical={9}
                  paddingHorizontal={12}
                  borderRadius={12}
                  borderWidth={1}
                  borderColor={isMine ? '$brandGold' : '$surfacePanelBorder'}
                  backgroundColor="$surfaceCard"
                >
                  <Text
                    fontFamily="$heading"
                    fontSize={14}
                    fontWeight="800"
                    color="$fg4"
                    width={22}
                  >
                    {idx + 1}
                  </Text>
                  <YStack
                    width={8}
                    height={8}
                    borderRadius={4}
                    backgroundColor={
                      onlineTeamIds.has(String(team.id))
                        ? '$statusSuccessFg'
                        : '$outlineDefault'
                    }
                  />
                  <Text
                    flex={1}
                    fontSize={14.5}
                    fontWeight="600"
                    numberOfLines={1}
                    color={isMine ? '$brandGoldLight' : '$color'}
                  >
                    {team.name}
                    {isMine ? ' (You)' : ''}
                  </Text>
                </XStack>
              );
            })}
          </YStack>
        )}
      </YStack>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Draft Complete (native) — "FINAL BOARD"
// ---------------------------------------------------------------------------
function NativeDraftComplete({
  league,
  leagueId,
  boardTeams,
  pickHistory,
  myTeamId,
  statsLookup,
  onNavigate,
}: {
  league: { isMockDraft?: boolean; name?: string } | null | undefined;
  leagueId: number | null;
  boardTeams: LeagueTeam[];
  pickHistory: DraftPickRecord[];
  myTeamId: number | null;
  statsLookup: Map<number, DraftPlayer>;
  onNavigate: (path: string) => void;
}) {
  const myPicks = useMemo(
    () =>
      myTeamId !== null ? pickHistory.filter((p) => p.teamId === myTeamId) : [],
    [pickHistory, myTeamId],
  );

  const rounds = resolveBoardRounds({
    teamCount: boardTeams.length,
    pickCount: pickHistory.length,
    currentRound: null,
    maxPickRound: pickHistory.reduce((max, p) => Math.max(max, p.round), 0),
  });

  return (
    <ScrollView flex={1} backgroundColor="$background">
      <YStack padding="$4" gap="$3">
        <YStack alignItems="center" marginTop="$2">
          <Text
            fontSize={44}
            accessibilityRole="image"
            accessibilityLabel="trophy"
          >
            🏆
          </Text>
          <Text
            fontFamily="$heading"
            fontSize={28}
            fontWeight="800"
            color="$brandGoldLight"
          >
            FINAL BOARD
          </Text>
          {league?.name && (
            <Text color="$textMuted" fontSize={13}>
              {league.name}
            </Text>
          )}
        </YStack>

        {boardTeams.length > 0 && (
          <YStack
            backgroundColor="$surfacePanel"
            borderWidth={1}
            borderColor="$surfacePanelBorder"
            borderRadius={12}
            padding="$3"
          >
            <DraftMiniBoard
              teams={boardTeams}
              picks={pickHistory}
              currentPickInfo={null}
              myTeamId={myTeamId}
              statsLookup={statsLookup}
              rounds={rounds}
            />
          </YStack>
        )}

        {myPicks.length > 0 && (
          <YStack gap="$2">
            <Eyebrow color="$brandGoldLight">
              Your haul · {myPicks.length} picks
            </Eyebrow>
            {myPicks.map((pick) => {
              const player = statsLookup.get(pick.playerId);
              const name = player
                ? player.name
                : pick.player
                  ? `${pick.player.firstName} ${pick.player.lastName}`
                  : `Player #${pick.playerId}`;
              const position = player?.position;
              return (
                <XStack
                  key={pick.id}
                  alignItems="center"
                  gap={11}
                  backgroundColor="$surfaceCard"
                  borderWidth={1}
                  borderColor="$surfacePanelBorder"
                  borderRadius={12}
                  paddingVertical={11}
                  paddingHorizontal={13}
                >
                  {position && (
                    <PositionBadge
                      position={position}
                      color={getPositionColor('baseball', position)}
                      alpha={0.14}
                      paddingHorizontal={8}
                      paddingVertical={3}
                      borderRadius={6}
                    />
                  )}
                  <YStack flex={1}>
                    <Text
                      fontWeight="600"
                      fontSize={14.5}
                      color="$color"
                      numberOfLines={1}
                    >
                      {name}
                    </Text>
                    <Text fontSize={11} color="$fg4">
                      Rd {pick.round} · Pick #{pick.overallPick}
                    </Text>
                  </YStack>
                  {player?.ppg != null && (
                    <Text
                      fontFamily="$heading"
                      fontSize={16}
                      fontWeight="700"
                      color="$brandGoldLight"
                    >
                      {player.ppg.toFixed(1)}
                    </Text>
                  )}
                </XStack>
              );
            })}
          </YStack>
        )}

        <YStack alignItems="center" marginTop="$2">
          <GhostButton
            label="BACK TO LEAGUE"
            onPress={() =>
              onNavigate(
                leagueId ? `/baseball/league/${leagueId}` : '/baseball',
              )
            }
          />
        </YStack>
      </YStack>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Player Row (native)
// ---------------------------------------------------------------------------
function PlayerRow({
  player,
  adp,
  canDraft,
  commPickMode,
  onDraft,
  onCommissionerPick,
}: {
  player: DraftPlayer;
  adp: number;
  canDraft: boolean;
  commPickMode: boolean;
  onDraft: (id: number) => void;
  onCommissionerPick: (id: number) => void;
}) {
  const posColor = getPositionColor('baseball', player.position);

  return (
    <XStack
      alignItems="center"
      gap={10}
      backgroundColor="$surfaceCard"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      borderRadius={12}
      paddingVertical={10}
      paddingHorizontal={13}
      marginBottom={7}
    >
      <PositionBadge
        position={player.position}
        color={posColor}
        alpha={0.14}
        paddingHorizontal={8}
        paddingVertical={3}
        borderRadius={6}
      />
      <YStack flex={1} minWidth={0}>
        <Text fontWeight="600" fontSize={15} color="$color" numberOfLines={1}>
          {player.name}
        </Text>
        <Text
          fontSize={11.5}
          color="$textMuted"
          marginTop={2}
          numberOfLines={1}
        >
          {statLineFor(player)}
        </Text>
      </YStack>
      <YStack alignItems="flex-end" flexShrink={0}>
        <Text
          fontFamily="$heading"
          fontSize={16}
          fontWeight="700"
          color="$brandGoldLight"
        >
          {player.ppg != null ? player.ppg.toFixed(1) : '—'}
        </Text>
        <Text fontSize={9} color="$fg4" letterSpacing={0.5}>
          ADP {adp}
        </Text>
      </YStack>
      {canDraft && (
        <GoldButton
          size="sm"
          label={commPickMode ? 'ASSIGN' : 'DRAFT'}
          onPress={() =>
            commPickMode ? onCommissionerPick(player.id) : onDraft(player.id)
          }
        />
      )}
    </XStack>
  );
}

// ---------------------------------------------------------------------------
// Main component (native)
// ---------------------------------------------------------------------------
export function EliteDraftBoardScreen({
  leagueId,
  onNavigate,
  websocketUrl,
  websocketToken,
}: EliteDraftBoardScreenProps): React.JSX.Element {
  const { user, token: authToken } = useAuth();
  const isAuthenticated = !!user;
  const palette = useDraftPalette();

  const [sortKey, setSortKey] = useState<SortKey>('adp');
  const [rosterOpen, setRosterOpen] = useState(false);

  const ui = useDraftUIState();

  const queries = useDraftQueries({
    leagueId,
    playerSearch: ui.playerSearch,
    selectedPosition: ui.selectedPosition,
    viewMode: ui.viewMode,
  });

  const isMyPick = Boolean(
    queries.currentPickInfo &&
    queries.currentPickTeamId !== null &&
    queries.myTeamId !== null &&
    queries.currentPickTeamId === queries.myTeamId &&
    !queries.currentPickInfo.isComplete,
  );

  const playerData = usePlayerData({
    availablePlayers: queries.availablePlayers,
    pickHistory: queries.pickHistory,
    playerStatsMap: queries.playerStatsMap,
    pitchingStatsMap: queries.pitchingStatsMap,
    myTeamId: queries.myTeamId,
  });

  const actions = useDraftActions({
    leagueId,
    draftId: queries.draftId,
    myTeamId: queries.myTeamId,
    isMyPick,
    draftPaused: ui.draftPaused,
    autoPickDisabled: ui.autoPickDisabled,
    leagueTeams: queries.leagueTeams,
    customDraftOrder: ui.customDraftOrder,
    queuedPlayerIds: queries.queuedPlayerIds,
    showToast: ui.showToast,
    setDraftPaused: ui.setDraftPaused,
    setDraftOrderMissing: ui.setDraftOrderMissing,
    setInitError: ui.setInitError,
    setAutoPickDisabled: ui.setAutoPickDisabled,
    setCommPickMode: ui.setCommPickMode,
    setUrgentMessage: ui.setUrgentMessage,
    refetchDraft: queries.refetchDraft,
    refetchLeague: queries.refetchLeague,
    refetchCurrentPick: queries.refetchCurrentPick,
    refetchPickHistory: queries.refetchPickHistory,
    refetchAvailablePlayers: queries.refetchAvailablePlayers,
    refetchQueue: queries.refetchQueue,
    refetchAutoPickStatuses: queries.refetchAutoPickStatuses,
    autoPickTeamIds: queries.autoPickTeamIds,
  });

  useDraftWebSocket({
    leagueId,
    draftId: queries.draftId,
    isAuthenticated,
    isAuctionDraft: queries.isAuctionDraft,
    myTeamId: queries.myTeamId,
    enrichedPlayers: playerData.enrichedPlayers,
    statsLookup: playerData.statsLookup,
    teamNameById: queries.teamNameById,
    notifiedPicksRef: ui.notifiedPicksRef,
    showAnnouncement: ui.showAnnouncement,
    showToast: ui.showToast,
    setDraftComplete: ui.setDraftComplete,
    setDraftPaused: ui.setDraftPaused,
    setPickDeadline: ui.setPickDeadline,
    setPickTimeLimitSeconds: ui.setPickTimeLimitSeconds,
    setLiveMessage: ui.setLiveMessage,
    setOnlineUserIds: ui.setOnlineUserIds,
    refetchDraft: queries.refetchDraft,
    refetchLeague: queries.refetchLeague,
    refetchCurrentPick: queries.refetchCurrentPick,
    refetchPickHistory: queries.refetchPickHistory,
    refetchAvailablePlayers: queries.refetchAvailablePlayers,
    refetchQueue: queries.refetchQueue,
    refetchAutoPickStatuses: queries.refetchAutoPickStatuses,
    websocketUrl,
    // LS-8108: mirror the LS-8067 web fix — fall back to the in-memory JWT
    // from useAuth when no explicit websocketToken prop is supplied. The
    // native consumer (apps/app DraftBoardPage) does not pass one, so without
    // this the draft socket defers forever and other open clients never
    // receive live pick pushes until a manual refetch.
    token: websocketToken ?? authToken ?? undefined,
  });

  const { timeRemaining } = useDraftTimer({
    draftId: queries.draftId,
    leagueId,
    draftComplete: ui.draftComplete,
    draftOrderMissing: ui.draftOrderMissing,
    draftPaused: ui.draftPaused,
    currentPickInfo: queries.currentPickInfo,
    pickDeadline: ui.pickDeadline,
    leagueDraft: queries.leagueDraft,
    setPickDeadline: ui.setPickDeadline,
    setPickTimeLimitSeconds: ui.setPickTimeLimitSeconds,
    setAutoPickDisabled: ui.setAutoPickDisabled,
    nudgeExpiredDraftPick: actions.nudgeExpiredDraftPick,
    refetchDraft: queries.refetchDraft,
    refetchCurrentPick: queries.refetchCurrentPick,
    refetchPickHistory: queries.refetchPickHistory,
    refetchAvailablePlayers: queries.refetchAvailablePlayers,
  });

  useDraftEffects({
    league: queries.league,
    leagueDraft: queries.leagueDraft,
    currentPickInfo: queries.currentPickInfo,
    currentPickErrorMessage: queries.currentPickErrorMessage,
    currentPickTeamId: queries.currentPickTeamId,
    isMyPick,
    draftOrderMissing: ui.draftOrderMissing,
    searchTerm: ui.searchTerm,
    teamNameById: queries.teamNameById,
    setDraftComplete: ui.setDraftComplete,
    setDraftPaused: ui.setDraftPaused,
    setDraftOrderMissing: ui.setDraftOrderMissing,
    setCurrentPickLoadError: ui.setCurrentPickLoadError,
    setInitError: ui.setInitError,
    setUrgentMessage: ui.setUrgentMessage,
    setLiveMessage: ui.setLiveMessage,
    setPlayerSearch: ui.setPlayerSearch,
  });

  // ---- Derived values ----
  const onlineTeamIds = useMemo<ReadonlySet<string>>(() => {
    const set = new Set<string>();
    for (const team of queries.leagueTeams) {
      if (team.managerId != null && ui.onlineUserIds.has(team.managerId)) {
        set.add(String(team.id));
      }
    }
    return set;
  }, [queries.leagueTeams, ui.onlineUserIds]);

  // boardOrderedTeams falls back to leagueTeams when the draft-order query is
  // skipped, so the board always has columns to render.
  const boardTeams =
    queries.boardOrderedTeams.length > 0
      ? queries.boardOrderedTeams
      : queries.leagueTeams;

  const boardRounds = resolveBoardRounds({
    teamCount: boardTeams.length,
    pickCount: queries.pickHistory.length,
    currentRound: queries.currentPickInfo?.round ?? null,
    maxPickRound: queries.pickHistory.reduce(
      (max, p) => Math.max(max, p.round),
      0,
    ),
  });

  const round =
    queries.currentPickInfo?.round ??
    Math.ceil(
      (queries.currentPickInfo?.overallPick ?? 1) /
        Math.max(queries.leagueTeams.length, 1),
    );
  const currentPick =
    queries.currentPickInfo?.overallPick ?? queries.pickHistory.length + 1;

  // ADP is the server's own ordering of the available pool, so capture it
  // before any client-side re-sort — otherwise the PTS sort renumbers it.
  const rankedPlayers = useMemo(
    () =>
      playerData.enrichedPlayers.map((player, index) => ({
        player,
        adp: index + 1,
      })),
    [playerData.enrichedPlayers],
  );
  const listedPlayers = useMemo(() => {
    if (sortKey === 'adp') return rankedPlayers;
    return [...rankedPlayers].sort(
      (a, b) => (b.player.ppg ?? 0) - (a.player.ppg ?? 0),
    );
  }, [rankedPlayers, sortKey]);

  // ---- Early returns for special states ----
  if (!leagueId) {
    return (
      <CenteredMessage
        icon="⚾"
        title="Live Draft Board"
        description="Navigate to a league and start a live draft from the commissioner panel."
        buttonText="Go to Leagues"
        onPress={() => onNavigate('/baseball')}
      />
    );
  }

  if (
    (queries.leagueLoading || queries.availablePlayersLoading) &&
    !queries.availablePlayersData &&
    !queries.leagueData
  ) {
    return (
      <YStack
        flex={1}
        backgroundColor="$background"
        justifyContent="center"
        alignItems="center"
      >
        <Spinner size="large" color="$brandGold" />
        <Text marginTop="$2" color="$textMuted">
          Setting the board…
        </Text>
      </YStack>
    );
  }

  if (
    !queries.leagueLoading &&
    !queries.league &&
    (queries.leagueError || queries.leagueData !== undefined)
  ) {
    const isUnauthorized =
      hasErrorCode(queries.leagueError, 'UNAUTHENTICATED') ||
      hasErrorCode(queries.leagueError, 'FORBIDDEN');
    return (
      <CenteredMessage
        icon={isUnauthorized ? '🔒' : '⚠️'}
        title={isUnauthorized ? 'Access Denied' : 'League Not Found'}
        description={
          isUnauthorized
            ? "You don't have access to this draft room."
            : "This league doesn't exist or the draft room is unavailable."
        }
        buttonText="Back to Leagues"
        onPress={() => onNavigate('/baseball')}
      />
    );
  }

  // The league itself loaded fine (e.g. it's still publicly viewable), but the
  // draft-scoped query came back FORBIDDEN — the user was removed from this
  // league after landing on the draft route. Without this check the board
  // silently rendered with no draft data instead of telling the user why
  // (LS-8863).
  if (hasErrorCode(queries.draftError, 'FORBIDDEN')) {
    return (
      <CenteredMessage
        icon="🔒"
        title="Access Denied"
        description="You don't have access to this draft room."
        buttonText="Back to Leagues"
        onPress={() => onNavigate('/baseball')}
      />
    );
  }

  if (queries.availablePlayersError) {
    return (
      <CenteredMessage
        icon="⚠️"
        title="Failed to Load Players"
        description={
          queries.availablePlayersError.message ||
          'An error occurred while fetching player data.'
        }
        buttonText="Try Again"
        onPress={() => void queries.refetchAvailablePlayers()}
      />
    );
  }

  if (ui.draftComplete || queries.currentPickInfo?.isComplete) {
    return (
      <NativeDraftComplete
        league={
          queries.league
            ? {
                isMockDraft: queries.league.isMockDraft ?? undefined,
                name: queries.league.name ?? undefined,
              }
            : null
        }
        leagueId={leagueId}
        boardTeams={boardTeams}
        pickHistory={queries.pickHistory}
        myTeamId={queries.myTeamId}
        statsLookup={playerData.statsLookup}
        onNavigate={onNavigate}
      />
    );
  }

  // Only render the live draft board when the draft is actively running or paused (LS-4085).
  if (
    queries.league?.draftStatus !== 'in-progress' &&
    queries.league?.draftStatus !== 'paused'
  ) {
    return (
      <NativePreDraftLobby
        league={queries.league}
        leagueTeams={boardTeams}
        myTeamId={queries.myTeamId}
        isCommissioner={queries.isCommissioner}
        onlineTeamIds={onlineTeamIds}
        initError={ui.initError}
        initDraftLoading={actions.initDraftLoading}
        onInitializeDraft={actions.handleInitializeDraft}
      />
    );
  }

  if (queries.isAuctionDraft) {
    return (
      <CenteredMessage
        icon="🏷️"
        title="Auction Draft"
        description="Auction drafts are not yet supported on mobile. Please use the web app to participate in this draft."
        buttonText="Back to League"
        onPress={() =>
          onNavigate(leagueId ? `/baseball/league/${leagueId}` : '/baseball')
        }
      />
    );
  }

  // ---- Main Live Draft UI ----
  const canCommissionerPick = ui.commPickMode && queries.isCommissioner;
  const canDraft = isMyPick || canCommissionerPick;
  const showCommissionerBar = queries.isCommissioner;

  return (
    <YStack flex={1} backgroundColor="$background">
      {/* ---- On the clock: team, countdown ring, and the board itself ---- */}
      <YStack
        paddingHorizontal="$3"
        paddingTop={10}
        paddingBottom={11}
        borderBottomWidth={1}
        backgroundColor={isMyPick ? '$surfaceRaised' : '$surfacePanel'}
        borderBottomColor={isMyPick ? '$brandGold' : '$outlineSubtle'}
      >
        <XStack
          justifyContent="space-between"
          alignItems="center"
          gap="$3"
          marginBottom={8}
        >
          <YStack flex={1} minWidth={0}>
            <Eyebrow color={isMyPick ? '$brandGoldLight' : '$fg4'}>
              {ui.draftPaused
                ? 'Draft paused'
                : isMyPick
                  ? 'You’re on the clock'
                  : 'On the clock'}
            </Eyebrow>
            <Text
              fontFamily="$heading"
              fontSize={19}
              fontWeight="800"
              letterSpacing={0.5}
              lineHeight={21}
              color="$color"
              numberOfLines={1}
            >
              {queries.teamNameById(queries.currentPickTeamId)}
            </Text>
            <Text fontSize={11} color="$fg4" marginTop={1}>
              Round {round} · Pick #{currentPick}
            </Text>
          </YStack>
          <DraftClockRing
            secondsRemaining={timeRemaining}
            totalSeconds={ui.pickTimeLimitSeconds}
            emphasize={isMyPick}
            paused={ui.draftPaused}
          />
        </XStack>

        <DraftMiniBoard
          teams={boardTeams}
          picks={queries.pickHistory}
          currentPickInfo={queries.currentPickInfo}
          myTeamId={queries.myTeamId}
          statsLookup={playerData.statsLookup}
          rounds={boardRounds}
        />
      </YStack>

      {/* ---- Commissioner controls ---- */}
      {showCommissionerBar && (
        <XStack
          gap="$2"
          paddingHorizontal="$3"
          paddingTop={8}
          alignItems="center"
        >
          {!ui.draftPaused ? (
            <GhostButton
              label="PAUSE"
              disabled={actions.pauseLoading}
              onPress={() => void actions.handlePauseDraft()}
            />
          ) : (
            <GhostButton
              label="RESUME"
              tone="active"
              disabled={actions.resumeLoading}
              onPress={() => void actions.handleResumeDraft()}
            />
          )}
          <GhostButton
            label={ui.commPickMode ? 'COMM PICK ON' : 'COMM PICK'}
            tone={ui.commPickMode ? 'active' : 'neutral'}
            onPress={() => ui.setCommPickMode(!ui.commPickMode)}
          />
        </XStack>
      )}

      {/* ---- Search + sort ---- */}
      <XStack
        gap="$2"
        paddingHorizontal="$3"
        paddingTop={9}
        alignItems="center"
      >
        <Input
          flex={1}
          minWidth={0}
          size="$3"
          borderRadius={10}
          backgroundColor="$surfacePanel"
          borderColor="$surfacePanelBorder"
          color="$color"
          placeholder="Search…"
          placeholderTextColor={palette.text.fg4}
          value={ui.searchTerm}
          onChangeText={ui.setSearchTerm}
        />
        <XStack
          borderWidth={1}
          borderColor="$surfacePanelBorder"
          borderRadius={9}
          overflow="hidden"
        >
          {(['adp', 'pts'] as const).map((key) => {
            const active = sortKey === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${key.toUpperCase()}`}
                accessibilityState={{ selected: active }}
                onPress={() => setSortKey(key)}
              >
                <YStack
                  paddingVertical={8}
                  paddingHorizontal={11}
                  backgroundColor={active ? '$surfaceRaised' : 'transparent'}
                >
                  <Text
                    fontSize={11}
                    fontWeight="800"
                    color={active ? '$color' : '$fg4'}
                  >
                    {key.toUpperCase()}
                  </Text>
                </YStack>
              </Pressable>
            );
          })}
        </XStack>
      </XStack>

      {/* ---- Position filter chips ---- */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        flexGrow={0}
        flexShrink={0}
      >
        <XStack gap={4} paddingHorizontal="$3" paddingVertical={8}>
          {POSITION_FILTERS.map((pos) => {
            const active = ui.selectedPosition === pos;
            const tint =
              pos === 'ALL'
                ? palette.gold.gold
                : getPositionColor('baseball', pos);
            return (
              <Pressable
                key={pos}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${pos}`}
                accessibilityState={{ selected: active }}
                onPress={() => ui.setSelectedPosition(pos)}
              >
                <YStack
                  paddingVertical={4}
                  paddingHorizontal={10}
                  borderRadius={999}
                  borderWidth={1}
                  borderColor={active ? tint : '$outlineDefault'}
                  backgroundColor={active ? tint : 'transparent'}
                >
                  <Text
                    fontSize={11.5}
                    fontWeight="700"
                    color={active ? '$textOnAccent' : '$textMuted'}
                  >
                    {pos}
                  </Text>
                </YStack>
              </Pressable>
            );
          })}
        </XStack>
      </ScrollView>

      {/* ---- Available players ---- */}
      <FlatList
        data={listedPlayers}
        keyExtractor={(item) => String(item.player.id)}
        contentContainerStyle={styles.playerList}
        renderItem={({ item }) => (
          <PlayerRow
            player={item.player}
            adp={item.adp}
            canDraft={canDraft}
            commPickMode={canCommissionerPick}
            onDraft={(id) => void actions.handleMakePick(id)}
            onCommissionerPick={(id) => void actions.handleCommissionerPick(id)}
          />
        )}
        onEndReached={() => {
          if (queries.hasMorePlayers && !queries.loadingMore) {
            void queries.handleLoadMorePlayers();
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          queries.loadingMore ? (
            <YStack padding="$3" alignItems="center">
              <Spinner color="$brandGold" />
            </YStack>
          ) : null
        }
        ListEmptyComponent={
          <YStack padding="$6" alignItems="center">
            <Text color="$textMuted">No players match that filter</Text>
          </YStack>
        }
      />

      {/* ---- My squad strip + roster sheet ---- */}
      <DraftSquadStrip
        myPicks={playerData.myTeamPicks}
        myTeam={playerData.myTeam}
        statsLookup={playerData.statsLookup}
        rounds={Math.max(boardRounds, MIN_BOARD_ROUNDS)}
        teamName={queries.teamNameById(queries.myTeamId)}
        isMyPick={isMyPick}
        open={rosterOpen}
        onOpen={() => setRosterOpen(true)}
        onClose={() => setRosterOpen(false)}
      />

      {/* ---- Pick announcement + confetti ---- */}
      <DraftPickAnnouncement
        announcement={ui.announcement}
        celebrate
        onDismiss={ui.dismissAnnouncement}
      />

      {/* Toast overlay */}
      {ui.toastMessage && (
        <YStack
          position="absolute"
          bottom={20}
          left={16}
          right={16}
          zIndex={100}
          borderRadius={12}
          borderWidth={1}
          padding="$3"
          backgroundColor={
            ui.toastMessage.type === 'error'
              ? '$statusDangerBg'
              : ui.toastMessage.type === 'success'
                ? '$statusSuccessBg'
                : '$surfaceRaised'
          }
          borderColor={
            ui.toastMessage.type === 'error'
              ? '$statusDangerBorder'
              : ui.toastMessage.type === 'success'
                ? '$statusSuccessBorder'
                : '$outlineDefault'
          }
        >
          <Pressable onPress={() => ui.setToastMessage(null)}>
            <Text color="$color" fontWeight="600" textAlign="center">
              {ui.toastMessage.text}
            </Text>
          </Pressable>
        </YStack>
      )}

      {/* Urgent-error overlay (LS-8066).
          The shared draft-pick handler routes uncategorized pick failures —
          including "Draft pick failed: …" — to ui.urgentMessage. The web
          screen renders this channel, but the native screen previously did
          not, so mobile users got no feedback during the draft. Mirror the
          web behavior: show it as an error toast when no toast is already
          visible (the two channels are mutually exclusive). It auto-dismisses
          after 6s via useDraftUIState (LS-4827). */}
      {ui.urgentMessage && !ui.toastMessage && (
        <YStack
          position="absolute"
          bottom={20}
          left={16}
          right={16}
          zIndex={100}
          borderRadius={12}
          borderWidth={1}
          padding="$3"
          backgroundColor="$statusDangerBg"
          borderColor="$statusDangerBorder"
        >
          <Pressable onPress={() => ui.setUrgentMessage('')}>
            <Text color="$statusDangerFg" fontWeight="600" textAlign="center">
              {ui.urgentMessage}
            </Text>
          </Pressable>
        </YStack>
      )}
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  playerList: {
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 16,
  },
});
