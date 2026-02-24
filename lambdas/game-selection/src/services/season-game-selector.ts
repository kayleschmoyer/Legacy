import { PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq, isNotNull, notInArray, sql } from 'drizzle-orm';

export interface GameSelectionResult {
  gameIdentifier: string | null;
  fieldingGamePos: string | null;
  statsAreCached: boolean;
  /** True if game was skipped due to SP start probability */
  skipped?: boolean;
}

/** Player's roster position type for game selection purposes */
type PitcherRole = 'SP' | 'RP' | 'non-pitcher';

/**
 * Get the primary fielding position for a player in a season.
 * Returns the position with the most games, or null if no fielding stats.
 */
async function getPrimaryFieldingPosition(
  db: PublicDb,
  playerId: number,
  season: number,
): Promise<string | null> {
  const fieldingStats = await db
    .select({
      pos: PublicSchema.seasonFielding.pos,
      g: PublicSchema.seasonFielding.g,
    })
    .from(PublicSchema.seasonFielding)
    .where(
      and(
        eq(PublicSchema.seasonFielding.playerId, playerId),
        eq(PublicSchema.seasonFielding.season, season),
      ),
    );

  if (fieldingStats.length === 0) {
    return null;
  }

  // Return position with most games
  fieldingStats.sort((a, b) => (b.g ?? 0) - (a.g ?? 0));
  return fieldingStats[0].pos;
}

/**
 * Select a random game_identifier for a player/season from cached game stats.
 * Excludes game_identifiers already used by other game slots.
 *
 * For pitchers, filters by GS (games started):
 * - SP: only games where GS = 1 (pitcher was the starter)
 * - RP: only games where GS = 0 (pitcher was a reliever)
 * - non-pitcher: all games (no pitching filter)
 */
async function selectGameIdentifier(
  db: PublicDb,
  playerId: number,
  season: number,
  excludeGameIdentifiers: string[],
  pitcherRole: PitcherRole = 'non-pitcher',
): Promise<string | null> {
  // Start with batting games as the base (every player has batting stats)
  const battingConditions = [
    eq(PublicSchema.gameBatting.playerId, playerId),
    eq(PublicSchema.gameBatting.season, season),
  ];

  if (excludeGameIdentifiers.length > 0) {
    battingConditions.push(
      notInArray(
        PublicSchema.gameBatting.gameIdentifier,
        excludeGameIdentifiers,
      ),
    );
  }

  // For pitchers, we need to filter by GS from game_pitching
  if (pitcherRole === 'SP' || pitcherRole === 'RP') {
    const gsValue = pitcherRole === 'SP' ? 1 : 0;

    // Join game_batting with game_pitching to filter by GS
    const availableGames = await db
      .selectDistinct({
        gameIdentifier: PublicSchema.gameBatting.gameIdentifier,
      })
      .from(PublicSchema.gameBatting)
      .innerJoin(
        PublicSchema.gamePitching,
        and(
          eq(
            PublicSchema.gameBatting.gameIdentifier,
            PublicSchema.gamePitching.gameIdentifier,
          ),
          eq(
            PublicSchema.gameBatting.playerId,
            PublicSchema.gamePitching.playerId,
          ),
          eq(PublicSchema.gameBatting.season, PublicSchema.gamePitching.season),
        ),
      )
      .where(
        and(...battingConditions, eq(PublicSchema.gamePitching.gs, gsValue)),
      );

    if (availableGames.length === 0) {
      LOGGER.warn(
        `No available ${pitcherRole} games (GS=${gsValue}) for player ${playerId} season ${season}`,
      );
      return null;
    }

    const randomIndex = Math.floor(Math.random() * availableGames.length);
    return availableGames[randomIndex].gameIdentifier;
  }

  // Non-pitcher: select from all games
  const availableGames = await db
    .selectDistinct({ gameIdentifier: PublicSchema.gameBatting.gameIdentifier })
    .from(PublicSchema.gameBatting)
    .where(and(...battingConditions));

  if (availableGames.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * availableGames.length);
  return availableGames[randomIndex].gameIdentifier;
}

