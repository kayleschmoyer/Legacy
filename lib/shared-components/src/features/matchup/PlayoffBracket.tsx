import React from 'react';
import { useWindowDimensions } from 'react-native';
import {
  Card,
  H3,
  H4,
  ScrollView,
  Separator,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Trophy } from '@tamagui/lucide-icons/icons/Trophy';
import { PlayoffMatchupStatus, PlayoffRound } from '@legacy-sports/graphql';
import { BRAND_GOLD, BRAND_NAVY_LIGHT, withAlpha } from '../../utils/colors';

/**
 * Minimal team reference needed to render a bracket slot. Kept structural
 * (not the generated `Team` type) so both web and native query results — which
 * carry their own per-app generated enum/object types — assign cleanly.
 */
export interface PlayoffBracketTeamRef {
  name?: string | null;
}

/** Single playoff matchup, injected via props. */
export interface PlayoffBracketMatchupData {
  id?: string | number | null;
  round?: PlayoffRound | string | null;
  matchupNumber?: number | null;
  weekNumber?: number | null;
  isMultiWeek?: boolean | null;
  status?: PlayoffMatchupStatus | string | null;
  highSeedTeamId?: number | null;
  lowSeedTeamId?: number | null;
  winnerTeamId?: number | null;
  highSeedScore?: number | null;
  lowSeedScore?: number | null;
  highSeedTeam?: PlayoffBracketTeamRef | null;
  lowSeedTeam?: PlayoffBracketTeamRef | null;
}

/** Bracket seeding + results, injected via props. */
export interface PlayoffBracketData {
  season?: number | null;
  format?: string | null;
  status?: PlayoffMatchupStatus | string | null;
  championTeam?: PlayoffBracketTeamRef | null;
  matchups?: readonly PlayoffBracketMatchupData[] | null;
}

export interface PlayoffBracketProps {
  bracket: PlayoffBracketData;
}

const ROUND_LABELS: Record<string, string> = {
  wildcard: 'Wild Card',
  semifinals: 'Semifinals',
  finals: 'Championship',
};

function MatchupCard({ matchup }: { matchup: PlayoffBracketMatchupData }) {
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

interface RoundGroup {
  round: string;
  label: string;
  matchups: PlayoffBracketMatchupData[];
}

function RoundColumn({
  group,
  fullWidth,
}: {
  group: RoundGroup;
  fullWidth: boolean;
}) {
  return (
    <YStack
      gap="$3"
      flex={fullWidth ? undefined : 1}
      width={fullWidth ? '100%' : undefined}
      minWidth={fullWidth ? undefined : 220}
    >
      <H4
        margin={0}
        fontSize="$3"
        color="$gray11"
        textTransform="uppercase"
        letterSpacing={1}
      >
        {group.label}
      </H4>
      <YStack gap="$2">
        {group.matchups.map((matchup, index) => (
          <MatchupCard key={matchup.id ?? index} matchup={matchup} />
        ))}
      </YStack>
    </YStack>
  );
}

/**
 * PlayoffBracket - cross-platform playoff bracket visualization.
 *
 * Groups matchups by round in tournament order. On wide viewports the rounds
 * render as left-to-right columns inside a horizontal scroll container; on
 * narrow viewports they stack vertically. Completed matchups show final scores
 * and highlight the winner. Seeding/results are injected via the `bracket` prop.
 */
export function PlayoffBracket({ bracket }: PlayoffBracketProps) {
  const { width } = useWindowDimensions();
  const matchups = bracket.matchups ?? [];

  // Group matchups by round in tournament order.
  const roundOrder: PlayoffRound[] = [
    PlayoffRound.Wildcard,
    PlayoffRound.Semifinals,
    PlayoffRound.Finals,
  ];

  const rounds: RoundGroup[] = roundOrder
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

  // Wide viewports lay the rounds out horizontally (scrollable on overflow);
  // narrow viewports stack them vertically. 660px mirrors Tamagui's `gtSm`
  // breakpoint so the switch lines up with the rest of the app's responsive UI.
  const isWide = width >= 660;

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
        {isWide ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <XStack gap="$4" alignItems="flex-start">
              {rounds.map((group) => (
                <RoundColumn
                  key={group.round}
                  group={group}
                  fullWidth={false}
                />
              ))}
            </XStack>
          </ScrollView>
        ) : (
          <YStack gap="$4">
            {rounds.map((group) => (
              <RoundColumn key={group.round} group={group} fullWidth />
            ))}
          </YStack>
        )}
      </YStack>
    </Card>
  );
}
