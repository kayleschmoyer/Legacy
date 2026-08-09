import React from 'react';
import { ScrollView, Text, XStack, YStack } from 'tamagui';
import type {
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
} from './types';
import { DraftIntelligence } from './DraftIntelligence';
import { DraftQueuePanel } from './DraftQueuePanel';
import { CurrentPickPanel } from './CurrentPickPanel';
import { getPositionColor } from './utils';
import { isPlayerEligibleForSlot } from './draftDnd';
import type { Sport } from '../../utils/colors';
import {
  BRAND_GOLD,
  BRAND_NAVY,
  SCORE_WIN,
  SURFACE_PANEL,
  SURFACE_SUBTLE,
  TEXT_MUTED,
  TEXT_PRIMARY,
  WHITE,
  withAlpha,
} from '../../utils/colors';
import { FONT_DISPLAY } from '../../utils/typography';
import { tamaguiStyled } from '../../utils/tamaguiStyled';

// ---------------------------------------------------------------------------
// Styled primitives — ported 1:1 from styles.ts .d-rail* rules (LS-9064).
// tamaguiStyled() isolates Tamagui's any-typed styled() API from strict lint.
// ---------------------------------------------------------------------------

type StyledComponent = React.ComponentType<Record<string, unknown>>;

const TEXT_SECONDARY = TEXT_MUTED;
const TEXT_MUTED_DIM = withAlpha(TEXT_PRIMARY, 0.45);
// White-alpha overlays — derived via withAlpha() rather than literal rgba()
// strings so the theme-compliance ratchet (scripts/check-theme-compliance.mjs)
// doesn't flag them; see .agents/skills/ui/SKILL.md (epic LS-8518).
const BORDER_HAIRLINE = withAlpha(WHITE, 0.06);
const SURFACE_OVERLAY_SUBTLE = withAlpha(WHITE, 0.04);
const TRACK_BG = withAlpha(WHITE, 0.05);
const HOVER_BORDER = withAlpha(WHITE, 0.1);

// Rail root + mobile toggle + content — the one responsive surface in this
// component (mirrors the original @media (max-width: 900px) block for
// .d-rail / .d-rail-mobile-toggle / .d-rail.collapsed in styles.ts).
// Border/padding are CSS-only via the $md breakpoint config; the
// collapse-driven maxHeight/overflow/visibility (which depend on the
// `mobileCollapsed` state, not just viewport width) are expressed as a
// Tamagui `collapsed` variant rather than a `useMedia()` hook call — the
// hook requires the app's TamaguiProvider/config to be bootstrapped, which
// isolated component tests (e.g. EliteDraftBoard.a11y.spec.tsx) don't set
// up, while declarative $md style props resolve without it.
const RailRoot = tamaguiStyled(YStack, {
  // `gridArea` docks this component into the still-CSS-Grid `.d-layout`
  // container in EliteDraftBoardScreen.tsx (raw HTML/CSS, out of scope for
  // this ticket — see LS-9057). Tamagui forwards unrecognized style keys
  // straight through to the underlying web element's style object.
  gridArea: 'rail',
  backgroundColor: SURFACE_SUBTLE,
  borderLeftWidth: 1,
  borderLeftColor: BORDER_HAIRLINE,
  padding: 14,
  gap: 12,
  overflow: 'scroll',
  $md: {
    borderLeftWidth: 0,
    borderTopWidth: 1,
    borderTopColor: BORDER_HAIRLINE,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  variants: {
    collapsed: {
      true: { $md: { maxHeight: undefined, overflow: 'visible' } },
      false: { $md: { maxHeight: 280, overflow: 'scroll' } },
    },
  } as const,
}) as StyledComponent;

const RailMobileToggle = tamaguiStyled(XStack, {
  tag: 'button',
  display: 'none',
  cursor: 'pointer',
  $md: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: SURFACE_OVERLAY_SUBTLE,
    borderWidth: 1,
    borderColor: BORDER_HAIRLINE,
    borderRadius: 6,
  },
}) as StyledComponent;

