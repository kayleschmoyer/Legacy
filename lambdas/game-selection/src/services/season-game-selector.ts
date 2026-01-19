import {
  getSeasonBattingStatsForPlayerSeason,
  getSeasonFieldingStatsForPlayerSeason,
  getSeasonPitchingStatsForPlayerSeason,
  PublicDb,
  PublicSchema,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq } from 'drizzle-orm';

export interface GameSelectionResult {
  battingGameNum: number | null;
  fieldingGameNum: number | null;
  fieldingGamePos: string | null;
  pitchingGameNum: number | null;
}

/**
 * Select a random game number from the available games in a season
 * @param stats - Stats object containing the number of games (g)
 * @returns Random game number (1-indexed) or null if no games available
 */
function selectGameNumber(stats: { g: number | null } | null): number | null {
  if (!stats?.g) {
    return null;
  }

  // 1-indexed
  return Math.floor(Math.random() * stats.g) + 1;
}

/**
 * Select games for a single matchup player in a specific season
 * @param db - Database connection
 * @param matchupPlayerId - ID of the matchup player record
 * @param playerId - Player ID
 * @param season - Season to select games from
 * @param gameNumber - Game number in the matchup (1-7 for weekly matchups)
 * @returns Object containing selected game numbers for batting, fielding, and pitching
 */
export async function selectGamesForMatchupPlayer(
  db: PublicDb,
  matchupPlayerId: number,
  playerId: number,
  season: number,
  gameNumber: number,
): Promise<GameSelectionResult> {
  // Fetch stats for the specified season
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

  // Fielding stats are segmented by position
  const fieldingStatsArray = await getSeasonFieldingStatsForPlayerSeason(
    db,
    playerId,
    season,
  );

  const fieldingStats =
    fieldingStatsArray.length > 0
      ? fieldingStatsArray[
          Math.floor(Math.random() * fieldingStatsArray.length)
        ]
      : null;

  const battingGameNum = selectGameNumber(battingStats);
  const fieldingGameNum = selectGameNumber(fieldingStats);
  let pitchingGameNum: number | null = null;

  // Pitchers can only throw one game per week
  if (gameNumber === 1) {
    pitchingGameNum = selectGameNumber(pitchingStats);
  }

  LOGGER.debug(
    `Selected Games for player ${playerId} season ${season}: batting=${battingGameNum} pitching=${pitchingGameNum} fielding=${fieldingGameNum}`,
  );

  return {
    battingGameNum,
    fieldingGameNum,
    fieldingGamePos: fieldingStats?.pos ?? null,
    pitchingGameNum,
  };
}

/**
 * Select games for all players in a matchup for a specific game number
 * Uses the matchup's selected_season field to determine which season to use
 * @param db - Database connection
 * @param matchupId - ID of the matchup
 * @param gameNumber - Game number in the matchup (1-7 for weekly matchups)
 */
export async function selectGamesForMatchup(
  db: PublicDb,
  matchupId: number,
  gameNumber: number,
): Promise<void> {
  // First, get the matchup to retrieve the selected_season
  const matchup = await db
    .select()
    .from(PublicSchema.matchups)
    .where(eq(PublicSchema.matchups.id, matchupId))
    .then((rows) => rows[0]);

  if (!matchup) {
    throw new Error(`Matchup ${matchupId} not found`);
  }

  const selectedSeason = matchup.selectedSeason;

  if (!selectedSeason) {
    throw new Error(
      `Matchup ${matchupId} does not have a selected_season specified`,
    );
  }

  LOGGER.info(
    `Selecting games for matchup ${matchupId}, game ${gameNumber}, season ${selectedSeason}`,
  );

  // Get all matchup players for this matchup that don't have games selected for this game number yet
  const matchupPlayers = await db
    .select()
    .from(PublicSchema.matchupPlayers)
    .where(eq(PublicSchema.matchupPlayers.matchupId, matchupId));

  LOGGER.debug(
    `Found ${matchupPlayers.length} matchup player records for matchup ${matchupId}`,
  );

  for (const matchupPlayer of matchupPlayers) {
    // Check if games have already been selected for this player and game number
    const existingGames = await db
      .select()
      .from(PublicSchema.matchupPlayerGames)
      .where(
        and(
          eq(PublicSchema.matchupPlayerGames.matchupPlayerId, matchupPlayer.id),
          eq(PublicSchema.matchupPlayerGames.gameNum, gameNumber),
        ),
      );

    if (existingGames.length > 0) {
      LOGGER.debug(
        `Games already selected for matchup player ${matchupPlayer.id}, game ${gameNumber}. Skipping.`,
      );
      continue;
    }

    // Select games for this player using the matchup's selected season
    const selectedGames = await selectGamesForMatchupPlayer(
      db,
      matchupPlayer.id,
      matchupPlayer.playerId,
      selectedSeason,
      gameNumber,
    );

    // Insert the selected games into the database
    // Skip if no valid fielding position was selected
    if (!selectedGames.fieldingGamePos) {
      LOGGER.warn(
        `No valid fielding position for matchup player ${matchupPlayer.id}, game ${gameNumber}. Skipping game selection.`,
      );
      continue;
    }

    await db.insert(PublicSchema.matchupPlayerGames).values({
      battingGameNum: selectedGames.battingGameNum,
      fieldingGameNum: selectedGames.fieldingGameNum,
      fieldingGamePos: selectedGames.fieldingGamePos,
      gameNum: gameNumber,
      matchupPlayerId: matchupPlayer.id,
      pitchingGameNum: selectedGames.pitchingGameNum,
    });

    LOGGER.debug(
      `Inserted game selection for matchup player ${matchupPlayer.id}, game ${gameNumber}`,
    );
  }

  LOGGER.info(
    `Completed game selection for matchup ${matchupId}, game ${gameNumber}`,
  );
}
