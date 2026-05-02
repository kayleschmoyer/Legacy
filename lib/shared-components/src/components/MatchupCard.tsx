import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { StatusBadge, type StatusBadgeVariant } from './StatusBadge';

export interface MatchupTeam {
  abbr: string;
  name: string;
  score: number;
  /** Win probability percent (0-100). */
  winProbability?: number;
}

export interface MatchupCardProps {
  away: MatchupTeam;
  home: MatchupTeam;
  /** Status — drives the badge color: LIVE / PRE / FINAL. */
  status?: 'live' | 'pre' | 'final';
  /** Subtitle e.g. "Week 14 · Sat 1:05 PM". */
  subtitle?: string;
  onPress?: () => void;
}

const TeamRow = ({
  team,
  isWinning,
}: {
  team: MatchupTeam;
  isWinning?: boolean;
}): React.JSX.Element => (
  <XStack
    alignItems="center"
    justifyContent="space-between"
    paddingVertical={6}
  >
    <XStack gap="$2" alignItems="center" flex={1}>
      <Text
        fontFamily="$heading"
        fontWeight="800"
        fontSize={16}
        letterSpacing={1}
        color={isWinning ? '$brandGold' : '$color'}
      >
        {team.abbr}
      </Text>
      <Text
        fontFamily="$body"
        fontSize={13}
        color="$textMuted"
        numberOfLines={1}
      >
        {team.name}
      </Text>
    </XStack>
    <Text
      fontFamily="$heading"
      fontWeight="800"
      fontSize={28}
      color={isWinning ? '$color12' : '$color'}
      style={{ fontVariantNumeric: 'tabular-nums' } as never}
    >
      {team.score.toFixed(1)}
    </Text>
  </XStack>
);

/**
 * Score card for a single matchup. Shows team rows with abbr, name,
 * tabular-nums score, plus a win-probability bar across the bottom.
 */
export function MatchupCard({
  away,
  home,
  status = 'pre',
  subtitle,
  onPress,
}: MatchupCardProps): React.JSX.Element {
  const variant: StatusBadgeVariant =
    status === 'live' ? 'live' : status === 'final' ? 'final' : 'preDraft';
  const label =
    status === 'live' ? '▶ Live' : status === 'final' ? 'Final' : 'Pre';

  const homeWinning = home.score > away.score;
  const awayWinning = away.score > home.score;
  const awayProb =
    away.winProbability ?? (status === 'pre' ? 50 : homeWinning ? 35 : 65);

  return (
    <YStack
      borderRadius={16}
      borderWidth={1}
      borderColor={status === 'live' ? '$brandSeamRed' : '$glassBorder'}
      backgroundColor="$surfaceCard"
      padding="$4"
      gap="$3"
      width="100%"
      onPress={onPress}
      cursor={onPress ? 'pointer' : undefined}
      hoverStyle={
        onPress ? { borderColor: '$glassBorderHover', y: -2 } : undefined
      }
      pressStyle={onPress ? { scale: 0.98 } : undefined}
      animation="medium"
    >
      <XStack alignItems="center" justifyContent="space-between">
        <StatusBadge label={label} variant={variant} />
        {subtitle ? (
          <Text fontFamily="$body" fontSize={12} color="$textMuted">
            {subtitle}
          </Text>
        ) : null}
      </XStack>

      <YStack>
        <TeamRow team={away} isWinning={awayWinning} />
        <TeamRow team={home} isWinning={homeWinning} />
      </YStack>

      {/* Win-probability bar */}
      <YStack gap={4}>
        <XStack
          height={4}
          borderRadius={9999}
          overflow="hidden"
          backgroundColor="$surfaceSubtle"
        >
          <YStack
            height={4}
            width={`${awayProb}%`}
            backgroundColor="$brandSeamRed"
          />
          <YStack height={4} flex={1} backgroundColor="$brandNavy" />
        </XStack>
        <XStack justifyContent="space-between">
          <Text
            fontFamily="$mono"
            fontSize={10}
            color="$textMuted"
            letterSpacing={0.4}
          >
            {away.abbr} {Math.round(awayProb)}%
          </Text>
          <Text
            fontFamily="$mono"
            fontSize={10}
            color="$textMuted"
            letterSpacing={0.4}
          >
            {home.abbr} {Math.round(100 - awayProb)}%
          </Text>
        </XStack>
      </YStack>
    </YStack>
  );
}
