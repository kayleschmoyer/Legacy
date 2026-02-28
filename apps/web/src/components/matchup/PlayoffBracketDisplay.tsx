import React from 'react';
import { Card, H3, H4, Separator, Text, XStack, YStack } from 'tamagui';
import { Trophy } from '@tamagui/lucide-icons';
import {
  GetPlayoffBracketQuery,
  PlayoffMatchupStatus,
  PlayoffRound,
} from '../../api/db/graphql.generated';
import {
  BRAND_GOLD,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';

type Bracket = NonNullable<GetPlayoffBracketQuery['getPlayoffBracket']>;
type PlayoffMatchup = NonNullable<Bracket['matchups']>[number];

interface PlayoffBracketDisplayProps {
  bracket: Bracket;
}

const ROUND_LABELS: Record<string, string> = {
  wildcard: 'Wild Card',
  semifinals: 'Semifinals',
  finals: 'Championship',
};

function MatchupCard({ matchup }: { matchup: PlayoffMatchup }) {
  const isComplete = matchup.status === PlayoffMatchupStatus.Completed;
  const isInProgress = matchup.status === PlayoffMatchupStatus.InProgress;

  const highTeamName = matchup.highSeedTeam?.name ?? 'TBD';
  const lowTeamName = matchup.lowSeedTeam?.name ?? 'TBD';

  const highSeedIsWinner =
    isComplete && matchup.winnerTeamId === matchup.highSeedTeamId;
  const lowSeedIsWinner =
    isComplete && matchup.winnerTeamId === matchup.lowSeedTeamId;

  return (
    <Card
      backgroundColor="$surfaceCard"
      borderColor={
        isComplete ? withAlpha(BRAND_NAVY_LIGHT, 0.4) : '$surfacePanelBorder'
      }
      borderWidth={1}
      borderRadius="$4"
      padding="$3"
      minWidth={200}
    >
      <YStack gap="$2">
        {/* Status badge */}
        <XStack justifyContent="space-between" alignItems="center">
          <Text fontSize="$1" color="$gray10">
            Week {matchup.weekNumber}
            {matchup.isMultiWeek
              ? '–' + String((matchup.weekNumber ?? 0) + 1)
              : ''}
          </Text>
          {isComplete && (
            <XStack
              backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.2)}
              borderRadius="$2"
              paddingHorizontal="$2"
              paddingVertical={2}
            >
              <Text fontSize="$1" color={BRAND_NAVY_LIGHT} fontWeight="600">
                Final
              </Text>
            </XStack>
          )}
          {isInProgress && (
            <XStack
              backgroundColor="$green2"
              borderRadius="$2"
              paddingHorizontal="$2"
              paddingVertical={2}
            >
              <Text fontSize="$1" color="$green10" fontWeight="600">
                Live
              </Text>
            </XStack>
          )}
        </XStack>

        <Separator />

        {/* High seed team */}
        <XStack justifyContent="space-between" alignItems="center" gap="$2">
          <XStack alignItems="center" gap="$1" flex={1}>
            {matchup.highSeedTeamId && (
              <Text fontSize="$1" color="$gray10" width={16} textAlign="center">
                #{matchup.matchupNumber}
              </Text>
            )}
            <Text
              fontSize="$3"
              fontWeight={highSeedIsWinner ? '700' : '400'}
              color={isComplete && !highSeedIsWinner ? '$gray9' : '$color'}
              flex={1}
              numberOfLines={1}
            >
              {highTeamName}
            </Text>
            {highSeedIsWinner && <Trophy size={12} color={BRAND_GOLD} />}
          </XStack>
          {matchup.highSeedScore !== null &&
            matchup.highSeedScore !== undefined && (
              <Text
                fontSize="$3"
                fontWeight={highSeedIsWinner ? '700' : '400'}
                color={isComplete && !highSeedIsWinner ? '$gray9' : '$color'}
                minWidth={40}
                textAlign="right"
              >
                {matchup.highSeedScore.toFixed(1)}
              </Text>
            )}
        </XStack>

        {/* Low seed team */}
        <XStack justifyContent="space-between" alignItems="center" gap="$2">
          <XStack alignItems="center" gap="$1" flex={1}>
            {matchup.lowSeedTeamId && (
              <Text fontSize="$1" color="$gray10" width={16} textAlign="center">
                {/* spacer for alignment */}
              </Text>
            )}
            <Text
              fontSize="$3"
              fontWeight={lowSeedIsWinner ? '700' : '400'}
              color={isComplete && !lowSeedIsWinner ? '$gray9' : '$color'}
              flex={1}
              numberOfLines={1}
            >
              {lowTeamName}
            </Text>
            {lowSeedIsWinner && <Trophy size={12} color={BRAND_GOLD} />}
          </XStack>
          {matchup.lowSeedScore !== null &&
            matchup.lowSeedScore !== undefined && (
              <Text
                fontSize="$3"
                fontWeight={lowSeedIsWinner ? '700' : '400'}
                color={isComplete && !lowSeedIsWinner ? '$gray9' : '$color'}
                minWidth={40}
                textAlign="right"
              >
                {matchup.lowSeedScore.toFixed(1)}
              </Text>
            )}
        </XStack>
      </YStack>
    </Card>
  );
}