/**
 * Select a game for a single matchup player using a real game_identifier.
 * If stats are cached in the DB, picks a random game from the cache.
 * If not cached, returns null gameIdentifier so stats loading can be queued.
 *
 * This ensures batting, pitching, and fielding stats all come from the
 * same real baseball game instead of mixing stats from different games.
 *
 * For pitchers:
 * - SP: only games where GS=1 are eligible
 * - RP: only games where GS=0 are eligible
 */
export async function selectGamesForMatchupPlayer(
  db: PublicDb,
  matchupPlayerId: number,
  playerId: number,
  season: number,
  pitcherRole: PitcherRole = 'non-pitcher',
): Promise<GameSelectionResult> {
  // Check if batting stats are cached (indicates stats for this player/season are loaded)
  const cachedCheck = await db
    .select({ gameIdentifier: PublicSchema.gameBatting.gameIdentifier })
    .from(PublicSchema.gameBatting)
    .where(
      and(
        eq(PublicSchema.gameBatting.playerId, playerId),
        eq(PublicSchema.gameBatting.season, season),
      ),
    )
    .limit(1);

  const fieldingPos = await getPrimaryFieldingPosition(db, playerId, season);

  if (cachedCheck.length === 0) {
    LOGGER.info(
      `No cached stats for player ${playerId} season ${season}. Stats loading needed.`,
    );
    return {
      gameIdentifier: null,
      fieldingGamePos: fieldingPos,
      statsAreCached: false,
    };
  }

  // Stats are cached - get already-used game identifiers for this matchup player
  const usedGames = await db
    .select({ gameIdentifier: PublicSchema.matchupPlayerGames.gameIdentifier })
    .from(PublicSchema.matchupPlayerGames)
    .where(
      and(
        eq(PublicSchema.matchupPlayerGames.matchupPlayerId, matchupPlayerId),
        isNotNull(PublicSchema.matchupPlayerGames.gameIdentifier),
      ),
    );

  const excludeIds = usedGames
    .map((g) => g.gameIdentifier)
    .filter((id): id is string => id !== null);

  const gameIdentifier = await selectGameIdentifier(
    db,
    playerId,
    season,
    excludeIds,
    pitcherRole,
  );

  if (!gameIdentifier) {
    LOGGER.warn(
      `No available games left for player ${playerId} season ${season} (${excludeIds.length} already used)`,
    );
    return {
      gameIdentifier: null,
      fieldingGamePos: fieldingPos,
      statsAreCached: true,
    };
  }

  LOGGER.debug(
    `Selected game ${gameIdentifier} for player ${playerId} season ${season}`,
  );

  return {
    gameIdentifier,
    fieldingGamePos: fieldingPos,
    statsAreCached: true,
  };
}

/**
 * Determine a player's pitcher role from their roster position in the league.
 * Looks up team_members → league_positions to find if the player is slotted as SP or RP.
 */
async function getPlayerPitcherRole(
  db: PublicDb,
  playerId: number,
  teamId: number,
  leagueId: number,
): Promise<PitcherRole> {
  const result = await db
    .select({
      positionType: PublicSchema.leaguePosition.positionType,
    })
    .from(PublicSchema.teamMembers)
    .innerJoin(
      PublicSchema.leaguePosition,
      eq(PublicSchema.teamMembers.positionId, PublicSchema.leaguePosition.id),
    )
    .where(
      and(
        eq(PublicSchema.teamMembers.playerId, playerId),
        eq(PublicSchema.teamMembers.teamId, teamId),
        eq(PublicSchema.teamMembers.leagueId, leagueId),
      ),
    )
    .limit(1);

  if (result.length === 0) {
    return 'non-pitcher';
  }

  const positionType = result[0].positionType;
  if (positionType === 'SP') return 'SP';
  if (positionType === 'RP') return 'RP';
  return 'non-pitcher';
}

