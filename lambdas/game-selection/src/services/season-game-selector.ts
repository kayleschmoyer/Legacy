import {
  getMatchupPlayerGameStats,
  getScoringMultipliersForLeague,
  PublicDb,
  PublicSchema,
  updateMatchupScore,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import {
  calculateMatchupScore,
  getDefaultScoringSettings,
  type PlayerGameStats,
  type ScoringSettings,
} from '@legacy-sports/scoring';
import { cryptoRandomFloat, cryptoRandomInt } from '@legacy-sports/utils';
import {
  and,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';

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
 * Calculate and persist matchup scores using already-cached player game stats.
 *
 * Called from the "all stats cached" path in selectGamesForMatchup so that
 * team1Score / team2Score are written to the matchups row *before*
 * statsLoadingStatus is set to 'completed'. Without this, any consumer
 * polling statsLoadingStatus would see 'completed' while the scores are
 * still null — the same race condition fixed by LS-3817 for the uncached path.
 */
async function computeAndPersistMatchupScores(
  db: PublicDb,
  matchupId: number,
  leagueId: number,
  team1Id: number | null,
  team2Id: number | null,
  gamesPerMatchup: number | null,
): Promise<void> {
  try {
    const rawMultipliers = await getScoringMultipliersForLeague(db, leagueId);
    const toCamelCase = (
      record: Record<string, number>,
    ): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(record)) {
        out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
      }
      return out;
    };
    const scoringSettings: ScoringSettings = rawMultipliers
      ? {
          batting: toCamelCase(rawMultipliers.batting),
          pitching: toCamelCase(rawMultipliers.pitching),
          fielding: toCamelCase(rawMultipliers.fielding),
        }
      : getDefaultScoringSettings();

    const statsRows = await getMatchupPlayerGameStats(db, matchupId);
    const team1Stats = new Map<number, PlayerGameStats[]>();
    const team2Stats = new Map<number, PlayerGameStats[]>();

    for (const stat of statsRows) {
      const entry: PlayerGameStats = {
        playerId: stat.playerId,
        season: stat.season,
        gameNum: stat.gameNum,
        batting: stat.battingStats
          ? {
              pa: stat.battingStats.pa,
              ab: stat.battingStats.ab,
              r: stat.battingStats.r,
              h: stat.battingStats.h,
              doubles: stat.battingStats.doubles,
              triples: stat.battingStats.triples,
              hr: stat.battingStats.hr,
              rbi: stat.battingStats.rbi,
              sb: stat.battingStats.sb,
              cs: stat.battingStats.cs,
              bb: stat.battingStats.bb,
              so: stat.battingStats.so,
              gidp: stat.battingStats.gidp,
              hbp: stat.battingStats.hbp,
              sh: stat.battingStats.sh,
              sf: stat.battingStats.sf,
              ibb: stat.battingStats.ibb,
            }
          : undefined,
        pitching: stat.pitchingStats
          ? {
              w: stat.pitchingStats.w,
              l: stat.pitchingStats.l,
              gs: stat.pitchingStats.gs,
              gf: stat.pitchingStats.gf,
              cg: stat.pitchingStats.cg,
              sho: stat.pitchingStats.sho,
              sv: stat.pitchingStats.sv,
              ip: stat.pitchingStats.ip,
              h: stat.pitchingStats.h,
              r: stat.pitchingStats.r,
              er: stat.pitchingStats.er,
              hr: stat.pitchingStats.hr,
              bb: stat.pitchingStats.bb,
              ibb: stat.pitchingStats.ibb,
              so: stat.pitchingStats.so,
              hbp: stat.pitchingStats.hbp,
              battersFaced: stat.pitchingStats.battersFaced,
              outsRecorded: stat.pitchingStats.outsRecorded,
            }
          : undefined,
        fielding: stat.fieldingStats
          ? {
              innDef: stat.fieldingStats.innDef,
              chances: stat.fieldingStats.chances,
              po: stat.fieldingStats.po,
              a: stat.fieldingStats.a,
              eDef: stat.fieldingStats.eDef,
              dpDef: stat.fieldingStats.dpDef,
            }
          : undefined,
      };

      if (stat.teamId === team1Id) {
        const existing = team1Stats.get(stat.playerId);
        if (existing) existing.push(entry);
        else team1Stats.set(stat.playerId, [entry]);
      } else if (stat.teamId === team2Id) {
        const existing = team2Stats.get(stat.playerId);
        if (existing) existing.push(entry);
        else team2Stats.set(stat.playerId, [entry]);
      }
    }

    const scores = calculateMatchupScore(
      matchupId,
      team1Id,
      team2Id,
      team1Stats,
      team2Stats,
      gamesPerMatchup ?? 5,
      scoringSettings,
    );

    await updateMatchupScore(
      db,
      matchupId,
      scores.team1Score?.totalScore ?? null,
      scores.team2Score?.totalScore ?? null,
    );

    LOGGER.info(
      `Calculated scores for matchup ${matchupId} (all-cached path)`,
      {
        team1Score: scores.team1Score?.totalScore ?? null,
        team2Score: scores.team2Score?.totalScore ?? null,
      },
    );
  } catch (err) {
    LOGGER.error(
      `Failed to calculate scores for matchup ${matchupId} (all-cached path)`,
      err instanceof Error ? err : new Error(String(err)),
      { matchupId },
    );
    throw err;
  }
}

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
    ne(PublicSchema.gameBatting.gameIdentifier, ''),
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

    // For RP, include games where gs=0 OR gs IS NULL.
    // Historical game logs (pre-1973) may not have the player_game_span column parsed,
    // leaving gs=NULL even for legitimate relief appearances.
    const gsCondition =
      pitcherRole === 'RP'
        ? or(
            eq(PublicSchema.gamePitching.gs, 0),
            isNull(PublicSchema.gamePitching.gs),
          )
        : eq(PublicSchema.gamePitching.gs, gsValue);

    // Use EXISTS subquery instead of JOIN + DISTINCT for better planner optimization
    const availableGames = await db
      .select({
        gameIdentifier: PublicSchema.gameBatting.gameIdentifier,
      })
      .from(PublicSchema.gameBatting)
      .where(
        and(
          ...battingConditions,
          exists(
            db
              .select({ _: sql`1` })
              .from(PublicSchema.gamePitching)
              .where(
                and(
                  eq(
                    PublicSchema.gamePitching.playerId,
                    PublicSchema.gameBatting.playerId,
                  ),
                  eq(
                    PublicSchema.gamePitching.gameIdentifier,
                    PublicSchema.gameBatting.gameIdentifier,
                  ),
                  eq(
                    PublicSchema.gamePitching.season,
                    PublicSchema.gameBatting.season,
                  ),
                  gsCondition,
                ),
              ),
          ),
        ),
      );

    if (availableGames.length === 0) {
      LOGGER.warn(
        `No available ${pitcherRole} games (GS=${gsValue}) for player ${playerId} season ${season}`,
      );
      return null;
    }

    const randomIndex = cryptoRandomInt(availableGames.length);
    return availableGames[randomIndex].gameIdentifier;
  }

  // Non-pitcher: select from all games
  const availableGames = await db
    .select({ gameIdentifier: PublicSchema.gameBatting.gameIdentifier })
    .from(PublicSchema.gameBatting)
    .where(and(...battingConditions));

  if (availableGames.length === 0) {
    return null;
  }

  const randomIndex = cryptoRandomInt(availableGames.length);
  return availableGames[randomIndex].gameIdentifier;
}

