import {
  getSeasonBattingStatsForPlayer,
  getSeasonBattingStatsForPlayerSeason,
  getSeasonFieldingStatsForPlayerSeason,
  getSeasonPitchingStatsForPlayerSeason,
  PublicDb,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';

export interface SeasonEligibility {
  isEligible: boolean;
  reason?: string;
  battingGames?: number;
  pitchingGames?: number;
  fieldingGames?: number;
}

/**
 * Validate that a player has sufficient games in a given season
 * @param db - Database connection
 * @param playerId - Player ID
 * @param season - Season to validate
 * @param minGamesRequired - Minimum number of games required (defaults to 1)
 * @returns SeasonEligibility object indicating if the player is eligible and why
 */
export async function validatePlayerSeasonEligibility(
  db: PublicDb,
  playerId: number,
  season: number,
  minGamesRequired = 1,
): Promise<SeasonEligibility> {
  const battingStats = await getSeasonBattingStatsForPlayerSeason(
    db,
    playerId,
    season,
  );
  const pitchingStats = await getSeasonPitchingStatsForPlayerSeason(
    db,
    playerId,
    season,
  );
  const fieldingStats = await getSeasonFieldingStatsForPlayerSeason(
    db,
    playerId,
    season,
  );

  const battingGames = battingStats?.g ?? 0;
  const pitchingGames = pitchingStats?.g ?? 0;
  const fieldingGames = fieldingStats.reduce(
    (max, stats) => Math.max(max, stats.g ?? 0),
    0,
  );

  LOGGER.debug(
    `Player ${playerId} season ${season} stats: batting=${battingGames}, pitching=${pitchingGames}, fielding=${fieldingGames} games`,
  );

  // Player must have at least some games in at least one category
  const totalGames = Math.max(battingGames, pitchingGames, fieldingGames);

  if (totalGames < minGamesRequired) {
    return {
      isEligible: false,
      reason: `Player has only ${totalGames} games in season ${season}, minimum required is ${minGamesRequired}`,
      battingGames,
      pitchingGames,
      fieldingGames,
    };
  }

  // Check if player has fielding stats (required for game selection)
  if (fieldingStats.length === 0) {
    return {
      isEligible: false,
      reason: `Player has no fielding stats for season ${season}`,
      battingGames,
      pitchingGames,
      fieldingGames,
    };
  }

  return {
    isEligible: true,
    battingGames,
    pitchingGames,
    fieldingGames,
  };
}

/**
 * Get a list of eligible seasons for a player
 * Uses the existing getSeasonBattingStatsForPlayer function to get all available seasons
 * @param db - Database connection
 * @param playerId - Player ID
 * @param minGamesRequired - Minimum number of games required per season (defaults to 1)
 * @returns Array of eligible season numbers
 */
export async function getEligibleSeasonsForPlayer(
  db: PublicDb,
  playerId: number,
  minGamesRequired = 1,
): Promise<number[]> {
  // Get all available seasons for the player from batting stats
  const allSeasonStats = await getSeasonBattingStatsForPlayer(db, playerId);

  const uniqueSeasons = new Set(allSeasonStats.map((s) => s.season));
  const eligibleSeasons: number[] = [];

  for (const season of uniqueSeasons) {
    const eligibility = await validatePlayerSeasonEligibility(
      db,
      playerId,
      season,
      minGamesRequired,
    );

    if (eligibility.isEligible) {
      eligibleSeasons.push(season);
    } else {
      LOGGER.debug(
        `Player ${playerId} season ${season} not eligible: ${eligibility.reason}`,
      );
    }
  }

  return eligibleSeasons.sort((a, b) => a - b);
}
