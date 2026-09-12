import React from 'react';
import { Card, Text, XStack, YStack } from 'tamagui';
import { Activity } from '@tamagui/lucide-icons/icons/Activity';
import { AlertTriangle } from '@tamagui/lucide-icons/icons/AlertTriangle';
import { Clock } from '@tamagui/lucide-icons/icons/Clock';
import { Swords } from '@tamagui/lucide-icons/icons/Swords';
import { TrendingUp } from '@tamagui/lucide-icons/icons/TrendingUp';
import { Trophy } from '@tamagui/lucide-icons/icons/Trophy';
import { XCircle } from '@tamagui/lucide-icons/icons/XCircle';
import { MatchupStatus } from '@legacy-sports/graphql';
import {
  type StaleScoringChangeLogEntry,
  StaleScoringIndicator,
} from './StaleScoringIndicator';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  TEXT_MUTED,
  withAlpha,
} from '../../utils/colors';
import { FONT_DISPLAY, FONT_MONO } from '../../utils/typography';
import { tamaguiStyled } from '../../utils/tamaguiStyled';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import { ScoreDeltaBadge } from '../../components/ScoreDeltaBadge';

// ── Styled Components ─────────────────────────────────────────────────────────
// tamaguiStyled() isolates Tamagui's any-typed styled() API from strict lint;
// casting the result to a concrete component type keeps call sites lint-clean.

type StyledComponent = React.ComponentType<Record<string, unknown>>;

const ScoreboardCard = tamaguiStyled(Card, {
  overflow: 'hidden',
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: '$surfacePanelBorder',
  width: '100%',
  maxWidth: 800,
}) as StyledComponent;

const TopBar = tamaguiStyled(XStack, {
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: '$5',
  paddingVertical: '$3',
  backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.12),
  borderBottomWidth: 1,
  borderBottomColor: withAlpha(BRAND_NAVY_LIGHT, 0.35),
  flexWrap: 'wrap',
  gap: '$2',
  $sm: {
    paddingHorizontal: '$3',
    paddingVertical: '$2',
  },
}) as StyledComponent;

const StatusChip = tamaguiStyled(XStack, {
  alignItems: 'center',
  gap: '$1.5',
  paddingHorizontal: '$3',
  paddingVertical: '$1.5',
  borderRadius: '$10',
  borderWidth: 1,
}) as StyledComponent;

const TeamPanel = tamaguiStyled(YStack, {
  flex: 1,
  flexBasis: 0,
  minWidth: 0,
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: '$5',
  paddingHorizontal: '$4',
  gap: '$2',
  $sm: {
    paddingVertical: '$3',
    paddingHorizontal: '$2',
  },
}) as StyledComponent;

const ScoreDisplay = tamaguiStyled(Text, {
  fontFamily: FONT_DISPLAY,
  fontWeight: '800',
  fontVariant: ['tabular-nums'],
  letterSpacing: -1,
  lineHeight: 52,
  $sm: {
    lineHeight: 40,
  },
}) as StyledComponent;