/**
 * PlayoffBracketDisplay - Shows a playoff bracket with round-by-round matchups.
 *
 * Groups matchups by round and displays them in columns from left to right.
 * Completed matchups show final scores and highlight the winner.
 */
export function PlayoffBracketDisplay({ bracket }: PlayoffBracketDisplayProps) {
  const matchups = bracket.matchups ?? [];

  // Group matchups by round in tournament order
  const roundOrder: PlayoffRound[] = [
    PlayoffRound.Wildcard,
    PlayoffRound.Semifinals,
    PlayoffRound.Finals,
  ];

  const rounds = roundOrder
    .map((round) => ({
      round,
      label: ROUND_LABELS[round] ?? round,
      matchups: matchups
        .filter((m) => m.round === round)
        .sort((a, b) => (a.matchupNumber ?? 0) - (b.matchupNumber ?? 0)),
    }))
    .filter((r) => r.matchups.length > 0);

  const isComplete = bracket.status === PlayoffMatchupStatus.Completed;
  const champion = bracket.championTeam;

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      padding="$5"
      borderRadius="$6"
    >
      <YStack gap="$4">
        {/* Header */}
        <XStack alignItems="center" gap="$2" justifyContent="space-between">
          <YStack>
            <H3 margin={0}>Playoff Bracket</H3>
            <Text fontSize="$2" color="$gray10">
              {bracket.season} Season · {bracket.format} bracket
            </Text>
          </YStack>
          {isComplete && champion && (
            <YStack alignItems="center" gap="$1">
              <Trophy size={20} color={BRAND_GOLD} />
              <Text fontSize="$2" fontWeight="600" color={BRAND_GOLD}>
                Champion
              </Text>
              <Text fontSize="$3" fontWeight="700" color="$color">
                {champion.name}
              </Text>
            </YStack>
          )}
        </XStack>

        {/* Bracket rounds */}
        <XStack gap="$4" flexWrap="wrap" alignItems="flex-start">
          {rounds.map(({ round, label, matchups: roundMatchups }) => (
            <YStack key={round} gap="$3" flex={1} minWidth={220}>
              <H4
                margin={0}
                fontSize="$3"
                color="$gray11"
                textTransform="uppercase"
                letterSpacing={1}
              >
                {label}
              </H4>
              <YStack gap="$2">
                {roundMatchups.map((matchup) => (
                  <MatchupCard key={matchup.id} matchup={matchup} />
                ))}
              </YStack>
            </YStack>
          ))}
        </XStack>
      </YStack>
    </Card>
  );
}
