import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, H2, Spinner, Text, XStack, YStack } from 'tamagui';
import { PageMeta } from '../../components/PageMeta';
import { MatchupScoreboard } from '../../features/matchup/MatchupScoreboard';
import { MatchupWinProbabilityPanel } from '../../features/matchup/MatchupWinProbabilityPanel';
import { GamesRemaining } from '../../features/matchup/GamesRemaining';
import { MatchupNavigationControls } from '../../features/matchup/MatchupNavigationControls';
import { MatchupRosterComparison } from '../../features/matchup/MatchupRosterComparison';
import { MatchupRosterEditor } from '../../features/matchup/MatchupRosterEditor';
import { MatchupRecapPanel } from '../../features/matchup/MatchupRecapPanel';
import {
  MatchupStatus,
  useGetUserTeamIdQuery,
} from '../../api/db/graphql.generated';
import { useMatchupById, useMatchupsForLeague } from '../../hooks/useMatchup';
import {
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
} from '../../constants/colors';

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

  // Fetch all matchups for the league to determine available weeks
  const { matchups: allLeagueMatchups } = useMatchupsForLeague(leagueIdNum);

  // Determine the current user's team in this league
  const { data: userTeamData } = useGetUserTeamIdQuery({
    variables: { leagueId: leagueIdNum ?? 0 },
    skip: !leagueIdNum,
  });
  const userTeamId = userTeamData?.userTeamId ?? null;

  if (loading) {
    return (
      <YStack
        padding="$4"
        alignItems="center"
        justifyContent="center"
        minHeight={400}
      >
        <Spinner size="large" color={BRAND_NAVY_LIGHT} />
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
          backgroundColor={BRAND_NAVY_LIGHT}
          color="white"
          pressStyle={{ backgroundColor: BRAND_NAVY_DARK }}
          hoverStyle={{ backgroundColor: BRAND_NAVY }}
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
          backgroundColor={BRAND_NAVY_LIGHT}
          color="white"
          pressStyle={{ backgroundColor: BRAND_NAVY_DARK }}
          hoverStyle={{ backgroundColor: BRAND_NAVY }}
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
      $sm={{ padding: '$2' }}
      space="$4"
    >
      <PageMeta
        title={
          matchup.weekNumber != null
            ? `Week ${matchup.weekNumber} Matchup`
            : 'Matchup Details'
        }
        description={`View Week ${matchup.weekNumber ?? ''} fantasy baseball matchup scores, rosters, and stats on Legacy Sports.`}
      />
      {/* Header */}
      <XStack
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        gap="$2"
        $sm={{ flexDirection: 'column', alignItems: 'flex-start' }}
      >
        <H2>Matchup Details</H2>
        <Button
          theme="alt2"
          onPress={() => navigate(`/baseball/league/${leagueId}`)}
        >
          Back to League
        </Button>
      </XStack>

      {/* Week & Team Navigation Controls */}
      {leagueIdNum && (
        <MatchupNavigationControls
          currentMatchup={matchup}
          leagueId={leagueIdNum}
          allMatchups={allLeagueMatchups}
        />
      )}

      {/* Scoreboard */}
      <MatchupScoreboard matchup={matchup} gamesRemaining={gamesRemaining} />

      {/* Win Probability & Projections */}
      <MatchupWinProbabilityPanel matchup={matchup} />

      {/* Games Progress */}
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
              Start: {new Date(String(matchup.startTime)).toLocaleString()}
            </Text>
          )}
          {matchup.endTime && (
            <Text fontSize="$3" color="$gray11">
              End: {new Date(String(matchup.endTime)).toLocaleString()}
            </Text>
          )}
        </YStack>
      </YStack>

      {/* Roster Editor — shown when the matchup is still editable */}
      {userTeamId &&
        matchup.status === MatchupStatus.Scheduled &&
        (matchup.team1Id === userTeamId || matchup.team2Id === userTeamId) && (
          <MatchupRosterEditor matchup={matchup} userTeamId={userTeamId} />
        )}

      {/* Narrative Recap — shown only for completed matchups */}
      {matchup.status === MatchupStatus.Completed && matchupIdNum && (
        <MatchupRecapPanel matchupId={matchupIdNum} />
      )}

      {/* Team Rosters & Player Matchups */}
      <MatchupRosterComparison matchup={matchup} />
    </YStack>
  );
}
