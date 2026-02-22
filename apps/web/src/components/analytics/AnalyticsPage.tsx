import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  H2,
  H3,
  H4,
  ScrollView,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
// TODO: Migrate to codegen once getLeagueAnalytics and getHeadToHeadRecord are added to the schema
// eslint-disable-next-line no-restricted-imports
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';

// GraphQL Queries
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

/**
 * AnalyticsPage - Comprehensive league analytics and statistics dashboard
 */
export function AnalyticsPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState<
    'overview' | 'power' | 'playoff' | 'h2h'
  >('overview');
  const [team1Id, setTeam1Id] = useState<number | null>(null);
  const [team2Id, setTeam2Id] = useState<number | null>(null);

  const leagueIdNum = leagueId ? parseInt(leagueId, 10) : null;

  // Fetch league analytics
  const { data, loading, error, refetch } = useQuery(GET_LEAGUE_ANALYTICS, {
    variables: { leagueId: leagueIdNum },
    skip: !leagueIdNum,
  });

  // Fetch head-to-head data (only when both teams are selected)
  const {
    data: h2hData,
    loading: h2hLoading,
    error: h2hError,
  } = useQuery(GET_HEAD_TO_HEAD, {
    variables: { leagueId: leagueIdNum, team1Id, team2Id },
    skip: !leagueIdNum || !team1Id || !team2Id,
  });

  const analytics = (
    data as {
      getLeagueAnalytics?: {
        leagueName?: string;
        currentWeek?: number;
        totalTeams?: number;
        averagePointsPerMatchup?: number;
        teamStats?: Array<{
          teamId?: number;
          teamName?: string;
          wins?: number;
          losses?: number;
          pointsFor?: number;
          pointsAgainst?: number;
          weeklyScores?: number[];
        }>;
        powerRankings?: Array<{
          teamId?: number;
          teamName?: string;
          rank?: number;
          rating?: number;
        }>;
        playoffProjections?: Array<{
          teamId?: number;
          teamName?: string;
          playoffChance?: number;
          expectedWins?: number;
        }>;
      };
    }
  )?.getLeagueAnalytics as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const h2hRecord = (
    h2hData as {
      getHeadToHeadRecord?: {
        team1Name?: string;
        team2Name?: string;
        totalMatchups?: number;
        team1Wins?: number;
        team2Wins?: number;
        ties?: number;
        team1AveragePoints?: number;
        team2AveragePoints?: number;
      };
    }
  )?.getHeadToHeadRecord as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  if (loading) {
    return (
      <YStack
        padding="$4"
        alignItems="center"
        justifyContent="center"
        minHeight={400}
      >
        <Spinner size="large" color="$blue10" />
        <Text marginTop="$2" color="$gray11">
          Loading analytics...
        </Text>
      </YStack>
    );
  }

  if (error || !analytics) {
    return (
      <YStack
        padding="$4"
        alignItems="center"
        justifyContent="center"
        minHeight={400}
      >
        <Text color="$red10" fontSize="$5" fontWeight="bold">
          Error loading analytics
        </Text>
        <Text marginTop="$2" color="$gray11">
          {error?.message || 'Unable to load league analytics'}
        </Text>
        <Button marginTop="$4" theme="blue" onPress={() => refetch()}>
          Retry
        </Button>
      </YStack>
    );
  }

  return (
    <ScrollView>
      <YStack
        width="100%"
        maxWidth={1400}
        alignSelf="center"
        padding="$4"
        space="$4"
      >
        {/* Header */}
        <XStack
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          gap="$2"
        >
          <YStack>
            <H2>{analytics.leagueName} Analytics</H2>
            <Text color="$gray11">
              Week {analytics.currentWeek} • {analytics.totalTeams} Teams
            </Text>
          </YStack>
          <XStack space="$2">
            <Button theme="alt2" onPress={() => refetch()}>
              Refresh
            </Button>
            <Button theme="alt2" onPress={() => window.print()}>
              Export
            </Button>
            <Button
              theme="blue"
              onPress={() => navigate(`/baseball/league/${leagueId}`)}
            >
              Back to League
            </Button>
          </XStack>
        </XStack>

        {/* Tab Navigation */}
        <XStack space="$2" flexWrap="wrap">
          <Button
            theme={selectedTab === 'overview' ? 'blue' : 'alt2'}
            onPress={() => setSelectedTab('overview')}
          >
            Overview
          </Button>
          <Button
            theme={selectedTab === 'power' ? 'blue' : 'alt2'}
            onPress={() => setSelectedTab('power')}
          >
            Power Rankings
          </Button>
          <Button
            theme={selectedTab === 'playoff' ? 'blue' : 'alt2'}
            onPress={() => setSelectedTab('playoff')}
          >
            Playoff Projections
          </Button>
          <Button
            theme={selectedTab === 'h2h' ? 'blue' : 'alt2'}
            onPress={() => setSelectedTab('h2h')}
          >
            Head-to-Head
          </Button>
        </XStack>

        {/* Overview Tab */}
        {selectedTab === 'overview' && (
          <YStack space="$4">
            {/* Key Metrics */}
            <Card elevate padding="$4">
              <H3 marginBottom="$3">League Summary</H3>
              <XStack space="$4" flexWrap="wrap">
                <YStack minWidth={150}>
                  <Text color="$gray11">Average Points/Matchup</Text>
                  <Text fontSize="$8" fontWeight="bold" color="$blue10">
                    {analytics.averagePointsPerMatchup.toFixed(2)}
                  </Text>
                </YStack>
                <YStack minWidth={150}>
                  <Text color="$gray11">Current Week</Text>
                  <Text fontSize="$8" fontWeight="bold" color="$blue10">
                    {analytics.currentWeek}
                  </Text>
                </YStack>
                <YStack minWidth={150}>
                  <Text color="$gray11">Total Teams</Text>
                  <Text fontSize="$8" fontWeight="bold" color="$blue10">
                    {analytics.totalTeams}
                  </Text>
                </YStack>
              </XStack>
            </Card>

            {/* Team Performance - Charts would go here (requires recharts dependency) */}

            {/* Team Statistics Table */}
            <Card elevate padding="$4">
              <H3 marginBottom="$3">Team Statistics</H3>
              <ScrollView horizontal>
                <YStack minWidth={900}>
                  {/* Table Header */}
                  <XStack
                    backgroundColor="$gray3"
                    padding="$2"
                    borderRadius="$2"
                    marginBottom="$2"
                  >
                    <Text flex={2} fontWeight="bold">
                      Team
                    </Text>
                    <Text flex={1} fontWeight="bold" textAlign="right">
                      Record
                    </Text>
                    <Text flex={1} fontWeight="bold" textAlign="right">
                      Win %
                    </Text>
                    <Text flex={1} fontWeight="bold" textAlign="right">
                      Avg Pts
                    </Text>
                    <Text flex={1} fontWeight="bold" textAlign="right">
                      Streak
                    </Text>
                  </XStack>
                  {/* Table Rows */}
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
                        <XStack padding="$2" alignItems="center">
                          <Text flex={2}>
                            {index + 1}. {team.teamName}
                          </Text>
                          <Text flex={1} textAlign="right">
                            {team.wins}-{team.losses}
                            {team.ties > 0 && `-${team.ties}`}
                          </Text>
                          <Text flex={1} textAlign="right">
                            {(team.winPercentage * 100).toFixed(1)}%
                          </Text>
                          <Text flex={1} textAlign="right">
                            {team.averagePoints.toFixed(2)}
                          </Text>
                          <Text
                            flex={1}
                            textAlign="right"
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
                        {index < analytics.teamStats.length - 1 && (
                          <Separator />
                        )}
                      </React.Fragment>
                    ),
                  )}
                </YStack>
              </ScrollView>
            </Card>
          </YStack>
        )}

        {/* Power Rankings Tab */}
        {selectedTab === 'power' && (
          <YStack space="$4">
            <Card elevate padding="$4">
              <H3 marginBottom="$3">Power Rankings</H3>
              <Text color="$gray11" marginBottom="$4">
                Rankings based on win percentage, recent form, and scoring
              </Text>
              {/* Charts would go here (requires recharts dependency) */}
            </Card>

            <Card elevate padding="$4">
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
                      <XStack padding="$3" alignItems="center" space="$3">
                        <Text fontSize="$6" fontWeight="bold" minWidth={40}>
                          #{team.rank}
                        </Text>
                        <YStack flex={1}>
                          <Text fontWeight="600">{team.teamName}</Text>
                          <Text fontSize="$2" color="$gray11">
                            Power: {(team.powerScore * 100).toFixed(1)} • Form:{' '}
                            {team.recentFormScore.toFixed(1)} • Diff:{' '}
                            {team.pointDifferential > 0 ? '+' : ''}
                            {team.pointDifferential.toFixed(1)}
                          </Text>
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
              <H3 marginBottom="$3">Playoff Projections</H3>
              <Text color="$gray11" marginBottom="$4">
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
                      <XStack padding="$3" space="$3" alignItems="center">
                        <YStack flex={1}>
                          <Text fontWeight="600">{proj.teamName}</Text>
                          <Text fontSize="$2" color="$gray11">
                            Current: {proj.currentRecord} • Projected:{' '}
                            {proj.projectedWins.toFixed(1)}-
                            {proj.projectedLosses.toFixed(1)}
                          </Text>
                          {proj.magicNumber !== null && (
                            <Text fontSize="$2" color="$green10">
                              Magic #: {proj.magicNumber}
                            </Text>
                          )}
                          {proj.eliminationNumber !== null && (
                            <Text fontSize="$2" color="$red10">
                              Elim #: {proj.eliminationNumber}
                            </Text>
                          )}
                        </YStack>
                        <YStack alignItems="flex-end" minWidth={120}>
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
                          <Text fontSize="$1" color="$gray11">
                            Playoff Prob
                          </Text>
                        </YStack>
                      </XStack>
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
                <XStack space="$3" flexWrap="wrap">
                  <YStack flex={1} minWidth={200}>
                    <Text marginBottom="$2">Team 1</Text>
                    <select
                      style={{
                        padding: '10px',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                      }}
                      onChange={(e) => setTeam1Id(Number(e.target.value))}
                      value={team1Id || ''}
                    >
                      <option value="">Select Team 1</option>
                      {analytics.teamStats.map(
                        (team: { teamId: number; teamName: string }) => (
                          <option key={team.teamId} value={team.teamId}>
                            {team.teamName}
                          </option>
                        ),
                      )}
                    </select>
                  </YStack>
                  <YStack flex={1} minWidth={200}>
                    <Text marginBottom="$2">Team 2</Text>
                    <select
                      style={{
                        padding: '10px',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                      }}
                      onChange={(e) => setTeam2Id(Number(e.target.value))}
                      value={team2Id || ''}
                    >
                      <option value="">Select Team 2</option>
                      {analytics.teamStats.map(
                        (team: { teamId: number; teamName: string }) => (
                          <option key={team.teamId} value={team.teamId}>
                            {team.teamName}
                          </option>
                        ),
                      )}
                    </select>
                  </YStack>
                </XStack>

                {h2hLoading && (
                  <XStack justifyContent="center" padding="$4">
                    <Spinner size="small" />
                  </XStack>
                )}

                {h2hError && (
                  <Text color="$red10">
                    Error loading head-to-head data: {h2hError.message}
                  </Text>
                )}

                {h2hRecord && (
                  <YStack space="$3" marginTop="$3">
                    <H4>
                      {h2hRecord.team1Name} vs {h2hRecord.team2Name}
                    </H4>
                    <XStack space="$4" flexWrap="wrap">
                      <Card
                        flex={1}
                        minWidth={150}
                        padding="$3"
                        backgroundColor="$blue2"
                      >
                        <Text color="$gray11">Total Matchups</Text>
                        <Text fontSize="$7" fontWeight="bold">
                          {h2hRecord.totalMatchups}
                        </Text>
                      </Card>
                      <Card
                        flex={1}
                        minWidth={150}
                        padding="$3"
                        backgroundColor="$green2"
                      >
                        <Text color="$gray11">{h2hRecord.team1Name} Wins</Text>
                        <Text fontSize="$7" fontWeight="bold">
                          {h2hRecord.team1Wins}
                        </Text>
                      </Card>
                      <Card
                        flex={1}
                        minWidth={150}
                        padding="$3"
                        backgroundColor="$red2"
                      >
                        <Text color="$gray11">{h2hRecord.team2Name} Wins</Text>
                        <Text fontSize="$7" fontWeight="bold">
                          {h2hRecord.team2Wins}
                        </Text>
                      </Card>
                      {h2hRecord.ties > 0 && (
                        <Card
                          flex={1}
                          minWidth={150}
                          padding="$3"
                          backgroundColor="$gray2"
                        >
                          <Text color="$gray11">Ties</Text>
                          <Text fontSize="$7" fontWeight="bold">
                            {h2hRecord.ties}
                          </Text>
                        </Card>
                      )}
                    </XStack>
                    <XStack space="$4" flexWrap="wrap">
                      <YStack flex={1}>
                        <Text color="$gray11">{h2hRecord.team1Name} Avg</Text>
                        <Text fontSize="$5" fontWeight="600">
                          {h2hRecord.team1AveragePoints.toFixed(2)}
                        </Text>
                      </YStack>
                      <YStack flex={1}>
                        <Text color="$gray11">{h2hRecord.team2Name} Avg</Text>
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
