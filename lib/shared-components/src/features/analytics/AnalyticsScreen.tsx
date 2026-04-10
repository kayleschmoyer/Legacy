import React, { useState } from 'react';
import {
  Button,
  Card,
  H2,
  H3,
  ScrollView,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { useGetLeagueAnalyticsQuery } from '../../api/db/graphql.generated';

export interface AnalyticsScreenProps {
  leagueId: number;
}

/**
 * AnalyticsScreen - Cross-platform analytics and statistics dashboard
 */
export function AnalyticsScreen({ leagueId }: AnalyticsScreenProps) {
  const [selectedTab, setSelectedTab] = useState<
    'overview' | 'power' | 'playoff'
  >('overview');

  // Fetch league analytics. errorPolicy 'all' keeps cached data available
  // when a refetch returns partial errors, enabling the inline error banner.
  const { data, loading, error, refetch } = useGetLeagueAnalyticsQuery({
    variables: { leagueId },
    errorPolicy: 'all',
  });

  const analytics = data?.getLeagueAnalytics;

  if (loading && !data) {
    return (
      <YStack flex={1} padding="$4" alignItems="center" justifyContent="center">
        <Spinner size="large" color="$brandNavyLight" />
        <Text marginTop="$2" color="$gray11">
          Loading analytics...
        </Text>
      </YStack>
    );
  }

  if (!analytics) {
    return (
      <YStack flex={1} padding="$4" alignItems="center" justifyContent="center">
        <Text color="$red10" fontSize="$5" fontWeight="bold">
          Error loading analytics
        </Text>
        <Text marginTop="$2" color="$gray11" textAlign="center">
          {error?.message ?? 'Unable to load league analytics'}
        </Text>
        <Button
          marginTop="$4"
          theme="blue"
          onPress={() => {
            void refetch();
          }}
        >
          Retry
        </Button>
      </YStack>
    );
  }

  return (
    <ScrollView>
      <YStack flex={1} padding="$4" space="$4">
        {/* Inline error banner shown during refetch failures when analytics is still available */}
        {error && (
          <XStack
            backgroundColor="$red3"
            borderRadius="$3"
            padding="$3"
            alignItems="center"
            space="$2"
          >
            <Text color="$red10" flex={1} fontSize="$2">
              {error.message}
            </Text>
            <Button
              size="$2"
              theme="red"
              onPress={() => {
                void refetch();
              }}
            >
              Retry
            </Button>
          </XStack>
        )}

        {/* Header */}
        <YStack space="$2">
          <H2>{analytics.leagueName ?? '—'} Analytics</H2>
          <Text color="$gray11">
            Week {analytics.currentWeek ?? '—'} • {analytics.totalTeams ?? '—'}{' '}
            Teams
          </Text>
        </YStack>

        {/* Tab Navigation */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <XStack space="$2">
            <Button
              theme={selectedTab === 'overview' ? 'blue' : 'alt2'}
              size="$3"
              onPress={() => setSelectedTab('overview')}
            >
              Overview
            </Button>
            <Button
              theme={selectedTab === 'power' ? 'blue' : 'alt2'}
              size="$3"
              onPress={() => setSelectedTab('power')}
            >
              Power Rankings
            </Button>
            <Button
              theme={selectedTab === 'playoff' ? 'blue' : 'alt2'}
              size="$3"
              onPress={() => setSelectedTab('playoff')}
            >
              Playoff Projections
            </Button>
          </XStack>
        </ScrollView>

        {/* Overview Tab */}
        {selectedTab === 'overview' && (
          <YStack space="$4">
            {/* Key Metrics */}
            <Card elevate padding="$4">
              <H3 marginBottom="$3">League Summary</H3>
              <YStack space="$3">
                <YStack>
                  <Text color="$gray11" fontSize="$2">
                    Average Points/Matchup
                  </Text>
                  <Text fontSize="$7" fontWeight="bold" color="$brandNavyLight">
                    {analytics.averagePointsPerMatchup?.toFixed(2) ?? '—'}
                  </Text>
                </YStack>
                <XStack space="$4">
                  <YStack flex={1}>
                    <Text color="$gray11" fontSize="$2">
                      Current Week
                    </Text>
                    <Text
                      fontSize="$6"
                      fontWeight="bold"
                      color="$brandNavyLight"
                    >
                      {analytics.currentWeek ?? '—'}
                    </Text>
                  </YStack>
                  <YStack flex={1}>
                    <Text color="$gray11" fontSize="$2">
                      Total Teams
                    </Text>
                    <Text
                      fontSize="$6"
                      fontWeight="bold"
                      color="$brandNavyLight"
                    >
                      {analytics.totalTeams ?? '—'}
                    </Text>
                  </YStack>
                </XStack>
              </YStack>
            </Card>

            {/* Team Statistics */}
            <Card elevate padding="$4">
              <H3 marginBottom="$3">Team Statistics</H3>
              <YStack space="$2">
                {analytics.teamStats?.map((team, index) => {
                  const normalizedStreak = (() => {
                    const s = team.currentStreak;
                    if (s === 'W' || s === 'win') return 'win';
                    if (s === 'L' || s === 'loss') return 'loss';
                    if (s === 'T' || s === 'tie') return 'tie';
                    return s?.toLowerCase();
                  })();
                  const wins = team.wins ?? 0;
                  const losses = team.losses ?? 0;
                  const winPercentage =
                    team.winPercentage == null
                      ? '—'
                      : `${(team.winPercentage * 100).toFixed(1)}%`;
                  const averagePoints =
                    team.averagePoints == null
                      ? '—'
                      : `${team.averagePoints.toFixed(2)} avg`;
                  const streakLabel = (() => {
                    const count = team.currentStreakCount;
                    if (normalizedStreak === 'win') return `W${count ?? ''}`;
                    if (normalizedStreak === 'loss') return `L${count ?? ''}`;
                    if (normalizedStreak === 'tie') return `T${count ?? ''}`;
                    return '—';
                  })();
                  return (
                    <React.Fragment key={team.teamId ?? index}>
                      <YStack padding="$2" space="$1">
                        <XStack
                          justifyContent="space-between"
                          alignItems="center"
                        >
                          <Text fontWeight="600" flex={1}>
                            {index + 1}. {team.teamName}
                          </Text>
                          <Text
                            fontSize="$2"
                            color={
                              normalizedStreak === 'win'
                                ? '$green10'
                                : normalizedStreak === 'loss'
                                  ? '$red10'
                                  : '$gray10'
                            }
                          >
                            {streakLabel}
                          </Text>
                        </XStack>
                        <XStack space="$4">
                          <Text fontSize="$2" color="$gray11">
                            {wins}-{losses}
                            {(team.ties ?? 0) > 0 && `-${team.ties}`}
                          </Text>
                          <Text fontSize="$2" color="$gray11">
                            {winPercentage}
                          </Text>
                          <Text fontSize="$2" color="$gray11">
                            {averagePoints}
                          </Text>
                        </XStack>
                      </YStack>
                      {index < (analytics.teamStats?.length ?? 0) - 1 && (
                        <Separator />
                      )}
                    </React.Fragment>
                  );
                })}
              </YStack>
            </Card>
          </YStack>
        )}

        {/* Power Rankings Tab */}
        {selectedTab === 'power' && (
          <YStack space="$4">
            <Card elevate padding="$4">
              <H3 marginBottom="$2">Power Rankings</H3>
              <Text color="$gray11" fontSize="$2" marginBottom="$3">
                Rankings based on win percentage, recent form, and scoring
              </Text>
              <YStack space="$2">
                {analytics.powerRankings?.map((team, index) => (
                  <React.Fragment key={team.teamId ?? index}>
                    <XStack padding="$2" alignItems="center" space="$3">
                      <Text
                        fontSize="$6"
                        fontWeight="bold"
                        minWidth={40}
                        color="$brandNavyLight"
                      >
                        #{team.rank ?? index + 1}
                      </Text>
                      <YStack flex={1} space="$1">
                        <Text fontWeight="600">{team.teamName}</Text>
                        <XStack space="$3">
                          <Text fontSize="$1" color="$gray11">
                            Power:{' '}
                            {team.powerScore == null
                              ? '—'
                              : (team.powerScore * 100).toFixed(0)}
                          </Text>
                          <Text fontSize="$1" color="$gray11">
                            Form: {team.recentFormScore?.toFixed(1) ?? '—'}
                          </Text>
                          <Text fontSize="$1" color="$gray11">
                            Diff: {(team.pointDifferential ?? 0) > 0 ? '+' : ''}
                            {team.pointDifferential?.toFixed(1) ?? '—'}
                          </Text>
                        </XStack>
                      </YStack>
                    </XStack>
                    {index < (analytics.powerRankings?.length ?? 0) - 1 && (
                      <Separator />
                    )}
                  </React.Fragment>
                ))}
              </YStack>
            </Card>
          </YStack>
        )}

        {/* Playoff Projections Tab */}
        {selectedTab === 'playoff' && (
          <YStack space="$4">
            <Card elevate padding="$4">
              <H3 marginBottom="$2">Playoff Projections</H3>
              <Text color="$gray11" fontSize="$2" marginBottom="$3">
                Monte Carlo simulations of remaining matchups
              </Text>
              <YStack space="$2">
                {analytics.playoffProjections?.map((proj, index) => {
                  const playoffProbabilityColor =
                    proj.playoffProbability == null
                      ? '$gray11'
                      : proj.playoffProbability > 0.7
                        ? '$green10'
                        : proj.playoffProbability > 0.3
                          ? '$yellow10'
                          : '$red10';
                  const playoffProbabilityLabel =
                    proj.playoffProbability == null
                      ? '—'
                      : `${(proj.playoffProbability * 100).toFixed(0)}%`;
                  return (
                    <React.Fragment key={proj.teamId ?? index}>
                      <YStack padding="$2" space="$1">
                        <XStack
                          justifyContent="space-between"
                          alignItems="center"
                        >
                          <Text fontWeight="600" flex={1}>
                            {proj.teamName}
                          </Text>
                          <Text
                            fontSize="$6"
                            fontWeight="bold"
                            color={playoffProbabilityColor}
                          >
                            {playoffProbabilityLabel}
                          </Text>
                        </XStack>
                        <XStack space="$3">
                          <Text fontSize="$2" color="$gray11">
                            Current: {proj.currentRecord ?? '—'}
                          </Text>
                          <Text fontSize="$2" color="$gray11">
                            Proj: {proj.projectedWins?.toFixed(1) ?? '—'}-
                            {proj.projectedLosses?.toFixed(1) ?? '—'}
                          </Text>
                        </XStack>
                        {proj.magicNumber != null && (
                          <Text fontSize="$2" color="$green10">
                            Magic #: {proj.magicNumber}
                          </Text>
                        )}
                        {proj.eliminationNumber != null && (
                          <Text fontSize="$2" color="$red10">
                            Elimination #: {proj.eliminationNumber}
                          </Text>
                        )}
                      </YStack>
                      {index <
                        (analytics.playoffProjections?.length ?? 0) - 1 && (
                        <Separator />
                      )}
                    </React.Fragment>
                  );
                })}
              </YStack>
            </Card>
          </YStack>
        )}
      </YStack>
    </ScrollView>
  );
}
