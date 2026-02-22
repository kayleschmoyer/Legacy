import React, { useMemo } from 'react';
import { Card, H3, H5, Separator, Text, XStack, YStack } from 'tamagui';
import { computeScoring } from '@legacy-sports/scoring';
import {
  type MatchupFragment,
  type MatchupPlayerFragment,
  MatchupStatus,
  useGetLeagueTeamsQuery,
  useGetMatchupPlayersQuery,
} from '../../api/db/graphql.generated';
import { useLeagueScoringSettings } from '../../lib/scoring';
import {
  mapBattingStats,
  mapFieldingStats,
  mapPitchingStats,
} from '../../lib/scoring/mapGraphQLToScoringFormat';

export interface MatchupScoreboardProps {
  matchup: MatchupFragment | null | undefined;
  gamesRemaining?: number;
}

/**
 * MatchupScoreboard - Large scoreboard-style display of a matchup
 * Shows live scores and games remaining counter with responsive design
 */
export function MatchupScoreboard({
  matchup,
  gamesRemaining = 0,
}: MatchupScoreboardProps) {
  // Extract IDs before early return to use in hooks
  const matchupIdStr = matchup?.id;
  const leagueIdNum = matchup?.leagueId ?? undefined;
  const matchupIdNum = matchupIdStr ? parseInt(matchupIdStr, 10) : 0;

  // Fetch matchup players to calculate actual scores (hooks must come before early return)
  const { data: playersData } = useGetMatchupPlayersQuery({
    variables: { matchupId: matchupIdNum },
    skip: !matchupIdNum,
  });

  // Fetch scoring settings
  const { settings: scoringSettings } = useLeagueScoringSettings(leagueIdNum);

  // Calculate team scores from individual player game scores
  const { team1Score, team2Score } = useMemo(() => {
    if (!playersData?.getMatchupPlayers || !scoringSettings || !matchup) {
      // Fall back to database values if data not loaded yet
      return {
        team1Score: matchup?.team1Score ?? 0,
        team2Score: matchup?.team2Score ?? 0,
      };
    }

    const players = playersData.getMatchupPlayers;

    // Helper: Calculate score for a single game
    const calculateGameScore = (
      game: NonNullable<MatchupPlayerFragment['games']>[number],
    ): number => {
      let total = 0;

      if (game.battingGame) {
        const mappedBatting = mapBattingStats(game.battingGame);
        total += computeScoring(mappedBatting, scoringSettings.batting || {});
      }

      if (game.pitchingGame) {
        const mappedPitching = mapPitchingStats(game.pitchingGame);
        total += computeScoring(mappedPitching, scoringSettings.pitching || {});
      }

      if (game.fieldingGame) {
        const mappedFielding = mapFieldingStats(game.fieldingGame);
        total += computeScoring(mappedFielding, scoringSettings.fielding || {});
      }

      return total;
    };

    // Calculate totals for each team (only count starters, not bench players)
    let team1Total = 0;
    let team2Total = 0;

    players.forEach((player) => {
      // Skip bench players (positionId is null for bench)
      if (player.positionId === null) {
        return;
      }

      const playerScore =
        player.games?.reduce(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return
          (sum, game) => sum + calculateGameScore(game),
          0,
        ) ?? 0;

      if (player.teamId === matchup.team1Id) {
        team1Total += playerScore;
      } else if (player.teamId === matchup.team2Id) {
        team2Total += playerScore;
      }
    });

    return {
      team1Score: team1Total,
      team2Score: team2Total,
    };
  }, [playersData, scoringSettings, matchup]);

  // Fetch team names
  const { data: teamsData } = useGetLeagueTeamsQuery({
    variables: { leagueId: leagueIdNum ?? 0 },
    skip: !leagueIdNum,
  });

  const team1Name = useMemo(() => {
    if (!matchup?.team1Id || !teamsData?.leagueTeams) return 'Team 1';
    return (
      teamsData.leagueTeams.find((t) => t.id === matchup.team1Id)?.name ??
      'Team 1'
    );
  }, [matchup?.team1Id, teamsData]);

  const team2Name = useMemo(() => {
    if (!matchup?.team2Id || !teamsData?.leagueTeams) return 'Team 2';
    return (
      teamsData.leagueTeams.find((t) => t.id === matchup.team2Id)?.name ??
      'Team 2'
    );
  }, [matchup?.team2Id, teamsData]);

  // Early return after all hooks
  if (!matchup) {
    return (
      <Card elevate size="$4" bordered margin="$2">
        <Card.Header padded>
          <Text color="$gray11">No active matchup</Text>
        </Card.Header>
      </Card>
    );
  }

  const { weekNumber, status, gamesPerMatchup } = matchup;

  const team1Leading = (team1Score ?? 0) > (team2Score ?? 0);
  const team2Leading = (team2Score ?? 0) > (team1Score ?? 0);
  const isTied = team1Score === team2Score;

  const getStatusBadgeColor = () => {
    if (status === MatchupStatus.InProgress) return '$green10';
    if (status === MatchupStatus.Completed) return '$blue10';
    return '$gray10';
  };

  return (
    <Card
      elevate
      size="$5"
      bordered
      margin="$2"
      backgroundColor="$background"
      maxWidth={800}
      width="100%"
    >
      {/* Header with Week and Status */}
      <Card.Header padded>
        <XStack
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          gap="$2"
        >
          <H5 color="$gray11">Week {weekNumber}</H5>
          <XStack space="$2" alignItems="center" flexWrap="wrap">
            {status === MatchupStatus.InProgress && gamesRemaining > 0 && (
              <Text fontSize="$3" color="$orange10">
                {gamesRemaining} games remaining
              </Text>
            )}
            <Text
              fontSize="$3"
              color={getStatusBadgeColor()}
              fontWeight="bold"
              paddingHorizontal="$3"
              paddingVertical="$1"
              backgroundColor="$backgroundPress"
              borderRadius="$2"
            >
              {status === MatchupStatus.InProgress
                ? 'LIVE'
                : status?.toUpperCase()}
            </Text>
          </XStack>
        </XStack>
      </Card.Header>

      <Separator />

      {/* Scoreboard */}
      <YStack padding="$4" space="$3">
        {/* Team 1 */}
        <XStack
          justifyContent="space-between"
          alignItems="center"
          paddingVertical="$3"
          paddingHorizontal="$4"
          backgroundColor={team1Leading ? '$blue3' : '$background'}
          borderRadius="$3"
          borderWidth={team1Leading ? 2 : 0}
          borderColor={team1Leading ? '$blue8' : 'transparent'}
          flexWrap="wrap"
          gap="$2"
        >
          <YStack flex={1} minWidth={150}>
            <H3>{team1Name}</H3>
            {team1Leading && !isTied && (
              <Text fontSize="$2" color="$green10">
                Leading
              </Text>
            )}
          </YStack>
          <H3
            fontSize="$9"
            fontWeight="900"
            color={team1Leading ? '$blue11' : '$gray11'}
          >
            {team1Score?.toFixed(2) ?? '0.00'}
          </H3>
        </XStack>

        {/* Team 2 */}
        <XStack
          justifyContent="space-between"
          alignItems="center"
          paddingVertical="$3"
          paddingHorizontal="$4"
          backgroundColor={team2Leading ? '$blue3' : '$background'}
          borderRadius="$3"
          borderWidth={team2Leading ? 2 : 0}
          borderColor={team2Leading ? '$blue8' : 'transparent'}
          flexWrap="wrap"
          gap="$2"
        >
          <YStack flex={1} minWidth={150}>
            <H3>{team2Name}</H3>
            {team2Leading && !isTied && (
              <Text fontSize="$2" color="$green10">
                Leading
              </Text>
            )}
          </YStack>
          <H3
            fontSize="$9"
            fontWeight="900"
            color={team2Leading ? '$blue11' : '$gray11'}
          >
            {team2Score?.toFixed(2) ?? '0.00'}
          </H3>
        </XStack>

        {/* Tie indicator */}
        {isTied && team1Score !== null && (
          <Text textAlign="center" color="$orange10" fontWeight="bold">
            TIED
          </Text>
        )}

        {/* Games info */}
        {gamesPerMatchup && (
          <Text fontSize="$2" color="$gray11" textAlign="center">
            {gamesPerMatchup} game matchup
            {gamesRemaining > 0 &&
              ` • ${gamesPerMatchup - gamesRemaining} games completed`}
          </Text>
        )}
      </YStack>
    </Card>
  );
}
