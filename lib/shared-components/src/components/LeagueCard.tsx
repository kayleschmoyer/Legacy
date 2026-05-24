import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { StatusBadge, type StatusBadgeVariant } from './StatusBadge';

export interface LeagueTeam {
  /** Display string e.g. "NYY Yankees" */
  abbr: string;
  /** Record + standing e.g. "8-4 · 1st" */
  record?: string;
  score: number;
  colorVariant?: 'navy' | 'red';
}

export interface LeagueCardProps {
  name: string;
  /** e.g. "Week 14/22 · 12 teams" */
  meta?: string;
  /** When provided, renders score rows for the current matchup. */
  matchup?: { home: LeagueTeam; away: LeagueTeam };
  status?: { label: string; variant: StatusBadgeVariant };
  /** Up to 4 avatar URLs/initials for the stack. */
  members?: { name: string; src?: string }[];
  /** Footer text — e.g. "Draft: Fri Apr 12 · 8:00 PM". */
  footer?: string;
  /** Mark as a gold-rimmed premium league. */
  premium?: boolean;
  onPress?: () => void;
}

const TeamDot = ({
  colorVariant = 'navy',
}: {
  colorVariant?: 'navy' | 'red';
}): React.JSX.Element => (
  <YStack
    width={28}
    height={28}
    borderRadius={9999}
    backgroundColor={
      colorVariant === 'red' ? '$brandSeamRedLight' : '$brandNavyLight'
    }
    borderWidth={1}
    borderColor="rgba(255,255,255,0.12)"
  />
);

const ScoreRow = ({
  team,
  isWinner,
}: {
  team: LeagueTeam;
  isWinner: boolean;
}): React.JSX.Element => (
  <XStack
    alignItems="center"
    justifyContent="space-between"
    paddingVertical={14}
    paddingHorizontal={16}
    backgroundColor="rgba(255, 255, 255, 0.02)"
    borderRadius={8}
    marginBottom={8}
  >
    <XStack alignItems="center" gap={10}>
      <TeamDot colorVariant={team.colorVariant} />
      <YStack>
        <Text
          fontFamily="$heading"
          fontWeight="700"
          fontSize={15}
          letterSpacing={0.6}
          color="$color12"
        >
          {team.abbr}
        </Text>
        {team.record ? (
          <Text fontFamily="$mono" fontSize={12} color="$textMuted">
            {team.record}
          </Text>
        ) : null}
      </YStack>
    </XStack>
    <Text
      fontFamily="$heading"
      fontWeight="800"
      fontSize={28}
      color={isWinner ? '$color12' : '$textMuted'}
      style={{ fontVariantNumeric: 'tabular-nums' } as never}
    >
      {team.score.toFixed(1)}
    </Text>
  </XStack>
);

const Initials = ({ name }: { name: string }): React.JSX.Element => {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <XStack
      width={28}
      height={28}
      borderRadius={9999}
      backgroundColor="$brandNavy"
      borderWidth={1}
      borderColor="$brandGold"
      alignItems="center"
      justifyContent="center"
    >
      <Text
        fontFamily="$heading"
        fontSize={11}
        fontWeight="800"
        color="$color12"
      >
        {initials}
      </Text>
    </XStack>
  );
};

/** Dashboard "My Leagues" tile — score rows when matchup is provided, member stack otherwise. */
export function LeagueCard({
  name,
  meta,
  matchup,
  status,
  members = [],
  footer,
  premium = false,
  onPress,
}: LeagueCardProps): React.JSX.Element {
  const homeWinner = matchup ? matchup.home.score >= matchup.away.score : false;

  return (
    <YStack
      borderRadius={16}
      borderWidth={1}
      borderColor={premium ? '$brandGold' : '$glassBorder'}
      backgroundColor="$surfaceCard"
      padding={20}
      maxWidth={420}
      width="100%"
      cursor={onPress ? 'pointer' : undefined}
      onPress={onPress}
      hoverStyle={
        onPress
          ? {
              borderColor: premium ? '$brandGoldLight' : '$glassBorderHover',
              y: -2,
            }
          : undefined
      }
      pressStyle={onPress ? { scale: 0.98 } : undefined}
      animation="medium"
      shadowColor="rgba(8, 12, 20, 0.55)"
      shadowOffset={{ width: 0, height: 4 }}
      shadowRadius={14}
    >
      {/* Header row */}
      <XStack
        alignItems="flex-start"
        justifyContent="space-between"
        marginBottom={16}
      >
        <YStack flex={1}>
          <Text
            fontFamily="$heading"
            fontWeight="800"
            fontSize={20}
            color="$color12"
          >
            {name}
          </Text>
          {meta ? (
            <Text
              fontFamily="$body"
              fontSize={13}
              color="$textMuted"
              marginTop={4}
            >
              {meta}
            </Text>
          ) : null}
        </YStack>
        {status ? (
          <StatusBadge label={status.label} variant={status.variant} />
        ) : null}
      </XStack>

      {/* Matchup score rows */}
      {matchup ? (
        <YStack>
          <ScoreRow team={matchup.away} isWinner={!homeWinner} />
          <ScoreRow team={matchup.home} isWinner={homeWinner} />
        </YStack>
      ) : null}

      {/* Member avatar stack — shown when no matchup is present */}
      {!matchup && members.length > 0 ? (
        <XStack gap={-8} alignItems="center">
          {members.slice(0, 4).map((m) => (
            <Initials key={m.name} name={m.name} />
          ))}
          {members.length > 4 ? (
            <Text
              fontFamily="$mono"
              fontSize={12}
              color="$textMuted"
              marginLeft={12}
            >
              +{members.length - 4}
            </Text>
          ) : null}
        </XStack>
      ) : null}

      {footer ? (
        <Text fontFamily="$body" fontSize={12} color="$textMuted">
          {footer}
        </Text>
      ) : null}
    </YStack>
  );
}
