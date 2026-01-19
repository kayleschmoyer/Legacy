import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, H2, Spinner, Text, XStack, YStack } from 'tamagui';
import { MatchupScoreboard } from './MatchupScoreboard';
import { GamesRemaining } from './GamesRemaining';
import { useMatchupById } from '../../hooks/useMatchup';

/**
 * MatchupDetailPage - Full matchup breakdown page
 * Shows scoreboard, games remaining, and detailed team stats
 */
export function MatchupDetailPage() {
  const { leagueId, matchupId } = useParams<{ leagueId: string; matchupId: string }>();
  const navigate = useNavigate();

  const matchupIdNum = matchupId ? parseInt(matchupId, 10) : null;
  const { matchup, loading, error } = useMatchupById(matchupIdNum);

  if (loading) {
    return (
      <YStack padding="$4" alignItems="center" justifyContent="center" minHeight={400}>
        <Spinner size="large" color="$blue10" />
        <Text marginTop="$2" color="$gray11">
          Loading matchup details...
        </Text>
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack padding="$4" alignItems="center" justifyContent="center" minHeight={400}>
        <Text color="$red10" fontSize="$5" fontWeight="bold">
          Error loading matchup
        </Text>
        <Text marginTop="$2" color="$gray11">
          {error.message}
        </Text>
        <Button
          marginTop="$4"
          theme="blue"
          onPress={() => navigate(`/baseball/league/${leagueId}`)}
        >
          Back to League
        </Button>
      </YStack>
    );
  }

  if (!matchup) {
    return (
      <YStack padding="$4" alignItems="center" justifyContent="center" minHeight={400}>
        <Text color="$gray11" fontSize="$4">
          Matchup not found
        </Text>
        <Button
          marginTop="$4"
          theme="blue"
          onPress={() => navigate(`/baseball/league/${leagueId}`)}
        >
          Back to League
        </Button>
      </YStack>
    );
  }

  const gamesRemaining = (matchup.gamesPerMatchup ?? 0) - 0; // TODO: Calculate actual games remaining

  return (
    <YStack width="100%" maxWidth={1200} alignSelf="center" padding="$4" space="$4">
      {/* Header */}
      <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
        <H2>Matchup Details</H2>
        <Button
          theme="alt2"
          onPress={() => navigate(`/baseball/league/${leagueId}`)}
        >
          Back to League
        </Button>
      </XStack>

      {/* Scoreboard */}
      <MatchupScoreboard matchup={matchup} gamesRemaining={gamesRemaining} />

      {/* Games Remaining */}
      {matchup.gamesPerMatchup && (
        <GamesRemaining
          gamesRemaining={gamesRemaining}
          totalGames={matchup.gamesPerMatchup}
        />
      )}

      {/* Additional details section */}
      <YStack space="$2">
        <Text fontSize="$4" fontWeight="bold">
          Matchup Information
        </Text>
        <YStack space="$1">
          <Text fontSize="$3" color="$gray11">
            Week: {matchup.weekNumber}
          </Text>
          {matchup.selectedSeason && (
            <Text fontSize="$3" color="$gray11">
              Season: {matchup.selectedSeason}
            </Text>
          )}
          {matchup.startTime && (
            <Text fontSize="$3" color="$gray11">
              Start: {new Date(matchup.startTime).toLocaleString()}
            </Text>
          )}
          {matchup.endTime && (
            <Text fontSize="$3" color="$gray11">
              End: {new Date(matchup.endTime).toLocaleString()}
            </Text>
          )}
        </YStack>
      </YStack>

      {/* TODO: Add team rosters and player projections */}
    </YStack>
  );
}
