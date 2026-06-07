import React from 'react';
import { Card, Text, XStack, YStack } from 'tamagui';
import {
  Activity,
  AlertTriangle,
  Clock,
  Swords,
  TrendingUp,
  Trophy,
} from '@tamagui/lucide-icons';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../utils/colors';
import { FONT_DISPLAY } from '../../utils/typography';
import { tamaguiStyled } from '../../utils/tamaguiStyled';
import { MatchupStatus } from '../../api/db/graphql.generated';

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
  gamesPerMatchup?: number | null;
  gamesRemaining?: number;
  team1Id?: number | null;
  team2Id?: number | null;
  team1Name: string;
  team2Name: string;
  team1Score: number | null;
  team2Score: number | null;
  team1Projected: number | null;
  team2Projected: number | null;
  /**
   * True when the live player-stats query errored and the scores shown are the
   * server-stored fallback values; surfaces a stale-data warning banner.
   */
  hasPlayersError?: boolean;
  /** When provided, team names become clickable links to view that team's roster */
  onTeamClick?: (teamId: number) => void;
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
  gamesPerMatchup,
  gamesRemaining = 0,
  team1Id,
  team2Id,
  team1Name,
  team2Name,
  team1Score,
  team2Score,
  team1Projected,
  team2Projected,
  hasPlayersError = false,
  onTeamClick,
}: MatchupScoreboardViewProps) {
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
  const gamesCompleted = gamesPerMatchup ? gamesPerMatchup - gamesRemaining : 0;

  // Show projections when games remain and matchup isn't completed
  const showProjections =
    !isCompleted && gamesRemaining > 0 && team1Projected !== null;

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
        </XStack>

        <XStack alignItems="center" gap="$3">
          {isLive && gamesRemaining > 0 && (
            <Text fontSize="$2" fontWeight="600" color="$orange10">
              {gamesRemaining} remaining
            </Text>
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
          <ScoreDisplay
            fontSize={48}
            $sm={{ fontSize: 32 }}
            color={team1Leading && !isTied ? BRAND_GOLD_LIGHT : '$textMuted'}
          >
            {team1Score?.toFixed(2) ?? '0.00'}
          </ScoreDisplay>
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
          <ScoreDisplay
            fontSize={48}
            $sm={{ fontSize: 32 }}
            color={team2Leading && !isTied ? BRAND_GOLD_LIGHT : '$textMuted'}
          >
            {team2Score?.toFixed(2) ?? '0.00'}
          </ScoreDisplay>
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
      {gamesPerMatchup && gamesPerMatchup > 0 && (
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
