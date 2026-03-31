import React, { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Spinner, Tabs, Text, YStack } from 'tamagui';
import {
  GamesRemaining,
  MatchupNavigationControls,
  MatchupRecapPanel,
  MatchupRosterComparison,
} from '@legacy-sports/shared-components';
import {
  MatchupStatus,
  useGetUserTeamIdQuery,
} from '../../../api/db/graphql.generated';
import { MatchupScoreboard } from '../components/MatchupScoreboard';
import { StandingsTable } from '../components/StandingsTable';
import {
  useCurrentWeek,
  useMatchupById,
  useMatchupsForLeague,
} from '../hooks/useMatchup';
import { useStandings } from '../hooks/useStandings';

/**
 * MatchupDetailScreen - Full matchup breakdown screen
 * Shows scoreboard, standings, and detailed matchup information
 */
export default function MatchupDetailScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();

  const rawMatchupId = params.matchupId;
  const matchupId = rawMatchupId ? parseInt(rawMatchupId as string, 10) : null;

  const rawLeagueId = params.leagueId;
  const leagueId = rawLeagueId ? parseInt(rawLeagueId as string, 10) : null;

  const {
    matchup,
    loading: matchupLoading,
    error: matchupError,
  } = useMatchupById(matchupId);
  const { standings, loading: standingsLoading } = useStandings(leagueId);
  const { currentWeek } = useCurrentWeek(leagueId);
  const { matchups: allMatchups } = useMatchupsForLeague(leagueId);
  const { data: userTeamData } = useGetUserTeamIdQuery({
    variables: { leagueId: leagueId ?? 0 },
    skip: !leagueId,
  });
  const userTeamId = userTeamData?.userTeamId ?? null;

  const [activeTab, setActiveTab] = useState('overview');

  const handleMatchupChange = useCallback(
    (newMatchupId: string) => {
      const numericId = parseInt(newMatchupId, 10);
      if (!isNaN(numericId) && leagueId) {
        router.navigate(
          `/baseball/matchup?matchupId=${numericId}&leagueId=${leagueId}`,
        );
      }
    },
    [router, leagueId],
  );

  if (matchupLoading || standingsLoading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
        <Spinner size="large" />
        <Text marginTop="$3" color="$gray11">
          Loading matchup details...
        </Text>
      </YStack>
    );
  }

  if (matchupError) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
        <Text color="$red10">Error loading matchup</Text>
        <Text color="$gray11" marginTop="$2">
          {matchupError.message}
        </Text>
      </YStack>
    );
  }

  if (!matchup) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
        <Text color="$gray11">Matchup not found</Text>
      </YStack>
    );
  }

  const gamesTotal = matchup.gamesPerMatchup ?? 0;
  const selectedGamesCount = matchup.selectedGamesCount ?? 0;
  const gamesRemaining = Math.min(
    Math.max(gamesTotal - selectedGamesCount, 0),
    gamesTotal,
  );

  return (
    <YStack flex={1} backgroundColor="$background">
      {/* Week navigation — browse matchups across weeks */}
      {leagueId && (
        <MatchupNavigationControls
          currentMatchup={matchup}
          leagueId={leagueId}
          allMatchups={allMatchups}
          currentLeagueWeek={currentWeek ?? undefined}
          userTeamId={userTeamId}
          onMatchupChange={handleMatchupChange}
        />
      )}

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        orientation="horizontal"
        flexDirection="column"
        flex={1}
      >
        <Tabs.List
          backgroundColor="$background"
          borderBottomWidth={1}
          borderBottomColor="$gray6"
        >
          <Tabs.Tab value="overview" flex={1}>
            <Text>Overview</Text>
          </Tabs.Tab>
          <Tabs.Tab value="rosters" flex={1}>
            <Text>Rosters</Text>
          </Tabs.Tab>
          <Tabs.Tab value="standings" flex={1}>
            <Text>Standings</Text>
          </Tabs.Tab>
          <Tabs.Tab value="details" flex={1}>
            <Text>Details</Text>
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Content value="overview" padding="$2">
          <ScrollView>
            <YStack space="$2">
              <MatchupScoreboard
                matchup={matchup}
                gamesRemaining={gamesRemaining}
              />

              {gamesTotal > 0 && (
                <GamesRemaining
                  gamesRemaining={gamesRemaining}
                  totalGames={gamesTotal}
                />
              )}

              {/* Narrative Recap — shown only for completed matchups */}
              {matchup.status === MatchupStatus.Completed && matchupId && (
                <MatchupRecapPanel matchupId={matchupId} />
              )}
            </YStack>
          </ScrollView>
        </Tabs.Content>

        <Tabs.Content value="rosters" padding="$2">
          <ScrollView>
            <MatchupRosterComparison matchup={matchup} />
          </ScrollView>
        </Tabs.Content>

        <Tabs.Content value="standings" padding="$2">
          <ScrollView>
            <StandingsTable standings={standings} />
          </ScrollView>
        </Tabs.Content>

        <Tabs.Content value="details" padding="$2">
          <ScrollView>
            <YStack space="$3" padding="$3">
              <Text fontSize="$5" fontWeight="bold">
                Matchup Details
              </Text>

              <YStack space="$2">
                <Text color="$gray11">
                  <Text fontWeight="bold">Week:</Text> {matchup.weekNumber}
                </Text>
                <Text color="$gray11">
                  <Text fontWeight="bold">Status:</Text> {matchup.status}
                </Text>
                {matchup.startTime && (
                  <Text color="$gray11">
                    <Text fontWeight="bold">Start:</Text>{' '}
                    {new Date(matchup.startTime).toLocaleString()}
                  </Text>
                )}
                {matchup.endTime && (
                  <Text color="$gray11">
                    <Text fontWeight="bold">End:</Text>{' '}
                    {new Date(matchup.endTime).toLocaleString()}
                  </Text>
                )}
              </YStack>
            </YStack>
          </ScrollView>
        </Tabs.Content>
      </Tabs>
    </YStack>
  );
}
