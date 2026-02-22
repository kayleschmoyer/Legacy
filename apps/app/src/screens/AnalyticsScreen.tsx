/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable no-restricted-imports -- TODO: Migrate to codegen once getLeagueAnalytics is added to the schema */
import React, { useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import {
  Button,
  Card,
  H2,
  H3,
  H4,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { useRoute } from '@react-navigation/native';

// TODO: Migrate to codegen once getLeagueAnalytics is added to the schema
// eslint-disable-next-line no-restricted-syntax
const GET_LEAGUE_ANALYTICS = gql`
  query GetLeagueAnalytics($leagueId: Int!) {
    getLeagueAnalytics(leagueId: $leagueId) {
      leagueId
      leagueName
      currentWeek
      totalTeams
      averagePointsPerMatchup
      teamStats {
        teamId
        teamName
        totalPoints
        averagePoints
        matchupsPlayed
        wins
        losses
        ties
        winPercentage
        currentStreak
        currentStreakCount
        longestWinStreak
        longestLoseStreak
      }
      powerRankings {
        rank
        teamId
        teamName
        powerScore
        recentFormScore
        pointDifferential
      }
      playoffProjections {
        teamId
        teamName
        currentRecord
        playoffProbability
        projectedWins
        projectedLosses
        strengthOfSchedule
        remainingMatchups
        magicNumber
        eliminationNumber
      }
    }
  }
`;

// eslint-disable-next-line no-restricted-syntax
const GET_HEAD_TO_HEAD = gql`
  query GetHeadToHeadRecord($leagueId: Int!, $team1Id: Int!, $team2Id: Int!) {
    getHeadToHeadRecord(
      leagueId: $leagueId
      team1Id: $team1Id
      team2Id: $team2Id
    ) {
      team1Id
      team1Name
      team2Id
      team2Name
      team1Wins
      team2Wins
      ties
      totalMatchups
      team1AveragePoints
      team2AveragePoints
    }
  }
`;

interface RouteParams {
  leagueId: number;
}

/**
 * AnalyticsScreen - Mobile analytics and statistics dashboard
 */
export default function AnalyticsScreen() {
  const route = useRoute();
  const { leagueId } = route.params as RouteParams;

  const [selectedTab, setSelectedTab] = useState<
    'overview' | 'power' | 'playoff' | 'h2h'
  >('overview');
  const [team1Id] = useState<number | null>(null);
  const [team2Id] = useState<number | null>(null);

  // Fetch league analytics
  const { data, loading, error, refetch } = useQuery(GET_LEAGUE_ANALYTICS, {
    variables: { leagueId },
  });

  // Fetch head-to-head data (only when both teams are selected)
  const {
    data: h2hData,
    loading: h2hLoading,
    error: h2hError,
  } = useQuery(GET_HEAD_TO_HEAD, {
    variables: { leagueId, team1Id, team2Id },
    skip: !team1Id || !team2Id,
  });

  const analytics = data?.getLeagueAnalytics;
  const h2hRecord = h2hData?.getHeadToHeadRecord;

  if (loading && !data) {
    return (
      <YStack flex={1} padding="$4" alignItems="center" justifyContent="center">
        <Spinner size="large" color="$blue10" />
        <Text marginTop="$2" color="$gray11">
          Loading analytics...
        </Text>
      </YStack>
    );
  }

  if (error || !analytics) {
    return (
      <YStack flex={1} padding="$4" alignItems="center" justifyContent="center">
        <Text color="$red10" fontSize="$5" fontWeight="bold">
          Error loading analytics
        </Text>
        <Text marginTop="$2" color="$gray11" textAlign="center">
          {error?.message || 'Unable to load league analytics'}
        </Text>
        <Button marginTop="$4" theme="blue" onPress={() => refetch()}>
          Retry
        </Button>
      </YStack>
    );
  }

  return (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void refetch()} />
      }
    >
      <YStack flex={1} padding="$4" space="$4">
        {/* Header */}
        <YStack space="$2">
          <H2>{analytics.leagueName} Analytics</H2>
          <Text color="$gray11">
            Week {analytics.currentWeek} • {analytics.totalTeams} Teams
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
            <Button
              theme={selectedTab === 'h2h' ? 'blue' : 'alt2'}
              size="$3"
              onPress={() => setSelectedTab('h2h')}
            >
              Head-to-Head
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
                  <Text fontSize="$7" fontWeight="bold" color="$blue10">
                    {analytics.averagePointsPerMatchup.toFixed(2)}
                  </Text>
                </YStack>
                <XStack space="$4">
                  <YStack flex={1}>
                    <Text color="$gray11" fontSize="$2">
                      Current Week
                    </Text>
                    <Text fontSize="$6" fontWeight="bold" color="$blue10">
                      {analytics.currentWeek}
                    </Text>
                  </YStack>
                  <YStack flex={1}>
                    <Text color="$gray11" fontSize="$2">
                      Total Teams
                    </Text>
                    <Text fontSize="$6" fontWeight="bold" color="$blue10">
                      {analytics.totalTeams}
                    </Text>
                  </YStack>
                </XStack>
              </YStack>
            </Card>

            {/* Team Statistics */}
            <Card elevate padding="$4">
              <H3 marginBottom="$3">Team Statistics</H3>
              <YStack space="$2">
                {analytics.teamStats.map(
                  (
                    team: {
                      teamId: number;
                      teamName: string;
                      wins: number;
                      losses: number;
                      ties: number;
                      winPercentage: number;
                      averagePoints: number;
                      currentStreak: string;
                      currentStreakCount: number;
                    },
                    index: number,
                  ) => (
                    <React.Fragment key={team.teamId}>
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
                              team.currentStreak === 'win'
                                ? '$green10'
                                : team.currentStreak === 'loss'
                                  ? '$red10'
                                  : '$gray10'
                            }
                          >
                            {team.currentStreak === 'win' && 'W'}
                            {team.currentStreak === 'loss' && 'L'}
                            {team.currentStreak === 'tie' && 'T'}
                            {team.currentStreakCount}
                          </Text>
                        </XStack>
                        <XStack space="$4">
                          <Text fontSize="$2" color="$gray11">
                            {team.wins}-{team.losses}
                            {team.ties > 0 && `-${team.ties}`}
                          </Text>
                          <Text fontSize="$2" color="$gray11">
                            {(team.winPercentage * 100).toFixed(1)}%
                          </Text>
                          <Text fontSize="$2" color="$gray11">
                            {team.averagePoints.toFixed(2)} avg
                          </Text>
                        </XStack>
                      </YStack>
                      {index < analytics.teamStats.length - 1 && <Separator />}
                    </React.Fragment>
                  ),
                )}
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
                {analytics.powerRankings.map(
                  (
                    team: {
                      rank: number;
                      teamName: string;
                      powerScore: number;
                      recentFormScore: number;
                      pointDifferential: number;
                    },
                    index: number,
                  ) => (
                    <React.Fragment key={index}>
                      <XStack padding="$2" alignItems="center" space="$3">
                        <Text
                          fontSize="$6"
                          fontWeight="bold"
                          minWidth={40}
                          color="$blue10"
                        >
                          #{team.rank}
                        </Text>
                        <YStack flex={1} space="$1">
                          <Text fontWeight="600">{team.teamName}</Text>
                          <XStack space="$3">
                            <Text fontSize="$1" color="$gray11">
                              Power: {(team.powerScore * 100).toFixed(0)}
                            </Text>
                            <Text fontSize="$1" color="$gray11">
                              Form: {team.recentFormScore.toFixed(1)}
                            </Text>
                            <Text fontSize="$1" color="$gray11">
                              Diff: {team.pointDifferential > 0 ? '+' : ''}
                              {team.pointDifferential.toFixed(1)}
                            </Text>
                          </XStack>
                        </YStack>
                      </XStack>
                      {index < analytics.powerRankings.length - 1 && (
                        <Separator />
                      )}
                    </React.Fragment>
                  ),
                )}
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
                {analytics.playoffProjections.map(
                  (
                    proj: {
                      teamName: string;
                      currentRecord: string;
                      playoffProbability: number;
                      projectedWins: number;
                      projectedLosses: number;
                      magicNumber: number | null;
                      eliminationNumber: number | null;
                    },
                    index: number,
                  ) => (
                    <React.Fragment key={index}>
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
                            color={
                              proj.playoffProbability > 0.7
                                ? '$green10'
                                : proj.playoffProbability > 0.3
                                  ? '$yellow10'
                                  : '$red10'
                            }
                          >
                            {(proj.playoffProbability * 100).toFixed(0)}%
                          </Text>
                        </XStack>
                        <XStack space="$3">
                          <Text fontSize="$2" color="$gray11">
                            Current: {proj.currentRecord}
                          </Text>
                          <Text fontSize="$2" color="$gray11">
                            Proj: {proj.projectedWins.toFixed(1)}-
                            {proj.projectedLosses.toFixed(1)}
                          </Text>
                        </XStack>
                        {proj.magicNumber !== null && (
                          <Text fontSize="$2" color="$green10">
                            Magic #: {proj.magicNumber}
                          </Text>
                        )}
                        {proj.eliminationNumber !== null && (
                          <Text fontSize="$2" color="$red10">
                            Elimination #: {proj.eliminationNumber}
                          </Text>
                        )}
                      </YStack>
                      {index < analytics.playoffProjections.length - 1 && (
                        <Separator />
                      )}
                    </React.Fragment>
                  ),
                )}
              </YStack>
            </Card>
          </YStack>
        )}

        {/* Head-to-Head Tab */}
        {selectedTab === 'h2h' && (
          <YStack space="$4">
            <Card elevate padding="$4">
              <H3 marginBottom="$3">Head-to-Head Comparison</H3>
              <YStack space="$3">
                <YStack space="$2">
                  <Text fontSize="$2" color="$gray11">
                    Team 1
                  </Text>
                  <Card padding="$3" pressStyle={{ opacity: 0.8 }}>
                    <Text>Select Team 1</Text>
                  </Card>
                </YStack>
                <YStack space="$2">
                  <Text fontSize="$2" color="$gray11">
                    Team 2
                  </Text>
                  <Card padding="$3" pressStyle={{ opacity: 0.8 }}>
                    <Text>Select Team 2</Text>
                  </Card>
                </YStack>

                <Text fontSize="$2" color="$gray11" textAlign="center">
                  Team selection requires native picker component
                </Text>

                {h2hLoading && (
                  <XStack justifyContent="center" padding="$4">
                    <Spinner size="small" />
                  </XStack>
                )}

                {h2hError && (
                  <Text color="$red10" fontSize="$2">
                    Error: {h2hError.message}
                  </Text>
                )}

                {h2hRecord && (
                  <YStack space="$3" marginTop="$3">
                    <H4>
                      {h2hRecord.team1Name} vs {h2hRecord.team2Name}
                    </H4>
                    <XStack space="$2" flexWrap="wrap">
                      <Card
                        flex={1}
                        minWidth={100}
                        padding="$3"
                        backgroundColor="$blue2"
                      >
                        <Text fontSize="$1" color="$gray11">
                          Matchups
                        </Text>
                        <Text fontSize="$6" fontWeight="bold">
                          {h2hRecord.totalMatchups}
                        </Text>
                      </Card>
                      <Card
                        flex={1}
                        minWidth={100}
                        padding="$3"
                        backgroundColor="$green2"
                      >
                        <Text fontSize="$1" color="$gray11" numberOfLines={1}>
                          {h2hRecord.team1Name}
                        </Text>
                        <Text fontSize="$6" fontWeight="bold">
                          {h2hRecord.team1Wins}W
                        </Text>
                      </Card>
                      <Card
                        flex={1}
                        minWidth={100}
                        padding="$3"
                        backgroundColor="$red2"
                      >
                        <Text fontSize="$1" color="$gray11" numberOfLines={1}>
                          {h2hRecord.team2Name}
                        </Text>
                        <Text fontSize="$6" fontWeight="bold">
                          {h2hRecord.team2Wins}W
                        </Text>
                      </Card>
                    </XStack>
                    <XStack space="$4">
                      <YStack flex={1}>
                        <Text fontSize="$2" color="$gray11">
                          {h2hRecord.team1Name} Avg
                        </Text>
                        <Text fontSize="$5" fontWeight="600">
                          {h2hRecord.team1AveragePoints.toFixed(2)}
                        </Text>
                      </YStack>
                      <YStack flex={1}>
                        <Text fontSize="$2" color="$gray11">
                          {h2hRecord.team2Name} Avg
                        </Text>
                        <Text fontSize="$5" fontWeight="600">
                          {h2hRecord.team2AveragePoints.toFixed(2)}
                        </Text>
                      </YStack>
                    </XStack>
                  </YStack>
                )}
              </YStack>
            </Card>
          </YStack>
        )}
      </YStack>
    </ScrollView>
  );
}