const VsBadge = tamaguiStyled(YStack, {
  width: 40,
  height: 40,
  borderRadius: 20,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '$background',
  borderWidth: 2,
  borderColor: '$surfacePanelBorder',
  zIndex: 1,
}) as StyledComponent;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatchupScoreboardViewProps {
  /**
   * When false the view renders its "No active matchup" empty state and ignores
   * the remaining props. The web/mobile data layer sets this from the presence
   * of a matchup record.
   */
  hasMatchup: boolean;
  weekNumber?: number | null;
  /**
   * Matchup status. Typed as `string` so the presentational layer stays
   * decoupled from any platform's generated GraphQL enum; the recognised values
   * are the `MatchupStatus` members ('in_progress', 'completed', ...).
   */
  status?: string | null;
  /**
   * Admin/commissioner-supplied reason this matchup was cancelled (LS-9683).
   * When present, extends the cancelled-state banner to
   * "This matchup was cancelled: <reason>."; ignored for non-cancelled
   * matchups.
   */
  cancellationReason?: string | null;
  gamesPerMatchup?: number | null;
  gamesRemaining?: number;
  team1Id?: number | null;
  team2Id?: number | null;
  team1Name: string;
  team2Name: string;
  /** Optional team1 W-L-T record string (e.g. "7-3-1"). */
  team1Record?: string | null;
  /** Optional team2 W-L-T record string (e.g. "7-3-1"). */
  team2Record?: string | null;
  team1Score: number | null;
  team2Score: number | null;
  team1Projected: number | null;
  team2Projected: number | null;
  /**
   * Whether the viewing user has premium access. Gates the "+N points"
   * flourish shown alongside a score increase (LS-6392). The score count-up
   * itself is ungated — the instant replacement it fixes was a defect on
   * every tier, not a premium feature.
   *
   * Resolved by the platform's data wrapper and passed in, keeping this
   * component presentational and free of data fetching. Defaults to `false`
   * so an unwired caller shows no premium affordance.
   */
  isPremium?: boolean;
  /**
   * True when the live player-stats query errored and the scores shown are the
   * server-stored fallback values; surfaces a stale-data warning banner.
   */
  hasPlayersError?: boolean;
  /**
   * Optional pre-formatted kickoff/time-remaining label (e.g. "Kickoff Sun 1:00 PM",
   * "Ends Mon 8:15 PM"), rendered in the top bar when provided. The caller
   * computes and formats this string — this component does no date math.
   */
  timeInfo?: string | null;
  /** When provided, team names become clickable links to view that team's roster */
  onTeamClick?: (teamId: number) => void;
  /**
   * `Matchup.scoringIsStale` (LS-9667). Renders the stale-scoring indicator
   * next to the status chip when true; no-op for false/null/undefined.
   */
  scoringIsStale?: boolean | null;
  /** `Matchup.scoringChangeLog` — shown on interaction with the indicator. */
  scoringChangeLog?: readonly StaleScoringChangeLogEntry[] | null;
}

/**
 * MatchupScoreboardView — Broadcast-style scoreboard with split team panels.
 *
 * Pure presentational component: it receives already-computed scores,
 * projections and team names and performs no data-fetching. Web and mobile wrap
 * it with their own GraphQL data layers (see `MatchupScoreboard` in apps/web).
 * Features a centered VS badge, large scores, and an integrated progress bar.
 */