/**
 * Select a random game_identifier directly from game_pitching (no batting join).
 * Used for DH-era pitchers who have no game_batting rows.
 *
 * - SP: only games where GS = 1
 * - RP: games where GS = 0 OR GS IS NULL (NULL handles historical data with unparsed spans)
 */
async function selectGameIdentifierFromPitching(
  db: PublicDb,
  playerId: number,
  season: number,
  excludeGameIdentifiers: string[],
  pitcherRole: 'SP' | 'RP',
): Promise<string | null> {
  const conditions = [
    eq(PublicSchema.gamePitching.playerId, playerId),
    eq(PublicSchema.gamePitching.season, season),
    ne(PublicSchema.gamePitching.gameIdentifier, ''),
  ];

  if (excludeGameIdentifiers.length > 0) {
    conditions.push(
      notInArray(
        PublicSchema.gamePitching.gameIdentifier,
        excludeGameIdentifiers,
      ),
    );
  }

  const gsCondition =
    pitcherRole === 'RP'
      ? or(
          eq(PublicSchema.gamePitching.gs, 0),
          isNull(PublicSchema.gamePitching.gs),
        )
      : eq(PublicSchema.gamePitching.gs, 1);

  const availableGames = await db
    .select({
      gameIdentifier: PublicSchema.gamePitching.gameIdentifier,
    })
    .from(PublicSchema.gamePitching)
    .where(and(...conditions, gsCondition));

  if (availableGames.length === 0) {
    return null;
  }

  const randomIndex = cryptoRandomInt(availableGames.length);
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
 * - RP: only games where GS=0 or GS IS NULL are eligible (NULL covers historical data
 *   where the game_span column was unparseable)
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
    // For pitchers in the DH era (post-1972 AL, post-1997 interleague, post-2022 NL),
    // batting stats may not exist. Fall back to checking gamePitching so we can
    // treat the stats as cached and select a game from the pitching log.
    if (pitcherRole === 'SP' || pitcherRole === 'RP') {
      const pitchingCheck = await db
        .select({ gameIdentifier: PublicSchema.gamePitching.gameIdentifier })
        .from(PublicSchema.gamePitching)
        .where(
          and(
            eq(PublicSchema.gamePitching.playerId, playerId),
            eq(PublicSchema.gamePitching.season, season),
          ),
        )
        .limit(1);

      if (pitchingCheck.length === 0) {
        LOGGER.info(
          `No cached stats for pitcher ${playerId} season ${season}. Stats loading needed.`,
        );
        return {
          gameIdentifier: null,
          fieldingGamePos: fieldingPos,
          statsAreCached: false,
        };
      }

      // Pitching stats are cached — select a game directly from game_pitching
      LOGGER.info(
        `Player ${playerId} season ${season} has no batting stats; selecting game from pitching log (DH-era pitcher).`,
      );
      const usedGames = await db
        .select({
          gameIdentifier: PublicSchema.matchupPlayerGames.gameIdentifier,
        })
        .from(PublicSchema.matchupPlayerGames)
        .where(
          and(
            eq(
              PublicSchema.matchupPlayerGames.matchupPlayerId,
              matchupPlayerId,
            ),
            isNotNull(PublicSchema.matchupPlayerGames.gameIdentifier),
          ),
        );

      const excludeIds = usedGames
        .map((g) => g.gameIdentifier)
        .filter((id): id is string => id !== null);

      const gameIdentifier = await selectGameIdentifierFromPitching(
        db,
        playerId,
        season,
        excludeIds,
        pitcherRole,
      );

      if (!gameIdentifier) {
        // All unique games exhausted — recycle from the full pool (no exclusions).
        // A repeated game is acceptable; returning statsAreCached: true with a
        // null/empty identifier would violate the invariant that cached selections
        // have a real game_identifier (LS-3774).
        LOGGER.warn(
          `No available ${pitcherRole} games for pitcher ${playerId} season ${season} (${excludeIds.length} already used); recycling from full pool`,
        );
        const recycled = await selectGameIdentifierFromPitching(
          db,
          playerId,
          season,
          [],
          pitcherRole,
        );
        // Guard: if the full pool is also empty, fall back to the pending-load
        // path (statsAreCached: false) to avoid returning a cached selection
        // without a valid game_identifier.
        if (!recycled) {
          LOGGER.warn(
            `Full pool also empty for pitcher ${playerId} season ${season}; falling back to stats load`,
          );
          return {
            gameIdentifier: null,
            fieldingGamePos: fieldingPos,
            statsAreCached: false,
          };
        }
        return {
          gameIdentifier: recycled,
          fieldingGamePos: fieldingPos,
          statsAreCached: true,
        };
      }

      return {
        gameIdentifier,
        fieldingGamePos: fieldingPos,
        statsAreCached: true,
      };
    }

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
    // All unique games exhausted — recycle from the full pool (no exclusions).
    // A repeated game is acceptable; returning statsAreCached: true with a
    // null/empty identifier would violate the invariant that cached selections
    // have a real game_identifier (LS-3774).
    LOGGER.warn(
      `No available games left for player ${playerId} season ${season} (${excludeIds.length} already used); recycling from full pool`,
    );
    const recycled = await selectGameIdentifier(
      db,
      playerId,
      season,
      [],
      pitcherRole,
    );
    // Guard: if the full pool is also empty, fall back to the pending-load
    // path (statsAreCached: false) to avoid returning a cached selection
    // without a valid game_identifier.
    if (!recycled) {
      LOGGER.warn(
        `Full pool also empty for player ${playerId} season ${season}; falling back to stats load`,
      );
      return {
        gameIdentifier: null,
        fieldingGamePos: fieldingPos,
        statsAreCached: false,
      };
    }
    return {
      gameIdentifier: recycled,
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
 * Batch-load pitcher roles for multiple players in one query.
 * Issues a single IN-clause JOIN instead of one query per pitcher, reducing N separate
 * round-trips to a single query for all pitchers in the matchup.
 * Returns a Map<playerId, PitcherRole>; players not found default to 'non-pitcher'.
 */
async function batchGetPlayerPitcherRoles(
  db: PublicDb,
  playerIds: number[],
  leagueId: number,
): Promise<Map<number, PitcherRole>> {
  if (playerIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      playerId: PublicSchema.teamMembers.playerId,
      positionType: PublicSchema.leaguePosition.positionType,
    })
    .from(PublicSchema.teamMembers)
    .innerJoin(
      PublicSchema.leaguePosition,
      eq(PublicSchema.teamMembers.positionId, PublicSchema.leaguePosition.id),
    )
    .where(
      and(
        inArray(PublicSchema.teamMembers.playerId, playerIds),
        eq(PublicSchema.teamMembers.leagueId, leagueId),
      ),
    );

  const roleMap = new Map<number, PitcherRole>();
  for (const row of rows) {
    const posType = row.positionType;
    let role: PitcherRole = 'non-pitcher';
    if (posType === 'SP') role = 'SP';
    else if (posType === 'RP') role = 'RP';
    roleMap.set(row.playerId, role);
  }
  return roleMap;
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
  const roll = cryptoRandomFloat();
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

  // Batch-load pitcher roles for all matchup players in one query instead of N per-pitcher queries
  const allPlayerIds = matchupPlayers.map((mp) => mp.playerId);
  const pitcherRoleMap = await batchGetPlayerPitcherRoles(
    db,
    allPlayerIds,
    matchup.leagueId,
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
      // A player can legitimately have no season when they were added via
      // waivers mid-week but have insufficient historical game data to assign
      // a season. Skip game selection for them rather than crashing the entire
      // matchup — they will simply contribute no stats for this matchup.
      LOGGER.warn(
        `No season assigned for player ${matchupPlayer.playerId} in league ${matchup.leagueId}, week ${matchup.weekNumber} — skipping game selection`,
      );
      continue;
    }

    // Determine the player's pitcher role from the pre-loaded map (batched query above)
    const pitcherRole =
      pitcherRoleMap.get(matchupPlayer.playerId) ?? 'non-pitcher';

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

  // If all players had cached stats, calculate scores then mark completed.
  // Scores must be persisted before statsLoadingStatus = 'completed' so that
  // any consumer polling that field sees non-null scores immediately — the
  // same ordering guarantee enforced by LS-3817 in the uncached (stats-lambda)
  // path.
  if (playersNeedingStatsLoading.length === 0) {
    await computeAndPersistMatchupScores(
      db,
      matchupId,
      matchup.leagueId,
      matchup.team1Id,
      matchup.team2Id,
      matchup.gamesPerMatchup,
    );

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
