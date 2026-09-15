import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import { ScrollView, Text, useMedia, XStack, YStack } from 'tamagui';
import { Sport, useGetUserByIdQuery } from '@legacy-sports/graphql';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import { CSS } from './styles';
import { DraftCompleteView } from './DraftCompleteView';
import { DraftPlayerBoard } from './DraftPlayerBoard';
import { PickAnnouncement } from './PickAnnouncement';
import { getDraftCommentary } from './draftUtils';
import { AuctionDraftRoom } from './auction/AuctionDraftRoom';
import { PreDraftLobby } from './PreDraftLobby';
import { DraftTopBand } from './DraftTopBand';
import { DraftRail } from './DraftRail';
import { DraftDetailsPanel } from './DraftDetailsPanel';
import type { DraftDetailsSettings } from './draftDetails';
import { DraftRoundBoard } from './DraftRoundBoard';
import { DraftHeaderBand } from './DraftHeaderBand';
import { DraftConnectionBanner } from './DraftConnectionBanner';
import { DraftLastPickTicker } from './DraftLastPickTicker';
import { DraftBottomNav } from './DraftBottomNav';
import { DraftSlotStrip } from './DraftSlotStrip';
import { DraftPlayersTab } from './DraftPlayersTab';
import {
  DraftPickCta,
  DraftPickSheet,
  SQUAD_SHEET_HEIGHT_PERCENT,
} from './DraftPickSheet';
import { DraftSquadStrip } from './DraftSquadStrip';
import { DraftQueueTab } from './DraftQueueTab';
import { DraftTeamTab } from './DraftTeamTab';
import { DraftPickToast } from './DraftPickToast';
import { DraftMyPickAnnouncement } from './DraftMyPickAnnouncement';
import { DraftRoomRecap } from './DraftRoomRecap';
import { resolveBoardRounds } from './nativeDraftBoard';
import {
  AuctionNotSupportedScreen,
  AutomatedDraftScreen,
  ConnectionLostScreen,
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
  useDraftViewportTier,
  useDraftWebSocket,
  usePlayerData,
} from './hooks';
import { DraftChatOverlay } from './DraftChatOverlay';
import { DEFAULT_NUM_TEAMS } from './constants';
import type { DraftChatRenderer } from './DraftChatOverlay';
import type { DraftChatTabRenderer } from './DraftChatTab';
import type { DraftPickRecord, DraftPlayer } from './types';
import { useAuth } from '../../features/auth';
import { useHasEntitlement } from '../../hooks/useEntitlement';
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
  /**
   * Optional data-source render prop for the Chat tab body (LS-9401,
   * compact/narrow-viewport shell only). If omitted, the Chat tab shows the
   * "coming soon" placeholder like the other not-yet-built tabs. Kept
   * separate from `renderChat` — see `DraftChatTabRenderer`.
   */
  renderChatTab?: DraftChatTabRenderer;
  /** Optional callback fired when a player is drafted (for analytics). */
  onPlayerDrafted?: (playerId: number, position: string) => void;
  /**
   * Active sport for this league. Drives stat-table headers, position filter
   * pills, lobby copy, and the `data-sport` attribute on the root. Optional:
   * when omitted the screen reads `league.sport` from its own league query, so
   * a football league renders a football board on either sport's route
   * (ADR 0011 / LS-4658). Pass it explicitly only to override that.
   */
  sport?: SportKind;
  /**
   * Called when the draft transitions between active (in-progress/paused) and
   * inactive states. Callers can use this to set up navigation guards that
   * prevent accidental back-button exits from an active draft session (LS-4986).
   */
  onActiveDraftChange?: (active: boolean) => void;
  /**
   * Bottom safe-area inset (e.g. from `useSafeAreaInsets().bottom`), forwarded
   * to the compact branch's persistent bottom nav so Android's edge-to-edge
   * system navigation bar does not cover the tabs (LS-9444). Defaults to 0 for
   * platforms without a safe-area concept (web).
   */
  bottomInset?: number;
  /**
   * Optional override for the Exit Draft control's navigation. When omitted,
   * Exit Draft falls back to `onNavigate('/baseball')` (web's behavior, where
   * `/baseball` is a real page). Native callers should pass a stack-popping
   * navigator (e.g. `closeToHomeTab`) instead of a forward push, since native's
   * `/baseball` is a redirect-only route sitting outside the tab stack
   * (LS-9446).
   */
  onExitDraft?: () => void;
  /**
   * Platform-specific persistence for the "download draft packet" feature
   * (LS-9750) — web triggers a browser download, mobile opens the native
   * share sheet. Optional: when omitted the download button is a no-op.
   */
  onDownloadDraftPacket?: (contents: string, filename: string) => void;
}

