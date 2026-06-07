import React, { useMemo } from 'react';
import {
  calculateMatchupProjection,
  computeScoring,
  type SeasonStats,
} from '@legacy-sports/scoring';
import { MatchupScoreboardView } from '@legacy-sports/shared-components/matchup';
import {
  type MatchupFragment,
  type MatchupPlayerFragment,
  useGetLeagueTeamsQuery,
  useGetMatchupPlayersQuery,
} from '../../api/db/graphql.generated';
import {
  type ScoringSettings,
  useLeagueScoringSettings,
} from '../../lib/scoring';
import {
  mapBattingStats,
  mapFieldingStats,
  mapMatchupPlayerToSeasonStats,
  mapPitchingStats,
} from '../../lib/scoring/mapGraphQLToScoringFormat';

// ── Score Computation ────────────────────────────────────────────────────────

export interface ComputedMatchupScores {
  team1Score: number;
  team2Score: number;
  team1Projected: number | null;
  team2Projected: number | null;
}

export interface ComputeMatchupScoresInput {
  matchup: MatchupFragment | null | undefined;
  players: readonly MatchupPlayerFragment[] | null | undefined;
  /**
   * True when the players query returned (or partially returned) a GraphQL
   * error. With `errorPolicy: 'all'`, Apollo surfaces the error alongside any
   * partial data; we must honour it as a signal to fall back to the
   * server-stored matchup scores rather than silently collapsing to 0-0.
   */
  hasPlayersError: boolean;
  scoringSettings: ScoringSettings | null | undefined;
  seasonStatsMap: ReadonlyMap<number, SeasonStats>;
}

/**
 * Compute the team scores and projections shown by the MatchupScoreboard.
 *
 * When the players query errors, or when required inputs are missing, fall
 * back to the matchup's server-stored `team1Score`/`team2Score`. Without this
 * fallback a failing nested resolver (e.g. games / battingGame) collapses
 * both totals to zero and the widget renders "0.00 vs 0.00 Tied" even though
 * the scores are stored correctly on the matchup row. See LS-2937.
 */
export function computeMatchupScores({
  matchup,
  players,
  hasPlayersError,
  scoringSettings,
  seasonStatsMap,
}: ComputeMatchupScoresInput): ComputedMatchupScores {
  if (hasPlayersError || !players || !scoringSettings || !matchup) {
    return {
      team1Score: matchup?.team1Score ?? 0,
      team2Score: matchup?.team2Score ?? 0,
      team1Projected: null,
      team2Projected: null,
    };
  }

  const gamesPerMatchup = matchup.gamesPerMatchup ?? 0;

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

  // Calculate projection for a single player using their selected season stats
  const calculatePlayerProjection = (player: MatchupPlayerFragment): number => {
    const gamesPlayed = player.games?.length ?? 0;
    const actualScore =
      player.games?.reduce((sum, game) => sum + calculateGameScore(game), 0) ??
      0;
    // Use player-specific numberOfGames (SP gets pitcherStartsPerMatchup, others get gamesPerMatchup)
    const playerTotalGames = player.numberOfGames ?? gamesPerMatchup;
    const remaining = playerTotalGames - gamesPlayed;

    if (remaining <= 0) return actualScore;

    const playerId = player.playerId;
    if (playerId) {
      const seasonStats = seasonStatsMap.get(playerId);
      if (seasonStats && scoringSettings) {
        try {
          const projection = calculateMatchupProjection(
            seasonStats,
            scoringSettings,
          );
          return actualScore + projection.totalPerGame * remaining;
        } catch {
          // Fall through to fallback
        }
      }
    }

    // Fallback: use average from games already played
    if (gamesPlayed > 0) {
      return actualScore + (actualScore / gamesPlayed) * remaining;
    }
    return actualScore;
  };

  let team1Total = 0;
  let team2Total = 0;
  let team1ProjTotal = 0;
  let team2ProjTotal = 0;

  players.forEach((player) => {
    if (player.positionId === null) return;

    const playerScore =
      player.games?.reduce((sum, game) => sum + calculateGameScore(game), 0) ??
      0;

    const playerProjected = calculatePlayerProjection(player);

    if (player.teamId === matchup.team1Id) {
      team1Total += playerScore;
      team1ProjTotal += playerProjected;
    } else if (player.teamId === matchup.team2Id) {
      team2Total += playerScore;
      team2ProjTotal += playerProjected;
    }
  });

  return {
    team1Score: team1Total,
    team2Score: team2Total,
    team1Projected: team1ProjTotal,
    team2Projected: team2ProjTotal,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatchupScoreboardProps {
  matchup: MatchupFragment | null | undefined;
  gamesRemaining?: number;
  /** When provided, team names become clickable links to view that team's roster */
  onTeamClick?: (teamId: number) => void;
}

/**
 * MatchupScoreboard — web data-fetching wrapper around the shared
 * `MatchupScoreboardView` presentational component.
 *
 * This wrapper owns the GraphQL query layer (matchup players, league teams,
 * scoring settings) and the score/projection computation, then hands the
 * already-computed values to the shared view. All presentation lives in
 * `@legacy-sports/shared-components/matchup` so web and mobile render
 * identically (LS-7715).
 */
export function MatchupScoreboard({
  matchup,
  gamesRemaining = 0,
  onTeamClick,
}: MatchupScoreboardProps) {
  // Extract IDs before early return to use in hooks
  const matchupIdStr = matchup?.id;
  const leagueIdNum = matchup?.leagueId ?? undefined;
  const matchupIdNum = matchupIdStr ? parseInt(matchupIdStr, 10) : 0;

  // Fetch matchup players to calculate actual scores (hooks must come before early return)
  const { data: playersData, error: playersError } = useGetMatchupPlayersQuery({
    variables: { matchupId: matchupIdNum },
    skip: !matchupIdNum,
  });

  // Fetch scoring settings
  const { settings: scoringSettings } = useLeagueScoringSettings(leagueIdNum);

  // Build season stats map from matchup players data for projection calculations
  const seasonStatsMap = useMemo(() => {
    const map = new Map<number, SeasonStats>();
    playersData?.getMatchupPlayers?.forEach((mp: MatchupPlayerFragment) => {
      const stats = mapMatchupPlayerToSeasonStats(mp);
      if (stats) map.set(stats.playerId, stats);
    });
    return map;
  }, [playersData]);

  // Calculate team scores and projected final scores. When the players
  // query errors (or returns partial data with a non-null errors array), fall
  // back to the matchup's server-stored scores — see `computeMatchupScores`
  // for the full rationale (LS-2937).
  const { team1Score, team2Score, team1Projected, team2Projected } = useMemo(
    () =>
      computeMatchupScores({
        matchup,
        players: playersData?.getMatchupPlayers,
        hasPlayersError: playersError != null,
        scoringSettings,
        seasonStatsMap,
      }),
    [playersData, playersError, scoringSettings, matchup, seasonStatsMap],
  );

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

  return (
    <MatchupScoreboardView
      hasMatchup={!!matchup}
      weekNumber={matchup?.weekNumber}
      status={matchup?.status}
      gamesPerMatchup={matchup?.gamesPerMatchup}
      gamesRemaining={gamesRemaining}
      team1Id={matchup?.team1Id}
      team2Id={matchup?.team2Id}
      team1Name={team1Name}
      team2Name={team2Name}
      team1Score={team1Score}
      team2Score={team2Score}
      team1Projected={team1Projected}
      team2Projected={team2Projected}
      hasPlayersError={playersError != null}
      onTeamClick={onTeamClick}
    />
  );
}
