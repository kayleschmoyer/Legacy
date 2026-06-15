import {
  calculateMatchupProjection,
  computeScoring,
  type SeasonStats,
} from '@legacy-sports/scoring';
import {
  type AppMatchupFragment,
  type AppMatchupPlayerFragment,
} from '@legacy-sports/graphql';
import { type ScoringSettings } from '../../common/scoring';
import {
  mapBattingStats,
  mapFieldingStats,
  mapPitchingStats,
} from '../../common/scoring/mapGraphQLToScoringFormat';

export interface ComputedMatchupScores {
  team1Score: number;
  team2Score: number;
  team1Projected: number | null;
  team2Projected: number | null;
}

export interface ComputeMatchupScoresInput {
  matchup: AppMatchupFragment | null | undefined;
  players: readonly AppMatchupPlayerFragment[] | null | undefined;
  /**
   * True when the players query returned (or partially returned) a GraphQL
   * error. With `errorPolicy: 'all'`, Apollo surfaces the error alongside any
   * partial data; we honour it as a signal to fall back to the server-stored
   * matchup scores rather than silently collapsing to 0-0.
   */
  hasPlayersError: boolean;
  scoringSettings: ScoringSettings | null | undefined;
  seasonStatsMap: ReadonlyMap<number, SeasonStats>;
}

/**
 * Compute team actual + projected scores for the matchup scoreboard.
 *
 * Native mirror of web's `computeMatchupScores`
 * (apps/web/src/features/matchup/MatchupScoreboard.tsx) so both platforms feed
 * the shared `MatchupScoreboardHero` identical values. When the players query
 * errors (or required inputs are missing) we fall back to the matchup's
 * server-stored `team1Score`/`team2Score` (see LS-2937).
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
    game: NonNullable<AppMatchupPlayerFragment['games']>[number],
  ): number => {
    let total = 0;
    if (game.battingGame) {
      total += computeScoring(
        mapBattingStats(game.battingGame),
        scoringSettings.batting ?? {},
      );
    }
    if (game.pitchingGame) {
      total += computeScoring(
        mapPitchingStats(game.pitchingGame),
        scoringSettings.pitching ?? {},
      );
    }
    if (game.fieldingGame) {
      total += computeScoring(
        mapFieldingStats(game.fieldingGame),
        scoringSettings.fielding ?? {},
      );
    }
    return total;
  };

  const calculatePlayerProjection = (
    player: AppMatchupPlayerFragment,
  ): number => {
    const gamesPlayed = player.games?.length ?? 0;
    const actualScore =
      player.games?.reduce((sum, game) => sum + calculateGameScore(game), 0) ??
      0;
    // SP gets pitcherStartsPerMatchup, others get gamesPerMatchup.
    const playerTotalGames = player.numberOfGames ?? gamesPerMatchup;
    const remaining = playerTotalGames - gamesPlayed;

    if (remaining <= 0) return actualScore;

    const playerId = player.playerId;
    if (playerId) {
      const seasonStats = seasonStatsMap.get(playerId);
      if (seasonStats) {
        try {
          const projection = calculateMatchupProjection(
            seasonStats,
            scoringSettings,
          );
          return actualScore + projection.totalPerGame * remaining;
        } catch {
          // Fall through to the games-played average fallback.
        }
      }
    }

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
