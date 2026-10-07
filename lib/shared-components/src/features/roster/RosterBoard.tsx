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
import { ArrowLeftRight } from '@tamagui/lucide-icons/icons/ArrowLeftRight';
import { ChevronRight } from '@tamagui/lucide-icons/icons/ChevronRight';
import { EllipsisVertical } from '@tamagui/lucide-icons/icons/EllipsisVertical';
import { Lock } from '@tamagui/lucide-icons/icons/Lock';
import { Users } from '@tamagui/lucide-icons/icons/Users';
import { contrastRatio } from '@legacy-sports/design-tokens';
import { LOGGER } from '@legacy-sports/logging';
import {
  canPlayerPlayPosition,
  getEligiblePositions,
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
  /** Cap hit (dollars) for this roster slot in salary-cap leagues. Null/absent otherwise (LS-6338). */
  salary?: number | null;
  player?: {
    id?: number | null;
    firstName?: string | null;
    lastName?: string | null;
    eligiblePositions?: readonly string[] | null;
    /** Current MLB team abbreviation for baseball players (LS-8597). */
    mlbTeam?: string | null;
    /** Jersey number (LS-8597 for baseball players). */
    jerseyNumber?: number | null;
    /** Current NFL team abbreviation for football players (LS-6334). */
    nflTeam?: string | null;
  } | null;
}

/** Formats a salary cap hit as a compact dollar string, e.g. "$4,500,000". */
function formatSalary(salary: number): string {
  return `$${salary.toLocaleString()}`;
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
  /**
   * When true, renders each assigned/bench player's salary cap hit
   * (`player.salary`) — premium salary-cap leagues need this visible on the
   * roster, otherwise the cap is the most critical roster signal and it's
   * invisible (LS-6338). No-op for non-cap leagues, which should pass false.
   */
  salaryCapEnabled?: boolean;
  /**
   * Per-NFL-team bye week for the league's active season, keyed by team
   * abbreviation (LS-6334). Football-only — omit for baseball, which has no
   * bye-week concept in a historical-data platform. Paired with `currentWeek`
   * to flag starters whose team is on bye with a red warning chip.
   */
  byeWeeksByTeam?: Readonly<Record<string, number>>;
  /**
   * The league's active/viewed week. Compared against `byeWeeksByTeam` to
   * determine bye-week starters (LS-6334).
   */
  currentWeek?: number | null;
  /**
   * The roster's owning team, for diagnostic context only (LS-6439) — logged
   * alongside a duplicate-`positionId` warning so the underlying data issue
   * can be traced back to a specific team. Purely optional; omitting it just
   * drops that field from the log line.
   */
  teamId?: number | string | null;
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

/** Red "On Bye Week" warning chip for a starter whose NFL team has no game this week (LS-6334). */
function ByeWeekChip(): React.JSX.Element {
  return (
    <XStack
      paddingHorizontal={6}
      paddingVertical={2}
      borderRadius="$10"
      backgroundColor={SCORE_LOSS}
    >
      <Text
        fontFamily={FONT_DISPLAY}
        fontWeight="700"
        fontSize={8}
        letterSpacing={0.6}
        textTransform="uppercase"
        color={WHITE}
      >
        On Bye Week
      </Text>
    </XStack>
  );
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
      // A non-<button> role="button" gets no native key activation on web,
      // so Enter/Space must be wired explicitly (LS-10719).
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPress();
        }
      }}
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

/**
 * Human-readable reason a selected player can't be placed in a given slot
 * (LS-9768) — surfaced as a dismissible banner instead of the tap silently
 * doing nothing. `null` when the placement is actually allowed.
 */
function describeBlockedPlacement(
  playerName: string,
  targetLabel: string,
  eligible: readonly string[],
  isTargetLocked: boolean,
): string {
  if (isTargetLocked) {
    return `${targetLabel} is locked — that matchup has already started, so this slot can't be changed.`;
  }
  return eligible.length > 0
    ? `${playerName} is only eligible for ${eligible.join(', ')} — can't be placed at ${targetLabel}.`
    : `${playerName} can't be placed at ${targetLabel}.`;
}

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
  positionId: number | null | undefined;
  positionType: string;
  assignedName: string | null;
  assignedEligible: readonly string[];
  assignedMlbTeam?: string | null;
  assignedJerseyNumber?: number | null;
  assignedPrimaryPosition?: string | null;
  assignedSalary?: number | null;
  showSalary?: boolean;
  stats?: RosterPlayerStats | null;
  selectedName: string | null;
  state: SlotState;
  readOnly: boolean;
  disabled?: boolean;
  isLocked?: boolean;
  /** True when the assigned player's team is on a bye this week (LS-6334). */
  onBye?: boolean;
  onPress: () => void;
  onPlayerPress?: () => void;
  actions?: React.ReactNode;
}

