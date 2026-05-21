import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import {
  Button,
  Card,
  H3,
  H4,
  Input,
  ScrollView,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import type { DraftChatRenderer } from './DraftChatOverlay';
import type { DraftPlayer, LeagueTeam } from './types';
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
import { withAlpha } from '../../utils/colors';
import { useAuth } from '../../features/auth';

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
// State screens (native equivalents of DraftStateScreens.tsx)
// ---------------------------------------------------------------------------

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
    <YStack flex={1} justifyContent="center" alignItems="center" padding="$6">
      <Text
        fontSize={48}
        marginBottom="$3"
        accessibilityRole="image"
        accessibilityLabel={title}
      >
        {icon}
      </Text>
      <H3 textAlign="center" marginBottom="$2">
        {title}
      </H3>
      <Text color="$gray10" textAlign="center" fontSize="$4" marginBottom="$4">
        {description}
      </Text>
      {buttonText && onPress && (
        <Button
          size="$4"
          backgroundColor="$brandNavyLight"
          color="$colorInverse"
          onPress={onPress}
        >
          {buttonText}
        </Button>
      )}
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// Pre-Draft Lobby (native)
// ---------------------------------------------------------------------------
function NativePreDraftLobby({
  league,
  leagueTeams,
  myTeamId,
  isOwner,
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
  isOwner: boolean;
  onlineTeamIds: ReadonlySet<string>;
  initError: string | null;
  initDraftLoading: boolean;
  onInitializeDraft: (order: 'snake' | 'linear') => Promise<void>;
}) {
  return (
    <ScrollView flex={1}>
      <YStack padding="$4" alignItems="center" space="$4">
        <Text
          fontSize={48}
          accessibilityRole="image"
          accessibilityLabel="baseball"
        >
          ⚾
        </Text>
        <H3 textAlign="center">
          {league?.name ? `${league.name} — Live Draft` : 'Live Draft Lobby'}
        </H3>
        <Text color="$gray10" textAlign="center" fontSize="$4">
          {leagueTeams.length < 2
            ? 'At least 2 teams are required to start a draft.'
            : isOwner
              ? 'As the commissioner, you can start the draft when ready.'
              : 'Waiting for the commissioner to start the draft.'}
        </Text>

        {leagueTeams.length > 0 && (
          <YStack width="100%" maxWidth={360}>
            <Text
              fontSize="$2"
              fontWeight="700"
              color="$gray10"
              marginBottom="$2"
              textTransform="uppercase"
            >
              Teams ({leagueTeams.length})
            </Text>
            {leagueTeams.map((team, idx) => (
              <Card
                key={team.id}
                padding="$2"
                paddingHorizontal="$3"
                marginBottom="$1"
                bordered
              >
                <XStack alignItems="center" space="$2">
                  <Text
                    fontSize="$2"
                    fontWeight="700"
                    color="$gray9"
                    width={24}
                  >
                    {idx + 1}.
                  </Text>
                  <YStack
                    width={8}
                    height={8}
                    borderRadius={4}
                    backgroundColor={
                      onlineTeamIds.has(String(team.id)) ? '$green9' : '$gray7'
                    }
                  />
                  <Text
                    flex={1}
                    fontSize="$3"
                    fontWeight="500"
                    color={
                      String(team.id) === String(myTeamId)
                        ? '$brandNavyLight'
                        : '$color'
                    }
                  >
                    {team.name}
                    {String(team.id) === String(myTeamId) ? ' (You)' : ''}
                  </Text>
                </XStack>
              </Card>
            ))}
          </YStack>
        )}

        {initError && (
          <Card
            padding="$3"
            backgroundColor="$red2"
            borderColor="$red6"
            bordered
            width="100%"
            maxWidth={360}
          >
            <Text color="$red10" fontSize="$3">
              {initError}
            </Text>
          </Card>
        )}

        {isOwner && leagueTeams.length >= 2 && (
          <XStack space="$3">
            <Button
              size="$4"
              backgroundColor="$brandNavyLight"
              color="$colorInverse"
              disabled={initDraftLoading}
              opacity={initDraftLoading ? 0.6 : 1}
              onPress={() => void onInitializeDraft('snake')}
            >
              {initDraftLoading ? 'Starting...' : 'Snake Draft'}
            </Button>
            <Button
              size="$4"
              backgroundColor="$brandNavy"
              color="$colorInverse"
              disabled={initDraftLoading}
              opacity={initDraftLoading ? 0.6 : 1}
              onPress={() => void onInitializeDraft('linear')}
            >
              {initDraftLoading ? 'Starting...' : 'Normal Draft'}
            </Button>
          </XStack>
        )}

        {!isOwner && (
          <Card
            padding="$3"
            backgroundColor="$blue2"
            borderColor="$blue6"
            bordered
            width="100%"
            maxWidth={360}
          >
            <Text color="$blue10" fontSize="$3">
              You'll be notified when the commissioner starts the draft.
            </Text>
          </Card>
        )}
      </YStack>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Draft Complete (native)
// ---------------------------------------------------------------------------
function NativeDraftComplete({
  league,
  leagueId,
  pickHistory,
  myTeamId,
  statsLookup,
  onNavigate,
}: {
  league: { isMockDraft?: boolean; name?: string } | null | undefined;
  leagueId: number | null;
  pickHistory: Array<{
    id: string;
    round: number;
    pickNumber: number;
    overallPick: number;
    teamId: number;
    playerId: number;
    player?: { id: number; firstName: string; lastName: string } | null;
  }>;
  myTeamId: number | null;
  statsLookup: Map<number, DraftPlayer>;
  onNavigate: (path: string) => void;
}) {
  const myPicks = useMemo(
    () =>
      myTeamId !== null ? pickHistory.filter((p) => p.teamId === myTeamId) : [],
    [pickHistory, myTeamId],
  );

  return (
    <ScrollView flex={1}>
      <YStack padding="$4" space="$4">
        <YStack alignItems="center" space="$2">
          <Text
            fontSize={48}
            accessibilityRole="image"
            accessibilityLabel="trophy"
          >
            🏆
          </Text>
          <H3 textAlign="center">Draft Complete!</H3>
          {league?.name && (
            <Text color="$gray10" fontSize="$4">
              {league.name}
            </Text>
          )}
        </YStack>

        {myPicks.length > 0 && (
          <YStack space="$2">
            <H4>Your Picks ({myPicks.length})</H4>
            {myPicks.map((pick) => {
              const player = statsLookup.get(pick.playerId);
              const name = player
                ? player.name
                : pick.player
                  ? `${pick.player.firstName} ${pick.player.lastName}`
                  : `Player #${pick.playerId}`;
              return (
                <Card key={pick.id} padding="$3" bordered>
                  <XStack justifyContent="space-between" alignItems="center">
                    <YStack>
                      <Text fontWeight="600" fontSize="$4">
                        {name}
                      </Text>
                      {player && (
                        <Text color="$gray10" fontSize="$2">
                          {player.position}
                        </Text>
                      )}
                    </YStack>
                    <Text color="$gray9" fontSize="$2">
                      Rd {pick.round}, Pick {pick.pickNumber}
                    </Text>
                  </XStack>
                </Card>
              );
            })}
          </YStack>
        )}

        <Button
          size="$4"
          backgroundColor="$brandNavyLight"
          color="$colorInverse"
          onPress={() =>
            onNavigate(leagueId ? `/baseball/league/${leagueId}` : '/baseball')
          }
        >
          Back to League
        </Button>
      </YStack>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Player Row (native)
// ---------------------------------------------------------------------------
function PlayerRow({
  player,
  isMyPick,
  commPickMode,
  isOwner,
  onDraft,
  onCommissionerPick,
}: {
  player: DraftPlayer;
  isMyPick: boolean;
  commPickMode: boolean;
  isOwner: boolean;
  onDraft: (id: number) => void;
  onCommissionerPick: (id: number) => void;
}) {
  const posColor = getPositionColor('baseball', player.position);
  const canDraft = isMyPick || (commPickMode && isOwner);

  return (
    <Card padding="$3" marginBottom="$2" bordered>
      <XStack justifyContent="space-between" alignItems="center">
        <YStack flex={1} marginRight="$2">
          <XStack alignItems="center" space="$2">
            <Text fontWeight="700" fontSize="$4">
              {player.name}
            </Text>
            <Text
              fontSize="$2"
              fontWeight="600"
              color={posColor}
              backgroundColor={withAlpha(posColor, 0.12)}
              paddingHorizontal="$1"
              borderRadius="$1"
            >
              {player.position}
            </Text>
          </XStack>
          <XStack space="$3" marginTop="$1">
            {player.isPitcher ? (
              <>
                <Text fontSize="$2" color="$gray10">
                  ERA {player.era?.toFixed(2) ?? '—'}
                </Text>
                <Text fontSize="$2" color="$gray10">
                  K {player.strikeouts ?? '—'}
                </Text>
                <Text fontSize="$2" color="$gray10">
                  W {player.wins ?? 0}-{player.losses ?? 0}
                </Text>
              </>
            ) : (
              <>
                <Text fontSize="$2" color="$gray10">
                  AVG {player.avg.toFixed(3)}
                </Text>
                <Text fontSize="$2" color="$gray10">
                  HR {player.hr}
                </Text>
                <Text fontSize="$2" color="$gray10">
                  RBI {player.rbi}
                </Text>
              </>
            )}
            {player.ppg != null && (
              <Text fontSize="$2" color="$brandNavyLight" fontWeight="600">
                {player.ppg.toFixed(1)} PPG
              </Text>
            )}
          </XStack>
        </YStack>
        {canDraft && (
          <Button
            size="$3"
            backgroundColor={commPickMode ? '$orange9' : '$green9'}
            color="$colorInverse"
            onPress={() =>
              commPickMode && isOwner
                ? onCommissionerPick(player.id)
                : onDraft(player.id)
            }
          >
            Draft
          </Button>
        )}
      </XStack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab selector
// ---------------------------------------------------------------------------
type DraftTab = 'players' | 'myteam' | 'history';

function TabBar({
  active,
  onSelect,
}: {
  active: DraftTab;
  onSelect: (tab: DraftTab) => void;
}) {
  const tabs: Array<{ key: DraftTab; label: string }> = [
    { key: 'players', label: 'Players' },
    { key: 'myteam', label: 'My Team' },
    { key: 'history', label: 'History' },
  ];

  return (
    <XStack borderBottomWidth={1} borderBottomColor="$gray4">
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          onPress={() => onSelect(tab.key)}
          style={styles.tabPressable}
        >
          <YStack
            paddingVertical="$2"
            paddingHorizontal="$3"
            borderBottomWidth={2}
            borderBottomColor={
              active === tab.key ? '$brandNavyLight' : 'transparent'
            }
          >
            <Text
              fontWeight={active === tab.key ? '700' : '400'}
              color={active === tab.key ? '$brandNavyLight' : '$gray10'}
              fontSize="$3"
            >
              {tab.label}
            </Text>
          </YStack>
        </Pressable>
      ))}
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
  const { user } = useAuth();
  const isAuthenticated = !!user;

  const [activeTab, setActiveTab] = useState<DraftTab>('players');

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
    token: websocketToken,
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

  const round =
    queries.currentPickInfo?.round ??
    Math.ceil(
      (queries.currentPickInfo?.overallPick ?? 1) /
        Math.max(queries.leagueTeams.length, 1),
    );
  const currentPick =
    queries.currentPickInfo?.overallPick ?? queries.pickHistory.length + 1;
  const filteredPlayers = playerData.enrichedPlayers;

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
      <YStack flex={1} justifyContent="center" alignItems="center">
        <Spinner size="large" />
        <Text marginTop="$2" color="$gray10">
          Loading draft board...
        </Text>
      </YStack>
    );
  }

  if (
    !queries.leagueLoading &&
    !queries.league &&
    (queries.leagueError || queries.leagueData !== undefined)
  ) {
    const graphQLErrors =
      queries.leagueError && 'graphQLErrors' in queries.leagueError
        ? (queries.leagueError.graphQLErrors as ReadonlyArray<{
            extensions?: Record<string, unknown>;
          }>)
        : [];
    const isUnauthorized = graphQLErrors.some(
      (e) =>
        e.extensions?.['code'] === 'UNAUTHENTICATED' ||
        e.extensions?.['code'] === 'FORBIDDEN',
    );
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
        pickHistory={queries.pickHistory}
        myTeamId={queries.myTeamId}
        statsLookup={playerData.statsLookup}
        onNavigate={onNavigate}
      />
    );
  }

  if (!queries.draftId && queries.league?.draftStatus !== 'in-progress') {
    return (
      <NativePreDraftLobby
        league={queries.league}
        leagueTeams={queries.leagueTeams}
        myTeamId={queries.myTeamId}
        isOwner={queries.isOwner}
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
  const timerColor =
    timeRemaining <= 10
      ? '$red9'
      : timeRemaining <= 30
        ? '$orange9'
        : '$green9';
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = (timeRemaining % 60).toString().padStart(2, '0');

  return (
    <YStack flex={1}>
      {/* Current Pick Banner */}
      {queries.currentPickInfo && (
        <YStack
          padding="$3"
          backgroundColor={isMyPick ? '$green2' : '$gray2'}
          borderBottomWidth={1}
          borderBottomColor="$gray4"
        >
          <XStack justifyContent="space-between" alignItems="center">
            <YStack>
              <Text
                fontWeight="800"
                fontSize="$5"
                color={isMyPick ? '$green10' : '$color'}
              >
                {isMyPick
                  ? 'YOUR PICK'
                  : queries.teamNameById(queries.currentPickTeamId)}
              </Text>
              <Text fontSize="$2" color="$gray10">
                Pick #{currentPick} · Round {round} · Pick{' '}
                {queries.currentPickInfo.pickNumber}
              </Text>
            </YStack>
            <YStack alignItems="center">
              {ui.draftPaused ? (
                <Text fontWeight="700" fontSize="$5" color="$orange9">
                  PAUSED
                </Text>
              ) : (
                <Text fontWeight="700" fontSize="$6" color={timerColor}>
                  {minutes}:{seconds}
                </Text>
              )}
            </YStack>
          </XStack>
        </YStack>
      )}

      {/* Commissioner Controls */}
      {(queries.isCommissioner || queries.isOwner) && (
        <XStack
          padding="$2"
          paddingHorizontal="$3"
          backgroundColor="$gray1"
          borderBottomWidth={1}
          borderBottomColor="$gray4"
          space="$2"
        >
          {!ui.draftPaused ? (
            <Button
              size="$2"
              backgroundColor="$orange9"
              color="$colorInverse"
              disabled={actions.pauseLoading}
              onPress={() => void actions.handlePauseDraft()}
            >
              Pause
            </Button>
          ) : (
            <Button
              size="$2"
              backgroundColor="$green9"
              color="$colorInverse"
              disabled={actions.resumeLoading}
              onPress={() => void actions.handleResumeDraft()}
            >
              Resume
            </Button>
          )}
          <Button
            size="$2"
            backgroundColor={ui.commPickMode ? '$orange9' : '$gray6'}
            color="$colorInverse"
            onPress={() => ui.setCommPickMode(!ui.commPickMode)}
          >
            {ui.commPickMode ? 'Comm Pick ON' : 'Comm Pick'}
          </Button>
        </XStack>
      )}

      {/* Tabs */}
      <TabBar active={activeTab} onSelect={setActiveTab} />

      {/* Tab Content */}
      {activeTab === 'players' && (
        <YStack flex={1}>
          {/* Search */}
          <XStack padding="$2" paddingHorizontal="$3" space="$2">
            <Input
              flex={1}
              size="$3"
              placeholder="Search players..."
              value={ui.searchTerm}
              onChangeText={ui.setSearchTerm}
            />
          </XStack>

          {/* Position filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <XStack padding="$2" paddingHorizontal="$3" space="$1">
              <Pressable onPress={() => ui.setSelectedPosition('ALL')}>
                <YStack
                  paddingHorizontal="$2"
                  paddingVertical="$1"
                  borderRadius="$2"
                  backgroundColor={
                    ui.selectedPosition === 'ALL' ? '$brandNavyLight' : '$gray3'
                  }
                >
                  <Text
                    fontSize="$2"
                    fontWeight="600"
                    color={
                      ui.selectedPosition === 'ALL'
                        ? '$colorInverse'
                        : '$gray11'
                    }
                  >
                    ALL
                  </Text>
                </YStack>
              </Pressable>
              {['C', '1B', '2B', '3B', 'SS', 'OF', 'SP', 'RP', 'DH'].map(
                (pos) => (
                  <Pressable
                    key={pos}
                    onPress={() => ui.setSelectedPosition(pos)}
                  >
                    <YStack
                      paddingHorizontal="$2"
                      paddingVertical="$1"
                      borderRadius="$2"
                      backgroundColor={
                        ui.selectedPosition === pos
                          ? getPositionColor('baseball', pos)
                          : '$gray3'
                      }
                    >
                      <Text
                        fontSize="$2"
                        fontWeight="600"
                        color={
                          ui.selectedPosition === pos
                            ? '$colorInverse'
                            : '$gray11'
                        }
                      >
                        {pos}
                      </Text>
                    </YStack>
                  </Pressable>
                ),
              )}
            </XStack>
          </ScrollView>

          {/* Player list */}
          <FlatList
            data={filteredPlayers}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.playerList}
            renderItem={({ item }) => (
              <PlayerRow
                player={item}
                isMyPick={isMyPick}
                commPickMode={ui.commPickMode}
                isOwner={queries.isOwner}
                onDraft={(id) => void actions.handleMakePick(id)}
                onCommissionerPick={(id) =>
                  void actions.handleCommissionerPick(id)
                }
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
                  <Spinner />
                </YStack>
              ) : null
            }
            ListEmptyComponent={
              <YStack padding="$6" alignItems="center">
                <Text color="$gray10">No players found</Text>
              </YStack>
            }
          />
        </YStack>
      )}

      {activeTab === 'myteam' && (
        <ScrollView flex={1} contentContainerStyle={styles.tabContent}>
          <YStack padding="$3" space="$2">
            <Text fontWeight="700" fontSize="$5" marginBottom="$1">
              My Roster ({playerData.myTeam.length})
            </Text>
            {playerData.myTeam.length === 0 ? (
              <Text color="$gray10">No picks yet</Text>
            ) : (
              playerData.myTeam.map((player) => {
                const posColor = getPositionColor('baseball', player.position);
                return (
                  <Card key={player.id} padding="$3" bordered>
                    <XStack alignItems="center" space="$2">
                      <Text
                        fontSize="$2"
                        fontWeight="600"
                        color={posColor}
                        width={30}
                      >
                        {player.position}
                      </Text>
                      <Text flex={1} fontWeight="600" fontSize="$4">
                        {player.name}
                      </Text>
                      {player.ppg != null && (
                        <Text
                          fontSize="$2"
                          color="$brandNavyLight"
                          fontWeight="600"
                        >
                          {player.ppg.toFixed(1)} PPG
                        </Text>
                      )}
                    </XStack>
                  </Card>
                );
              })
            )}
          </YStack>
        </ScrollView>
      )}

      {activeTab === 'history' && (
        <FlatList
          data={queries.pickHistory}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.tabContent}
          renderItem={({ item: pick }) => {
            const player = playerData.statsLookup.get(pick.playerId);
            const teamName = queries.teamNameById(pick.teamId);
            const name = player
              ? player.name
              : pick.player
                ? `${pick.player.firstName} ${pick.player.lastName}`
                : `Player #${pick.playerId}`;
            const isMine = pick.teamId === queries.myTeamId;
            return (
              <Card
                padding="$2"
                paddingHorizontal="$3"
                marginBottom="$1"
                marginHorizontal="$3"
                bordered
                backgroundColor={isMine ? '$blue2' : undefined}
              >
                <XStack justifyContent="space-between" alignItems="center">
                  <XStack flex={1} alignItems="center" space="$2">
                    <Text
                      fontSize="$2"
                      fontWeight="700"
                      color="$gray9"
                      width={36}
                    >
                      #{pick.overallPick}
                    </Text>
                    <YStack flex={1}>
                      <Text fontWeight="600" fontSize="$3">
                        {name}
                      </Text>
                      <Text fontSize="$1" color="$gray10">
                        {teamName}
                      </Text>
                    </YStack>
                  </XStack>
                  <Text fontSize="$1" color="$gray9">
                    Rd {pick.round}
                  </Text>
                </XStack>
              </Card>
            );
          }}
          ListEmptyComponent={
            <YStack padding="$6" alignItems="center">
              <Text color="$gray10">No picks yet</Text>
            </YStack>
          }
        />
      )}

      {/* Toast overlay */}
      {ui.toastMessage && (
        <YStack
          position="absolute"
          bottom={20}
          left={16}
          right={16}
          backgroundColor={
            ui.toastMessage.type === 'error'
              ? '$red9'
              : ui.toastMessage.type === 'success'
                ? '$green9'
                : '$brandNavyLight'
          }
          borderRadius="$3"
          padding="$3"
          zIndex={100}
        >
          <Pressable onPress={() => ui.setToastMessage(null)}>
            <Text color="$colorInverse" fontWeight="600" textAlign="center">
              {ui.toastMessage.text}
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
    paddingTop: 4,
    paddingBottom: 16,
  },
  tabContent: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  tabPressable: {
    flex: 1,
    alignItems: 'center',
  },
});