const RailContent = tamaguiStyled(YStack, {
  gap: 12,
  minHeight: 0,
  flex: 1,
  variants: {
    collapsed: {
      true: { $md: { display: 'none' } },
      false: {},
    },
  } as const,
}) as StyledComponent;

const RailPanel = tamaguiStyled(YStack, {
  backgroundColor: SURFACE_PANEL,
  borderWidth: 1,
  borderColor: BORDER_HAIRLINE,
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
  flexShrink: 0,
}) as StyledComponent;

const RailPanelHead = tamaguiStyled(XStack, {
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 10,
}) as StyledComponent;

const RailPanelTitle = tamaguiStyled(Text, {
  fontFamily: FONT_DISPLAY,
  fontWeight: '700',
  fontSize: 11,
  letterSpacing: 1.54,
  textTransform: 'uppercase',
  color: TEXT_SECONDARY,
}) as StyledComponent;

const RailPanelCount = tamaguiStyled(Text, {
  fontFamily: FONT_DISPLAY,
  fontSize: 11,
  color: TEXT_SECONDARY,
  letterSpacing: 1.32,
  fontVariant: ['tabular-nums'],
}) as StyledComponent;

const PosProgressRow = tamaguiStyled(XStack, {
  alignItems: 'center',
  gap: 8,
  paddingHorizontal: 2,
  paddingVertical: 4,
  borderRadius: 6,
}) as StyledComponent;

const PosProgressLabel = tamaguiStyled(Text, {
  fontFamily: FONT_DISPLAY,
  fontWeight: '800',
  fontSize: 11,
  letterSpacing: 0.88,
  color: TEXT_SECONDARY,
  width: 36,
}) as StyledComponent;

const PosProgressBar = tamaguiStyled(YStack, {
  position: 'relative',
  height: 4,
  flex: 1,
  borderRadius: 9999,
  backgroundColor: TRACK_BG,
  overflow: 'hidden',
}) as StyledComponent;

const PosProgressCount = tamaguiStyled(Text, {
  fontFamily: FONT_DISPLAY,
  fontWeight: '700',
  fontSize: 10,
  color: TEXT_SECONDARY,
  fontVariant: ['tabular-nums'],
  textAlign: 'right',
  width: 36,
}) as StyledComponent;

const PickRow = tamaguiStyled(XStack, {
  alignItems: 'center',
  gap: 8,
  paddingHorizontal: 4,
  paddingVertical: 6,
  borderBottomWidth: 1,
  borderBottomColor: SURFACE_OVERLAY_SUBTLE,
}) as StyledComponent;

const PickNum = tamaguiStyled(Text, {
  fontFamily: FONT_DISPLAY,
  fontWeight: '800',
  fontSize: 12,
  color: BRAND_GOLD,
  fontVariant: ['tabular-nums'],
  width: 36,
  flexShrink: 0,
}) as StyledComponent;

const GlassButton = tamaguiStyled(XStack, {
  tag: 'button',
  width: '100%',
  backgroundColor: withAlpha(BRAND_NAVY, 0.18),
  borderWidth: 1,
  borderColor: BORDER_HAIRLINE,
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 11,
  marginBottom: 8,
  cursor: 'pointer',
  hoverStyle: {
    backgroundColor: withAlpha(BRAND_NAVY, 0.28),
    borderColor: HOVER_BORDER,
  },
}) as StyledComponent;

// Position slot configuration for the depth-chart-style roster summary,
// sport-scoped per ADR 0011 §6 / LS-4663.
type PositionSlotConfig = { pos: string; label: string; slots: number };

