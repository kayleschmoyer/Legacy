import React, { useCallback, useMemo, useState } from 'react';
import {
  Card,
  H2,
  isWeb,
  Spinner,
  Text,
  useMedia,
  XStack,
  YStack,
} from 'tamagui';
import {
  ArrowLeftRight,
  ChevronRight,
  EllipsisVertical,
  Lock,
  Users,
} from '@tamagui/lucide-icons';
import { contrastRatio } from '@legacy-sports/design-tokens';
import {
  canPlayerPlayPosition,
  getPositionLabel,
  isPitcherSlot,
  playerHasBatting,
  playerHasPitchingOnly,
} from './rosterEligibility';
import { PACE_TINT_THRESHOLDS } from '../matchup/paceThresholds';
import { getPlayerName } from '../../utils/playerFormatting';
import {
  ACCENT_INK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  getPositionColor,
  OUTLINE_DEFAULT,
  SCORE_LOSS,
  SCORE_WIN,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
  WHITE,
  withAlpha,
} from '../../utils/colors';
import {
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
  TABULAR_NUMS,
} from '../../utils/typography';

// ── Platform-agnostic shapes ────────────────────────────────────────────────
// Minimal structural types satisfied by both web and native `TeamMemberFragment`
// / `LeaguePositionFragment`. RosterBoard is generic over the caller's concrete
// fragment types so assign/swap callbacks keep their precise types at call sites.

export interface RosterBoardPosition {
  id?: number | null;
  positionType?: string | null;
}

export interface RosterBoardPlayer {
  id?: number | null;
  positionId?: number | null;
  nickname?: string | null;
  isLocked?: boolean | null;
  player?: {
    id?: number | null;
    firstName?: string | null;
    lastName?: string | null;
    eligiblePositions?: readonly string[] | null;
    /** Current MLB team abbreviation for baseball players (LS-8597). */
    mlbTeam?: string | null;
    /** Jersey number (LS-8597 for baseball players). */
    jerseyNumber?: number | null;
  } | null;
}

/**
 * Per-player display stats for the command-center row layout (LS-9355).
 * All fields optional — rows degrade gracefully to the eligibility sub-line
 * when a caller has no matchup data for a player.
 */
export interface RosterPlayerStats {
  /** Actual fantasy points scored so far this matchup. */
  actual?: number | null;
  /** Projected fantasy points for the full matchup. */
  projected?: number | null;
  /** Games completed within the matchup window. */
  gamesPlayed?: number | null;
  /** Games in the matchup window for this player. */
  totalGames?: number | null;
  /** Historical season the roster entry drafts from (e.g. 2007). */
  seasonYear?: number | string | null;
  /** Real-world team abbreviation (e.g. "NE"). */
  teamAbbr?: string | null;
  /** Pre-formatted stat line (e.g. "4,806 PaYd · 50 PaTD · 8 INT"). */
  statLine?: string | null;
}

/** Renders "TEAM #NN", "TEAM", or "#NN" depending on which fields are present. */
function formatTeamJersey(
  mlbTeam?: string | null,
  jerseyNumber?: number | null,
): string | null {
  const parts: string[] = [];
  if (mlbTeam) parts.push(mlbTeam);
  if (jerseyNumber != null) parts.push(`#${jerseyNumber}`);
  return parts.length > 0 ? parts.join(' ') : null;
}

type SlotState = 'idle' | 'selected' | 'eligible-empty' | 'eligible-swap';

export interface RosterBoardProps<
  P extends RosterBoardPlayer,
  Pos extends RosterBoardPosition,
> {
  positions: readonly Pos[];
  teamPlayers: readonly P[];
  onPlayerAssign: (player: P, position: Pos) => void;
  onPlayerRemove: (position: Pos) => void;
  /**
   * Swap two players' slots. Optional: when omitted, tapping an occupied
   * eligible slot simply re-selects the occupant instead of swapping (used by
   * platforms whose data layer has no atomic swap mutation).
   */
  onPlayerSwap?: (incoming: P, target: Pos, displaced: P) => void;
  /**
   * Called when the user taps the chevron next to a player's name to view their
   * detail page. The caller is responsible for sport-aware navigation (e.g.
   * `/football/players/:id` vs `/players/:id`). When omitted, no chevron is shown.
   */
  onPlayerPress?: (player: P) => void;
  loading?: boolean;
  error?: Error | null;
  readOnly?: boolean;
  /** Position IDs whose slots are blocked while a mutation is in-flight. */
  disabledPositionIds?: ReadonlySet<number>;
  /**
   * Baseball (default) splits starters/bench into Hitters/Pitchers sections
   * via `isPitcherSlot`. Football has no such split — QB/RB/WR/TE/K/DST/DL/LB/DB
   * all render under one "Starters" section and an ungrouped "Bench" (LS-5421).
   */
  sport?: 'baseball' | 'football';
  /**
   * Resolves per-player matchup display stats (actual, projection, games,
   * season/team/stat line) for the command-center rows (LS-9355). Omit to
   * render the pre-redesign eligibility sub-lines.
   */
  getPlayerStats?: (player: P) => RosterPlayerStats | null;
}

// ── Position accents ────────────────────────────────────────────────────────

