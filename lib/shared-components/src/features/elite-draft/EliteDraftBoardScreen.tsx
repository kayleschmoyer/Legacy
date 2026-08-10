import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { Input, ScrollView, Spinner, Text, XStack, YStack } from 'tamagui';
import { useGetUserByIdQuery } from '@legacy-sports/graphql';
import { CSS } from './styles';
import { DraftCompleteView } from './DraftCompleteView';
import { DraftPlayerBoard } from './DraftPlayerBoard';
import { PickAnnouncement } from './PickAnnouncement';
import { getDraftCommentary } from './draftUtils';
import { AuctionDraftRoom } from './auction/AuctionDraftRoom';
import { PreDraftLobby } from './PreDraftLobby';
import { DraftTopBand } from './DraftTopBand';
import { DraftRail } from './DraftRail';
import { DraftClockRing } from './DraftClockRing';
import { DraftMiniBoard } from './DraftMiniBoard';
import { DraftPickAnnouncement } from './DraftPickAnnouncement';
import { DraftSquadStrip } from './DraftSquadStrip';
import { useDraftPalette } from './nativeDraftPalette';
import {
  MIN_BOARD_ROUNDS,
  resolveBoardRounds,
  statLineFor,
} from './nativeDraftBoard';
import { getPositionColor } from './utils';
import {
  AuctionNotSupportedScreen,
  AutomatedDraftScreen,
  LeagueErrorScreen,
  LoadingScreen,
  NoLeagueScreen,
  PlayersErrorScreen,
} from './DraftStateScreens';
import {
  useDraftActions,
  useDraftEffects,
  useDraftQueries,
  useDraftTimer,
  useDraftUIState,
  useDraftWebSocket,
  useIsCompactDraftViewport,
  usePlayerData,
} from './hooks';
import { DraftChatOverlay } from './DraftChatOverlay';
import { DEFAULT_NUM_TEAMS } from './constants';
import type { DraftChatRenderer } from './DraftChatOverlay';
import type { DraftPlayer } from './types';
import { PositionBadge } from '../../components/PositionBadge';
import { useAuth } from '../../features/auth';
import type { SportKind } from '../../config/sports';
import { hasErrorCode } from '../../utils/graphql-errors';

export interface EliteDraftBoardScreenProps {
  /** League ID to load (replaces route param). */
  leagueId: number | null;
  /** Navigation callback (replaces react-router useNavigate). */
  onNavigate: (path: string) => void;
  /** WebSocket URL for live draft updates. */
  websocketUrl: string;
  /** Optional auth token for the draft WebSocket. When omitted the socket defers until a token becomes available. */
  token?: string;
  /** Optional render prop for the chat overlay. If omitted, chat is disabled (compact/narrow viewports never render it — the mobile UX uses a separate chat screen accessible from the league tab). */
  renderChat?: DraftChatRenderer;
  /** Optional callback fired when a player is drafted (for analytics). */
  onPlayerDrafted?: (playerId: number, position: string) => void;
  /**
   * Active sport for this league. Drives stat-table headers, lobby copy, and
   * the `data-sport` attribute on the root. Defaults to `'baseball'` until
   * callers can read `league.sport` (ADR 0011 / LS-4658).
   */
  sport?: SportKind;
  /**
   * Called when the draft transitions between active (in-progress/paused) and
   * inactive states. Callers can use this to set up navigation guards that
   * prevent accidental back-button exits from an active draft session (LS-4986).
   */
  onActiveDraftChange?: (active: boolean) => void;
}

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
// Compact-branch chrome (narrow-viewport only — folded in from the former
// EliteDraftBoardScreen.native.tsx fork, LS-9207)
// ---------------------------------------------------------------------------

/** Uppercase, wide-tracked label used above every headline on the compact board. */
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

/** The gold lozenge used for every primary action on the compact draft board. */
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

/** Outlined, low-emphasis action (commissioner toggles) on the compact board. */
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

