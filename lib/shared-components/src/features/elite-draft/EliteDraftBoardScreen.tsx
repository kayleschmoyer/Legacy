import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Platform,
  Pressable,
} from 'react-native';
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
import { DraftClockBar } from './DraftClockBar';
import { DraftSlimNav } from './DraftSlimNav';
import { DraftHero } from './DraftHero';
import { DraftConnectionBanner } from './DraftConnectionBanner';
import { DraftLastPickTicker } from './DraftLastPickTicker';
import { DraftSheetTabs } from './DraftSheetTabs';
import { DraftPickHistoryList } from './DraftPickHistoryList';
import { DraftSlotStrip } from './DraftSlotStrip';
import { DraftPlayersTab } from './DraftPlayersTab';
import {
  DraftPickCta,
  DraftPickSheet,
  SQUAD_SHEET_HEIGHT_PERCENT,
} from './DraftPickSheet';
import { DraftOpenSlotsBanner } from './DraftOpenSlotsBanner';
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
  useFetchDraftPlayer,
  usePlayerData,
} from './hooks';
import { DraftChatOverlay } from './DraftChatOverlay';
import { DEFAULT_NUM_TEAMS } from './constants';
import type { DraftChatRenderer } from './DraftChatOverlay';
import type { DraftChatTabRenderer } from './DraftChatTab';
import { MockDraftLobby } from './MockDraftLobby';
import { useMockDraftLobby } from './hooks/useMockDraftLobby';
import type { DraftPickRecord, DraftPlayer } from './types';
import type { DraftRoomTab } from './hooks/useDraftUIState';
import { useAuth } from '../../features/auth';
import { handleKeyActivate } from '../../utils/keyboardActivation';
import { useHasEntitlement } from '../../hooks/useEntitlement';
import { useScreenWakeLock } from '../../hooks/useScreenWakeLock';
import type { SportKind } from '../../config/sports';
import { hasErrorCode } from '../../utils/graphql-errors';

const CHAT_KEYBOARD_AVOIDING_STYLE = { flex: 1 } as const;

/**
 * The phone squad strip's height before its bottom safe-area padding, used
 * until its first layout reports the real frame: border 1 + padding 9 + 44px
 * header row + 8 gap + 46px chip track + padding 12 (DraftSquadStrip).
 */
const SQUAD_STRIP_BASE_HEIGHT = 120;
/** Breathing room between the squad strip and a toast resting above it. */
const COMPACT_OVERLAY_GAP = 8;

/**
 * Bottom offset for the phone board's toast and urgent-error overlays
 * (LS-10822). They float above the squad strip — the board's bottom-most band,
 * which already reserves the bottom safe-area inset (LS-9444) — so they are
 * never drawn into Android's edge-to-edge navigation bar nor over the
 * Positions Drafted chips. `measuredStripHeight` is the strip's laid-out
 * height (inset included); before it is known the inset plus the strip's
 * design height stands in.
 */
export function compactOverlayBottom(
  bottomInset: number,
  measuredStripHeight: number | null,
): number {
  const stripHeight =
    measuredStripHeight ?? SQUAD_STRIP_BASE_HEIGHT + Math.max(bottomInset, 0);
  return stripHeight + COMPACT_OVERLAY_GAP;
}

