import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Spinner, Tabs, Text, YStack } from 'tamagui';
import { MatchupScoreboard } from '../components/MatchupScoreboard';
import { StandingsTable } from '../components/StandingsTable';
import { GamesRemaining } from '../components/GamesRemaining';
import { useMatchupById } from '../hooks/useMatchup';
import { useStandings } from '../hooks/useStandings';

/**
 * MatchupDetailScreen - Full matchup breakdown screen
 * Shows scoreboard, standings, and detailed matchup information
 */
export default function MatchupDetailScreen() {
  const params = useLocalSearchParams();
  const matchupId = params.matchupId ? parseInt(params.matchupId as string, 10) : null;
  const leagueId = params.leagueId ? parseInt(params.leagueId as string, 10) : null;

  const { matchup, loading: matchupLoading, error: matchupError } = useMatchupById(matchupId);
  const { standings, loading: standingsLoading } = useStandings(leagueId);

  const [activeTab, setActiveTab] = useState('overview');

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
  const gamesRemaining = 0; // TODO: Calculate from selected games
  const gamesCompleted = gamesTotal - gamesRemaining;

  return (
    <YStack flex={1} backgroundColor="$background">
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
              <MatchupScoreboard matchup={matchup} gamesRemaining={gamesRemaining} />
              
              {gamesTotal > 0 && (
                <GamesRemaining
                  gamesTotal={gamesTotal}
                  gamesCompleted={gamesCompleted}
                  gamesRemaining={gamesRemaining}
                />
              )}
            </YStack>
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
                {matchup.selectedSeason && (
                  <Text color="$gray11">
                    <Text fontWeight="bold">Season:</Text> {matchup.selectedSeason}
                  </Text>
                )}
                {matchup.startTime && (
                  <Text color="$gray11">
                    <Text fontWeight="bold">Start:</Text> {new Date(matchup.startTime).toLocaleString()}
                  </Text>
                )}
                {matchup.endTime && (
                  <Text color="$gray11">
                    <Text fontWeight="bold">End:</Text> {new Date(matchup.endTime).toLocaleString()}
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
