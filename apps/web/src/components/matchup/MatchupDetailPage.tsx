import React, { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, H2, Spinner, Text, XStack, YStack } from 'tamagui';
import { ChevronLeft, ChevronRight } from '@tamagui/lucide-icons';
import { MatchupScoreboard } from './MatchupScoreboard';
import { GamesRemaining } from './GamesRemaining';
import { useMatchupById, useMatchupsByWeek } from '../../hooks/useMatchup';

/**
 * MatchupDetailPage - Full matchup breakdown page
 * Shows scoreboard, games remaining, and detailed team stats
 */
export function MatchupDetailPage() {
  const { leagueId, matchupId } = useParams<{
    leagueId: string;
    matchupId: string;
  }>();
  const navigate = useNavigate();

  const matchupIdNum = matchupId ? parseInt(matchupId, 10) : null;
  const leagueIdNum = leagueId ? parseInt(leagueId, 10) : null;
  const { matchup, loading, error } = useMatchupById(matchupIdNum);

  // Get current week from matchup
  const currentWeek = matchup?.weekNumber ?? null;

  // Fetch matchups for previous and next weeks to check if they exist
  const { matchups: prevWeekMatchups } = useMatchupsByWeek(
    leagueIdNum,
    currentWeek ? currentWeek - 1 : null,
  );
  const { matchups: nextWeekMatchups } = useMatchupsByWeek(
    leagueIdNum,
    currentWeek ? currentWeek + 1 : null,
  );

  // Find the corresponding matchup in adjacent weeks (same teams)
  const adjacentMatchups = useMemo(() => {
    if (!matchup) return { prev: null, next: null };

    const prevMatchup = prevWeekMatchups.find(
      (m) =>
        (m.team1Id === matchup.team1Id && m.team2Id === matchup.team2Id) ||
        (m.team1Id === matchup.team2Id && m.team2Id === matchup.team1Id),
    );

    const nextMatchup = nextWeekMatchups.find(
      (m) =>
        (m.team1Id === matchup.team1Id && m.team2Id === matchup.team2Id) ||
        (m.team1Id === matchup.team2Id && m.team2Id === matchup.team1Id),
    );

    return { prev: prevMatchup ?? null, next: nextMatchup ?? null };
  }, [matchup, prevWeekMatchups, nextWeekMatchups]);

  const handleNavigateToWeek = (targetMatchupId: number) => {
    navigate(`/baseball/league/${leagueId}/matchups/${targetMatchupId}`);
  };

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
          Loading matchup details...
        </Text>
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack
        padding="$4"
        alignItems="center"
        justifyContent="center"
        minHeight={400}
      >
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
      <YStack
        padding="$4"
        alignItems="center"
        justifyContent="center"
        minHeight={400}
      >
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

  const gamesRemaining =
    (matchup.gamesPerMatchup ?? 0) - (matchup.selectedGamesCount ?? 0);

  return (
    <YStack
      width="100%"
      maxWidth={1200}
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
        <XStack alignItems="center" space="$2" flexWrap="wrap">
          <H2>Matchup Details</H2>
          {currentWeek && (
            <Text fontSize="$6" color="$gray11">
              Week {currentWeek}
            </Text>
          )}
        </XStack>
        <XStack space="$2">
          <Button
            theme="alt2"
            onPress={() => navigate(`/baseball/league/${leagueId}`)}
          >
            Back to League
          </Button>
        </XStack>
      </XStack>

      {/* Week Navigation */}
      <XStack
        justifyContent="center"
        alignItems="center"
        space="$3"
        paddingVertical="$2"
      >
        <Button
          size="$3"
          disabled={!adjacentMatchups.prev}
          onPress={() => {
            if (adjacentMatchups.prev?.id) {
              handleNavigateToWeek(parseInt(adjacentMatchups.prev.id, 10));
            }
          }}
          icon={ChevronLeft}
          chromeless={!adjacentMatchups.prev}
        >
          Previous Week
        </Button>
        <Text fontSize="$5" fontWeight="bold" minWidth={100} textAlign="center">
          Week {currentWeek}
        </Text>
        <Button
          size="$3"
          disabled={!adjacentMatchups.next}
          onPress={() => {
            if (adjacentMatchups.next?.id) {
              handleNavigateToWeek(parseInt(adjacentMatchups.next.id, 10));
            }
          }}
          iconAfter={ChevronRight}
          chromeless={!adjacentMatchups.next}
        >
          Next Week
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