export interface EliteDraftBoardScreenProps {
  /** League ID to load (replaces route param). Null in draft-room mode. */
  leagueId: number | null;
  /**
   * Draft-room mode (LS-10076): render this draft directly, through
   * `draftRoom(draftId)`. A mock draft has no league, so this is the only way
   * it can be rendered; the league draft route resolves its own draftId and
   * passes it too, so both kinds take one path through the board.
   */
  draftId?: number | null;
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
   * Top safe-area inset (status bar), forwarded to the compact branch's
   * sheets so their close control never lands under the status bar
   * (LS-10593). Defaults to 0 (web).
   */
  topInset?: number;
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
/** Pick-sheet heading (and dialog name) per tab (LS-10165). */
const PICK_SHEET_TITLES: Record<DraftRoomTab, string> = {
  players: 'Available players',
  queue: 'Queue',
  history: 'Pick history',
};

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
  isMock: boolean;
  /** Premium (LS-9253): every team's turn is pickable, routed through the
   *  commissionerPick mutation under the hood — no CPU auto-picker exists
   *  in this mode. */
  controlAllTeams: boolean;
  /** Bottom safe-area inset reserved under the squad strip, sheets and chat
   *  panel — the phone board's bottom-most surfaces (LS-9444, LS-10165). */
  bottomInset: number;
  /** Top safe-area inset — keeps the sheets' close control below the status
   *  bar (LS-10593). */
  topInset: number;
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
  /** Draft id, for a mock draft's own chat source (LS-10076). */
  chatDraftId?: number | null;
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
  isMock,
  controlAllTeams,
  bottomInset,
  topInset,
  draftDetails,
  connectionStale,
  onRetryConnection,
  onExitDraft,
  onDraftPlayer,
  onCommissionerPick,
  onLoadMore,
  leagueId,
  chatDraftId,
  userId,
  renderChatTab,
}: CompactLiveDraftBoardProps): React.JSX.Element {
  // ---- Phone in-page navigation (LS-10165) ----
  // The draft room owns no nav bar. On native the route sits outside the
  // `(tabs)` shell with no stack header; on web at phone width the app keeps
  // its header and fixed MobileBottomBar on this route, so the old draft
  // bottom nav stacked a second bar on top of the app's. Instead: the board is
  // the page, Players / Queue / History are tabs in the pick sheet, and Chat
  // is a full-height panel raised from the clock bar's chat control.
  const [chatOpen, setChatOpen] = useState(false);
  const openChat = useCallback(() => setChatOpen(true), []);
  const closeChat = useCallback(() => setChatOpen(false), []);

  // Unread-chat dot (LS-9401): clears the moment the chat panel opens, and is
  // set only when a new message arrives while it is closed. The renderChatTab
  // data connector stays mounted while the panel is down (display:none)
  // specifically so this can fire while the viewer is on the board.
  const handleNewChatMessage = useCallback(() => {
    if (!chatOpen) ui.setUnreadChat(true);
  }, [ui, chatOpen]);

  useEffect(() => {
    if (chatOpen) ui.setUnreadChat(false);
  }, [ui, chatOpen]);

  // Pick sheet (LS-10002) — raised over the board by the CTA or the viewer's
  // own on-the-clock tile; owned here rather than in useDraftUIState because
  // nothing outside the phone board ever reads it.
  const [pickSheetOpen, setPickSheetOpen] = useState(false);

  // Squad sheet (LS-10001) — raised from the persistent squad strip. Local for
  // the same reason as the pick sheet above: nothing outside the phone board
  // reads it. The *selected team* it shows still lives in `useDraftUIState`,
  // which is what survived the roster tab's removal.
  const [squadSheetOpen, setSquadSheetOpen] = useState(false);

  // Toast / urgent-error anchor (LS-10822): measured from the squad strip so
  // the overlays clear both it and the bottom safe-area inset it reserves.
  const [squadStripHeight, setSquadStripHeight] = useState<number | null>(null);
  const handleSquadStripLayout = useCallback((event: LayoutChangeEvent) => {
    setSquadStripHeight(event.nativeEvent.layout.height);
  }, []);
  const overlayBottom = compactOverlayBottom(bottomInset, squadStripHeight);

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
  const showCommissionerBar = queries.isCommissioner && !isMock;

  // ---- Phone shell: slim nav + clock bar (LS-10204) + last-pick ticker ----
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

  // Tapping the viewer's own on-the-clock tile raises the pick sheet, same as
  // the CTA — the pick happens without leaving the board. Both are "pick a
  // player" actions, so they land on the Players tab whichever tab the sheet
  // was last left on.
  const openPickSheet = useCallback(() => {
    ui.setActiveTab('players');
    setPickSheetOpen(true);
  }, [ui]);
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
      <DraftSlimNav leagueName={queries.league?.name} onBack={onExitDraft} />
      <DraftClockBar
        connectionStale={connectionStale}
        isMyPick={isMyPick}
        draftPaused={ui.draftPaused}
        untimed={untimed}
        round={round}
        roundPickNumber={queries.currentPickInfo?.pickNumber ?? currentPick}
        timeRemaining={timeRemaining}
        pickTimeLimitSeconds={ui.pickTimeLimitSeconds}
        onClockTeamName={queries.teamNameById(queries.currentPickTeamId)}
        onOpenChat={openChat}
        unreadChat={ui.unreadChat}
      />
      <DraftLastPickTicker
        lastPick={lastPick}
        statsLookup={playerData.statsLookup}
        teamName={lastPick ? queries.teamNameById(lastPick.teamId) : ''}
      />

      {/* ---- Board: the page itself, never a tab (LS-10165) ---- */}
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
            draftOrder={queries.leagueDraft?.draftOrder}
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
          {isMock && (
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
          {/* Auto-pick status + toggle (LS-10593): the phone layout had
              neither, so users with auto-pick on had no idea and no way to
              turn it off. The server only accepts toggles mid-draft. */}
          {!ui.draftPaused && (
            <XStack
              testID="draft-autopick-toggle"
              marginTop={8}
              alignSelf="center"
              alignItems="center"
              gap={6}
              paddingHorizontal={10}
              minHeight={32}
              borderRadius={999}
              borderWidth={1}
              borderColor={
                actions.isMyTeamAutoPick ? '$brandGold' : '$outlineDefault'
              }
              onPress={() => void actions.handleToggleUserAutoPick()}
              pressStyle={{ opacity: 0.7 }}
              cursor="pointer"
              role="switch"
              accessibilityRole="switch"
              aria-checked={actions.isMyTeamAutoPick}
              accessibilityState={{ checked: actions.isMyTeamAutoPick }}
              aria-label="Auto-pick"
              accessibilityLabel="Auto-pick"
            >
              <Text
                fontSize={11}
                fontWeight="800"
                letterSpacing={1}
                textTransform="uppercase"
                color={actions.isMyTeamAutoPick ? '$brandGoldLight' : '$fg3'}
              >
                {actions.isMyTeamAutoPick
                  ? 'Auto-pick on · tap to turn off'
                  : 'Auto-pick off'}
              </Text>
            </XStack>
          )}
        </YStack>
      </>

      {/* ---- Squad strip (LS-10001): replaces the roster tab ----
          The only route to the roster. Matches the design's `.mob-squad` as
          the bottom-most band with the CTA above it, so it also reserves the
          bottom safe-area inset (LS-9444). */}
      <DraftSquadStrip
        leaguePositions={queries.leaguePositions}
        players={playerData.myTeam}
        sport={sport}
        maxRosterSize={queries.maxRosterSize ?? null}
        onOpen={() => setSquadSheetOpen(true)}
        bottomInset={bottomInset}
        onLayout={handleSquadStripLayout}
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
        topInset={topInset}
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
          maxRosterSize={queries.maxRosterSize ?? null}
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

      {/* ---- Pick sheet (LS-10002): Players / Queue / History (LS-10165) ---- */}
      <DraftPickSheet
        open={pickSheetOpen}
        onOpenChange={setPickSheetOpen}
        title={PICK_SHEET_TITLES[ui.activeTab]}
        subtitle={pickSheetSubtitle}
        bottomInset={bottomInset}
        topInset={topInset}
      >
        <DraftSheetTabs
          activeTab={ui.activeTab}
          onChangeTab={ui.setActiveTab}
        />
        {ui.activeTab === 'queue' ? (
          <DraftQueueTab
            draftId={queries.draftId ?? 0}
            entries={queries.queueEntries}
            statsLookup={playerData.statsLookup}
            sport={sport}
            onRemove={(playerId) => void actions.handleToggleQueue(playerId)}
            onError={(message) => ui.showToast(message, 'error')}
          />
        ) : ui.activeTab === 'history' ? (
          <DraftPickHistoryList
            picks={queries.pickHistory}
            statsLookup={playerData.statsLookup}
            myTeamId={queries.myTeamId}
            teamNameById={queries.teamNameById}
          />
        ) : (
          <YStack flex={1}>
            {/* Names the open-roster-slot filter (LS-10593). */}
            <YStack paddingHorizontal="$3" paddingTop={8}>
              <DraftOpenSlotsBanner
                openSlotPositions={queries.openSlotPositions}
                showAllPositions={ui.showAllPositions}
                onToggleShowAll={ui.setShowAllPositions}
              />
            </YStack>
            <DraftPlayersTab
              players={playerData.enrichedPlayers}
              myTeam={playerData.myTeam}
              sport={sport}
              leaguePositions={queries.leaguePositions}
              defensiveFormat={defensiveFormat}
              maxRosterSize={queries.maxRosterSize ?? null}
              selectedPosition={ui.selectedPosition}
              searchTerm={ui.searchTerm}
              onSetSelectedPosition={ui.setSelectedPosition}
              onSetSearchTerm={ui.setSearchTerm}
              canDraft={canDraft}
              draftActionLabel={isRealCommPick ? 'ASSIGN' : 'DRAFT'}
              currentPickInfo={queries.currentPickInfo}
              boardOrderedTeams={boardTeams}
              myTeamId={queries.myTeamId}
              draftOrder={queries.leagueDraft?.draftOrder}
              queuedPlayerIds={queries.queuedPlayerIds}
              onToggleQueue={handleToggleQueue}
              onDraftPlayer={handleSheetDraft}
              hasMorePlayers={queries.hasMorePlayers}
              loadingMore={queries.loadingMore}
              onLoadMore={onLoadMore}
            />
          </YStack>
        )}
      </DraftPickSheet>

      {/* ---- Chat panel (LS-10165): raised from the clock bar ----
          A full-height panel rather than a sheet: the connector must stay
          mounted while it is down (display:none) so its live subscription can
          still report "message arrives while the panel is closed" for the
          unread dot, and the modal Sheet unmounts its children when hidden.
          Narrowing the chat source (a league, or a mock draft's own draft id
          — LS-10076) and renderChatTab inline, so TypeScript proves both are
          defined here without a non-null assertion. */}
      <YStack
        testID="draft-chat-panel"
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        zIndex={50}
        backgroundColor="$background"
        paddingBottom={Math.max(bottomInset, 0)}
        role="dialog"
        aria-label="Draft chat"
        accessibilityLabel="Draft chat"
        style={{ display: chatOpen ? 'flex' : 'none' }}
      >
        <XStack
          minHeight={48}
          alignItems="center"
          justifyContent="space-between"
          paddingLeft={14}
          paddingRight={6}
          borderBottomWidth={1}
          borderBottomColor="$outlineSubtle"
        >
          <Text
            fontFamily="$heading"
            fontSize={16}
            fontWeight="800"
            letterSpacing={0.6}
            textTransform="uppercase"
            color="$color"
          >
            Chat
          </Text>
          <YStack
            testID="draft-chat-panel-close"
            minWidth={44}
            minHeight={44}
            alignItems="center"
            justifyContent="center"
            onPress={closeChat}
            pressStyle={{ opacity: 0.7 }}
            cursor="pointer"
            role="button"
            accessibilityRole="button"
            tabIndex={0}
            onKeyDown={handleKeyActivate(closeChat)}
            aria-label="Close chat"
            accessibilityLabel="Close chat"
          >
            <Text fontSize={19} lineHeight={19} color="$fg4">
              ✕
            </Text>
          </YStack>
        </XStack>
        {(leagueId !== null || chatDraftId != null) && renderChatTab ? (
          // LS-10632: the panel is absolutely positioned over the whole screen,
          // so the soft keyboard would cover the composer. Avoid it around the
          // body only (the header stays put); 'height' on Android mirrors the
          // other app screens' KeyboardAvoidingView usage.
          <KeyboardAvoidingView
            style={CHAT_KEYBOARD_AVOIDING_STYLE}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <YStack flex={1} testID="draft-chat-tab-slot">
              {renderChatTab({
                leagueId,
                draftId: chatDraftId ?? null,
                userId,
                onNewMessage: handleNewChatMessage,
                chatOpen,
              })}
            </YStack>
          </KeyboardAvoidingView>
        ) : (
          <YStack
            flex={1}
            alignItems="center"
            justifyContent="center"
            padding="$6"
          >
            <Text color="$fg4" textAlign="center">
              Chat is coming soon.
            </Text>
          </YStack>
        )}
      </YStack>

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
          testID="draft-toast-overlay"
          position="absolute"
          bottom={overlayBottom}
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
          testID="draft-urgent-overlay"
          position="absolute"
          bottom={overlayBottom}
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
  draftId = null,
  onNavigate,
  websocketUrl,
  token,
  renderChat,
  renderChatTab,
  onPlayerDrafted,
  sport: sportOverride,
  onActiveDraftChange,
  bottomInset = 0,
  topInset = 0,
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
    draftId,
    playerSearch: ui.playerSearch,
    selectedPosition: ui.selectedPosition,
    showAllPositions: ui.showAllPositions,
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
    (queries.draftSport === Sport.Football ? 'football' : 'baseball');

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

  const fetchDraftPlayer = useFetchDraftPlayer();
  // The league was deleted under an open draft room: leave rather than sit on
  // a board whose draft no longer exists.
  const handleLeagueDeleted = useCallback(() => {
    if (onExitDraft) onExitDraft();
    else onNavigate(`/${sport}`);
  }, [onExitDraft, onNavigate, sport]);
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
    fetchPlayer: fetchDraftPlayer,
    onPlayerDrafted,
    currentOverallPick: queries.currentPickInfo?.overallPick ?? null,
    draftComplete: ui.draftComplete,
    onLeagueDeleted: handleLeagueDeleted,
  });

  // Offline mock draft mode (LS-9144): no pick-clock pressure on the human's
  // own turn. Only meaningful for mock drafts — undefined/false for real leagues.
  const untimed = queries.isOfflineDraft === true;

  // A mock draft's lobby is its own shape (LS-10076): seats and host controls,
  // not league teams and commissioner tools.
  const mockLobby = useMockDraftLobby({
    draftId: queries.draftId,
    onChanged: () => {
      void queries.refetchRoom();
    },
    onLeft: () => {
      if (onExitDraft) onExitDraft();
      else onNavigate(`/${sport}`);
    },
  });

  // Draft Details rail panel (LS-9857) — read-only summary built entirely from
  // settings the board already fetches (league row + draft row). `untimed`
  // (offline mock drafts, LS-9144) has no pick clock at all, so it reports as
  // such rather than echoing a limit that never fires.
  const draftDetails: DraftDetailsSettings = useMemo(
    () => ({
      sport,
      draftOrder: queries.leagueDraft?.draftOrder ?? null,
      maxRosterSize: queries.maxRosterSize ?? null,
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
      queries.maxRosterSize,
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
  const isMock = queries.isMock === true;
  // LS-9859: same gate the compact shell's commissioner bar uses
  // (`showCommissionerBar` in CompactLiveDraftBoard) — commissioner, but not a
  // mock draft, where the solo human is auto-registered as "commissioner"
  // (LS-9242). Drives the rail's Draft Pick Order panel.
  const showCommissionerControls = queries.isCommissioner && !isMock;
  // Premium Control All Teams mode (LS-9253): the human picks for every
  // team, so every turn should be pickable regardless of whose seat it is.
  const controlAllTeams = queries.controlAllTeams === true;
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
    refetchPickHistory: queries.refetchPickHistory,
  });

  // LS-4986: notify callers when the draft is actively running so they can set
  // up navigation guards (e.g. browser/Android back-button interception).
  const isDraftRunning = Boolean(
    !ui.draftComplete &&
    !queries.leagueDraft?.draftCompletedAt &&
    !queries.currentPickInfo?.isComplete &&
    (queries.draftStatus === 'in-progress' || queries.draftStatus === 'paused'),
  );
  useEffect(() => {
    onActiveDraftChange?.(isDraftRunning);
    return () => onActiveDraftChange?.(false);
  }, [isDraftRunning, onActiveDraftChange]);
  // Keep the display awake for the whole live draft — browser fullscreen
  // alone lets the PC sleep mid-draft (LS-10593). Native routes hold
  // expo-keep-awake themselves.
  useScreenWakeLock(isDraftRunning);

  const playersRefreshFailed =
    !!queries.availablePlayersError && queries.availablePlayers.length > 0;
  const { showToast } = ui;
  useEffect(() => {
    if (playersRefreshFailed) {
      showToast('Could not refresh players — showing last list', 'warning');
    }
  }, [playersRefreshFailed, showToast]);

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
    handleMockHostPick,
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
  // `commissionerPick` is a league tool — a mock draft has no commissioner
  // (LS-10076). Control All Teams still lets the host pick for every seat, so
  // a mock draft's forced picks go through `makeDraftPick`, whose turn check
  // recognises that host — without the client-side own-turn gate, which would
  // drop every pick for a seat other than the host's (LS-10433). Routed here,
  // at the prop boundary, so every board surface (rail, player board, compact
  // board) inherits it unchanged.
  const handleCommissionerPick = useCallback(
    (id: number) => {
      if (isMock) {
        void handleMockHostPick(id);
        return;
      }
      void commissionerPick(id);
    },
    [isMock, handleMockHostPick, commissionerPick],
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
  // Either handle will render a board; neither means there is nothing to show.
  if (!leagueId && draftId == null) {
    return <NoLeagueScreen onNavigate={onNavigate} />;
  }

  // Initial load only. A filter/search change refetches available players with
  // new variables and Apollo clears `data` meanwhile; a mock draft has no
  // `leagueData` to hold the gate shut, so checking `data` alone unmounted the
  // whole board — and the open pick sheet — on every filter change (LS-10806).
  if (
    (queries.leagueLoading || queries.availablePlayersLoading) &&
    !queries.availablePlayersData &&
    !queries.previousAvailablePlayersData &&
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
    // README "Draft-complete recap" — reusing LS-9400's roster-slot-row,
    // plus the same CTAs and team selector as the wide view (LS-10528).
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
          maxRosterSize={queries.maxRosterSize ?? null}
          isPremium={hasDraftPacketEntitlement}
          teamNameById={queries.teamNameById}
          leagueName={queries.draftTitle ?? undefined}
          onDownloadPacket={onDownloadDraftPacket}
          isMock={isMock}
          leagueId={leagueId}
          myTeamId={queries.myTeamId}
          leagueTeams={queries.leagueTeams}
          onNavigate={onNavigate}
        />
      );
    }
    return (
      <DraftCompleteView
        draftSummary={
          // A mock draft has no league row to read this from, so both kinds
          // pass the derived values (LS-10076) — the completion screen only
          // needs to know which copy and CTAs to render.
          queries.league || queries.isRoomMode
            ? {
                isMock,
                name: queries.draftTitle ?? undefined,
              }
            : null
        }
        leagueId={leagueId}
        sport={sport}
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

  // Only take over the whole screen when there is no player list at all. A
  // transient failure on the post-pick refetch (often mid-search) used to
  // unmount the live board — open sheet included — for an exit-less error
  // screen, which read as the app locking up (LS-10593). With a list already
  // on screen, keep the board and toast instead (effect above).
  if (queries.availablePlayersError && queries.availablePlayers.length === 0) {
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
  if (queries.draftStatus === 'completed' && !queries.leagueDraft && !draftId) {
    return <LoadingScreen />;
  }

  // Only render the live draft board when the draft is actively running or paused.
  // A draftId can exist for scheduled ('queued') drafts that haven't started yet;
  // relying on draftId absence would render the empty live board for those cases (LS-4085).
  if (
    queries.draftStatus !== 'in-progress' &&
    queries.draftStatus !== 'paused'
  ) {
    if (isMock) {
      return (
        <MockDraftLobby
          draftId={queries.draftId ?? null}
          reservedSlots={queries.room?.reservedSlots ?? []}
          onInvitesChanged={() => {
            void queries.refetchRoom();
          }}
          seats={(queries.room?.seats ?? []).flatMap((seat) =>
            seat.id == null || seat.slot == null
              ? []
              : [
                  {
                    id: seat.id,
                    slot: seat.slot,
                    seatName: seat.seatName ?? `Seat ${String(seat.slot)}`,
                    userId: seat.userId ?? null,
                    controller: seat.controller ?? 'open',
                  },
                ],
          )}
          mySeatId={queries.room?.viewer?.seatId ?? null}
          isHost={queries.room?.viewer?.canHost ?? false}
          inviteCode={queries.room?.draft?.inviteCode ?? null}
          isPublic={queries.room?.draft?.isPublic ?? false}
          lobbyExpiresAt={queries.room?.draft?.lobbyExpiresAt ?? null}
          starting={mockLobby.starting}
          error={mockLobby.error}
          onStart={mockLobby.handleStart}
          onKick={mockLobby.handleKick}
          onToggleVisibility={mockLobby.handleToggleVisibility}
          onLeave={mockLobby.handleLeave}
        />
      );
    }

    return (
      <PreDraftLobby
        league={queries.league}
        sport={sport}
        // A league draft always has one; the mock branch returned above.
        leagueId={leagueId ?? 0}
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
        roundCount={queries.maxRosterSize ?? undefined}
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
        isMock={isMock}
        chatDraftId={isMock ? queries.draftId : null}
        controlAllTeams={controlAllTeams}
        bottomInset={bottomInset}
        topInset={topInset}
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
        gridTemplateRows: 'auto auto auto 1fr',
        gridTemplateAreas: '"hero" "topband" "main" "rail"',
      }
    : {
        gridTemplateColumns: `1fr ${desktopRailWidth}px`,
        gridTemplateRows: 'auto auto 1fr',
        gridTemplateAreas: '"hero hero" "topband topband" "main rail"',
      };
  // Hero (LS-10204): back link, "League · Draft" and the live / pick / format
  // badges — DraftRoom.html's `.hero`. The design's `.nav` row above it
  // (burger, breadcrumbs) is apps/web's own header, so it is not drawn here.
  const maxRosterSize = queries.league?.maxRosterSize ?? 0;
  const heroTotalPicks =
    maxRosterSize > 0 && queries.leagueTeams.length > 0
      ? maxRosterSize * queries.leagueTeams.length
      : null;
  const heroBackHref =
    isMock || leagueId == null ? null : `/${sport}/league/${leagueId}`;

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
        <DraftHero
          leagueName={queries.league?.name}
          backHref={heroBackHref}
          onNavigate={onNavigate}
          draftPaused={ui.draftPaused}
          round={round}
          overallPick={currentPick}
          totalPicks={heroTotalPicks}
          teamCount={queries.leagueTeams.length}
          selectionMethod={queries.leagueDraft?.selectionMethod}
          draftOrder={queries.leagueDraft?.draftOrder}
          compact={Boolean(media.md)}
        />
        <DraftTopBand
          connectionStale={connectionStale}
          draftPaused={ui.draftPaused}
          currentPick={currentPick}
          round={round}
          timeRemaining={timeRemaining}
          pickTimeLimitSeconds={ui.pickTimeLimitSeconds}
          untimed={untimed}
          isMock={isMock}
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
          openSlotsBanner={
            <DraftOpenSlotsBanner
              openSlotPositions={queries.openSlotPositions}
              showAllPositions={ui.showAllPositions}
              onToggleShowAll={ui.setShowAllPositions}
            />
          }
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
          draftOrder={queries.leagueDraft?.draftOrder}
          myTeam={playerData.myTeam}
          positionCounts={playerData.positionCounts}
          leaguePositions={queries.leaguePositions}
          maxRosterSize={queries.maxRosterSize ?? null}
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
          isMockDraft={isMock}
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
          leaguePositions={queries.leaguePositions}
          maxRosterSize={queries.maxRosterSize ?? null}
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
          maxRosterSize={queries.maxRosterSize ?? null}
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
          sport={sport}
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
