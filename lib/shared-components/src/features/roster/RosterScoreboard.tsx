import React from 'react';
import { Card, isWeb, Text, useMedia, XStack, YStack } from 'tamagui';
import { ChevronLeft, ChevronRight } from '@tamagui/lucide-icons';
import {
  BG_DARK,
  BLACK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  GREEN,
  OUTLINE_DEFAULT,
  OUTLINE_STRONG,
  OUTLINE_SUBTLE,
  SURFACE_SUBTLE,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
  WHITE,
  withAlpha,
} from '../../utils/colors';
import { FONT_DISPLAY, FONT_MONO, TABULAR_NUMS } from '../../utils/typography';

// ── Types ───────────────────────────────────────────────────────────────────

export interface RosterScorelineTeam {
  name?: string | null;
  /** Actual points scored so far this matchup. */
  score?: number | null;
  /** Projected final score. */
  projected?: number | null;
  /** Starters whose games are complete. */
  playersPlayed?: number | null;
  /** Total starters in the lineup. */
  playersTotal?: number | null;
}

export interface RosterScoreboardProps {
  /** The week currently being viewed. */
  week: number;
  /** The league's live/current week. */
  currentWeek: number;
  /** Total number of matchup weeks in the season. */
  totalWeeks: number;
  /** Called with the new week when the user steps the picker. */
  onWeekChange: (week: number) => void;
  /** Called when the user taps "Reset to Current". */
  onResetToCurrent: () => void;
  /** The viewer's side of the matchup scoreline. Omit to hide the scoreline. */
  myTeam?: RosterScorelineTeam | null;
  /** The opponent's side of the matchup scoreline. */
  opponent?: RosterScorelineTeam | null;
  /** Matchup period, e.g. "Thu Nov 12 – Mon Nov 16". Wide layout only. */
  dateRange?: string | null;
  /**
   * Right-band action slot (e.g. the premium-gated "Set Optimal Lineup"
   * button). Rendered in the top band on wide viewports; narrow viewports get
   * their actions from RosterActionBar instead.
   */
  actions?: React.ReactNode;
}

// ── Status chip ─────────────────────────────────────────────────────────────

interface ChipConfig {
  label: string;
  bg: string;
  border: string;
  text: string;
}

function chipConfig(week: number, currentWeek: number): ChipConfig {
  if (week === currentWeek)
    return {
      label: 'Current',
      bg: withAlpha(GREEN, 0.12),
      border: withAlpha(GREEN, 0.4),
      text: GREEN,
    };
  if (week < currentWeek)
    return {
      label: 'Frozen',
      bg: SURFACE_SUBTLE,
      border: OUTLINE_DEFAULT,
      text: TEXT_PRIMARY,
    };
  return {
    label: 'Upcoming',
    bg: withAlpha(BRAND_GOLD, 0.14),
    border: withAlpha(BRAND_GOLD, 0.4),
    text: BRAND_GOLD_LIGHT,
  };
}

function StatusChip({ chip }: { chip: ChipConfig }): React.JSX.Element {
  return (
    <XStack
      paddingHorizontal="$2"
      paddingVertical={3}
      borderRadius="$10"
      borderWidth={1}
      backgroundColor={chip.bg}
      borderColor={chip.border}
    >
      <Text
        fontFamily={FONT_DISPLAY}
        fontSize={9}
        fontWeight="700"
        color={chip.text}
        letterSpacing={1}
        textTransform="uppercase"
      >
        {chip.label}
      </Text>
    </XStack>
  );
}

// ── Nav button ──────────────────────────────────────────────────────────────

function NavButton({
  direction,
  disabled,
  size,
  onPress,
}: {
  direction: 'prev' | 'next';
  disabled: boolean;
  size: number;
  onPress: () => void;
}): React.JSX.Element {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <XStack
      role="button"
      aria-label={direction === 'prev' ? 'Previous week' : 'Next week'}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      width={size}
      height={size}
      borderRadius="$2"
      borderWidth={1}
      borderColor={OUTLINE_DEFAULT}
      backgroundColor={withAlpha(WHITE, 0.04)}
      justifyContent="center"
      alignItems="center"
      opacity={disabled ? 0.4 : 1}
      hoverStyle={
        disabled ? undefined : { backgroundColor: withAlpha(WHITE, 0.08) }
      }
      pressStyle={disabled ? undefined : { scale: 0.95 }}
      onPress={disabled ? undefined : onPress}
    >
      <Icon size={14} color={TEXT_PRIMARY} />
    </XStack>
  );
}

// ── Scoreline sides ─────────────────────────────────────────────────────────