/**
 * Left-rail / chip accent for a slot or player position, from the canonical
 * design-tokens palette (LS-8526) via the shared `getPositionColor` map
 * (which already covers the legacy football "DEF" slot type).
 */
function positionAccent(
  sport: 'baseball' | 'football',
  position: string | null | undefined,
): string {
  const pos = (position ?? '').toUpperCase();
  if (pos === '') return OUTLINE_DEFAULT;
  return getPositionColor(sport, pos);
}

/** Chip label color: white where it clears contrast, dark ink otherwise. */
function chipTextColor(background: string): string {
  return contrastRatio(WHITE, background) >= 3 ? WHITE : ACCENT_INK;
}

function PositionChip({
  sport,
  position,
}: {
  sport: 'baseball' | 'football';
  position: string;
}): React.JSX.Element {
  const bg = positionAccent(sport, position);
  return (
    <XStack
      paddingHorizontal={6}
      paddingVertical={2}
      borderRadius={4}
      backgroundColor={bg}
    >
      <Text
        fontFamily={FONT_DISPLAY}
        fontWeight="700"
        fontSize={9}
        letterSpacing={0.8}
        color={chipTextColor(bg)}
      >
        {position}
      </Text>
    </XStack>
  );
}

// ── Score cell ──────────────────────────────────────────────────────────────

/**
 * Pace tint for a completed player line (mockup 1d): at or above the good
 * threshold of projection → success green, at or below the bad threshold →
 * loss red, otherwise default. Thresholds are the shared PACE_TINT_THRESHOLDS
 * so the tint matches the matchup surfaces.
 */
function actualColor(stats: RosterPlayerStats): string {
  const { actual, projected, gamesPlayed, totalGames } = stats;
  const complete =
    gamesPlayed != null && totalGames != null && totalGames > 0
      ? gamesPlayed >= totalGames
      : false;
  if (!complete || actual == null || projected == null || projected <= 0)
    return WHITE;
  if (actual >= projected * PACE_TINT_THRESHOLDS.good) return SCORE_WIN;
  if (actual <= projected * PACE_TINT_THRESHOLDS.bad) return SCORE_LOSS;
  return WHITE;
}

function ScoreCell({
  stats,
  compact,
}: {
  stats: RosterPlayerStats;
  compact?: boolean;
}): React.JSX.Element {
  return (
    <YStack alignItems="flex-end" minWidth={44}>
      <Text
        fontFamily={FONT_DISPLAY}
        fontWeight="800"
        fontSize={compact ? 15 : 22}
        lineHeight={compact ? 17 : 24}
        color={compact ? TEXT_MUTED : actualColor(stats)}
        {...TABULAR_NUMS}
      >
        {compact
          ? (stats.projected ?? 0).toFixed(1)
          : (stats.actual ?? 0).toFixed(1)}
      </Text>
      <Text fontFamily={FONT_MONO} fontSize={11} color={TEXT_TERTIARY}>
        {compact ? 'proj' : `${(stats.projected ?? 0).toFixed(1)} proj`}
      </Text>
    </YStack>
  );
}

// ── Icon action button ──────────────────────────────────────────────────────

function IconMini({
  label,
  expanded,
  children,
  onPress,
}: {
  label: string;
  expanded?: boolean;
  children: React.ReactNode;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <XStack
      role="button"
      aria-label={label}
      aria-expanded={expanded}
      tabIndex={0}
      width={28}
      height={28}
      borderRadius="$2"
      borderWidth={1}
      borderColor={OUTLINE_DEFAULT}
      backgroundColor={withAlpha(WHITE, 0.04)}
      justifyContent="center"
      alignItems="center"
      hoverStyle={{ backgroundColor: withAlpha(WHITE, 0.08) }}
      pressStyle={{ scale: 0.95 }}
      onPress={(e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        onPress();
      }}
    >
      {children}
    </XStack>
  );
}

// ── Inline row menu ─────────────────────────────────────────────────────────

/**
 * Inline expander listing row actions. Deliberately NOT role="menu" — that
 * role carries an arrow-key/Home/End keyboard contract; a plain group of
 * buttons is the lighter WAI-ARIA pattern for inline disclosure content and
 * is fully keyboard-operable via Tab.
 */
function RowMenu({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <YStack
      marginTop={4}
      marginLeft={44}
      borderRadius="$3"
      borderWidth={1}
      borderColor={OUTLINE_DEFAULT}
      backgroundColor={SURFACE_CARD}
      overflow="hidden"
    >
      {children}
    </YStack>
  );
}

function RowMenuItem({
  label,
  right,
  onPress,
}: {
  label: string;
  right?: string | null;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <XStack
      role="button"
      aria-label={label}
      tabIndex={0}
      paddingHorizontal="$3"
      paddingVertical="$2.5"
      alignItems="center"
      justifyContent="space-between"
      gap="$3"
      hoverStyle={{ backgroundColor: withAlpha(WHITE, 0.06) }}
      pressStyle={{ backgroundColor: withAlpha(WHITE, 0.09) }}
      onPress={onPress}
    >
      <Text fontFamily={FONT_BODY} fontSize={13} color={TEXT_PRIMARY}>
        {label}
      </Text>
      {right != null && (
        <Text fontFamily={FONT_MONO} fontSize={11} color={TEXT_TERTIARY}>
          {right}
        </Text>
      )}
    </XStack>
  );
}