export function MatchupScoreboardView({
  hasMatchup,
  weekNumber,
  status,
  cancellationReason,
  gamesPerMatchup,
  gamesRemaining = 0,
  team1Id,
  team2Id,
  team1Name,
  team2Name,
  team1Record,
  team2Record,
  team1Score,
  team2Score,
  isPremium = false,
  team1Projected,
  team2Projected,
  hasPlayersError = false,
  timeInfo,
  onTeamClick,
  scoringIsStale,
  scoringChangeLog,
}: MatchupScoreboardViewProps) {
  // Count each score up to its new value rather than replacing it instantly
  // (LS-6392). Hooks run unconditionally; a score that never changes simply
  // never tweens. These must stay above the `hasMatchup` early return —
  // React requires the same hook order on every render.
  const { current: team1Animated, delta: team1Delta } = useAnimatedNumber(
    team1Score ?? 0,
  );
  const { current: team2Animated, delta: team2Delta } = useAnimatedNumber(
    team2Score ?? 0,
  );

  if (!hasMatchup) {
    return (
      <ScoreboardCard>
        <YStack padding="$6" alignItems="center" gap="$2">
          <Clock size={24} color="var(--textMuted)" />
          <Text color="$textMuted" fontSize="$4">
            No active matchup
          </Text>
        </YStack>
      </ScoreboardCard>
    );
  }

  const team1Leading = (team1Score ?? 0) > (team2Score ?? 0);
  const team2Leading = (team2Score ?? 0) > (team1Score ?? 0);
  const isTied = team1Score === team2Score;
  const isLive = status === MatchupStatus.InProgress;
  const isCompleted = status === MatchupStatus.Completed;
  // LS-6369: without this branch, cancelled matchups fell through to the
  // default "SCHEDULED" config below — mislabelling a cancelled matchup as
  // upcoming, and diverging from mobile's Cancelled chip (MatchupStatusChip).
  const isCancelled = status === MatchupStatus.Cancelled;
  const gamesCompleted = gamesPerMatchup ? gamesPerMatchup - gamesRemaining : 0;

  // Show projections when games remain and matchup isn't completed or cancelled
  const showProjections =
    !isCompleted &&
    !isCancelled &&
    gamesRemaining > 0 &&
    team1Projected !== null;

  const statusConfig = isLive
    ? {
        bg: '$green3',
        border: '$green7',
        text: '$green11',
        label: 'LIVE',
        icon: <Activity size={12} color="var(--green11)" />,
      }
    : isCompleted
      ? {
          bg: withAlpha(BRAND_NAVY_LIGHT, 0.18),
          border: withAlpha(BRAND_NAVY_LIGHT, 0.5),
          text: BRAND_GOLD_LIGHT,
          label: 'FINAL',
          icon: <Trophy size={12} color={BRAND_GOLD_LIGHT} />,
        }
      : isCancelled
        ? {
            bg: '$gray3',
            border: '$gray7',
            text: '$gray11',
            label: 'CANCELLED',
            icon: <XCircle size={12} color="var(--gray11)" />,
          }
        : {
            bg: '$gray3',
            border: '$gray7',
            text: '$gray11',
            label: 'SCHEDULED',
            icon: <Clock size={12} color="var(--gray11)" />,
          };

  return (
    <ScoreboardCard
      role="region"
      aria-label={`Week ${weekNumber} scoreboard: ${team1Name} vs ${team2Name}`}
    >
      {/* Stale-data warning: surfaced when the live player-stats query errors
          and we've fallen back to the matchup's server-stored scores. Without
          this banner the fallback is silent and users can't tell the numbers
          may be out of date (LS-4038). */}
      {hasPlayersError && (
        <XStack
          role="status"
          aria-live="polite"
          alignItems="center"
          gap="$2"
          paddingHorizontal="$5"
          paddingVertical="$2"
          backgroundColor="$orange3"
          borderBottomWidth={1}
          borderBottomColor="$orange7"
          $sm={{ paddingHorizontal: '$3' }}
        >
          <AlertTriangle size={14} color="var(--orange11)" />
          <Text fontSize="$2" fontWeight="600" color="$orange11">
            Live stats unavailable — showing last saved scores.
          </Text>
        </XStack>
      )}

      {/* Cancelled explanation: the status chip alone ("CANCELLED") gives no
          actionable next step — this banner makes the state unambiguous
          (LS-6369). */}
      {isCancelled && (
        <XStack
          role="status"
          aria-live="polite"
          alignItems="center"
          gap="$2"
          paddingHorizontal="$5"
          paddingVertical="$2"
          backgroundColor="$gray3"
          borderBottomWidth={1}
          borderBottomColor="$gray7"
          $sm={{ paddingHorizontal: '$3' }}
        >
          <XCircle size={14} color="var(--gray11)" />
          <Text fontSize="$2" fontWeight="600" color="$gray11">
            {cancellationReason
              ? `This matchup was cancelled: ${cancellationReason}.`
              : 'This matchup was cancelled.'}
          </Text>
        </XStack>
      )}

      {/* Top Bar */}
      <TopBar>
        <XStack alignItems="center" gap="$2">
          <Swords size={16} color={BRAND_GOLD_LIGHT} />
          <Text fontSize="$4" fontWeight="700" color={BRAND_GOLD_LIGHT}>
            Week {weekNumber}
          </Text>
          {gamesPerMatchup && (
            <Text fontSize="$2" color={BRAND_NAVY_LIGHT} marginLeft="$1">
              {gamesCompleted}/{gamesPerMatchup} games
            </Text>
          )}
          {timeInfo && (
            <Text fontSize="$2" color={BRAND_NAVY_LIGHT} marginLeft="$1">
              {timeInfo}
            </Text>
          )}
        </XStack>

        <XStack alignItems="center" gap="$3">
          {isLive && gamesRemaining > 0 && (
            <Text fontSize="$2" fontWeight="600" color="$orange10">
              {gamesRemaining} remaining
            </Text>
          )}
          {isCompleted && (
            <StaleScoringIndicator
              scoringIsStale={scoringIsStale}
              changeLog={scoringChangeLog}
            />
          )}
          <StatusChip
            backgroundColor={statusConfig.bg}
            borderColor={statusConfig.border}
          >
            {statusConfig.icon}
            <Text
              fontSize="$2"
              fontWeight="700"
              color={statusConfig.text}
              letterSpacing={0.5}
            >
              {statusConfig.label}
            </Text>
          </StatusChip>
        </XStack>
      </TopBar>

      {/* Score Panels */}
      <XStack position="relative">
        {/* Team 1 */}
        <TeamPanel
          backgroundColor={
            team1Leading && !isTied
              ? withAlpha(BRAND_NAVY_LIGHT, 0.12)
              : '$background'
          }
        >
          <Text
            fontSize="$5"
            fontWeight="700"
            color={team1Leading ? BRAND_GOLD_LIGHT : '$color'}
            cursor={onTeamClick && team1Id ? 'pointer' : undefined}
            hoverStyle={
              onTeamClick && team1Id
                ? { textDecorationLine: 'underline', opacity: 0.85 }
                : undefined
            }
            onPress={
              onTeamClick && team1Id ? () => onTeamClick(team1Id) : undefined
            }
          >
            {team1Name}
          </Text>
          {team1Record != null && (
            <Text
              testID={team1Id != null ? `team-record-${team1Id}` : undefined}
              fontFamily={FONT_MONO}
              fontSize="$2"
              color={TEXT_MUTED}
            >
              {team1Record}
            </Text>
          )}
          <ScoreDisplay
            fontSize={48}
            $sm={{ fontSize: 32 }}
            color={team1Leading && !isTied ? BRAND_GOLD_LIGHT : '$textMuted'}
          >
            {(team1Score == null ? 0 : team1Animated).toFixed(2)}
          </ScoreDisplay>
          {isPremium && (
            // Fixed-height slot — see MatchupScoreboardHero: an inline
            // mount/unmount would shift everything below the score each time
            // the badge appears.
            <YStack height={22} justifyContent="center">
              <ScoreDeltaBadge
                delta={team1Delta}
                testID={team1Id != null ? `score-delta-${team1Id}` : undefined}
              />
            </YStack>
          )}
          {team1Leading && !isTied && (
            <XStack alignItems="center" gap="$1.5">
              <YStack
                width={6}
                height={6}
                borderRadius={3}
                backgroundColor="$green10"
              />
              <Text fontSize="$2" fontWeight="600" color="$green10">
                {isCompleted ? 'Winner' : 'Leading'}
              </Text>
            </XStack>
          )}
          {isTied && team1Score !== null && (
            <Text fontSize="$2" fontWeight="600" color="$orange10">
              Tied
            </Text>
          )}
          {showProjections && team1Projected !== null && (
            <XStack
              alignItems="center"
              gap="$1.5"
              marginTop="$1"
              paddingHorizontal="$2.5"
              paddingVertical="$1"
              borderRadius="$3"
              backgroundColor="$gray3"
            >
              <TrendingUp size={12} color="var(--textMuted)" />
              <Text fontSize="$1" fontWeight="600" color="$textMuted">
                Proj: {team1Projected.toFixed(2)}
              </Text>
            </XStack>
          )}
        </TeamPanel>

        {/* Center VS Badge */}
        <YStack
          position="absolute"
          top={0}
          bottom={0}
          left={0}
          right={0}
          justifyContent="center"
          alignItems="center"
          zIndex={2}
          pointerEvents="none"
        >
          <VsBadge>
            <Text
              fontSize="$2"
              fontWeight="900"
              color="$textMuted"
              letterSpacing={1}
            >
              VS
            </Text>
          </VsBadge>
        </YStack>

        {/* Vertical divider */}
        <YStack width={1} backgroundColor="$surfacePanelBorder" />

        {/* Team 2 */}
        <TeamPanel
          backgroundColor={
            team2Leading && !isTied
              ? withAlpha(BRAND_NAVY_LIGHT, 0.12)
              : '$background'
          }
        >
          <Text
            fontSize="$5"
            fontWeight="700"
            color={team2Leading ? BRAND_GOLD_LIGHT : '$color'}
            cursor={onTeamClick && team2Id ? 'pointer' : undefined}
            hoverStyle={
              onTeamClick && team2Id
                ? { textDecorationLine: 'underline', opacity: 0.85 }
                : undefined
            }
            onPress={
              onTeamClick && team2Id ? () => onTeamClick(team2Id) : undefined
            }
          >
            {team2Name}
          </Text>
          {team2Record != null && (
            <Text
              testID={team2Id != null ? `team-record-${team2Id}` : undefined}
              fontFamily={FONT_MONO}
              fontSize="$2"
              color={TEXT_MUTED}
            >
              {team2Record}
            </Text>
          )}
          <ScoreDisplay
            fontSize={48}
            $sm={{ fontSize: 32 }}
            color={team2Leading && !isTied ? BRAND_GOLD_LIGHT : '$textMuted'}
          >
            {(team2Score == null ? 0 : team2Animated).toFixed(2)}
          </ScoreDisplay>
          {isPremium && (
            // Fixed-height slot — see MatchupScoreboardHero: an inline
            // mount/unmount would shift everything below the score each time
            // the badge appears.
            <YStack height={22} justifyContent="center">
              <ScoreDeltaBadge
                delta={team2Delta}
                testID={team2Id != null ? `score-delta-${team2Id}` : undefined}
              />
            </YStack>
          )}
          {team2Leading && !isTied && (
            <XStack alignItems="center" gap="$1.5">
              <YStack
                width={6}
                height={6}
                borderRadius={3}
                backgroundColor="$green10"
              />
              <Text fontSize="$2" fontWeight="600" color="$green10">
                {isCompleted ? 'Winner' : 'Leading'}
              </Text>
            </XStack>
          )}
          {isTied && team2Score !== null && (
            <Text fontSize="$2" fontWeight="600" color="$orange10">
              Tied
            </Text>
          )}
          {showProjections && team2Projected !== null && (
            <XStack
              alignItems="center"
              gap="$1.5"
              marginTop="$1"
              paddingHorizontal="$2.5"
              paddingVertical="$1"
              borderRadius="$3"
              backgroundColor="$gray3"
            >
              <TrendingUp size={12} color="var(--textMuted)" />
              <Text fontSize="$1" fontWeight="600" color="$textMuted">
                Proj: {team2Projected.toFixed(2)}
              </Text>
            </XStack>
          )}
        </TeamPanel>
      </XStack>

      {/* Games Progress Bar */}
      {!isCancelled && gamesPerMatchup && gamesPerMatchup > 0 && (
        <YStack
          paddingHorizontal="$5"
          paddingVertical="$3"
          borderTopWidth={1}
          borderTopColor="$surfacePanelBorder"
          backgroundColor="$surfacePanel"
        >
          <XStack
            justifyContent="space-between"
            alignItems="center"
            marginBottom="$2"
          >
            <Text fontSize="$1" fontWeight="600" color="$textMuted">
              {gamesCompleted} of {gamesPerMatchup} games completed
            </Text>
            <Text
              fontSize="$1"
              fontWeight="700"
              color={gamesRemaining === 0 ? '$green10' : BRAND_GOLD_LIGHT}
            >
              {gamesRemaining === 0
                ? 'Complete'
                : `${Math.round((gamesCompleted / gamesPerMatchup) * 100)}%`}
            </Text>
          </XStack>
          <XStack
            height={4}
            width="100%"
            backgroundColor="$gray4"
            borderRadius="$10"
            overflow="hidden"
          >
            <YStack
              height="100%"
              width={`${(gamesCompleted / gamesPerMatchup) * 100}%`}
              backgroundColor={
                gamesRemaining === 0 ? '$green9' : BRAND_NAVY_LIGHT
              }
              borderRadius="$10"
              animation="quick"
            />
          </XStack>
        </YStack>
      )}
    </ScoreboardCard>
  );
}