/**
 * Determine whether a starting pitcher should get a game this matchup day.
 *
 * Uses probability: numberOfStarts / gamesRemaining
 * - If the SP has already been selected for their max starts, return false.
 * - If numberOfStarts >= gamesRemaining, always select (100%).
 * - Otherwise, roll a random number against the probability.
 *
 * @param spStartsPerMatchup - Max starts allowed for SP in this matchup
 * @param startsAlreadySelected - How many starts this SP already has in this matchup
 * @param gamesRemaining - How many game slots remain in this matchup (including current)
 */
function shouldSelectSpGame(
  spStartsPerMatchup: number,
  startsAlreadySelected: number,
  gamesRemaining: number,
): boolean {
  const startsNeeded = spStartsPerMatchup - startsAlreadySelected;

  // SP already has their full allotment
  if (startsNeeded <= 0) {
    return false;
  }

  // Must start every remaining game to hit the target
  if (startsNeeded >= gamesRemaining) {
    return true;
  }

  // Probabilistic selection
  const probability = startsNeeded / gamesRemaining;
  const roll = Math.random();
  return roll < probability;
}

/**
 * Select games for all players in a matchup for a specific game number.
 * Uses game_identifier for real game selection - all stat types come from the same game.
 *
 * Position-based rules:
 * - SP (Starting Pitcher): probabilistic selection based on spStartsPerMatchup,
 *   only games where GS=1 in game_pitching
 * - RP (Relief Pitcher): selects every game, only games where GS=0
 * - All other positions: selects every game, no GS filtering
 *
 * Returns list of players that need stats loading (uncached).
 */