/** Type guard narrowing an unknown value to a known defensiveFormat literal. */
function isDefensiveFormatLiteral(value: unknown): value is 'dst' | 'idp' {
  return value === 'dst' || value === 'idp';
}

/**
 * Draft Room v2 shell (LS-9397) + Queue/Team tabs (LS-9400) + Chat tab
 * (LS-9401). The Board tab is the round board (LS-10000) plus the pick sheet
 * (LS-10002), which re-hosts the Players browser (LS-9399) over the board —
 * that browser has no bottom-nav tab of its own on phone any more, so there
 * is exactly one way to reach it.
 */

// ---------------------------------------------------------------------------
// Compact-branch chrome (narrow-viewport only — folded in from the former
// EliteDraftBoardScreen.native.tsx fork, LS-9207)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Compact (narrow-viewport) live-board — a separate component so its
// compact-only hooks (useDraftPalette et al) only run when this subtree
// actually mounts. `EliteDraftBoardScreen` calling useDraftPalette()
// unconditionally at its own top level previously crashed apps/web's test
// environment (no useThemeName mock there) even though the wide branch never
// used it — this render path is only reachable when useDraftViewportTier()
// returns 'phone' (LS-9207 review fix).
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
  /** Active league sport — drives Queue/Team tab position colors (LS-9400). */
  sport: SportKind;
  /** League's defensive format ('dst' | 'idp') — drives which football
   *  position chips the pick sheet's browser offers (LS-9475). */
  defensiveFormat: 'dst' | 'idp' | null;
  /** Mock drafts only — no real teammates to leave hanging (LS-9238). */
  isMockDraft: boolean;
  /** Premium (LS-9253): every team's turn is pickable, routed through the
   *  commissionerPick mutation under the hood — no CPU auto-picker exists
   *  in this mode. */
  controlAllTeams: boolean;
  /** Bottom safe-area inset reserved under the persistent bottom nav (LS-9444). */
  bottomInset: number;
  /** Read-only league/draft settings summary rendered under the Team tab (LS-9857). */
  draftDetails: DraftDetailsSettings;
  /**
   * True while the live socket has been down long enough to warn about but
   * not long enough to replace the board (LS-9856) — renders the reconnecting
   * banner and marks the pick clock stale.
   */
  connectionStale: boolean;
  /** Forces a fresh socket handshake from the banner's Retry action. */
  onRetryConnection: () => void;
  onExitDraft: () => void;
  onDraftPlayer: (id: number) => void;
  onCommissionerPick: (id: number) => void;
  onLoadMore: () => void;
  /** League id passed to `renderChatTab`'s data connector (LS-9401); null
   *  before the league has loaded, matching `EliteDraftBoardScreenProps`. */
  leagueId: number | null;
  /** Viewer's user id, passed to `renderChatTab` as the "mine" bubble check. */
  userId: number;
  renderChatTab?: DraftChatTabRenderer;
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
  sport,
  defensiveFormat,
  isMockDraft,
  controlAllTeams,
  bottomInset,
  draftDetails,
  connectionStale,
  onRetryConnection,
  onExitDraft,
  onDraftPlayer,
  onCommissionerPick,
  onLoadMore,
  leagueId,
  userId,
  renderChatTab,
}: CompactLiveDraftBoardProps): React.JSX.Element {
  const hasChatTab = leagueId !== null && !!renderChatTab;

  // Unread-chat dot (LS-9401, README "Chat tab"): clears the moment the
  // Chat tab is opened, and is set only when a new message arrives while a
  // *different* tab is active. The renderChatTab data connector stays
  // mounted regardless of activeTab (display:none when hidden) specifically
  // so this can fire while the viewer is elsewhere.
  const handleNewChatMessage = useCallback(() => {
    if (ui.activeTab !== 'chat') ui.setUnreadChat(true);
  }, [ui]);

  useEffect(() => {
    if (ui.activeTab === 'chat') ui.setUnreadChat(false);
  }, [ui]);

  // Pick sheet (LS-10002) — raised over the board by the CTA or the viewer's
  // own on-the-clock tile; owned here rather than in useDraftUIState because
  // nothing outside the phone board ever reads it.
  const [pickSheetOpen, setPickSheetOpen] = useState(false);

  // Squad sheet (LS-10001) — raised from the persistent squad strip. Local for
  // the same reason as the pick sheet above: nothing outside the phone board
  // reads it. The *selected team* it shows still lives in `useDraftUIState`,
  // which is what survived the roster tab's removal.
  const [squadSheetOpen, setSquadSheetOpen] = useState(false);

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

  // A real commissioner force-pick override — never true for Control All
  // Teams mock drafts, since LS-9242 hides the commissioner bar (and its
  // COMM PICK toggle) there entirely. Kept separate from controlAllTeams so
  // the "ASSIGN"/Force-Pick framing stays exclusive to actual commissioner
  // overrides (LS-9253 wants a first-class pick action, not an override).
  const isRealCommPick = ui.commPickMode && queries.isCommissioner;
  const canDraft = isMyPick || controlAllTeams || isRealCommPick;
  // Which mutation a tap on the Draft/Assign button should fire: real
  // commissioner overrides and Control All Teams turns for teams other than
  // the human's own seat both go through commissionerPick (it doesn't check
  // turn ownership, just commissioner permission); the human's own turn
  // still uses the normal makeDraftPick path.
  const handlePlayerRowPress = useCallback(
    (id: number) => {
      if (isRealCommPick || (controlAllTeams && !isMyPick)) {
        onCommissionerPick(id);
      } else {
        onDraftPlayer(id);
      }
    },
    [
      isRealCommPick,
      controlAllTeams,
      isMyPick,
      onCommissionerPick,
      onDraftPlayer,
    ],
  );
  const handleToggleQueue = useCallback(
    (id: number) => {
      void actions.handleToggleQueue(id);
    },
    [actions],
  );
  // Mock drafts auto-register the human as "commissioner" (initialize-mock-draft.ts)
  // so the queue/pick flow works, but there's no real commissioner role to manage
  // in a solo practice draft — the controls should never surface there (LS-9242).
  const showCommissionerBar =
    queries.isCommissioner && !queries.league?.isMockDraft;

  // ---- Draft Room v2 shell (LS-9397): header band + ticker + bottom nav ----
  const lastPick = useMemo(
    () =>
      queries.pickHistory.reduce<DraftPickRecord | null>(
        (latest, pick) =>
          latest == null || pick.overallPick > latest.overallPick
            ? pick
            : latest,
        null,
      ),
    [queries.pickHistory],
  );

  const topQueuedPlayerName = useMemo(() => {
    if (!isMyPick) return null;
    const entries = queries.queueEntries ?? [];
    if (entries.length === 0) return null;
    const top = [...entries].sort(
      (a, b) =>
        (a.priority ?? Number.MAX_SAFE_INTEGER) -
        (b.priority ?? Number.MAX_SAFE_INTEGER),
    )[0];
    if (top?.playerId == null) return null;
    const stats = playerData.statsLookup.get(top.playerId);
    if (stats) return stats.name;
    return top.player
      ? `${top.player.firstName} ${top.player.lastName}`.trim()
      : null;
  }, [isMyPick, queries.queueEntries, playerData.statsLookup]);

  // Board tab: tapping the viewer's own on-the-clock tile raises the pick
  // sheet, same as the CTA — the pick happens without leaving the board.
  const openPickSheet = useCallback(() => setPickSheetOpen(true), []);
  // Drafting from the sheet completes the pick and drops the sheet, so the
  // pick toast/splash lands on the board rather than behind the scrim. A
  // failed pick still surfaces through the board's own urgent-error overlay.
  const handleSheetDraft = useCallback(
    (id: number) => {
      handlePlayerRowPress(id);
      setPickSheetOpen(false);
    },
    [handlePlayerRowPress],
  );
  const currentPickInfo = queries.currentPickInfo;
  const pickSheetSubtitle = currentPickInfo
    ? `Pick #${currentPickInfo.overallPick} · Round ${currentPickInfo.round}`
    : undefined;

  return (
    <YStack flex={1} backgroundColor="$background">
      {connectionStale && <DraftConnectionBanner onRetry={onRetryConnection} />}
      <DraftHeaderBand
        connectionStale={connectionStale}
        isMyPick={isMyPick}
        draftPaused={ui.draftPaused}
        untimed={untimed}
        round={round}
        roundPickNumber={queries.currentPickInfo?.pickNumber ?? currentPick}
        timeRemaining={timeRemaining}
        pickTimeLimitSeconds={ui.pickTimeLimitSeconds}
        onClockTeamName={queries.teamNameById(queries.currentPickTeamId)}
        topQueuedPlayerName={topQueuedPlayerName}
      />
      <DraftLastPickTicker
        lastPick={lastPick}
        statsLookup={playerData.statsLookup}
        teamName={lastPick ? queries.teamNameById(lastPick.teamId) : ''}
      />

      {/* Mounted regardless of activeTab (display:none when hidden) so the
          connector's live subscription keeps running and can still report
          "message arrives while another tab is open" for the unread dot.
          Narrowing leagueId/renderChatTab inline (rather than via the
          `hasChatTab` boolean) so TypeScript proves both are defined here
          without a non-null assertion. */}
      {leagueId !== null && renderChatTab && (
        <YStack
          flex={1}
          testID="draft-chat-tab-slot"
          style={{ display: ui.activeTab === 'chat' ? 'flex' : 'none' }}
        >
          {renderChatTab({
            leagueId,
            userId,
            onNewMessage: handleNewChatMessage,
          })}
        </YStack>
      )}
      {ui.activeTab === 'queue' ? (
        <DraftQueueTab
          draftId={queries.draftId ?? 0}
          entries={queries.queueEntries}
          statsLookup={playerData.statsLookup}
          sport={sport}
          onRemove={(playerId) => void actions.handleToggleQueue(playerId)}
          onError={(message) => ui.showToast(message, 'error')}
        />
      ) : ui.activeTab === 'chat' && !hasChatTab ? (
        <YStack
          flex={1}
          alignItems="center"
          justifyContent="center"
          padding="$6"
        >
          <Text color="$fg4" textAlign="center">
            Chat tab is coming soon.
          </Text>
        </YStack>
      ) : null}
      {ui.activeTab === 'board' && (
        <>
          {/* The board scrolls; the CTA below it does not. A 14-team round
              plus the commissioner bar outgrows a short phone, and the pick
              control must never be the thing that falls off the fold. */}
          <ScrollView flex={1} contentContainerStyle={{ paddingBottom: 8 }}>
            <DraftRoundBoard
              teams={boardTeams}
              picks={queries.pickHistory}
              currentPickInfo={queries.currentPickInfo}
              myTeamId={queries.myTeamId}
              statsLookup={playerData.statsLookup}
              rounds={boardRounds}
              sport={sport}
              onMakePick={openPickSheet}
            />

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

            {/* ---- Exit Draft — mock drafts only, no real teammates to leave hanging (LS-9238) ---- */}
            {isMockDraft && (
              <XStack
                gap="$2"
                paddingHorizontal="$3"
                paddingTop={8}
                alignItems="center"
              >
                <GhostButton label="EXIT DRAFT" onPress={onExitDraft} />
              </XStack>
            )}
          </ScrollView>

          {/* ---- Pick CTA (LS-10002) ---- */}
          <YStack paddingHorizontal={14} paddingVertical={10}>
            <DraftPickCta
              canDraft={canDraft}
              untimed={untimed}
              draftPaused={ui.draftPaused}
              timeRemaining={timeRemaining}
              pickTimeLimitSeconds={ui.pickTimeLimitSeconds}
              onPress={openPickSheet}
            />
          </YStack>
        </>
      )}

      {/* ---- Squad strip (LS-10001): replaces the roster tab ----
          Outside the activeTab switch on purpose — "persistent" is the point.
          Now that Team is gone from the nav, this is the *only* route to the
          roster, so it has to be reachable from Queue and Chat too, not just
          the Board. Sits directly above the bottom nav, matching the design's
          `.mob-squad` as the bottom-most band with the CTA above it. */}
      <DraftSquadStrip
        leaguePositions={queries.leaguePositions}
        players={playerData.myTeam}
        sport={sport}
        maxRosterSize={queries.league?.maxRosterSize ?? null}
        onOpen={() => setSquadSheetOpen(true)}
      />

      {/* ---- Squad sheet (LS-10001): the expanded strip ----
          Hosts the existing DraftTeamTab verbatim rather than a second roster
          view — it already owns the team switcher the design's `.mob-sheet`
          keeps ("any team's roster is inspectable") and the compact home for
          the Draft Details panel (LS-9857), both of which would otherwise be
          lost with the tab. */}
      <DraftPickSheet
        open={squadSheetOpen}
        onOpenChange={setSquadSheetOpen}
        title="Squad"
        heightPercent={SQUAD_SHEET_HEIGHT_PERCENT}
        testID="draft-squad-sheet"
        bottomInset={bottomInset}
      >
        {/* No wrapper scroller: DraftTeamTab owns its own ScrollView (the one
            its `footer` renders inside), and nesting a second would strand the
            inner list's gesture. The sheet frame only bounds it. */}
        <DraftTeamTab
          teams={
            queries.boardOrderedTeams.length > 0
              ? queries.boardOrderedTeams
              : queries.leagueTeams
          }
          myTeamId={queries.myTeamId}
          selectedTeamId={ui.selectedTeamId}
          onSelectTeam={ui.setSelectedTeamId}
          pickHistory={queries.pickHistory}
          statsLookup={playerData.statsLookup}
          leaguePositions={queries.leaguePositions}
          sport={sport}
          maxRosterSize={queries.league?.maxRosterSize ?? null}
          footer={
            <YStack marginTop="$3">
              <DraftDetailsPanel
                settings={draftDetails}
                testID="draft-details-panel-compact"
              />
            </YStack>
          }
        />
      </DraftPickSheet>

      {/* ---- Pick sheet (LS-10002): the phone tier's one player browser ---- */}
      <DraftPickSheet
        open={pickSheetOpen}
        onOpenChange={setPickSheetOpen}
        subtitle={pickSheetSubtitle}
        bottomInset={bottomInset}
      >
        <DraftPlayersTab
          players={playerData.enrichedPlayers}
          myTeam={playerData.myTeam}
          sport={sport}
          leaguePositions={queries.leaguePositions}
          defensiveFormat={defensiveFormat}
          maxRosterSize={queries.league?.maxRosterSize ?? null}
          selectedPosition={ui.selectedPosition}
          searchTerm={ui.searchTerm}
          onSetSelectedPosition={ui.setSelectedPosition}
          onSetSearchTerm={ui.setSearchTerm}
          canDraft={canDraft}
          draftActionLabel={isRealCommPick ? 'ASSIGN' : 'DRAFT'}
          currentPickInfo={queries.currentPickInfo}
          boardOrderedTeams={boardTeams}
          myTeamId={queries.myTeamId}
          queuedPlayerIds={queries.queuedPlayerIds}
          onToggleQueue={handleToggleQueue}
          onDraftPlayer={handleSheetDraft}
          hasMorePlayers={queries.hasMorePlayers}
          loadingMore={queries.loadingMore}
          onLoadMore={onLoadMore}
        />
      </DraftPickSheet>

      {/* ---- Draft Room v2 overlays (LS-9402): AI-pick toast + my-pick announcement (LS-10205) ---- */}
      <DraftPickToast
        queue={ui.pickToastQueue}
        onDismiss={ui.dequeuePickToast}
        sport={sport}
      />
      <DraftMyPickAnnouncement
        queue={ui.pickSplashQueue}
        onDismiss={ui.dequeuePickSplash}
        teamName={queries.teamNameById(queries.myTeamId)}
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
      <DraftBottomNav
        activeTab={ui.activeTab}
        onChangeTab={ui.setActiveTab}
        unreadChat={ui.unreadChat}
        bottomInset={bottomInset}
      />
    </YStack>
  );
}