function formatScore(value: number | null | undefined): string {
  return (value ?? 0).toFixed(1);
}

function subLine(team: RosterScorelineTeam): string | null {
  const parts: string[] = [];
  if (team.projected != null) parts.push(`proj ${team.projected.toFixed(1)}`);
  if (team.playersPlayed != null && team.playersTotal != null)
    parts.push(`${team.playersPlayed} of ${team.playersTotal} played`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function TeamSide({
  team,
  isMine,
  alignRight,
  condensed,
}: {
  team: RosterScorelineTeam;
  isMine: boolean;
  alignRight: boolean;
  condensed: boolean;
}): React.JSX.Element {
  const scoreColor = isMine ? BRAND_GOLD_LIGHT : WHITE;
  const name = team.name ?? (isMine ? 'My Team' : 'Opponent');
  if (condensed) {
    return (
      <YStack
        minWidth={0}
        flex={1}
        alignItems={alignRight ? 'flex-end' : 'flex-start'}
      >
        <Text
          fontFamily={FONT_DISPLAY}
          fontWeight="700"
          fontSize={12}
          letterSpacing={0.4}
          color={TEXT_PRIMARY}
          numberOfLines={1}
        >
          {name}
        </Text>
        <XStack alignItems="baseline" gap="$1.5">
          <Text
            fontFamily={FONT_DISPLAY}
            fontWeight="800"
            fontSize={24}
            lineHeight={26}
            color={scoreColor}
            {...TABULAR_NUMS}
            aria-label={`${name} score ${formatScore(team.score)}`}
          >
            {formatScore(team.score)}
          </Text>
          {team.projected != null && (
            <Text fontFamily={FONT_MONO} fontSize={10} color={TEXT_TERTIARY}>
              p{team.projected.toFixed(1)}
            </Text>
          )}
        </XStack>
      </YStack>
    );
  }
  const sub = subLine(team);
  return (
    <YStack
      minWidth={0}
      flex={1}
      gap={2}
      alignItems={alignRight ? 'flex-end' : 'flex-start'}
    >
      <Text
        fontFamily={FONT_DISPLAY}
        fontWeight="700"
        fontSize={14}
        letterSpacing={0.4}
        color={TEXT_PRIMARY}
        numberOfLines={1}
      >
        {name}
        {isMine ? (
          <Text color={TEXT_TERTIARY} fontSize={11}>
            {'  (you)'}
          </Text>
        ) : null}
      </Text>
      <Text
        fontFamily={FONT_DISPLAY}
        fontWeight="800"
        fontSize={40}
        lineHeight={42}
        color={scoreColor}
        {...TABULAR_NUMS}
        aria-label={`${name} score ${formatScore(team.score)}`}
      >
        {formatScore(team.score)}
      </Text>
      {sub != null && (
        <Text fontFamily={FONT_MONO} fontSize={11} color={TEXT_TERTIARY}>
          {sub}
        </Text>
      )}
    </YStack>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

/**
 * RosterScoreboard — the roster tab's "command center" scoreline hero
 * (LS-9355). Wide viewports render the full hero: week navigation, status
 * chip, date range, and action slot in the top band with the matchup
 * scoreline below (mockup 2a). Narrow viewports (≤ the `md` breakpoint)
 * collapse to the condensed sticky-bar layout: week nav row plus a compact
 * scoreline (mockup 2b).
 *
 * Pure presentation — the caller owns week state and supplies already-computed
 * scores/projections. Replaces RosterWeekNavigation on the roster tab; the
 * standalone control remains for other surfaces.
 */
export function RosterScoreboard({
  week,
  currentWeek,
  totalWeeks,
  onWeekChange,
  onResetToCurrent,
  myTeam,
  opponent,
  dateRange,
  actions,
}: RosterScoreboardProps): React.JSX.Element {
  // Tamagui's useMedia is any-typed under the strict lint config; bind it
  // through an explicit signature so the call and result stay typed (same
  // pattern as LeagueDetailShell / HomeScreen).
  const readMedia = useMedia as () => { md?: boolean };
  const media = readMedia();
  const condensed = media.md === true;
  const isCurrent = week === currentWeek;
  const atFirst = week <= 1;
  const atLast = week >= totalWeeks;
  const chip = chipConfig(week, currentWeek);
  const hasScoreline = myTeam != null && opponent != null;

  const resetButton = !isCurrent && (
    <Text
      role="button"
      aria-label="Reset to current week"
      tabIndex={0}
      fontFamily={FONT_DISPLAY}
      fontSize={11}
      fontWeight="700"
      letterSpacing={0.8}
      textTransform="uppercase"
      color={TEXT_PRIMARY}
      borderWidth={1}
      borderColor={OUTLINE_DEFAULT}
      borderRadius="$3"
      paddingHorizontal="$2.5"
      paddingVertical="$1.5"
      hoverStyle={{ borderColor: OUTLINE_STRONG }}
      onPress={onResetToCurrent}
    >
      Reset to Current
    </Text>
  );

  if (condensed) {
    return (
      <YStack
        role="region"
        aria-label={`Week ${week} roster scoreboard`}
        gap="$2"
        paddingHorizontal="$3.5"
        paddingVertical="$2.5"
        borderBottomWidth={1}
        borderBottomColor={OUTLINE_SUBTLE}
        backgroundColor={withAlpha(BG_DARK, 0.94)}
        // Sticky pinning + glass blur are DOM-only CSS; on native the wrapper
        // renders this header outside its ScrollView so it stays pinned.
        style={
          isWeb
            ? {
                position: 'sticky',
                top: 0,
                zIndex: 5,
                backdropFilter: 'blur(10px)',
              }
            : undefined
        }
      >
        <XStack alignItems="center" justifyContent="space-between" gap="$2">
          <NavButton
            direction="prev"
            disabled={atFirst}
            size={28}
            onPress={() => onWeekChange(Math.max(1, week - 1))}
          />
          <XStack alignItems="center" gap="$1.5">
            <Text
              fontFamily={FONT_DISPLAY}
              fontWeight="700"
              fontSize={14}
              letterSpacing={0.6}
              color={TEXT_PRIMARY}
            >
              Week {week}
            </Text>
            <StatusChip chip={chip} />
            {resetButton}
          </XStack>
          <NavButton
            direction="next"
            disabled={atLast}
            size={28}
            onPress={() => onWeekChange(Math.min(totalWeeks, week + 1))}
          />
        </XStack>
        {hasScoreline && (
          <XStack alignItems="center" gap="$2.5">
            <TeamSide team={myTeam} isMine alignRight={false} condensed />
            <Text
              fontFamily={FONT_DISPLAY}
              fontWeight="800"
              fontSize={11}
              letterSpacing={2}
              color={TEXT_TERTIARY}
            >
              VS
            </Text>
            <TeamSide team={opponent} isMine={false} alignRight condensed />
          </XStack>
        )}
      </YStack>
    );
  }

  return (
    <Card
      role="region"
      aria-label={`Week ${week} roster scoreboard`}
      overflow="hidden"
      borderRadius="$6"
      borderWidth={1}
      borderColor={withAlpha(BRAND_GOLD_LIGHT, 0.35)}
      backgroundColor={withAlpha(BRAND_NAVY, 0.5)}
      padding={0}
    >
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal="$5"
        paddingVertical="$3"
        backgroundColor={withAlpha(BLACK, 0.28)}
        borderBottomWidth={1}
        borderBottomColor={withAlpha(WHITE, 0.06)}
        flexWrap="wrap"
        gap="$2"
      >
        <XStack alignItems="center" gap="$3">
          <NavButton
            direction="prev"
            disabled={atFirst}
            size={32}
            onPress={() => onWeekChange(Math.max(1, week - 1))}
          />
          <Text
            fontFamily={FONT_DISPLAY}
            fontWeight="700"
            fontSize={14}
            letterSpacing={0.6}
            color={TEXT_PRIMARY}
          >
            Week {week}
          </Text>
          <StatusChip chip={chip} />
          <NavButton
            direction="next"
            disabled={atLast}
            size={32}
            onPress={() => onWeekChange(Math.min(totalWeeks, week + 1))}
          />
        </XStack>
        <XStack alignItems="center" gap="$3">
          {dateRange != null && dateRange !== '' && (
            <Text fontFamily={FONT_MONO} fontSize={11} color={TEXT_TERTIARY}>
              {dateRange}
            </Text>
          )}
          {resetButton}
          {actions}
        </XStack>
      </XStack>
      {hasScoreline && (
        <XStack
          alignItems="center"
          gap="$4"
          paddingHorizontal="$5"
          paddingVertical="$4"
        >
          <TeamSide team={myTeam} isMine alignRight={false} condensed={false} />
          <Text
            fontFamily={FONT_DISPLAY}
            fontWeight="800"
            fontSize={14}
            letterSpacing={3}
            color={TEXT_TERTIARY}
          >
            VS
          </Text>
          <TeamSide
            team={opponent}
            isMine={false}
            alignRight
            condensed={false}
          />
        </XStack>
      )}
    </Card>
  );
}