export async function selectGamesForMatchup(
  db: PublicDb,
  matchupId: number,
  gameNumber: number,
): Promise<{
  playersNeedingStatsLoading: Array<{
    matchupPlayerId: number;
    playerId: number;
    season: number;
    fieldingGamePos: string | null;
  }>;
}> {
  // First, get the matchup to retrieve league and week information
  const matchup = await db
    .select()
    .from(PublicSchema.matchups)
    .where(eq(PublicSchema.matchups.id, matchupId))
    .then((rows) => rows[0]);

  if (!matchup) {
    throw new Error(`Matchup ${matchupId} not found`);
  }

  const spStartsPerMatchup = matchup.spStartsPerMatchup ?? 1;
  const gamesPerMatchup = matchup.gamesPerMatchup ?? 5;
  const gamesRemainingInMatchup = gamesPerMatchup - gameNumber + 1;

  LOGGER.info(
    `Selecting games for matchup ${matchupId}, game ${gameNumber} ` +
      `(spStarts=${spStartsPerMatchup}, gamesPerMatchup=${gamesPerMatchup})`,
  );

  // Update matchup stats loading status to 'loading' (transitioning from 'queued')
  await db
    .update(PublicSchema.matchups)
    .set({ statsLoadingStatus: 'loading' })
    .where(eq(PublicSchema.matchups.id, matchupId));

  // Get all matchup players for this matchup that don't have games selected for this game number yet
  const matchupPlayers = await db
    .select()
    .from(PublicSchema.matchupPlayers)
    .where(eq(PublicSchema.matchupPlayers.matchupId, matchupId));

  LOGGER.debug(
    `Found ${matchupPlayers.length} matchup player records for matchup ${matchupId}`,
  );

  // Get per-player season assignments from league_week_player_seasons
  const playerSeasons = await db
    .select({
      playerId: PublicSchema.leagueWeekPlayerSeasons.playerId,
      season: PublicSchema.leagueWeekPlayerSeasons.season,
    })
    .from(PublicSchema.leagueWeekPlayerSeasons)
    .where(
      and(
        eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, matchup.leagueId),
        eq(PublicSchema.leagueWeekPlayerSeasons.weekNumber, matchup.weekNumber),
      ),
    );

  const seasonMap = new Map(
    playerSeasons.map((ps) => [ps.playerId, ps.season]),
  );

  const playersNeedingStatsLoading: Array<{
    matchupPlayerId: number;
    playerId: number;
    season: number;
    fieldingGamePos: string | null;
  }> = [];

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

    // Get this player's assigned season from league_week_player_seasons
    const playerSeason = seasonMap.get(matchupPlayer.playerId);

    if (!playerSeason) {
      LOGGER.error(
        `No season assigned for player ${matchupPlayer.playerId} in league ${matchup.leagueId}, week ${matchup.weekNumber}`,
      );
      throw new Error(
        `Player ${matchupPlayer.playerId} does not have a season assigned for this matchup`,
      );
    }

    // Determine the player's pitcher role from their roster position
    const pitcherRole = await getPlayerPitcherRole(
      db,
      matchupPlayer.playerId,
      matchupPlayer.teamId,
      matchup.leagueId,
    );

    // For SPs: apply probabilistic start selection
    if (pitcherRole === 'SP') {
      // Count how many starts this SP already has in this matchup
      const existingStarts = await db
        .select({ count: sql<number>`count(*)` })
        .from(PublicSchema.matchupPlayerGames)
        .where(
          and(
            eq(
              PublicSchema.matchupPlayerGames.matchupPlayerId,
              matchupPlayer.id,
            ),
            isNotNull(PublicSchema.matchupPlayerGames.gameIdentifier),
          ),
        );

      const startsAlreadySelected = Number(existingStarts[0]?.count ?? 0);

      if (
        !shouldSelectSpGame(
          spStartsPerMatchup,
          startsAlreadySelected,
          gamesRemainingInMatchup,
        )
      ) {
        LOGGER.debug(
          `SP player ${matchupPlayer.playerId} skipped for game ${gameNumber} ` +
            `(starts=${startsAlreadySelected}/${spStartsPerMatchup}, ` +
            `remaining=${gamesRemainingInMatchup})`,
        );

        // Insert a record with null gameIdentifier and spSkipped=true to indicate intentional skip
        await db.insert(PublicSchema.matchupPlayerGames).values({
          gameNum: gameNumber,
          matchupPlayerId: matchupPlayer.id,
          gameIdentifier: null,
          fieldingGamePos: null,
          statsLoadingStatus: 'completed',
          spSkipped: true,
        });
        continue;
      }
    }

    LOGGER.debug(
      `Selecting game for player ${matchupPlayer.playerId} ` +
        `(role=${pitcherRole}) using season ${playerSeason}`,
    );

    // Select a real game for this player using game_identifier
    const result = await selectGamesForMatchupPlayer(
      db,
      matchupPlayer.id,
      matchupPlayer.playerId,
      playerSeason,
      pitcherRole,
    );

    // Insert the selected game into the database
    await db.insert(PublicSchema.matchupPlayerGames).values({
      gameNum: gameNumber,
      matchupPlayerId: matchupPlayer.id,
      gameIdentifier: result.gameIdentifier,
      fieldingGamePos: result.fieldingGamePos,
      // Set status based on whether stats are cached
      statsLoadingStatus: result.statsAreCached ? 'completed' : 'pending',
    });

    LOGGER.debug(
      `Inserted game selection for matchup player ${matchupPlayer.id}, game ${gameNumber} ` +
        `(gameIdentifier=${result.gameIdentifier}, cached=${result.statsAreCached}, role=${pitcherRole})`,
    );

    // Track players that need stats loading
    if (!result.statsAreCached) {
      playersNeedingStatsLoading.push({
        matchupPlayerId: matchupPlayer.id,
        playerId: matchupPlayer.playerId,
        season: playerSeason,
        fieldingGamePos: result.fieldingGamePos,
      });
    }
  }

  // If all players had cached stats, set matchup to completed immediately
  if (playersNeedingStatsLoading.length === 0) {
    await db
      .update(PublicSchema.matchups)
      .set({ statsLoadingStatus: 'completed' })
      .where(eq(PublicSchema.matchups.id, matchupId));

    LOGGER.info(
      `All stats cached for matchup ${matchupId}, game ${gameNumber}. Set to completed.`,
    );
  }

  LOGGER.info(
    `Completed game selection for matchup ${matchupId}, game ${gameNumber}. ` +
      `${playersNeedingStatsLoading.length} players need stats loading.`,
  );

  return { playersNeedingStatsLoading };
}