export function EliteDraftBoardScreen({
  leagueId,
  onNavigate,
  websocketUrl,
  token,
  renderChat,
  renderChatTab,
  onPlayerDrafted,
  sport: sportOverride,
  onActiveDraftChange,
  bottomInset = 0,
  onExitDraft,
  onDownloadDraftPacket,
}: EliteDraftBoardScreenProps): React.JSX.Element {
  const { user, token: authToken } = useAuth();
  const userId = user?.id ?? 0;
  const isAuthenticated = !!user;
  // `phone` is the only tier that swaps the whole board for
  // `CompactLiveDraftBoard`; `tablet` and `desktop` both render the wide
  // branch below and differ only in the CSS `styles.ts` applies to it.
  const isCompact = useDraftViewportTier() === 'phone';
  // `.d-layout`'s responsive grid (LS-10067) — ported off styles.ts's
  // `@media (max-width: ...)` rules onto Tamagui's `useMedia()`. Called
  // unconditionally here (rules-of-hooks: several early returns follow
  // below, e.g. `NoLeagueScreen`/`LoadingScreen`) even though the computed
  // value below is only consumed by the wide-viewport branch's `.d-layout`
  // div — see `layoutGridStyle` near that JSX.
  //
  // `$md`/`$lg`/`$xxl` derive from `@legacy-sports/design-tokens`
  // `breakpoints` (LS-9885/9896), the same scale `styles.ts`'s
  // `BP_TABLET_MAX`/`BP_LAND_MAX` already use (`breakpoints.lg - 1` /
  // `breakpoints.xl - 1`), so this reproduces the exact same 979px/1119px
  // boundaries as the CSS it replaces — not the 1034px figure that appears
  // in some ticket descriptions of this work, which doesn't match any
  // breakpoint actually defined in this file. `$xxl` (LS-10162) is the
  // ≥1280px wide-desktop band (a `minWidth` query — see tamagui-config.ts).
  //
  // Bound through an explicit signature so the call/result stay type-safe
  // under this project's typed ESLint rules (same pattern as PreDraftLobby's
  // `readMedia`/`iconFontSize`).
  const readMedia = useMedia as
    | (() => { md?: boolean; lg?: boolean; xxl?: boolean })
    | undefined;
  const media = readMedia?.() ?? {};

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

  // Capability-based gate (LS-9750) per useEntitlement.ts's own guidance —
  // new shared-component gates should check the entitlement directly rather
  // than threading a coarse tier-based `isPremium` down from each platform.
  const hasDraftPacketEntitlement = useHasEntitlement(
    ENTITLEMENTS.draft_packet,
  );

  const ui = useDraftUIState();

  const queries = useDraftQueries({
    leagueId,
    playerSearch: ui.playerSearch,
    selectedPosition: ui.selectedPosition,
    viewMode: ui.viewMode,
    isCompact,
  });

  // The league itself is the source of truth for the board's sport: neither the
  // web nor the native route passes a `sport` prop, so before this every league
  // rendered a baseball board (baseball stat columns and position pills) even
  // when `league.sport === 'football'`. The explicit prop still wins when a
  // caller supplies one.
  const sport: SportKind =
    sportOverride ??
    (queries.league?.sport === Sport.Football ? 'football' : 'baseball');

  // Football's position-filter pills depend on the league's defensive format
  // (LS-9475) — `leaguePositions` can't be used for this (empty for mock
  // drafts, which never seed league_positions), so this reads directly off
  // the league row, which always carries a defensiveFormat value. Converted
  // to a plain literal (mirroring the `sport` derivation above) rather than
  // passed through as the generated `DefensiveFormat` enum — shared-component
  // props take plain strings, not GraphQL-generated types. Narrowed via a
  // type guard (rather than comparing the `DefensiveFormat` enum directly)
  // so this doesn't depend on that enum surviving test mocks of
  // @legacy-sports/graphql, and so the comparison isn't flagged as an unsafe
  // cross-enum comparison by lint. Any value other than the two known
  // literals — including a mock/test double, an unrecognized future enum
  // member, or a missing league row — safely falls through to `null`.
  const rawDefensiveFormat: unknown = queries.league?.defensiveFormat;
  const defensiveFormat: 'dst' | 'idp' | null = isDefensiveFormatLiteral(
    rawDefensiveFormat,
  )
    ? rawDefensiveFormat
    : null;

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
    sport,
    footballStatsMap: queries.footballStatsMap,
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

  const { connectionStatus, retryConnection } = useDraftWebSocket({
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
    enqueuePickToast: ui.enqueuePickToast,
    enqueuePickSplash: ui.enqueuePickSplash,
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

  // Draft Details rail panel (LS-9857) — read-only summary built entirely from
  // settings the board already fetches (league row + draft row). `untimed`
  // (offline mock drafts, LS-9144) has no pick clock at all, so it reports as
  // such rather than echoing a limit that never fires.
  const draftDetails: DraftDetailsSettings = useMemo(
    () => ({
      sport,
      draftOrder: queries.leagueDraft?.draftOrder ?? null,
      maxRosterSize: queries.league?.maxRosterSize ?? null,
      pickTimeLimitSeconds: untimed ? 0 : ui.pickTimeLimitSeconds,
      autoPickDisabled: ui.autoPickDisabled,
      eraFilter: queries.league?.eraFilter ?? null,
      customEraStartYear: queries.league?.customEraStartYear ?? null,
      customEraEndYear: queries.league?.customEraEndYear ?? null,
      minCareerGames: queries.league?.minCareerGames ?? null,
      baseballHofOnly: queries.league?.baseballHofOnly ?? null,
    }),
    [
      sport,
      untimed,
      ui.pickTimeLimitSeconds,
      ui.autoPickDisabled,
      queries.leagueDraft?.draftOrder,
      queries.league?.maxRosterSize,
      queries.league?.eraFilter,
      queries.league?.customEraStartYear,
      queries.league?.customEraEndYear,
      queries.league?.minCareerGames,
      queries.league?.baseballHofOnly,
    ],
  );

  // LS-9238: the live board otherwise has no way to leave a mock draft in
  // progress — real leagues intentionally omit this (other drafters are
  // waiting on you), but a mock draft has no one to leave hanging.
  const isMockDraft = queries.league?.isMockDraft === true;
  // LS-9859: same gate the compact shell's commissioner bar uses
  // (`showCommissionerBar` in CompactLiveDraftBoard) — commissioner, but not a
  // mock draft, where the solo human is auto-registered as "commissioner"
  // (LS-9242). Drives the rail's Draft Pick Order panel.
  const showCommissionerControls = queries.isCommissioner && !isMockDraft;
  // Premium Control All Teams mode (LS-9253): the human picks for every
  // team, so every turn should be pickable regardless of whose seat it is.
  const controlAllTeams = queries.league?.controlAllTeams === true;
  const handleExitDraft = useCallback(() => {
    if (onExitDraft) {
      onExitDraft();
      return;
    }
    onNavigate('/baseball');
  }, [onExitDraft, onNavigate]);

  // Connection treatment (LS-9856). Two tiers, both driven by the debounced
  // status out of useDraftWebSocket: `reconnecting` leaves the board up but
  // banners it and marks the pick clock stale; `lost` replaces the board
  // entirely (below, once the live-draft branches are reached).
  const connectionStale = connectionStatus === 'reconnecting';

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
    // Draft Room v2 (LS-9402): the compact branch gets the new recap —
    // README "Draft-complete recap" — reusing LS-9400's roster-slot-row.
    // The wide-viewport branch is out of scope for this redesign and keeps
    // the pre-v2 DraftCompleteView unchanged.
    if (isCompact) {
      return (
        <DraftRoomRecap
          pickHistory={queries.pickHistory}
          myTeamPicks={playerData.myTeamPicks}
          myTeam={playerData.myTeam}
          statsLookup={playerData.statsLookup}
          leaguePositions={queries.leaguePositions}
          sport={sport}
          maxRosterSize={queries.league?.maxRosterSize ?? null}
          isPremium={hasDraftPacketEntitlement}
          teamNameById={queries.teamNameById}
          leagueName={queries.league?.name}
          onDownloadPacket={onDownloadDraftPacket}
        />
      );
    }
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
        scheduledAt={queries.leagueDraft?.scheduledAt}
        roundCount={queries.league?.maxRosterSize}
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

  // A sustained outage replaces the live board outright (LS-9856). Placed
  // after every non-live branch on purpose: the pre-draft lobby, the recap,
  // and the error screens carry no live state, so a dead socket is not a
  // reason to hide them.
  if (connectionStatus === 'lost') {
    return (
      <ConnectionLostScreen
        onRetry={retryConnection}
        onBack={handleExitDraft}
      />
    );
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
        sport={sport}
        defensiveFormat={defensiveFormat}
        isMockDraft={isMockDraft}
        controlAllTeams={controlAllTeams}
        bottomInset={bottomInset}
        draftDetails={draftDetails}
        connectionStale={connectionStale}
        onRetryConnection={retryConnection}
        onExitDraft={handleExitDraft}
        onDraftPlayer={handleDraftPlayer}
        onCommissionerPick={handleCommissionerPick}
        onLoadMore={handleLoadMore}
        leagueId={leagueId}
        userId={userId}
        renderChatTab={renderChatTab}
      />
    );
  }

  // ---- Main Live Draft UI: wide-viewport branch ----
  //
  // `.d-layout`'s responsive states (LS-10067), reproducing styles.ts's
  // `BP_TABLET_MAX`/`BP_LAND_MAX` media queries via `media` from
  // `useMedia()` above rather than raw CSS, matched against the design
  // bundle's adaptive.css (docs/design/.../legacy-sports-draft-board):
  //   - `media.md` (≤979): rail becomes a shelf BELOW main, not above it
  //     (adaptive.css:175 — LS-10162 fixed the area order here, which had
  //     the rail on top).
  //   - `media.lg && !media.md` (980–1119): side rail at 300px
  //     (adaptive.css:216).
  //   - `media.xl && !media.lg` (1120–1279): side rail at its full 320px
  //     (adaptive.css:223 — unchanged, already correct).
  //   - `media.xxl` (≥1280): side rail at 340px (adaptive.css:230). The
  //     design has a further split to 360px at ≥1400 (adaptive.css:243),
  //     but the design-token scale (breakpoints.ts) tops out at `xxl`
  //     (1280+) with no 1400 band, so that split is a deliberate,
  //     recorded deviation rather than implemented here.
  // The base `.d-layout` class (styles.ts) still supplies everything this
  // doesn't touch — position, height, overflow, z-index — this only
  // overrides the grid template, the same `gridArea`-needs-a-`style`-escape-
  // hatch tradeoff DraftRail.tsx/DraftTopBand.tsx/DraftPlayerBoard.tsx
  // already make for their own placement within this grid.
  const isNarrowDesktopRail = Boolean(media.lg) && !media.md;
  const isWideDesktopRail = Boolean(media.xxl);
  const desktopRailWidth = isNarrowDesktopRail
    ? 300
    : isWideDesktopRail
      ? 340
      : 320;
  const layoutGridStyle: React.CSSProperties = media.md
    ? {
        gridTemplateColumns: '1fr',
        gridTemplateRows: 'auto auto 1fr',
        gridTemplateAreas: '"topband" "main" "rail"',
      }
    : {
        gridTemplateColumns: `1fr ${desktopRailWidth}px`,
        gridTemplateRows: 'auto 1fr',
        gridTemplateAreas: '"topband topband" "main rail"',
      };

  return (
    <div className="d-root" data-sport={sport}>
      <style>{CSS}</style>
      <div className="d-bg-fx" />
      {connectionStale && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 300,
          }}
        >
          <DraftConnectionBanner onRetry={retryConnection} />
        </div>
      )}
      <div className="d-layout" style={layoutGridStyle}>
        <DraftTopBand
          connectionStale={connectionStale}
          draftPaused={ui.draftPaused}
          currentPick={currentPick}
          round={round}
          timeRemaining={timeRemaining}
          pickTimeLimitSeconds={ui.pickTimeLimitSeconds}
          untimed={untimed}
          isMockDraft={isMockDraft}
          onExitDraft={handleExitDraft}
          isMyPick={isMyPick}
          currentPickInfo={queries.currentPickInfo}
          leagueTeamsLength={queries.leagueTeams.length}
          isCommissioner={queries.isCommissioner}
          isOwner={queries.isOwner}
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
          defensiveFormat={defensiveFormat}
          selectedPosition={ui.selectedPosition}
          searchTerm={ui.searchTerm}
          availablePlayersLoading={queries.availablePlayersLoading}
          commPickMode={ui.commPickMode}
          isOwner={queries.isCommissioner}
          isMyPick={isMyPick}
          controlAllTeams={controlAllTeams}
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
          timeRemaining={timeRemaining}
          pickTimeLimitSeconds={ui.pickTimeLimitSeconds}
          untimed={untimed}
          draftPaused={ui.draftPaused}
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
          controlAllTeams={controlAllTeams}
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
          draftDetails={draftDetails}
          showCommissionerControls={showCommissionerControls}
          leagueId={leagueId}
          draftStatus={queries.league?.draftStatus ?? null}
        />
      </div>

      {/* Positions-drafted slot strip (LS-10004) — pinned below `.d-layout`,
          which is shortened by exactly its height so it overlays nothing. */}
      <div className="d-slotbar">
        <DraftSlotStrip
          leaguePositions={queries.leaguePositions}
          players={playerData.myTeam}
          sport={sport}
          maxRosterSize={queries.league?.maxRosterSize ?? null}
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
