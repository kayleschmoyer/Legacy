import React, { useMemo } from 'react';
import { type SeasonStats } from '@legacy-sports/scoring';
import { MatchupScoreboardHero } from '@legacy-sports/shared-components/matchup';
import {
  type AppMatchupFragment,
  type AppMatchupPlayerFragment,
  useGetLeagueTeamsQuery,
  useGetMatchupPlayersQuery,
} from '../../../api/db/graphql.generated';
import { useLeagueScoringSettings } from '../../../common/scoring';
import { mapMatchupPlayerToSeasonStats } from '../../../common/scoring/mapGraphQLToScoringFormat';
import { computeMatchupScores } from '../computeMatchupScores';

export interface MatchupScoreboardProps {
  matchup: AppMatchupFragment | null | undefined;
  /** League id used to resolve team names and scoring settings. */
  leagueId: number | null | undefined;
  gamesRemaining?: number;
  /** When provided, team avatars/names become pressable to view that team. */
  onTeamPress?: (teamId: number) => void;
}

/**
 * MatchupScoreboard — native data-fetching wrapper around the shared
 * `MatchupScoreboardHero` presentational component.
 *
 * Owns the GraphQL query layer (matchup players, league teams, scoring
 * settings) and the score/projection computation, then hands the
 * already-computed values to the shared hero so web and mobile render the same
 * rich scoreboard: projected scores, status chip, pace-coloured scores and a
 * games-progress summary (LS-7815). Mirrors web's `MatchupScoreboard` wrapper.
 */
export function MatchupScoreboard({
  matchup,
  leagueId,
  gamesRemaining = 0,
  onTeamPress,
}: MatchupScoreboardProps) {
  const matchupIdNum = matchup?.id ? parseInt(matchup.id, 10) : 0;

  const { data: playersData, error: playersError } = useGetMatchupPlayersQuery({
    variables: { matchupId: matchupIdNum },
    skip: !matchupIdNum,
    errorPolicy: 'all',
  });

  const { settings: scoringSettings } = useLeagueScoringSettings(
    leagueId ?? undefined,
  );

  const seasonStatsMap = useMemo(() => {
    const map = new Map<number, SeasonStats>();
    playersData?.getMatchupPlayers?.forEach((mp: AppMatchupPlayerFragment) => {
      const stats = mapMatchupPlayerToSeasonStats(mp);
      if (stats) map.set(stats.playerId, stats);
    });
    return map;
  }, [playersData]);

  const { team1Score, team2Score, team1Projected, team2Projected } = useMemo(
    () =>
      computeMatchupScores({
        matchup,
        players: playersData?.getMatchupPlayers,
        hasPlayersError: playersError != null,
        scoringSettings,
        seasonStatsMap,
      }),
    [matchup, playersData, playersError, scoringSettings, seasonStatsMap],
  );

  const { data: teamsData } = useGetLeagueTeamsQuery({
    variables: { leagueId: leagueId ?? 0 },
    skip: !leagueId,
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

  const totalGames = matchup?.gamesPerMatchup ?? 0;
  const gamesPlayed = Math.max(0, totalGames - gamesRemaining);

  return (
    <MatchupScoreboardHero
      weekNumber={matchup?.weekNumber}
      status={matchup?.status}
      team1={{
        id: matchup?.team1Id ?? null,
        name: team1Name,
        score: team1Score,
        projectedScore: team1Projected,
      }}
      team2={{
        id: matchup?.team2Id ?? null,
        name: team2Name,
        score: team2Score,
        projectedScore: team2Projected,
      }}
      gamesPlayed={gamesPlayed}
      totalGames={totalGames}
      onTeamPress={onTeamPress}
    />
  );
}