/** A single row in the compact board's available-players list. */
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
// Compact (narrow-viewport) live-board — a separate component so its
// compact-only hooks (useDraftPalette et al) only run when this subtree
// actually mounts. `EliteDraftBoardScreen` calling useDraftPalette()
// unconditionally at its own top level previously crashed apps/web's test
// environment (no useThemeName mock there) even though the wide branch never
// used it — this render path is only reachable when useIsCompactDraftViewport()
// is true (LS-9207 review fix).
// ---------------------------------------------------------------------------
interface CompactLiveDraftBoardProps {
  ui: ReturnType<typeof useDraftUIState>;
  queries: ReturnType<typeof useDraftQueries>;
  actions: ReturnType<typeof useDraftActions>;
  playerData: ReturnType<typeof usePlayerData>;
  isMyPick: boolean;
  untimed: boolean;
  timeRemaining: number;
  round: number;
  currentPick: number;
  onDraftPlayer: (id: number) => void;
  onCommissionerPick: (id: number) => void;
  onLoadMore: () => void;
}

function CompactLiveDraftBoard({
  ui,
  queries,
  actions,
  playerData,
  isMyPick,
  untimed,
  timeRemaining,
  round,
  currentPick,
  onDraftPlayer,
  onCommissionerPick,
  onLoadMore,
}: CompactLiveDraftBoardProps): React.JSX.Element {
  const palette = useDraftPalette();
  const [sortKey, setSortKey] = useState<SortKey>('adp');
  const [rosterOpen, setRosterOpen] = useState(false);

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

  const canCommissionerPick = ui.commPickMode && queries.isCommissioner;
  const canDraft = isMyPick || canCommissionerPick;
  // Mock drafts auto-register the human as "commissioner" (initialize-mock-draft.ts)
  // so the queue/pick flow works, but there's no real commissioner role to manage
  // in a solo practice draft — the controls should never surface there (LS-9242).
  const showCommissionerBar =
    queries.isCommissioner && !queries.league?.isMockDraft;

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
                : untimed && isMyPick
                  ? 'Your pick — take your time'
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
            untimed={untimed}
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
            onDraft={onDraftPlayer}
            onCommissionerPick={onCommissionerPick}
          />
        )}
        onEndReached={() => {
          if (queries.hasMorePlayers && !queries.loadingMore) {
            onLoadMore();
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          queries.loadingMore ? (
            <YStack
              testID="draft-loading-more"
              padding="$3"
              alignItems="center"
            >
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

      {/* ---- Pick announcement ---- */}
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

      {/* Urgent-error overlay (LS-8066) — mirrors the wide-viewport toast
          below so pick failures are visible on every screen size. */}
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
      <Text
        position="absolute"
        width={1}
        height={1}
        padding={0}
        margin={-1}
        overflow="hidden"
        borderWidth={0}
      >
        {ui.liveMessage}
      </Text>
    </YStack>
  );
}

export function EliteDraftBoardScreen({
  leagueId,
  onNavigate,
  websocketUrl,
  token,
  renderChat,
  onPlayerDrafted,
  sport = 'baseball',
  onActiveDraftChange,
}: EliteDraftBoardScreenProps): React.JSX.Element {
  const { user, token: authToken } = useAuth();
  const userId = user?.id ?? 0;
  const isAuthenticated = !!user;
  const isCompact = useIsCompactDraftViewport();

  const { data: userSubscriptionData } = useGetUserByIdQuery({
    variables: { id: userId },
    skip: !user?.id,
  });
  // Admins are always treated as premium, mirroring the web `useIsPremium`
  // hook (apps/web/src/hooks/useIsPremium.ts) and the backend authorization
  // layer. The admin flag is sourced from the trusted server `GetUserById`
  // response (`accessLevel`), never the client-side auth state — a forged
  // JWT `accessLevel` claim is never signature-verified in the browser.
  const isPremium =
    userSubscriptionData?.user?.accessLevel === 'admin' ||
    userSubscriptionData?.user?.subscriptionTier === 'premium';

  const ui = useDraftUIState();

  const queries = useDraftQueries({
    leagueId,
    playerSearch: ui.playerSearch,
    selectedPosition: ui.selectedPosition,
    viewMode: ui.viewMode,
    isCompact,
  });

  const isMyPick = Boolean(
    queries.currentPickInfo &&
    queries.currentPickTeamId !== null &&
    queries.myTeamId !== null &&
    queries.currentPickTeamId === queries.myTeamId &&
    !queries.currentPickInfo.isComplete,
  );

  // LS-4449 / LS-4485: when it becomes the user's turn while a pick
  // announcement for an earlier pick is still on screen, dismiss it
  // immediately so the next drafter never has to wait for a 3.6s
  // celebration overlay (the position:fixed z-index:9999 backdrop covers
  // the player grid and prevents both real-user clicks and Playwright
  // force-clicks on the Draft Now button).
  //
  // The dismissal fires whenever the announcement is for a strictly older
  // pick than the current pick — i.e. announcement.pickNumber <
  // currentPickInfo.overallPick. That naturally covers two scenarios:
  //   1. (LS-4449) someone else picked and now it is the user's turn —
  //      announcement.isMyPick=false, but the dismissal also handles the
  //      back-to-back case where
  //   2. (LS-4485) the user picked the last slot of one round and the
  //      snake turn-around hands them the first slot of the next round —
  //      announcement.isMyPick=true for the previous pick, but it is now
  //      a *new* (later) pick that is theirs, so the celebration would
  //      otherwise block their own Draft Now button.
  //
  // The picker still sees their own celebration for the full 3.6s in the
  // normal (non-back-to-back) case: after a self-pick, isMyPick flips to
  // false on the next poll and the condition below short-circuits.
  const { announcement: currentAnnouncement, dismissAnnouncement } = ui;
  const currentOverallPick = queries.currentPickInfo?.overallPick;
  useEffect(() => {
    if (
      isMyPick &&
      currentAnnouncement &&
      currentOverallPick != null &&
      currentAnnouncement.pickNumber < currentOverallPick
    ) {
      dismissAnnouncement();
    }
  }, [isMyPick, currentAnnouncement, currentOverallPick, dismissAnnouncement]);

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
    // LS-8067 / LS-8108: fall back to the in-memory JWT from useAuth when no
    // explicit token prop is supplied. Most consumers never pass `token`, so
    // without this the draft socket defers forever and other open clients
    // (e.g. a laptop while you pick on mobile) never receive live pick pushes
    // until a manual refetch. The prop still wins when provided.
    token: token ?? authToken ?? undefined,
    onPlayerDrafted,
  });

  // Offline mock draft mode (LS-9144): no pick-clock pressure on the human's
  // own turn. Only meaningful for mock drafts — undefined/false for real leagues.
  const untimed = queries.league?.isOfflineDraft === true;

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
    untimed,
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

  // LS-4986: notify callers when the draft is actively running so they can set
  // up navigation guards (e.g. browser/Android back-button interception).
  const isDraftRunning = Boolean(
    !ui.draftComplete &&
    !queries.leagueDraft?.draftCompletedAt &&
    !queries.currentPickInfo?.isComplete &&
    (queries.league?.draftStatus === 'in-progress' ||
      queries.league?.draftStatus === 'paused'),
  );
  useEffect(() => {
    onActiveDraftChange?.(isDraftRunning);
    return () => onActiveDraftChange?.(false);
  }, [isDraftRunning, onActiveDraftChange]);

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

  const announcementCommentary = useMemo(() => {
    if (!ui.announcement || !('name' in ui.announcement.player))
      return undefined;
    const player = ui.announcement.player;
    const teamCount =
      queries.leagueTeams.length > 0
        ? queries.leagueTeams.length
        : DEFAULT_NUM_TEAMS;
    const announcementRound = Math.ceil(ui.announcement.pickNumber / teamCount);
    return getDraftCommentary(
      player,
      announcementRound,
      ui.announcement.isMyPick,
      ui.announcement.isAuto,
    );
  }, [ui.announcement, queries.leagueTeams.length]);

  const round =
    queries.currentPickInfo?.round ??
    Math.ceil(
      (queries.currentPickInfo?.overallPick ?? 1) /
        Math.max(queries.leagueTeams.length, 1),
    );
  const currentPick =
    queries.currentPickInfo?.overallPick ?? queries.pickHistory.length + 1;
  const filteredPlayers = playerData.enrichedPlayers;

  // ---- Stable callbacks for DraftPlayerBoard (prevent re-renders on each timer tick) ----
  // Destructure stable useCallback refs before using them as hook deps — the actions/queries
  // objects are recreated each render, but the individual methods inside are stable.
  const {
    handleMakePick,
    handleCommissionerPick: commissionerPick,
    handleToggleQueue,
  } = actions;
  const {
    handleLoadMorePlayers,
    refetchLeague,
    refetchCurrentPick,
    refetchAvailablePlayers,
    refetchPickHistory,
  } = queries;

  const handleDraftPlayer = useCallback(
    (id: number) => {
      void handleMakePick(id);
    },
    [handleMakePick],
  );
  const handleCommissionerPick = useCallback(
    (id: number) => {
      void commissionerPick(id);
    },
    [commissionerPick],
  );
  const handleToggleQueuePlayer = useCallback(
    (id: number) => {
      void handleToggleQueue(id);
    },
    [handleToggleQueue],
  );
  const handleLoadMore = useCallback(() => {
    void handleLoadMorePlayers();
  }, [handleLoadMorePlayers]);

  const handleRefresh = useCallback(() => {
    void refetchLeague();
    void refetchCurrentPick();
    void refetchAvailablePlayers();
    void refetchPickHistory();
  }, [
    refetchLeague,
    refetchCurrentPick,
    refetchAvailablePlayers,
    refetchPickHistory,
  ]);

  const handleRetryCurrentPick = useCallback(() => {
    void refetchCurrentPick();
  }, [refetchCurrentPick]);

  // LS-8068: drag-to-draft. The player card being dragged is held here so the
  // DraftRail can highlight eligible roster slots during the drag and validate
  // eligibility on drop. Cleared when the drag ends (drop or cancel). Wide
  // viewport only — the compact branch has no drag-and-drop interaction.
  const [draggedPlayer, setDraggedPlayer] = useState<DraftPlayer | null>(null);
  const handlePlayerDragStart = useCallback(
    (player: DraftPlayer) => setDraggedPlayer(player),
    [],
  );
  const handlePlayerDragEnd = useCallback(() => setDraggedPlayer(null), []);

  // ---- Early returns for special states (identical at every viewport width
  // — DraftStateScreens/PreDraftLobby/DraftCompleteView are already
  // responsive, LS-9060/LS-9061/LS-9205) ----
  if (!leagueId) return <NoLeagueScreen onNavigate={onNavigate} />;

  if (
    (queries.leagueLoading || queries.availablePlayersLoading) &&
    !queries.availablePlayersData &&
    !queries.leagueData
  ) {
    return <LoadingScreen />;
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
      <LeagueErrorScreen
        isUnauthorized={isUnauthorized}
        onNavigate={onNavigate}
      />
    );
  }

  // The league itself loaded fine (e.g. it's still publicly viewable), but the
  // draft-scoped query came back FORBIDDEN — the user was removed from this
  // league after landing on the draft route. Without this check the board
  // silently rendered with no draft data instead of telling the user why
  // (LS-8863).
  if (hasErrorCode(queries.draftError, 'FORBIDDEN')) {
    return <LeagueErrorScreen isUnauthorized onNavigate={onNavigate} />;
  }

  // Check draft completion before any error screens — once the draft is done
  // the available-players query is irrelevant (LS-3823).
  // currentPickInfo?.isComplete is a poll-based fallback: if the DraftCompleted
  // WebSocket event was missed and leagueDraft hasn't been refetched yet, the 5-second
  // GET_CURRENT_DRAFT_PICK poll returns isComplete:true once draftCompletedAt lands in
  // the DB, triggering the banner without requiring a page reload (LS-4191).
  if (
    ui.draftComplete ||
    queries.leagueDraft?.draftCompletedAt ||
    queries.currentPickInfo?.isComplete
  ) {
    return (
      <DraftCompleteView
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
        myTeam={playerData.myTeam}
        myTeamPicks={playerData.myTeamPicks}
        leagueTeams={queries.leagueTeams}
        statsLookup={playerData.statsLookup}
        onNavigate={onNavigate}
      />
    );
  }

  if (queries.availablePlayersError) {
    return (
      <PlayersErrorScreen
        message={queries.availablePlayersError.message}
        onRetry={() => {
          void queries.refetchAvailablePlayers();
        }}
      />
    );
  }

  // Guard against a race where GetLeagueById resolves first with draftStatus='completed'
  // but GetLiveDraftLeagueDraft is still loading (leagueDraft=null, draftId=null).
  // Without this, the draftStatus-based condition below would fire and show PreDraftLobby
  // instead of DraftCompleteView. Hold at LoadingScreen until leagueDraft arrives —
  // its draftCompletedAt will trigger DraftCompleteView above (LS-4263).
  if (queries.league?.draftStatus === 'completed' && !queries.leagueDraft) {
    return <LoadingScreen />;
  }

  // Only render the live draft board when the draft is actively running or paused.
  // A draftId can exist for scheduled ('queued') drafts that haven't started yet;
  // relying on draftId absence would render the empty live board for those cases (LS-4085).
  if (
    queries.league?.draftStatus !== 'in-progress' &&
    queries.league?.draftStatus !== 'paused'
  ) {
    return (
      <PreDraftLobby
        league={queries.league}
        sport={sport}
        leagueId={leagueId}
        leagueTeams={queries.boardOrderedTeams}
        myTeamId={queries.myTeamId}
        isOwner={queries.isCommissioner}
        canManageOwnTeam={
          queries.permLevel === 'general_manager' ||
          queries.permLevel === 'commissioner'
        }
        isCommissioner={queries.isCommissioner}
        onlineTeamIds={onlineTeamIds}
        customDraftOrder={ui.customDraftOrder}
        setCustomDraftOrder={ui.setCustomDraftOrder}
        initError={ui.initError}
        initDraftLoading={actions.initDraftLoading}
        onInitializeDraft={actions.handleInitializeDraft}
        onDraftSlotTradeExecuted={() => {
          void queries.refetchDraftTeamOrder();
        }}
      />
    );
  }

  if (
    queries.leagueDraft?.selectionMethod === 'auction' &&
    queries.draftId != null
  ) {
    // Auction drafts have no compact layout yet — a deferred product
    // decision (AC6 on the original LS-9066), not a capability gap, so this
    // is gated on viewport rather than platform (LS-9207).
    return isCompact ? (
      <AuctionNotSupportedScreen leagueId={leagueId} onNavigate={onNavigate} />
    ) : (
      <AuctionDraftRoom
        draftId={queries.draftId}
        myTeamId={queries.myTeamId ?? undefined}
      />
    );
  }

  if (queries.leagueDraft?.selectionMethod === 'random') {
    return <AutomatedDraftScreen />;
  }

  // ---- Main Live Draft UI: compact (narrow-viewport) branch ----
  if (isCompact) {
    return (
      <CompactLiveDraftBoard
        ui={ui}
        queries={queries}
        actions={actions}
        playerData={playerData}
        isMyPick={isMyPick}
        untimed={untimed}
        timeRemaining={timeRemaining}
        round={round}
        currentPick={currentPick}
        onDraftPlayer={handleDraftPlayer}
        onCommissionerPick={handleCommissionerPick}
        onLoadMore={handleLoadMore}
      />
    );
  }

  // ---- Main Live Draft UI: wide-viewport branch ----
  return (
    <div className="d-root" data-sport={sport}>
      <style>{CSS}</style>
      <div className="d-bg-fx" />
      <div className="d-layout">
        <DraftTopBand
          draftPaused={ui.draftPaused}
          currentPick={currentPick}
          round={round}
          timeRemaining={timeRemaining}
          pickTimeLimitSeconds={ui.pickTimeLimitSeconds}
          untimed={untimed}
          isMyPick={isMyPick}
          currentPickInfo={queries.currentPickInfo}
          leagueTeamsLength={queries.leagueTeams.length}
          isCommissioner={queries.isCommissioner}
          isOwner={queries.isOwner}
          isMockDraft={queries.league?.isMockDraft ?? false}
          draftId={queries.draftId}
          commPickMode={ui.commPickMode}
          autoPickDisabled={ui.autoPickDisabled}
          pauseLoading={actions.pauseLoading}
          resumeLoading={actions.resumeLoading}
          autoPickDisabledLoading={actions.autoPickDisabledLoading}
          isMyTeamAutoPick={actions.isMyTeamAutoPick}
          toggleAutoPickLoading={actions.toggleAutoPickLoading}
          myTeamId={queries.myTeamId}
          teamNameById={queries.teamNameById}
          leagueTeams={queries.leagueTeams}
          autoPickTeamIds={queries.autoPickTeamIds}
          commissionerToggleUserAutoPickLoading={
            actions.commissionerToggleUserAutoPickLoading
          }
          onPauseDraft={() => void actions.handlePauseDraft()}
          onResumeDraft={() => void actions.handleResumeDraft()}
          onToggleCommPickMode={() => ui.setCommPickMode(!ui.commPickMode)}
          onToggleAutoPickDisabled={() =>
            void actions.handleToggleAutoPickDisabled()
          }
          onToggleUserAutoPick={() => void actions.handleToggleUserAutoPick()}
          onCommissionerToggleUserAutoPick={(teamId, enable) =>
            void actions.handleCommissionerToggleUserAutoPick(teamId, enable)
          }
        />

        <DraftPlayerBoard
          viewMode={ui.viewMode}
          sport={sport}
          selectedPosition={ui.selectedPosition}
          searchTerm={ui.searchTerm}
          availablePlayersLoading={queries.availablePlayersLoading}
          commPickMode={ui.commPickMode}
          isOwner={queries.isCommissioner}
          isMyPick={isMyPick}
          pickLoading={actions.pickLoading}
          myTeamId={queries.myTeamId}
          draftId={queries.draftId}
          filteredPlayers={filteredPlayers}
          watchlist={ui.watchlist}
          queuedPlayerIds={queries.queuedPlayerIds}
          autoPickTeamIds={queries.autoPickTeamIds}
          boardOrderedTeams={queries.boardOrderedTeams}
          pickHistory={queries.pickHistory}
          currentPickInfo={queries.currentPickInfo}
          statsLookup={playerData.statsLookup}
          leagueTeamsLength={queries.leagueTeams.length}
          hasMorePlayers={queries.hasMorePlayers}
          loadingMore={queries.loadingMore}
          onlineTeamIds={onlineTeamIds}
          myTeam={playerData.myTeam}
          positionCounts={playerData.positionCounts}
          leaguePositions={queries.leaguePositions}
          maxRosterSize={queries.league?.maxRosterSize ?? null}
          onSetSearchTerm={ui.setSearchTerm}
          onSetSelectedPosition={ui.setSelectedPosition}
          onSetViewMode={ui.setViewMode}
          onSetWatchlist={ui.setWatchlist}
          onDraftPlayer={handleDraftPlayer}
          onCommissionerPick={handleCommissionerPick}
          onToggleQueue={handleToggleQueuePlayer}
          onLoadMore={handleLoadMore}
          onPlayerDragStart={handlePlayerDragStart}
          onPlayerDragEnd={handlePlayerDragEnd}
        />

        <DraftRail
          isPremium={isPremium}
          isMyPick={isMyPick}
          commPickMode={ui.commPickMode}
          isOwner={queries.isCommissioner}
          isGeneralManager={queries.isGeneralManager}
          draftId={queries.draftId}
          myTeamId={queries.myTeamId}
          currentOverallPick={queries.currentPickInfo?.overallPick ?? 0}
          currentPickInfo={queries.currentPickInfo}
          currentPickTeamId={queries.currentPickTeamId}
          currentPickLoadError={ui.currentPickLoadError}
          onlineTeamIds={onlineTeamIds}
          initDraftLoading={actions.initDraftLoading}
          autoPickDisabled={ui.autoPickDisabled}
          myTeam={playerData.myTeam}
          positionCounts={playerData.positionCounts}
          sport={sport}
          pickHistory={queries.pickHistory}
          statsLookup={playerData.statsLookup}
          teamNameById={queries.teamNameById}
          chatOpen={ui.chatOpen}
          onShowToast={ui.showToast}
          onDraftPlayer={handleDraftPlayer}
          onCommissionerPick={handleCommissionerPick}
          onInitializeDraft={(order) =>
            void actions.handleInitializeDraft(order)
          }
          onRetryCurrentPick={handleRetryCurrentPick}
          onToggleChat={() => ui.setChatOpen(!ui.chatOpen)}
          onRefresh={handleRefresh}
          draggedPlayer={draggedPlayer}
        />
      </div>

      {/* Overlays */}
      {ui.draftPaused && (
        <div className="d-paused-overlay" role="alert" aria-live="assertive">
          <div className="d-paused-card">
            <div className="d-paused-icon">
              <span role="img" aria-label="paused">
                ⏸️
              </span>
            </div>
            <div className="d-paused-title">DRAFT PAUSED</div>
            {queries.isCommissioner ? (
              <button
                className="d-paused-resume-btn"
                onClick={() => void actions.handleResumeDraft()}
                disabled={actions.resumeLoading}
              >
                {actions.resumeLoading ? 'Resuming…' : 'Resume Draft'}
              </button>
            ) : (
              <div className="d-paused-desc">
                The commissioner has paused the draft. You&apos;ll be notified
                when it resumes.
              </div>
            )}
          </div>
        </div>
      )}

      {ui.announcement && 'name' in ui.announcement.player && (
        <PickAnnouncement
          player={ui.announcement.player}
          pickNumber={ui.announcement.pickNumber}
          round={ui.announcement.round}
          roundPickNumber={ui.announcement.roundPickNumber}
          isMyPick={ui.announcement.isMyPick}
          isAuto={ui.announcement.isAuto}
          leaving={ui.announcementLeaving}
          commentary={announcementCommentary}
          onDismiss={ui.dismissAnnouncement}
        />
      )}

      {ui.toastMessage && (
        <div
          className={`d-toast ${ui.toastMessage.type}`}
          role="alert"
          aria-live="assertive"
          onClick={() => ui.setToastMessage(null)}
        >
          {ui.toastMessage.text}
        </div>
      )}
      {ui.urgentMessage && !ui.toastMessage && (
        <div
          className="d-toast error"
          role="alert"
          aria-live="assertive"
          onClick={() => ui.setUrgentMessage('')}
        >
          {ui.urgentMessage}
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {ui.liveMessage}
      </div>
      <div className="sr-only" aria-live="assertive">
        {ui.urgentMessage}
      </div>

      {ui.chatOpen && leagueId !== null && renderChat && (
        <DraftChatOverlay
          leagueId={leagueId}
          userId={userId}
          leagueTeams={queries.leagueTeams}
          onClose={() => ui.setChatOpen(false)}
          renderChat={renderChat}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles (compact-branch FlatList only — the wide branch uses the raw-CSS
// `.d-*` classes injected via <style>{CSS}</style> above)
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  playerList: {
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 16,
  },
});