function SlotRow({
  sport,
  positionId,
  positionType,
  assignedName,
  assignedEligible,
  assignedMlbTeam,
  assignedJerseyNumber,
  assignedPrimaryPosition,
  assignedSalary,
  showSalary = false,
  stats,
  selectedName,
  state,
  readOnly,
  disabled = false,
  isLocked = false,
  onBye = false,
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
        : onBye
          ? `${assignedName} at ${posType} — on bye week`
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

  // Suggested testID scheme (LS-9654): `roster-slot-${positionId}`.
  const rowTestId = `roster-slot-${positionId}`;

  const row = (
    <XStack
      testID={rowTestId}
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
          {assignedName && onBye && <ByeWeekChip />}
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
      {assignedName && showSalary && assignedSalary != null && (
        <Text
          fontFamily={FONT_MONO}
          fontSize={11}
          fontWeight="700"
          color={TEXT_MUTED}
          numberOfLines={1}
        >
          {formatSalary(assignedSalary)}
        </Text>
      )}
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

  // Tamagui drops `data-testid` on animated XStacks with onPress in Chromium
  // (LS-4133, LS-4215) — a web-only `<div>` wrapper guarantees the attribute
  // reaches the real DOM for Playwright. RN has no view config for a
  // lowercase `div` host tag, so the wrapper must stay web-only; native reads
  // `testID` straight off the XStack (LS-9163 pattern, LS-9654).
  return isWeb ? <div data-testid={rowTestId}>{row}</div> : row;
}

interface BenchRowProps {
  sport: 'baseball' | 'football';
  playerId: number | null | undefined;
  name: string;
  eligible: readonly string[];
  primaryPosition: string;
  mlbTeam?: string | null;
  jerseyNumber?: number | null;
  salary?: number | null;
  showSalary?: boolean;
  stats?: RosterPlayerStats | null;
  selected: boolean;
  readOnly: boolean;
  isLocked?: boolean;
  onPress: () => void;
  onPlayerPress?: () => void;
}

function BenchRow({
  sport,
  playerId,
  name,
  eligible,
  primaryPosition,
  mlbTeam,
  jerseyNumber,
  salary,
  showSalary = false,
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

  // Suggested testID scheme (LS-9654): `roster-bench-${playerId}`.
  const rowTestId = `roster-bench-${playerId}`;

  const row = (
    <XStack
      testID={rowTestId}
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
      {showSalary && salary != null && (
        <Text
          fontFamily={FONT_MONO}
          fontSize={11}
          fontWeight="700"
          color={TEXT_MUTED}
          numberOfLines={1}
        >
          {formatSalary(salary)}
        </Text>
      )}
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

  // Tamagui drops `data-testid` on animated XStacks with onPress in Chromium
  // (LS-4133, LS-4215) — a web-only `<div>` wrapper guarantees the attribute
  // reaches the real DOM for Playwright. RN has no view config for a
  // lowercase `div` host tag, so the wrapper must stay web-only; native reads
  // `testID` straight off the XStack (LS-9163 pattern, LS-9654).
  return isWeb ? <div data-testid={rowTestId}>{row}</div> : row;
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
  salaryCapEnabled = false,
  byeWeeksByTeam,
  currentWeek,
  teamId,
}: RosterBoardProps<P, Pos>): React.JSX.Element {
  const [selected, setSelected] = useState<P | null>(null);
  /**
   * Reason the last placement attempt was blocked (position mismatch, or the
   * target slot's occupant is locked) — cleared on the next successful
   * action, new selection, or dismissal (LS-9768).
   */
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  /** Position id whose quick-swap menu is open. */
  const [quickSwapPositionId, setQuickSwapPositionId] = useState<number | null>(
    null,
  );
  /** Position id whose overflow (kebab) menu is open. */
  const [morePositionId, setMorePositionId] = useState<number | null>(null);
  const media = useMedia();
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

  /**
   * Resolves the one starter occupying each slot. `team_members.positionId`
   * is expected to be unique among starters, but if data corruption, a race
   * condition, or a migration bug ever produces two rows sharing the same
   * positionId, a plain `Map.set` would silently let the later row overwrite
   * the earlier one — the earlier player would vanish from the lineup with no
   * trace of what happened (LS-6439). Still resolves to one entry per
   * positionId (last write wins, unchanged from before), but now logs the
   * collision so the underlying data issue is discoverable.
   */
  const teamMemberByPositionId = useMemo(() => {
    const map = new Map<number, P>();
    for (const p of teamPlayers) {
      if (p.positionId == null) continue;
      const existing = map.get(p.positionId);
      if (existing) {
        LOGGER.warn('Duplicate positionId in team roster', {
          teamId,
          positionId: p.positionId,
          overwrittenPlayerId: existing.id,
          newPlayerId: p.id,
        });
      }
      map.set(p.positionId, p);
    }
    return map;
  }, [teamPlayers, teamId]);

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
      const assigned =
        position.id != null
          ? teamMemberByPositionId.get(position.id)
          : undefined;
      const posLabel = getPositionLabel(position.positionType);
      if (!selected) {
        setBlockedReason(null);
        if (assigned && !assigned.isLocked) setSelected(assigned);
        return;
      }
      // Clicking the already-selected player's own slot → deselect.
      if (assigned && assigned.id === selected.id) {
        setBlockedReason(null);
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
          // (Unreachable from the row's own tap today — SlotRow disables
          // onPress whenever its occupant is locked — but this guard stays
          // as a defensive fallback for any other caller of this handler.
          // The locked occupant's own row already explains why via its
          // "Locked — game in progress" subtext and lock icon, LS-9768.)
          setSelected(assigned);
          return;
        }
        // Swap when the data layer supports it; otherwise re-select occupant.
        setBlockedReason(null);
        if (onPlayerSwap) {
          onPlayerSwap(selected, position, assigned);
          setSelected(null);
        } else {
          setSelected(assigned);
        }
        return;
      }
      if (!assigned && canAccept) {
        setBlockedReason(null);
        onPlayerAssign(selected, position);
        setSelected(null);
        return;
      }
      // Selected player can't play here (position mismatch, LS-9768) —
      // explain why, then switch to the occupant or deselect as before.
      setBlockedReason(
        describeBlockedPlacement(
          getPlayerName(selected),
          posLabel,
          getEligiblePositions(selected),
          false,
        ),
      );
      if (assigned) setSelected(assigned);
      else setSelected(null);
    },
    [
      readOnly,
      selected,
      teamMemberByPositionId,
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
      setBlockedReason(null);
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
    const assigned =
      position.id != null ? teamMemberByPositionId.get(position.id) : undefined;
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
    const assignedTeam = assigned?.player?.nflTeam;
    const onBye =
      isFootball &&
      currentWeek != null &&
      assignedTeam != null &&
      byeWeeksByTeam?.[assignedTeam] === currentWeek;

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
          positionId={position.id}
          positionType={position.positionType ?? ''}
          assignedName={assigned ? getPlayerName(assigned) : null}
          assignedEligible={assigned?.player?.eligiblePositions ?? []}
          assignedMlbTeam={assigned?.player?.mlbTeam}
          assignedJerseyNumber={assigned?.player?.jerseyNumber}
          assignedPrimaryPosition={assigned?.player?.eligiblePositions?.[0]}
          assignedSalary={assigned?.salary}
          showSalary={salaryCapEnabled}
          stats={stats}
          selectedName={selectedName}
          state={state}
          readOnly={readOnly}
          disabled={slotDisabled}
          isLocked={assigned?.isLocked ?? false}
          onBye={onBye}
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
      playerId={p.id}
      name={getPlayerName(p)}
      eligible={p.player?.eligiblePositions ?? []}
      primaryPosition={p.player?.eligiblePositions?.[0] ?? ''}
      mlbTeam={p.player?.mlbTeam}
      jerseyNumber={p.player?.jerseyNumber}
      salary={p.salary}
      showSalary={salaryCapEnabled}
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
          testID="roster-cancel-selection"
          role="button"
          aria-label="Cancel selection"
          tabIndex={0}
          fontSize="$2"
          fontWeight="600"
          color="$brandGoldLight"
          hoverStyle={{ color: '$brandGold' }}
          onPress={() => {
            setSelected(null);
            setBlockedReason(null);
          }}
        >
          Cancel
        </Text>
      </XStack>
    </Card>
  );

  const blockedReasonBanner = blockedReason && !readOnly && (
    <Card
      testID="roster-blocked-reason"
      role="alert"
      aria-live="assertive"
      borderRadius="$4"
      borderWidth={1}
      borderColor="$orange7"
      backgroundColor="$orange3"
      paddingHorizontal="$4"
      paddingVertical="$2.5"
    >
      <XStack alignItems="center" gap="$2">
        <YStack flex={1} minWidth={0}>
          <Text fontSize="$2" color="$orange11">
            {blockedReason}
          </Text>
        </YStack>
        <Text
          testID="roster-dismiss-blocked-reason"
          role="button"
          aria-label="Dismiss"
          tabIndex={0}
          fontSize="$2"
          fontWeight="600"
          color="$orange11"
          onPress={() => setBlockedReason(null)}
        >
          Dismiss
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
              testID="roster-move-to-bench"
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
                  setBlockedReason(null);
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
        {blockedReasonBanner}
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
      {blockedReasonBanner}
      {startersCard}
      {pitchersCard}
      {benchCard}
    </YStack>
  );
}
