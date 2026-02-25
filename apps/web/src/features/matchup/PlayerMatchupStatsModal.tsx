import React, { useMemo } from 'react';
import {
  Button,
  Card,
  Dialog,
  H3,
  H4,
  ScrollView,
  Separator,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { X } from '@tamagui/lucide-icons';
import type { BaseballScoringSettings } from '@legacy-sports/scoring';
/* eslint-enable */
import {
  mapBattingStats,
  mapFieldingStats,
  mapPitchingStats,
  type ScoringBattingStats,
  type ScoringFieldingStats,
  type ScoringPitchingStats,
} from '../../lib/scoring/mapGraphQLToScoringFormat';
import type { MatchupPlayerFragment } from '../../api/db/graphql.generated';
import { BRAND_GOLD_LIGHT } from '../../constants/colors';

export interface PlayerMatchupStatsModalProps {
  /** Player data with games and stats */
  player: MatchupPlayerFragment | null;
  /** Player name to display in title */
  playerName: string;
  /** Scoring settings for the league */
  scoringSettings?: BaseballScoringSettings;
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal should close */
  onOpenChange: (open: boolean) => void;
}

interface StatLine {
  label: string;
  value: string | number;
  points: number;
  isNegative?: boolean;
}

/**
 * PlayerMatchupStatsModal - Shows detailed game-by-game stats and score breakdown
 * for a player in a specific matchup
 */
export function PlayerMatchupStatsModal({
  player,
  playerName,
  scoringSettings,
  open,
  onOpenChange,
}: PlayerMatchupStatsModalProps) {
  // Calculate detailed score breakdown
  const scoreBreakdown = useMemo(() => {
    if (!player || !player.games || !scoringSettings) {
      return null;
    }

    const batting: StatLine[] = [];
    const pitching: StatLine[] = [];
    const fielding: StatLine[] = [];
    let totalScore = 0;

    // Aggregate stats across all games - map GraphQL to DB format first
    const battingGames = player.games
      .filter((g) => g.battingGame)
      .map((g) => ({
        ...g,
        mappedBatting: mapBattingStats(g.battingGame),
      }));
    const pitchingGames = player.games
      .filter((g) => g.pitchingGame)
      .map((g) => ({
        ...g,
        mappedPitching: mapPitchingStats(g.pitchingGame),
      }));
    const fieldingGames = player.games
      .filter((g) => g.fieldingGame)
      .map((g) => ({
        ...g,
        mappedFielding: mapFieldingStats(g.fieldingGame),
      }));

    // Process batting stats - now using DB field names
    if (battingGames.length > 0) {
      const battingStats = [
        {
          key: 'pa',
          label: 'Plate Appearances',
          extract: (s: ScoringBattingStats | null) => s?.pa ?? 0,
        },
        {
          key: 'ab',
          label: 'At Bats',
          extract: (s: ScoringBattingStats | null) => s?.ab ?? 0,
        },
        {
          key: 'r',
          label: 'Runs',
          extract: (s: ScoringBattingStats | null) => s?.r ?? 0,
        },
        {
          key: 'h',
          label: 'Hits',
          extract: (s: ScoringBattingStats | null) => s?.h ?? 0,
        },
        {
          key: 'doubles',
          label: 'Doubles',
          extract: (s: ScoringBattingStats | null) => s?.doubles ?? 0,
        },
        {
          key: 'triples',
          label: 'Triples',
          extract: (s: ScoringBattingStats | null) => s?.triples ?? 0,
        },
        {
          key: 'hr',
          label: 'Home Runs',
          extract: (s: ScoringBattingStats | null) => s?.hr ?? 0,
        },
        {
          key: 'rbi',
          label: 'RBI',
          extract: (s: ScoringBattingStats | null) => s?.rbi ?? 0,
        },
        {
          key: 'sb',
          label: 'Stolen Bases',
          extract: (s: ScoringBattingStats | null) => s?.sb ?? 0,
        },
        {
          key: 'cs',
          label: 'Caught Stealing',
          extract: (s: ScoringBattingStats | null) => s?.cs ?? 0,
        },
        {
          key: 'bb',
          label: 'Walks',
          extract: (s: ScoringBattingStats | null) => s?.bb ?? 0,
        },
        {
          key: 'ibb',
          label: 'Intentional Walks',
          extract: (s: ScoringBattingStats | null) => s?.ibb ?? 0,
        },
        {
          key: 'so',
          label: 'Strikeouts',
          extract: (s: ScoringBattingStats | null) => s?.so ?? 0,
        },
        {
          key: 'hbp',
          label: 'Hit By Pitch',
          extract: (s: ScoringBattingStats | null) => s?.hbp ?? 0,
        },
        {
          key: 'sh',
          label: 'Sacrifice Hits',
          extract: (s: ScoringBattingStats | null) => s?.sh ?? 0,
        },
        {
          key: 'sf',
          label: 'Sacrifice Flies',
          extract: (s: ScoringBattingStats | null) => s?.sf ?? 0,
        },
        {
          key: 'gidp',
          label: 'Grounded Into DP',
          extract: (s: ScoringBattingStats | null) => s?.gidp ?? 0,
        },
      ];

      for (const stat of battingStats) {
        const total = battingGames.reduce(
          (sum, g) => sum + stat.extract(g.mappedBatting),
          0,
        );
        const scoringValue = scoringSettings.batting[stat.key];
        const points =
          scoringValue !== undefined && scoringValue !== 0
            ? total * scoringValue
            : 0;

        // Add to total score if scoring value exists
        if (points !== 0) {
          totalScore += points;
        }

        // Show all stats, not just ones with values
        batting.push({
          label: stat.label,
          value: total,
          points,
          isNegative: points < 0,
        });
      }
    }

    // Process pitching stats - now using DB field names
    if (pitchingGames.length > 0) {
      // Handle innings pitched first (special calculation)
      const totalOuts = pitchingGames.reduce(
        (sum, g) => sum + (g.mappedPitching?.outsRecorded ?? 0),
        0,
      );
      const outsRecordedScoring = scoringSettings.pitching.outsRecorded;
      const ipPoints =
        outsRecordedScoring !== undefined && outsRecordedScoring !== 0
          ? totalOuts * outsRecordedScoring
          : 0;

      if (ipPoints !== 0) {
        totalScore += ipPoints;
      }

      pitching.push({
        label: 'Innings Pitched',
        value: (totalOuts / 3).toFixed(1),
        points: ipPoints,
        isNegative: ipPoints < 0,
      });

      const pitchingStats = [
        {
          key: 'w',
          label: 'Wins',
          extract: (s: ScoringPitchingStats | null) => s?.w ?? 0,
        },
        {
          key: 'l',
          label: 'Losses',
          extract: (s: ScoringPitchingStats | null) => s?.l ?? 0,
        },
        {
          key: 'gs',
          label: 'Games Started',
          extract: (s: ScoringPitchingStats | null) => s?.gs ?? 0,
        },
        {
          key: 'gf',
          label: 'Games Finished',
          extract: (s: ScoringPitchingStats | null) => s?.gf ?? 0,
        },
        {
          key: 'cg',
          label: 'Complete Games',
          extract: (s: ScoringPitchingStats | null) => s?.cg ?? 0,
        },
        {
          key: 'sho',
          label: 'Shutouts',
          extract: (s: ScoringPitchingStats | null) => s?.sho ?? 0,
        },
        {
          key: 'sv',
          label: 'Saves',
          extract: (s: ScoringPitchingStats | null) => s?.sv ?? 0,
        },
        {
          key: 'h',
          label: 'Hits Allowed',
          extract: (s: ScoringPitchingStats | null) => s?.h ?? 0,
        },
        {
          key: 'r',
          label: 'Runs Allowed',
          extract: (s: ScoringPitchingStats | null) => s?.r ?? 0,
        },
        {
          key: 'er',
          label: 'Earned Runs',
          extract: (s: ScoringPitchingStats | null) => s?.er ?? 0,
        },
        {
          key: 'hr',
          label: 'Home Runs Allowed',
          extract: (s: ScoringPitchingStats | null) => s?.hr ?? 0,
        },
        {
          key: 'bb',
          label: 'Walks',
          extract: (s: ScoringPitchingStats | null) => s?.bb ?? 0,
        },
        {
          key: 'ibb',
          label: 'Intentional Walks',
          extract: (s: ScoringPitchingStats | null) => s?.ibb ?? 0,
        },
        {
          key: 'so',
          label: 'Strikeouts',
          extract: (s: ScoringPitchingStats | null) => s?.so ?? 0,
        },
        {
          key: 'hbp',
          label: 'Hit Batters',
          extract: (s: ScoringPitchingStats | null) => s?.hbp ?? 0,
        },
        {
          key: 'battersFaced',
          label: 'Batters Faced',
          extract: (s: ScoringPitchingStats | null) => s?.battersFaced ?? 0,
        },
      ];

      for (const stat of pitchingStats) {
        const total = pitchingGames.reduce(
          (sum, g) => sum + stat.extract(g.mappedPitching),
          0,
        );
        const scoringValue = scoringSettings.pitching[stat.key];
        const points =
          scoringValue !== undefined && scoringValue !== 0
            ? total * scoringValue
            : 0;

        // Add to total score if scoring value exists
        if (points !== 0) {
          totalScore += points;
        }

        // Show all stats
        pitching.push({
          label: stat.label,
          value: total,
          points,
          isNegative: points < 0,
        });
      }
    }

    // Process fielding stats - now using DB field names
    if (fieldingGames.length > 0) {
      const fieldingStats = [
        {
          key: 'po',
          label: 'Putouts',
          extract: (s: ScoringFieldingStats | null) => s?.po ?? 0,
        },
        {
          key: 'a',
          label: 'Assists',
          extract: (s: ScoringFieldingStats | null) => s?.a ?? 0,
        },
        {
          key: 'eDef',
          label: 'Errors',
          extract: (s: ScoringFieldingStats | null) => s?.eDef ?? 0,
        },
        {
          key: 'dpDef',
          label: 'Double Plays',
          extract: (s: ScoringFieldingStats | null) => s?.dpDef ?? 0,
        },
        {
          key: 'pbDef',
          label: 'Passed Balls',
          extract: (s: ScoringFieldingStats | null) => s?.pbDef ?? 0,
        },
      ];

      for (const stat of fieldingStats) {
        const total = fieldingGames.reduce(
          (sum, g) => sum + stat.extract(g.mappedFielding),
          0,
        );
        const scoringValue = scoringSettings.fielding[stat.key];
        const points =
          scoringValue !== undefined && scoringValue !== 0
            ? total * scoringValue
            : 0;

        // Add to total score if scoring value exists
        if (points !== 0) {
          totalScore += points;
        }

        // Show all stats
        fielding.push({
          label: stat.label,
          value: total,
          points,
          isNegative: points < 0,
        });
      }
    }

    return {
      batting,
      pitching,
      fielding,
      totalScore,
      gamesPlayed: player.games.length,
    };
  }, [player, scoringSettings]);

  const renderStatLine = (stat: StatLine) => {
    // Determine color: gray if no points, red if negative, green if positive
    const pointsColor =
      stat.points === 0 ? '$gray9' : stat.isNegative ? '$red10' : '$green10';

    return (
      <XStack
        key={stat.label}
        justifyContent="space-between"
        alignItems="center"
        paddingVertical="$2"
        paddingHorizontal="$3"
        borderBottomWidth={1}
        borderBottomColor="$gray4"
      >
        <Text fontSize="$3" color="$gray11" flex={1}>
          {stat.label}
        </Text>
        <Text fontSize="$3" fontWeight="600" width={60} textAlign="right">
          {stat.value}
        </Text>
        <Text
          fontSize="$3"
          fontWeight="bold"
          width={80}
          textAlign="right"
          color={pointsColor}
        >
          {stat.points > 0 ? '+' : ''}
          {stat.points.toFixed(2)}
        </Text>
      </XStack>
    );
  };

  return (
    <Dialog modal open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          key="overlay"
          animation="quick"
          opacity={0.5}
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <Dialog.Content
          bordered
          elevate
          key="content"
          animateOnly={['transform', 'opacity']}
          animation={[
            'quick',
            {
              opacity: {
                overshootClamping: true,
              },
            },
          ]}
          enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
          exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
          gap="$4"
          maxWidth={600}
          width="90%"
          maxHeight="85vh"
        >
          {/* Header */}
          <XStack justifyContent="space-between" alignItems="center">
            <Dialog.Title>
              <H3>{playerName}</H3>
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                size="$3"
                circular
                icon={X}
                chromeless
                aria-label="Close"
              />
            </Dialog.Close>
          </XStack>

          <Separator />

          {/* Content */}
          <ScrollView maxHeight="65vh">
            {!scoreBreakdown ? (
              <YStack padding="$4" alignItems="center">
                <Text color="$gray11">No stats available</Text>
              </YStack>
            ) : (
              <YStack gap="$4">
                {/* Score Summary */}
                <Card elevate bordered padding="$4">
                  <XStack justifyContent="space-between" alignItems="center">
                    <YStack>
                      <Text fontSize="$2" color="$gray11">
                        Total Score
                      </Text>
                      <H3 color={BRAND_GOLD_LIGHT}>
                        {scoreBreakdown.totalScore.toFixed(2)}
                      </H3>
                    </YStack>
                    <Text fontSize="$3" color="$gray10">
                      {scoreBreakdown.gamesPlayed}{' '}
                      {scoreBreakdown.gamesPlayed === 1 ? 'game' : 'games'}{' '}
                      played
                    </Text>
                  </XStack>
                </Card>

                {/* Batting Stats */}
                {scoreBreakdown.batting.length > 0 && (
                  <YStack gap="$2">
                    <H4 paddingHorizontal="$3" color={BRAND_GOLD_LIGHT}>
                      Batting
                    </H4>
                    <Card bordered>
                      {/* Header Row */}
                      <XStack
                        backgroundColor="$gray3"
                        paddingVertical="$2"
                        paddingHorizontal="$3"
                        borderBottomWidth={1}
                        borderBottomColor="$gray6"
                      >
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$gray11"
                          flex={1}
                        >
                          Stat
                        </Text>
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$gray11"
                          width={60}
                          textAlign="right"
                        >
                          Total
                        </Text>
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$gray11"
                          width={80}
                          textAlign="right"
                        >
                          Points
                        </Text>
                      </XStack>
                      {scoreBreakdown.batting.map(renderStatLine)}
                    </Card>
                  </YStack>
                )}

                {/* Pitching Stats */}
                {scoreBreakdown.pitching.length > 0 && (
                  <YStack gap="$2">
                    <H4 paddingHorizontal="$3" color={BRAND_GOLD_LIGHT}>
                      Pitching
                    </H4>
                    <Card bordered>
                      {/* Header Row */}
                      <XStack
                        backgroundColor="$gray3"
                        paddingVertical="$2"
                        paddingHorizontal="$3"
                        borderBottomWidth={1}
                        borderBottomColor="$gray6"
                      >
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$gray11"
                          flex={1}
                        >
                          Stat
                        </Text>
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$gray11"
                          width={60}
                          textAlign="right"
                        >
                          Total
                        </Text>
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$gray11"
                          width={80}
                          textAlign="right"
                        >
                          Points
                        </Text>
                      </XStack>
                      {scoreBreakdown.pitching.map(renderStatLine)}
                    </Card>
                  </YStack>
                )}

                {/* Fielding Stats */}
                {scoreBreakdown.fielding.length > 0 && (
                  <YStack gap="$2">
                    <H4 paddingHorizontal="$3" color={BRAND_GOLD_LIGHT}>
                      Fielding
                    </H4>
                    <Card bordered>
                      {/* Header Row */}
                      <XStack
                        backgroundColor="$gray3"
                        paddingVertical="$2"
                        paddingHorizontal="$3"
                        borderBottomWidth={1}
                        borderBottomColor="$gray6"
                      >
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$gray11"
                          flex={1}
                        >
                          Stat
                        </Text>
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$gray11"
                          width={60}
                          textAlign="right"
                        >
                          Total
                        </Text>
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$gray11"
                          width={80}
                          textAlign="right"
                        >
                          Points
                        </Text>
                      </XStack>
                      {scoreBreakdown.fielding.map(renderStatLine)}
                    </Card>
                  </YStack>
                )}
              </YStack>
            )}
          </ScrollView>

          {/* Footer */}
          <XStack justifyContent="flex-end" gap="$3">
            <Dialog.Close displayWhenAdapted asChild>
              <Button theme="alt2">Close</Button>
            </Dialog.Close>
          </XStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