const BASEBALL_POSITION_SLOTS: PositionSlotConfig[] = [
  { pos: 'C', label: 'C', slots: 1 },
  { pos: '1B', label: '1B', slots: 1 },
  { pos: '2B', label: '2B', slots: 1 },
  { pos: '3B', label: '3B', slots: 1 },
  { pos: 'SS', label: 'SS', slots: 1 },
  { pos: 'OF', label: 'OF', slots: 3 },
  { pos: 'P', label: 'P', slots: 9 },
  { pos: 'U', label: 'UTIL', slots: 2 },
];

const FOOTBALL_POSITION_SLOTS: PositionSlotConfig[] = [
  { pos: 'QB', label: 'QB', slots: 1 },
  { pos: 'RB', label: 'RB', slots: 2 },
  { pos: 'WR', label: 'WR', slots: 3 },
  { pos: 'TE', label: 'TE', slots: 1 },
  { pos: 'K', label: 'K', slots: 1 },
  { pos: 'DEF', label: 'DEF', slots: 1 },
  { pos: 'FLEX', label: 'FLEX', slots: 1 },
];

export function getPositionSlotsForSport(sport: Sport): PositionSlotConfig[] {
  return sport === 'football'
    ? FOOTBALL_POSITION_SLOTS
    : BASEBALL_POSITION_SLOTS;
}

interface DraftRailProps {
  // Intelligence
  isPremium: boolean;
  isMyPick: boolean;
  commPickMode: boolean;
  isOwner: boolean;
  /** Whether the user is the team general manager (gates the draft-queue query). */
  isGeneralManager: boolean;
  draftId: number | null;
  myTeamId: number | null;
  currentOverallPick: number;
  // Current pick (whose-turn edge states: load error / draft-order pending)
  currentPickInfo: CurrentDraftPickInfo | null;
  currentPickTeamId: number | null;
  currentPickLoadError: string | null;
  onlineTeamIds: ReadonlySet<string>;
  initDraftLoading: boolean;
  // Queue
  autoPickDisabled: boolean;
  // Roster
  myTeam: DraftPlayer[];
  positionCounts: Record<string, number>;
  /** League sport — drives depth-chart slot layout and roster-bar fill colors. */
  sport?: Sport;
  // History
  pickHistory: DraftPickRecord[];
  statsLookup: Map<number, DraftPlayer>;
  teamNameById: (teamId: number | null | undefined) => string;
  /** Drag-to-draft (LS-8068): the player card currently being dragged, or null. */
  draggedPlayer?: DraftPlayer | null;
  // Chat
  chatOpen: boolean;
  // Actions
  onShowToast: (msg: string) => void;
  onDraftPlayer: (playerId: number) => void;
  onCommissionerPick: (playerId: number) => void;
  onInitializeDraft: (order: 'snake' | 'linear') => void;
  onRetryCurrentPick: () => void;
  onToggleChat: () => void;
  onRefresh: () => void;
}

function playerName(
  pick: DraftPickRecord,
  statsLookup: Map<number, DraftPlayer>,
): string {
  const stat = statsLookup.get(pick.playerId);
  if (stat) return stat.name;
  if (pick.player) return `${pick.player.firstName} ${pick.player.lastName}`;
  return `Player #${pick.playerId}`;
}

function pickRoundLabel(pick: DraftPickRecord): string {
  return `${pick.round}.${pick.pickNumber.toString().padStart(2, '0')}`;
}

function getPositionPill(pos: string): { bg: string; color: string } {
  const color = getPositionColor('baseball', pos);
  return { bg: `${color}26`, color }; // 15% opacity bg
}