// ── Row primitives ──────────────────────────────────────────────────────────

/** Selection accents shared by slot and bench rows (mockup 1c). */
const ELIGIBLE_BORDER = withAlpha(BRAND_GOLD, 0.55);
const ELIGIBLE_BG = withAlpha(BRAND_GOLD, 0.06);
const SELECTED_BORDER = withAlpha(BRAND_GOLD, 0.6);
const SELECTED_BG = withAlpha(BRAND_GOLD, 0.1);
/** DOM-only gold glow for eligible slots; native keeps the border + fill. */
const ELIGIBLE_GLOW = isWeb
  ? { boxShadow: `0 0 18px ${withAlpha(BRAND_GOLD, 0.18)}` }
  : undefined;

function subLineFromStats(stats: RosterPlayerStats): string | null {
  const parts: string[] = [];
  if (stats.seasonYear != null) parts.push(String(stats.seasonYear));
  if (stats.teamAbbr) parts.push(stats.teamAbbr);
  if (stats.statLine) parts.push(stats.statLine);
  if (stats.gamesPlayed != null && stats.totalGames != null)
    parts.push(`${stats.gamesPlayed}/${stats.totalGames} G`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

interface SlotRowProps {
  sport: 'baseball' | 'football';
  positionType: string;
  assignedName: string | null;
  assignedEligible: readonly string[];
  assignedMlbTeam?: string | null;
  assignedJerseyNumber?: number | null;
  assignedPrimaryPosition?: string | null;
  stats?: RosterPlayerStats | null;
  selectedName: string | null;
  state: SlotState;
  readOnly: boolean;
  disabled?: boolean;
  isLocked?: boolean;
  onPress: () => void;
  onPlayerPress?: () => void;
  actions?: React.ReactNode;
}

function SlotRow({
  sport,
  positionType,
  assignedName,
  assignedEligible,
  assignedMlbTeam,
  assignedJerseyNumber,
  assignedPrimaryPosition,
  stats,
  selectedName,
  state,
  readOnly,
  disabled = false,
  isLocked = false,
  onPress,
  onPlayerPress,
  actions,
}: SlotRowProps): React.JSX.Element {
  const posType = positionType.toUpperCase();
  const railColor = positionAccent(sport, posType);
  const effectiveReadOnly = readOnly || isLocked;
  const eligible = state === 'eligible-swap' || state === 'eligible-empty';

  const ariaLabel = assignedName
    ? isLocked
      ? `${assignedName} at ${posType} — locked`
      : state === 'eligible-swap' && selectedName
        ? `Swap ${selectedName} into ${posType}`
        : `${assignedName} at ${posType}`
    : state === 'eligible-empty' && selectedName
      ? `Assign ${selectedName} to ${posType}`
      : `${getPositionLabel(posType)} — open slot`;

  const statsSub = stats ? subLineFromStats(stats) : null;
  const subText = assignedName
    ? isLocked
      ? 'Locked — game in progress'
      : (statsSub ?? assignedEligible.join(' · '))
    : state === 'eligible-empty' && selectedName
      ? `Tap to assign ${selectedName}`
      : 'Open slot';

  const chipPosition = assignedName
    ? (assignedPrimaryPosition ?? posType)
    : posType;

  return (
    <XStack
      role="button"
      aria-pressed={state === 'selected'}
      aria-disabled={effectiveReadOnly}
      aria-label={ariaLabel}
      tabIndex={effectiveReadOnly ? -1 : 0}
      paddingVertical="$2.5"
      paddingHorizontal="$3"
      borderRadius="$3"
      borderWidth={1}
      borderLeftWidth={4}
      borderColor={
        state === 'selected'
          ? SELECTED_BORDER
          : eligible
            ? ELIGIBLE_BORDER
            : withAlpha(WHITE, 0.06)
      }
      borderLeftColor={railColor}
      backgroundColor={
        disabled
          ? withAlpha(SURFACE_CARD, 0.6)
          : state === 'selected'
            ? SELECTED_BG
            : eligible
              ? ELIGIBLE_BG
              : SURFACE_CARD
      }
      alignItems="center"
      gap="$3"
      opacity={disabled ? 0.6 : isLocked && assignedName ? 0.82 : 1}
      hoverStyle={
        effectiveReadOnly
          ? undefined
          : { borderColor: withAlpha(BRAND_GOLD, 0.25) }
      }
      pressStyle={effectiveReadOnly ? undefined : { scale: 0.99 }}
      animation="quick"
      style={eligible ? ELIGIBLE_GLOW : undefined}
      onPress={effectiveReadOnly ? undefined : onPress}
    >
      <Text
        fontFamily={FONT_DISPLAY}
        fontWeight="800"
        fontSize={13}
        letterSpacing={0.6}
        color={TEXT_MUTED}
        minWidth={40}
      >
        {posType}
      </Text>
      <YStack flex={1} minWidth={0}>
        <XStack alignItems="center" gap="$1.5" flexWrap="wrap">
          {/* Chip only when it adds information beyond the slot label (e.g. an
              RB filling a FLEX slot) — a duplicate would also break e2e specs
              that assert unique position text (roster-section.spec.ts). */}
          {chipPosition !== posType && (
            <PositionChip sport={sport} position={chipPosition} />
          )}
          <Text
            fontFamily={FONT_BODY}
            fontSize={14}
            fontWeight="600"
            color={TEXT_PRIMARY}
            numberOfLines={1}
          >
            {assignedName ?? getPositionLabel(posType)}
          </Text>
          {assignedName && isLocked && (
            <Lock size={11} color={TEXT_MUTED} aria-label="Locked" />
          )}
          {eligible && !isLocked && selectedName && (
            <XStack
              paddingHorizontal={6}
              paddingVertical={2}
              borderRadius="$10"
              borderWidth={1}
              borderColor={withAlpha(BRAND_GOLD, 0.4)}
              backgroundColor={withAlpha(BRAND_GOLD, 0.14)}
            >
              <Text
                fontFamily={FONT_DISPLAY}
                fontWeight="700"
                fontSize={8}
                letterSpacing={0.8}
                textTransform="uppercase"
                color={BRAND_GOLD_LIGHT}
              >
                {state === 'eligible-swap' ? 'Tap to swap' : 'Tap to assign'}
              </Text>
            </XStack>
          )}
        </XStack>
        <Text
          fontFamily={FONT_BODY}
          fontSize={12}
          color={isLocked && assignedName ? TEXT_MUTED : TEXT_TERTIARY}
          numberOfLines={1}
          marginTop={2}
        >
          {subText}
        </Text>
      </YStack>
      {assignedName &&
        stats == null &&
        formatTeamJersey(assignedMlbTeam, assignedJerseyNumber) && (
          <Text
            fontFamily={FONT_MONO}
            fontSize={11}
            fontWeight="700"
            color={TEXT_MUTED}
            numberOfLines={1}
          >
            {formatTeamJersey(assignedMlbTeam, assignedJerseyNumber)}
          </Text>
        )}
      {assignedName && stats != null && <ScoreCell stats={stats} />}
      {actions}
      {assignedName && onPlayerPress && (
        <YStack
          role="button"
          aria-label={`View ${assignedName} detail`}
          padding="$1"
          onPress={(e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            onPlayerPress();
          }}
        >
          <ChevronRight size={16} color={TEXT_TERTIARY} />
        </YStack>
      )}
    </XStack>
  );
}

interface BenchRowProps {
  sport: 'baseball' | 'football';
  name: string;
  eligible: readonly string[];
  primaryPosition: string;
  mlbTeam?: string | null;
  jerseyNumber?: number | null;
  stats?: RosterPlayerStats | null;
  selected: boolean;
  readOnly: boolean;
  isLocked?: boolean;
  onPress: () => void;
  onPlayerPress?: () => void;
}

function BenchRow({
  sport,
  name,
  eligible,
  primaryPosition,
  mlbTeam,
  jerseyNumber,
  stats,
  selected,
  readOnly,
  isLocked = false,
  onPress,
  onPlayerPress,
}: BenchRowProps): React.JSX.Element {
  const railColor = positionAccent(sport, primaryPosition);
  const effectiveReadOnly = readOnly || isLocked;
  const statsSub = stats ? subLineFromStats(stats) : null;
  return (
    <XStack
      role="button"
      aria-pressed={selected}
      aria-disabled={effectiveReadOnly}
      aria-label={`${name} — bench${isLocked ? ', locked' : ''}${selected ? ', selected' : ''}`}
      tabIndex={effectiveReadOnly ? -1 : 0}
      paddingVertical="$2.5"
      paddingHorizontal="$3"
      borderRadius="$3"
      borderWidth={1}
      borderLeftWidth={4}
      borderColor={selected ? SELECTED_BORDER : withAlpha(WHITE, 0.06)}
      borderLeftColor={railColor}
      backgroundColor={selected ? SELECTED_BG : withAlpha(SURFACE_CARD, 0.55)}
      alignItems="center"
      gap="$3"
      opacity={isLocked ? 0.82 : 1}
      hoverStyle={
        effectiveReadOnly
          ? undefined
          : { borderColor: withAlpha(BRAND_GOLD, 0.25) }
      }
      pressStyle={effectiveReadOnly ? undefined : { scale: 0.99 }}
      animation="quick"
      onPress={effectiveReadOnly ? undefined : onPress}
    >
      <YStack flex={1} minWidth={0}>
        <XStack alignItems="center" gap="$1.5" flexWrap="wrap">
          {primaryPosition !== '' && (
            <PositionChip sport={sport} position={primaryPosition} />
          )}
          <Text
            fontFamily={FONT_BODY}
            fontSize={13}
            fontWeight="600"
            color={TEXT_PRIMARY}
            numberOfLines={1}
          >
            {name}
          </Text>
          {isLocked && (
            <Lock size={11} color={TEXT_MUTED} aria-label="Locked" />
          )}
        </XStack>
        <Text
          fontFamily={FONT_BODY}
          fontSize={11}
          color={isLocked ? TEXT_MUTED : TEXT_TERTIARY}
          numberOfLines={1}
          marginTop={2}
        >
          {isLocked
            ? 'Locked — game in progress'
            : (statsSub ??
              (eligible.length > 0 ? eligible.join(' · ') : 'Unclassified'))}
        </Text>
      </YStack>
      {stats == null && formatTeamJersey(mlbTeam, jerseyNumber) && (
        <Text
          fontFamily={FONT_MONO}
          fontSize={11}
          fontWeight="700"
          color={TEXT_MUTED}
          numberOfLines={1}
        >
          {formatTeamJersey(mlbTeam, jerseyNumber)}
        </Text>
      )}
      {stats != null && <ScoreCell stats={stats} compact />}
      {!effectiveReadOnly && (
        <ArrowLeftRight size={13} color={TEXT_TERTIARY} aria-hidden />
      )}
      {onPlayerPress && (
        <YStack
          role="button"
          aria-label={`View ${name} detail`}
          padding="$1"
          onPress={(e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            onPlayerPress();
          }}
        >
          <ChevronRight size={16} color={TEXT_TERTIARY} />
        </YStack>
      )}
    </XStack>
  );
}

// ── Section card ────────────────────────────────────────────────────────────

function SectionCard({
  title,
  sub,
  right,
  children,
  testId,
  webSticky = false,
}: {
  title: string;
  sub?: string | null;
  right?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
  /** Pin the card while its column scrolls (web desktop bench, mockup 2a). */
  webSticky?: boolean;
}): React.JSX.Element {
  return (
    <Card
      borderRadius="$6"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      backgroundColor="$background"
      padding="$3"
      testID={testId}
      style={webSticky && isWeb ? { position: 'sticky', top: 16 } : undefined}
    >
      <XStack
        justifyContent="space-between"
        alignItems="center"
        marginBottom="$2"
        gap="$2"
      >
        <YStack minWidth={0}>
          {/* H2 keeps each section one level below the league page's h1 hero,
              matching the web a11y heading hierarchy (LS-4171). */}
          <H2
            fontFamily={FONT_DISPLAY}
            fontSize="$5"
            fontWeight="700"
            color="$color"
            margin={0}
          >
            {title}
          </H2>
          {sub != null && (
            <Text fontSize="$1" color={TEXT_TERTIARY}>
              {sub}
            </Text>
          )}
        </YStack>
        {right}
      </XStack>
      {children}
    </Card>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

/**
 * RosterBoard — cross-platform lineup board extracted from the web canonical
 * `RosterBoardV2` (LS-7813), restyled to the league-detail "command center"
 * design (LS-9355): position color rails from the canonical design-tokens
 * palette, per-row actual/projected points, gold tap-to-select accents, a
 * per-row quick-swap menu, and a two-column lineup + bench grid on wide
 * viewports. Selection-driven assign / swap / bench interaction is unchanged:
 * tap a player to select, then tap an eligible slot to assign or swap, or tap
 * the bench to send them down. Pure presentation + local selection state; all
 * mutations are delegated to the caller. Renders on web and native via Tamagui.
 */
export function RosterBoard<
  P extends RosterBoardPlayer,
  Pos extends RosterBoardPosition,
>({
  positions,
  teamPlayers,
  onPlayerAssign,
  onPlayerRemove,
  onPlayerSwap,
  onPlayerPress,
  loading = false,
  error = null,
  readOnly = false,
  disabledPositionIds,
  sport = 'baseball',
  getPlayerStats,
}: RosterBoardProps<P, Pos>): React.JSX.Element {
  const [selected, setSelected] = useState<P | null>(null);
  /** Position id whose quick-swap menu is open. */
  const [quickSwapPositionId, setQuickSwapPositionId] = useState<number | null>(
    null,
  );
  /** Position id whose overflow (kebab) menu is open. */
  const [morePositionId, setMorePositionId] = useState<number | null>(null);
  // Tamagui's useMedia is any-typed under the strict lint config; bind it
  // through an explicit signature so the call and result stay typed (same
  // pattern as LeagueDetailShell / HomeScreen).
  const readMedia = useMedia as () => { gtMd?: boolean };
  const media = readMedia();
  const isFootball = sport === 'football';

  const { hitterSlots, pitcherSlots } = useMemo(() => {
    if (isFootball) return { hitterSlots: [...positions], pitcherSlots: [] };
    const hitters: Pos[] = [];
    const pitchers: Pos[] = [];
    for (const p of positions) {
      if (isPitcherSlot(p.positionType)) pitchers.push(p);
      else hitters.push(p);
    }
    return { hitterSlots: hitters, pitcherSlots: pitchers };
  }, [positions, isFootball]);

  const benchPlayers = useMemo(
    () => teamPlayers.filter((p) => p.positionId == null),
    [teamPlayers],
  );

  const { benchHitters, benchPitchers } = useMemo(() => {
    if (isFootball)
      return { benchHitters: [...benchPlayers], benchPitchers: [] };
    const hitters: P[] = [];
    const pitchers: P[] = [];
    for (const p of benchPlayers) {
      if (playerHasPitchingOnly(p)) pitchers.push(p);
      else if (playerHasBatting(p)) hitters.push(p);
      else hitters.push(p); // unclassified → hitters group (safety fallback)
    }
    return { benchHitters: hitters, benchPitchers: pitchers };
  }, [benchPlayers, isFootball]);

  const filledHitters = hitterSlots.filter((s) =>
    teamPlayers.some((tp) => tp.positionId === s.id),
  ).length;
  const filledPitchers = pitcherSlots.filter((s) =>
    teamPlayers.some((tp) => tp.positionId === s.id),
  ).length;

  const starterStats = useMemo(() => {
    if (!getPlayerStats) return null;
    let total = 0;
    let proj = 0;
    let any = false;
    for (const p of teamPlayers) {
      if (p.positionId == null) continue;
      const s = getPlayerStats(p);
      if (!s) continue;
      any = true;
      total += s.actual ?? 0;
      proj += s.projected ?? 0;
    }
    return any ? { total, proj } : null;
  }, [getPlayerStats, teamPlayers]);

  const benchProj = useMemo(() => {
    if (!getPlayerStats) return null;
    let proj = 0;
    let any = false;
    for (const p of benchPlayers) {
      const s = getPlayerStats(p);
      if (!s) continue;
      any = true;
      proj += s.projected ?? 0;
    }
    return any ? proj : null;
  }, [getPlayerStats, benchPlayers]);

  const closeMenus = useCallback(() => {
    setQuickSwapPositionId(null);
    setMorePositionId(null);
  }, []);

  const handleSlotPress = useCallback(
    (position: Pos) => {
      if (readOnly) return;
      if (position.id != null && disabledPositionIds?.has(position.id)) return;
      closeMenus();
      const assigned = teamPlayers.find((p) => p.positionId === position.id);
      if (!selected) {
        if (assigned && !assigned.isLocked) setSelected(assigned);
        return;
      }
      // Clicking the already-selected player's own slot → deselect.
      if (assigned && assigned.id === selected.id) {
        setSelected(null);
        return;
      }
      const canAccept = canPlayerPlayPosition(
        selected,
        position.positionType,
        sport,
      );
      if (assigned && canAccept) {
        if (assigned.isLocked) {
          // Can't swap into a locked player's slot; re-select them instead.
          setSelected(assigned);
          return;
        }
        // Swap when the data layer supports it; otherwise re-select occupant.
        if (onPlayerSwap) {
          onPlayerSwap(selected, position, assigned);
          setSelected(null);
        } else {
          setSelected(assigned);
        }
        return;
      }
      if (!assigned && canAccept) {
        onPlayerAssign(selected, position);
        setSelected(null);
        return;
      }
      // Selected player can't play here — switch to the occupant or deselect.
      if (assigned) setSelected(assigned);
      else setSelected(null);
    },
    [
      readOnly,
      selected,
      teamPlayers,
      onPlayerAssign,
      onPlayerSwap,
      disabledPositionIds,
      sport,
      closeMenus,
    ],
  );

  const handleBenchSelect = useCallback(
    (player: P) => {
      if (readOnly) return;
      if (player.isLocked) return;
      closeMenus();
      // Tapping the bench while a lineup player is selected → bench that player.
      if (selected && selected.positionId != null) {
        const pos = positions.find((p) => p.id === selected.positionId);
        if (pos) {
          onPlayerRemove(pos);
          setSelected(null);
          return;
        }
      }
      setSelected(selected?.id === player.id ? null : player);
    },
    [readOnly, selected, positions, onPlayerRemove, closeMenus],
  );

  if (loading) {
    return (
      <Card
        borderRadius="$6"
        borderWidth={1}
        borderColor="$surfacePanelBorder"
        padding="$5"
        alignItems="center"
      >
        <Spinner size="small" color="$brandNavyLight" />
        <Text marginTop="$2" color="$gray11" fontSize="$3">
          Loading roster…
        </Text>
      </Card>
    );
  }

  if (error) {
    return (
      <Card
        role="alert"
        borderRadius="$6"
        borderWidth={1}
        borderColor="$red7"
        backgroundColor="$red2"
        padding="$5"
        alignItems="center"
      >
        <Text fontSize="$4" fontWeight="700" color="$red11">
          Failed to load roster
        </Text>
        <Text marginTop="$1" color="$red11" fontSize="$2">
          Refresh the page to try again.
        </Text>
      </Card>
    );
  }

  const selectedName = selected ? getPlayerName(selected) : null;
  const moveToBenchEnabled = !readOnly && selected?.positionId != null;

  const renderSlot = (position: Pos) => {
    const assigned = teamPlayers.find((p) => p.positionId === position.id);
    let state: SlotState = 'idle';
    if (selected) {
      const canAccept = canPlayerPlayPosition(
        selected,
        position.positionType,
        sport,
      );
      if (assigned?.id === selected.id) state = 'selected';
      else if (assigned && canAccept) state = 'eligible-swap';
      else if (!assigned && canAccept) state = 'eligible-empty';
    }
    const slotDisabled =
      position.id != null && (disabledPositionIds?.has(position.id) ?? false);
    const stats = assigned && getPlayerStats ? getPlayerStats(assigned) : null;

    // Quick-swap candidates: unlocked bench players eligible for this slot.
    const swapCandidates = benchPlayers.filter(
      (b) =>
        !b.isLocked && canPlayerPlayPosition(b, position.positionType, sport),
    );
    const canQuickSwap =
      !readOnly &&
      !slotDisabled &&
      !(assigned?.isLocked ?? false) &&
      (assigned == null || onPlayerSwap != null);
    const quickSwapOpen = quickSwapPositionId === position.id;
    const moreOpen = morePositionId === position.id;
    const posType = (position.positionType ?? '').toUpperCase();

    const actions =
      canQuickSwap || assigned != null ? (
        <XStack gap="$1.5">
          {canQuickSwap && (
            <IconMini
              label={`Quick swap ${posType}`}
              expanded={quickSwapOpen}
              onPress={() => {
                setMorePositionId(null);
                setQuickSwapPositionId(
                  quickSwapOpen ? null : (position.id ?? null),
                );
              }}
            >
              <ArrowLeftRight size={14} color={TEXT_MUTED} />
            </IconMini>
          )}
          {assigned != null && (onPlayerPress || !readOnly) && (
            <IconMini
              label={`More actions for ${getPlayerName(assigned)}`}
              expanded={moreOpen}
              onPress={() => {
                setQuickSwapPositionId(null);
                setMorePositionId(moreOpen ? null : (position.id ?? null));
              }}
            >
              <EllipsisVertical size={14} color={TEXT_MUTED} />
            </IconMini>
          )}
        </XStack>
      ) : undefined;

    return (
      <YStack key={position.id}>
        <SlotRow
          sport={sport}
          positionType={position.positionType ?? ''}
          assignedName={assigned ? getPlayerName(assigned) : null}
          assignedEligible={assigned?.player?.eligiblePositions ?? []}
          assignedMlbTeam={assigned?.player?.mlbTeam}
          assignedJerseyNumber={assigned?.player?.jerseyNumber}
          assignedPrimaryPosition={assigned?.player?.eligiblePositions?.[0]}
          stats={stats}
          selectedName={selectedName}
          state={state}
          readOnly={readOnly}
          disabled={slotDisabled}
          isLocked={assigned?.isLocked ?? false}
          onPress={() => handleSlotPress(position)}
          onPlayerPress={
            assigned && onPlayerPress
              ? () => onPlayerPress(assigned)
              : undefined
          }
          actions={actions}
        />
        {quickSwapOpen && (
          <RowMenu>
            {swapCandidates.length === 0 ? (
              <Text
                fontFamily={FONT_BODY}
                fontSize={12}
                color={TEXT_TERTIARY}
                paddingHorizontal="$3"
                paddingVertical="$2.5"
              >
                No eligible bench players.
              </Text>
            ) : (
              swapCandidates.map((b) => {
                const bStats = getPlayerStats ? getPlayerStats(b) : null;
                return (
                  <RowMenuItem
                    key={b.id}
                    label={
                      assigned
                        ? `Swap in ${getPlayerName(b)} at ${posType}`
                        : `Assign ${getPlayerName(b)} to ${posType}`
                    }
                    right={
                      bStats?.projected != null
                        ? `${bStats.projected.toFixed(1)} proj`
                        : null
                    }
                    onPress={() => {
                      closeMenus();
                      setSelected(null);
                      if (assigned) {
                        onPlayerSwap?.(b, position, assigned);
                      } else {
                        onPlayerAssign(b, position);
                      }
                    }}
                  />
                );
              })
            )}
          </RowMenu>
        )}
        {moreOpen && assigned != null && (
          <RowMenu>
            {onPlayerPress && (
              <RowMenuItem
                label={`View ${getPlayerName(assigned)} details`}
                onPress={() => {
                  closeMenus();
                  onPlayerPress(assigned);
                }}
              />
            )}
            {!readOnly && !(assigned.isLocked ?? false) && (
              <RowMenuItem
                label={`Move ${getPlayerName(assigned)} to bench`}
                onPress={() => {
                  closeMenus();
                  setSelected(null);
                  onPlayerRemove(position);
                }}
              />
            )}
          </RowMenu>
        )}
      </YStack>
    );
  };

  const renderBenchRow = (p: P) => (
    <BenchRow
      key={p.id}
      sport={sport}
      name={getPlayerName(p)}
      eligible={p.player?.eligiblePositions ?? []}
      primaryPosition={p.player?.eligiblePositions?.[0] ?? ''}
      mlbTeam={p.player?.mlbTeam}
      jerseyNumber={p.player?.jerseyNumber}
      stats={getPlayerStats ? getPlayerStats(p) : null}
      selected={selected?.id === p.id}
      readOnly={readOnly}
      isLocked={p.isLocked ?? false}
      onPress={() => handleBenchSelect(p)}
      onPlayerPress={onPlayerPress ? () => onPlayerPress(p) : undefined}
    />
  );

  const selectionBanner = selected && !readOnly && (
    <Card
      role="status"
      aria-live="polite"
      borderRadius="$4"
      borderWidth={1}
      borderColor={withAlpha(BRAND_GOLD, 0.4)}
      backgroundColor={withAlpha(BRAND_GOLD, 0.1)}
      paddingHorizontal="$4"
      paddingVertical="$2.5"
    >
      <XStack alignItems="center" gap="$2">
        <Users size={18} color={BRAND_GOLD_LIGHT} />
        <YStack flex={1} minWidth={0}>
          <Text fontSize="$3" fontWeight="700" color="$brandGold">
            {selectedName} selected
          </Text>
          <Text fontSize="$2" color="$brandGoldLight">
            {selected.positionId != null
              ? 'Tap an eligible slot to swap, or tap the bench to send this player there.'
              : 'Tap an eligible lineup slot to assign.'}
          </Text>
        </YStack>
        <Text
          role="button"
          aria-label="Cancel selection"
          tabIndex={0}
          fontSize="$2"
          fontWeight="600"
          color="$brandGoldLight"
          hoverStyle={{ color: '$brandGold' }}
          onPress={() => setSelected(null)}
        >
          Cancel
        </Text>
      </XStack>
    </Card>
  );

  const startersCard = (
    <SectionCard
      title={isFootball ? 'Starters' : 'Starting Hitters'}
      sub={
        isFootball
          ? `${filledHitters} of ${hitterSlots.length} positions filled`
          : null
      }
      testId={isFootball ? 'roster-section-starters' : 'roster-section-hitters'}
      right={
        starterStats != null ? (
          <Text fontFamily={FONT_MONO} fontSize="$2" color={TEXT_TERTIARY}>
            Total:{' '}
            <Text color={WHITE} fontWeight="700" fontSize="$4">
              {starterStats.total.toFixed(1)}
            </Text>{' '}
            · Proj {starterStats.proj.toFixed(1)}
          </Text>
        ) : (
          <Text fontSize="$2" color="$gray10">
            {filledHitters}/{hitterSlots.length}
          </Text>
        )
      }
    >
      {hitterSlots.length === 0 ? (
        <Text color="$gray9" fontSize="$2" padding="$2">
          {isFootball
            ? 'No starting slots configured.'
            : 'No hitter slots configured.'}
        </Text>
      ) : (
        <YStack gap="$2">{hitterSlots.map(renderSlot)}</YStack>
      )}
    </SectionCard>
  );

  const pitchersCard = isFootball ? null : (
    <SectionCard
      title="Starting Pitchers"
      testId="roster-section-pitchers"
      right={
        <Text fontSize="$2" color="$gray10">
          {filledPitchers}/{pitcherSlots.length}
        </Text>
      }
    >
      {pitcherSlots.length === 0 ? (
        <Text color="$gray9" fontSize="$2" padding="$2">
          No pitcher slots configured.
        </Text>
      ) : (
        <YStack gap="$2">{pitcherSlots.map(renderSlot)}</YStack>
      )}
    </SectionCard>
  );

  const benchCard = (
    <SectionCard
      title="Bench"
      testId="roster-section-bench"
      sub={
        benchProj != null
          ? `${benchPlayers.length} players · Proj ${benchProj.toFixed(1)}`
          : null
      }
      right={
        benchProj == null ? (
          <Text fontSize="$2" color="$gray10">
            {benchPlayers.length} players
          </Text>
        ) : undefined
      }
      webSticky={media.gtMd}
    >
      {benchPlayers.length === 0 && !moveToBenchEnabled ? (
        <Text color="$gray9" fontSize="$2" padding="$2">
          Bench is empty. Add free agents or move players from the lineup.
        </Text>
      ) : (
        <YStack gap="$4">
          {isFootball ? (
            <YStack gap="$2">{benchHitters.map(renderBenchRow)}</YStack>
          ) : (
            <>
              <YStack gap="$2">
                <Text fontSize="$2" color="$gray10">
                  Hitters · {benchHitters.length}
                </Text>
                {benchHitters.length === 0 ? (
                  <Text color="$gray9" fontSize="$1" padding="$2">
                    No hitters on the bench.
                  </Text>
                ) : (
                  benchHitters.map(renderBenchRow)
                )}
              </YStack>
              <YStack gap="$2">
                <Text fontSize="$2" color="$gray10">
                  Pitchers · {benchPitchers.length}
                </Text>
                {benchPitchers.length === 0 ? (
                  <Text color="$gray9" fontSize="$1" padding="$2">
                    No pitchers on the bench.
                  </Text>
                ) : (
                  benchPitchers.map(renderBenchRow)
                )}
              </YStack>
            </>
          )}
          {moveToBenchEnabled && selected && (
            <Text
              role="button"
              aria-label={`Move ${selectedName} to bench`}
              tabIndex={0}
              fontSize="$2"
              fontWeight="600"
              color="$brandGoldLight"
              hoverStyle={{ color: '$brandGold' }}
              onPress={() => {
                const pos = positions.find((p) => p.id === selected.positionId);
                if (pos) {
                  onPlayerRemove(pos);
                  setSelected(null);
                }
              }}
            >
              Move {selectedName} to bench
            </Text>
          )}
        </YStack>
      )}
    </SectionCard>
  );

  // Wide viewports: lineup 2fr + bench 1fr side-by-side (mockup 2a). Baseball
  // stacks its hitter/pitcher cards inside the lineup column.
  if (media.gtMd) {
    return (
      <YStack gap="$4">
        {selectionBanner}
        <XStack gap="$4" alignItems="flex-start">
          <YStack flex={2} minWidth={0} gap="$4">
            {startersCard}
            {pitchersCard}
          </YStack>
          <YStack flex={1} minWidth={0}>
            {benchCard}
          </YStack>
        </XStack>
      </YStack>
    );
  }

  return (
    <YStack gap="$4">
      {selectionBanner}
      {startersCard}
      {pitchersCard}
      {benchCard}
    </YStack>
  );
}