export function DraftRail({
  isPremium,
  isMyPick,
  commPickMode,
  isOwner,
  isGeneralManager,
  draftId,
  myTeamId,
  currentOverallPick,
  currentPickInfo,
  currentPickTeamId,
  currentPickLoadError,
  onlineTeamIds,
  initDraftLoading,
  autoPickDisabled,
  myTeam,
  positionCounts,
  sport = 'baseball',
  pickHistory,
  statsLookup,
  teamNameById,
  draggedPlayer = null,
  chatOpen,
  onShowToast,
  onDraftPlayer,
  onCommissionerPick,
  onInitializeDraft,
  onRetryCurrentPick,
  onToggleChat,
  onRefresh,
}: DraftRailProps): React.JSX.Element {
  const positionSlots = getPositionSlotsForSport(sport);
  const totalDrafted = myTeam.length;
  const totalSlots = positionSlots.reduce((sum, s) => sum + s.slots, 0);

  // LS-8068: drag-to-draft. A player card dropped onto an eligible roster slot
  // drafts that player (the server is the final gate on the pick). Mirrors the
  // PlayerCard "Draft Now" gating: commissioner force-pick when in comm-pick
  // mode, otherwise only on the user's own turn.
  const canDraft = commPickMode ? isOwner : isMyPick;
  const handleSlotDrop = (slotPos: string, label: string) => {
    const player = draggedPlayer;
    if (!player) return;
    if (!canDraft) {
      onShowToast('Wait for your turn to draft.');
      return;
    }
    if (!isPlayerEligibleForSlot(sport, slotPos, player.eligiblePositions)) {
      onShowToast(`${player.name} isn't eligible at ${label}.`);
      return;
    }
    if (commPickMode && isOwner) {
      onCommissionerPick(player.id);
    } else {
      onDraftPlayer(player.id);
    }
  };

  // LS-4824: on mobile the rail sits above the player pool and consumes the
  // top of the viewport. Default to collapsed so mobile users can see the
  // draft board first, and provide a toggle. Desktop ignores this — the
  // `collapsed` variant's nested $md mirrors the original @media
  // (max-width: 900px) rule (nearest defined breakpoint; see AGENTS.md
  // responsive-token diagnostic).
  const [mobileCollapsed, setMobileCollapsed] = React.useState(true);

  return (
    <RailRoot
      tag="aside"
      role="complementary"
      aria-label="Draft panel"
      testID="draft-rail"
      data-collapsed={mobileCollapsed ? 'true' : 'false'}
      collapsed={mobileCollapsed}
    >
      <RailMobileToggle
        tag="button"
        type="button"
        role="button"
        aria-expanded={!mobileCollapsed}
        aria-controls="d-rail-content"
        onPress={() => setMobileCollapsed((c) => !c)}
      >
        <Text
          fontFamily={FONT_DISPLAY}
          fontWeight="700"
          fontSize={12}
          letterSpacing={1.68}
          textTransform="uppercase"
          color={TEXT_PRIMARY}
        >
          Draft panel
        </Text>
        <Text aria-hidden={true} color={TEXT_PRIMARY}>
          {mobileCollapsed ? '▾ Show' : '▴ Hide'}
        </Text>
      </RailMobileToggle>

      <RailContent id="d-rail-content" collapsed={mobileCollapsed}>
        {/* Current-pick edge states — the top band's on-the-clock slab covers
            the normal case, but a failed load or a not-yet-initialized draft
            order needs the retry / Generate Order affordances the sidebar
            used to provide. Hidden once currentPickInfo resolves. */}
        {!currentPickInfo && (
          <CurrentPickPanel
            currentPickInfo={currentPickInfo}
            currentPickTeamId={currentPickTeamId}
            currentPickLoadError={currentPickLoadError}
            isMyPick={isMyPick}
            isOwner={isOwner}
            myTeamId={myTeamId}
            onlineTeamIds={onlineTeamIds}
            initDraftLoading={initDraftLoading}
            pickHistoryLength={pickHistory.length}
            teamNameById={teamNameById}
            onInitializeDraft={onInitializeDraft}
            onRetryCurrentPick={onRetryCurrentPick}
          />
        )}

        {/* Draft Intelligence — only on user's pick, premium only */}
        {isMyPick && (
          <YStack
            backgroundColor={withAlpha(BRAND_GOLD, 0.07)}
            borderWidth={1}
            borderColor={withAlpha(BRAND_GOLD, 0.18)}
            borderRadius={16}
            padding={14}
          >
            <XStack alignItems="center" marginBottom={10}>
              <Text
                fontSize={11}
                fontWeight="800"
                letterSpacing={1.5}
                textTransform="uppercase"
                color={BRAND_GOLD}
              >
                Draft Intelligence
              </Text>
              <Text
                marginLeft={6}
                fontSize={9}
                letterSpacing={1.26}
                color={BRAND_GOLD}
                fontWeight="700"
              >
                ✦ PREMIUM
              </Text>
            </XStack>
            {isPremium ? (
              <DraftIntelligence
                draftId={draftId}
                teamId={myTeamId}
                currentOverallPick={currentOverallPick}
                onDraft={
                  commPickMode && isOwner ? onCommissionerPick : onDraftPlayer
                }
              />
            ) : (
              <XStack alignItems="center" gap={8}>
                {/* jsx-a11y/accessible-emoji requires a literal <span> — Text
                    compiles to <span> on web but the static rule doesn't
                    recognize it (same shim used elsewhere in this package,
                    e.g. DraftQueuePanel.tsx). */}
                <span role="img" aria-label="locked" style={{ fontSize: 16 }}>
                  🔒
                </span>
                <Text fontSize={12} color={TEXT_SECONDARY} flex={1}>
                  Upgrade to Premium for AI-powered draft recommendations.
                </Text>
              </XStack>
            )}
          </YStack>
        )}

        {/* Auto-pick Queue — GM-only on the server (LS-4804). */}
        {draftId && myTeamId !== null && isGeneralManager && (
          <RailPanel borderColor={withAlpha(BRAND_GOLD, 0.18)}>
            <RailPanelHead>
              <RailPanelTitle tag="h4" margin={0}>
                Auto-pick Queue
              </RailPanelTitle>
            </RailPanelHead>
            <DraftQueuePanel
              draftId={draftId}
              autoPickDisabled={autoPickDisabled}
              onError={onShowToast}
              enabled={isGeneralManager}
            />
          </RailPanel>
        )}

        {/* My Roster — progress bars */}
        <RailPanel>
          <RailPanelHead>
            <RailPanelTitle tag="h4" margin={0}>
              My Roster
            </RailPanelTitle>
            <RailPanelCount>
              {totalDrafted} / {totalSlots}
            </RailPanelCount>
          </RailPanelHead>
          <YStack gap={2} role="list">
            {positionSlots.map(({ pos, label, slots }) => {
              const count = positionCounts[pos] ?? 0;
              const fill = slots > 0 ? Math.min(1, count / slots) : 0;
              const barColor = getPositionColor(sport ?? 'baseball', pos);
              const isFilled = count > 0;
              const isComplete = count >= slots;
              // Drag-to-draft highlight: only when a draggable player is active.
              const dropEligible =
                draggedPlayer != null &&
                canDraft &&
                isPlayerEligibleForSlot(
                  sport,
                  pos,
                  draggedPlayer.eligiblePositions,
                );
              const isDragActive = draggedPlayer != null;
              const dropState = isDragActive
                ? dropEligible
                  ? 'eligible'
                  : 'ineligible'
                : undefined;
              return (
                <PosProgressRow
                  key={pos}
                  role="listitem"
                  aria-label={`${label}: ${count} of ${slots}`}
                  data-drop-state={dropState}
                  opacity={dropState === 'ineligible' ? 0.4 : 1}
                  style={
                    dropState === 'eligible'
                      ? {
                          backgroundColor: withAlpha(SCORE_WIN, 0.08),
                          outline: `1px dashed ${withAlpha(SCORE_WIN, 0.7)}`,
                        }
                      : undefined
                  }
                  onDragOver={
                    isDragActive
                      ? (e: React.DragEvent) => {
                          // preventDefault makes every rail row a valid drop
                          // target so an ineligible drop still fires and we can
                          // toast *why* it was rejected. Eligibility is conveyed
                          // visually via the drop-state background/outline
                          // while hovering.
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }
                      : undefined
                  }
                  onDrop={
                    isDragActive
                      ? (e: React.DragEvent) => {
                          e.preventDefault();
                          handleSlotDrop(pos, label);
                        }
                      : undefined
                  }
                >
                  <PosProgressLabel color={isFilled ? TEXT_PRIMARY : undefined}>
                    {label}
                  </PosProgressLabel>
                  <PosProgressBar aria-hidden={true}>
                    <YStack
                      testID={`pos-fill-${pos}`}
                      position="absolute"
                      left={0}
                      top={0}
                      bottom={0}
                      borderRadius={9999}
                      style={{
                        width: `${fill * 100}%`,
                        background: barColor,
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </PosProgressBar>
                  <PosProgressCount
                    color={
                      isComplete
                        ? SCORE_WIN
                        : isFilled
                          ? TEXT_PRIMARY
                          : undefined
                    }
                  >
                    {count}/{slots}
                  </PosProgressCount>
                </PosProgressRow>
              );
            })}
          </YStack>
        </RailPanel>

        {/* Pick History */}
        {pickHistory.length > 0 && (
          <RailPanel flex={1} overflow="hidden" style={{ display: 'flex' }}>
            <RailPanelHead>
              <RailPanelTitle tag="h4" margin={0}>
                Pick History
              </RailPanelTitle>
              <RailPanelCount>{pickHistory.length}</RailPanelCount>
            </RailPanelHead>
            <ScrollView flex={1} role="list" aria-label="Recent draft picks">
              {pickHistory
                .slice()
                .reverse()
                .slice(0, 40)
                .map((pick) => {
                  const name = playerName(pick, statsLookup);
                  const pos =
                    statsLookup.get(pick.playerId)?.position ??
                    pick.player?.eligiblePositions?.[0] ??
                    '?';
                  const isMine = pick.teamId === myTeamId;
                  const pill = getPositionPill(pos);
                  return (
                    <PickRow key={pick.id} role="listitem">
                      <PickNum>{pickRoundLabel(pick)}</PickNum>
                      <Text
                        display="inline"
                        paddingHorizontal={5}
                        paddingVertical={1}
                        borderRadius={3}
                        fontSize={9}
                        fontWeight="700"
                        color={pill.color}
                        backgroundColor={pill.bg}
                        whiteSpace="nowrap"
                        fontFamily={FONT_DISPLAY}
                        letterSpacing={0.54}
                        flexShrink={0}
                      >
                        {pos}
                      </Text>
                      <Text
                        overflow="hidden"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                        fontSize={12}
                        color={isMine ? BRAND_GOLD : TEXT_PRIMARY}
                      >
                        {name}
                      </Text>
                      <Text
                        fontSize={10}
                        color={TEXT_MUTED_DIM}
                        textAlign="right"
                        flexShrink={0}
                      >
                        {teamNameById(pick.teamId)}
                      </Text>
                    </PickRow>
                  );
                })}
            </ScrollView>
          </RailPanel>
        )}

        {/* Actions */}
        <GlassButton
          tag="button"
          role="button"
          onPress={onToggleChat}
          aria-pressed={chatOpen}
          aria-label={`League chat ${chatOpen ? 'open' : 'closed'}`}
        >
          <Text color={TEXT_PRIMARY} fontSize={13} fontWeight="600">
            League Chat
          </Text>
        </GlassButton>
        <GlassButton tag="button" role="button" onPress={onRefresh}>
          <Text color={TEXT_PRIMARY} fontSize={13} fontWeight="600">
            Refresh
          </Text>
        </GlassButton>
      </RailContent>
    </RailRoot>
  );
}
