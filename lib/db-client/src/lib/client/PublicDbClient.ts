import { and, asc, eq, inArray, lte, not, sql } from 'drizzle-orm';
import { conflictUpdateAllExcept } from './utils/ConflictUpdateAllExcept';
import { TakeUniqueOrNull } from './utils/TakeUniqueOrThrow';
import { GenericDatabase } from './abstract/BaseDbClient';
import {
  AggregateSeasonBatting,
  AggregateSeasonFieldingByPos,
  AggregateSeasonPitching,
  CareerBatting,
  CareerFielding,
  CareerPitching,
  CreateMatchupPlayer,
  CreatePlayerInput,
  LeagueScoringPositionBonus,
  LeagueScoringProfile,
  LeagueScoringProfileEntry,
  Matchup,
  MatchupPlayer,
  Player,
  PlayerEligiblePosition,
  ScoringStatDefinition,
  SeasonBatting,
  SeasonFielding,
  SeasonPitching,
} from '../../types/DatabaseTypes';
import { LeagueScoringMultipliers } from '../../types/ScoringTypes';
import * as Schema from '../../drizzle/public/schema';

export const PublicSchema = Schema;

export type PublicDb = GenericDatabase<typeof Schema>;

export interface LeagueScoringMultiplierUpdateInput {
  statDefinitionId: number;
  multiplier?: number | null;
  isEnabled?: boolean | null;
}

export interface LeagueScoringPositionBonusUpdateInput {
  statDefinitionId: number;
  position: string;
  bonusMultiplier?: number | null;
  isEnabled?: boolean | null;
}

export async function getPlayerByBrefId(
  db: PublicDb,
  brefId: string,
): Promise<Player | null> {
  return await db
    .select()
    .from(Schema.players)
    .where(eq(Schema.players.brefId, brefId))
    .then(TakeUniqueOrNull);
}

export async function getCareerBattingStatsForPlayer(
  db: PublicDb,
  playerId: number,
): Promise<CareerBatting | null> {
  return await db
    .select()
    .from(Schema.careerBatting)
    .where(eq(Schema.careerBatting.playerId, playerId))
    .then(TakeUniqueOrNull);
}

export async function getCareerFieldingStatsForPlayer(
  db: PublicDb,
  playerId: number,
): Promise<CareerFielding | null> {
  return await db
    .select()
    .from(Schema.careerFielding)
    .where(eq(Schema.careerFielding.playerId, playerId))
    .then(TakeUniqueOrNull);
}

export async function getCareerPitchingStatsForPlayer(
  db: PublicDb,
  playerId: number,
): Promise<CareerPitching | null> {
  return await db
    .select()
    .from(Schema.careerPitching)
    .where(eq(Schema.careerPitching.playerId, playerId))
    .then(TakeUniqueOrNull);
}

export async function getAllPlayers(db: PublicDb): Promise<Player[]> {
  return await db.select().from(Schema.players);
}

export async function getPlayersOnTeams(db: PublicDb): Promise<Player[]> {
  const subSelect = db
    .select({
      playerId: Schema.teamMembers.playerId,
    })
    .from(Schema.teamMembers);

  return await db
    .select()
    .from(Schema.players)
    .where(inArray(Schema.players.id, subSelect));
}

export async function bulkUpsertBattingSeason(
  db: PublicDb,
  season: SeasonBatting[],
): Promise<SeasonBatting[]> {
  if (season.length === 0) {
    return [];
  }

  return await db
    .insert(Schema.seasonBatting)
    .values(season)
    .onConflictDoUpdate({
      set: conflictUpdateAllExcept(Schema.seasonBatting, [
        'playerId',
        'season',
        'team',
        'rowId',
      ]),
      target: [
        Schema.seasonBatting.playerId,
        Schema.seasonBatting.season,
        Schema.seasonBatting.team,
        Schema.seasonBatting.rowId,
      ],
    })
    .returning();
}

export async function bulkUpsertFieldingSeason(
  db: PublicDb,
  season: SeasonFielding[],
): Promise<SeasonFielding[]> {
  if (season.length === 0) {
    return [];
  }

  return await db
    .insert(Schema.seasonFielding)
    .values(season)
    .onConflictDoUpdate({
      set: conflictUpdateAllExcept(Schema.seasonFielding, [
        'playerId',
        'season',
        'team',
        'pos',
        'rowId',
      ]),
      target: [
        Schema.seasonFielding.playerId,
        Schema.seasonFielding.season,
        Schema.seasonFielding.team,
        Schema.seasonFielding.pos,
        Schema.seasonFielding.rowId,
      ],
    })
    .returning();
}

export async function bulkUpsertPitchingSeason(
  db: PublicDb,
  season: SeasonPitching[],
): Promise<SeasonPitching[]> {
  if (season.length === 0) {
    return [];
  }

  return await db
    .insert(Schema.seasonPitching)
    .values(season)
    .onConflictDoUpdate({
      set: conflictUpdateAllExcept(Schema.seasonPitching, [
        'playerId',
        'season',
        'team',
        'rowId',
      ]),
      target: [
        Schema.seasonPitching.playerId,
        Schema.seasonPitching.season,
        Schema.seasonPitching.team,
        Schema.seasonPitching.rowId,
      ],
    })
    .returning();
}

/**
 * Write a player's per-season awards (Lahman AwardsPlayers, via the
 * mlb_season_award_summaries view) into season_batting and
 * season_pitching.award_summary (LS-10674). Run after the season upserts so a
 * re-load keeps the awards. Seasons with no Lahman award are left untouched.
 */
export async function syncSeasonAwardSummaries(
  db: PublicDb,
  playerId: number,
): Promise<void> {
  for (const table of [Schema.seasonBatting, Schema.seasonPitching]) {
    await db.execute(sql`
      UPDATE ${table} AS s
      SET award_summary = a.award_summary
      FROM ${Schema.mlbSeasonAwardSummaries} AS a
      JOIN ${Schema.players} AS p ON p.bref_id = a.bref_id
      WHERE p.id = ${playerId}
        AND s.player_id = p.id
        AND s.season = a.season
        AND s.award_summary IS DISTINCT FROM a.award_summary
    `);
  }
}

/**
 * Refresh the career_batting, career_fielding, career_pitching and
 * career_pitching_appearances materialized views.
 *
 * Should be called once per SQS batch after career stats have been written to the
 * underlying season_batting / season_fielding / season_pitching base tables.
 * Must be called BEFORE refreshPlayerEligiblePositions, which reads from
 * career_batting and career_pitching.
 *
 * CONCURRENTLY allows reads to continue during refresh; it requires the unique
 * indexes created by migration 20260303_120000 to already exist.
 */
export async function refreshCareerStats(db: PublicDb): Promise<void> {
  await db.execute(
    sql`REFRESH MATERIALIZED VIEW CONCURRENTLY public.career_batting`,
  );
  await db.execute(
    sql`REFRESH MATERIALIZED VIEW CONCURRENTLY public.career_fielding`,
  );
  await db.execute(
    sql`REFRESH MATERIALIZED VIEW CONCURRENTLY public.career_pitching`,
  );
  await db.execute(
    sql`REFRESH MATERIALIZED VIEW CONCURRENTLY public.career_pitching_appearances`,
  );
}

/**
 * Refresh the player_eligible_positions materialized view.
 *
 * Should be called once after a bulk stats-load run (not per-player) so the
 * draft picker always sees up-to-date eligibility data.
 *
 * CONCURRENTLY allows reads to continue during the refresh; it requires the
 * unique index created by migration 20260302_120000 to already exist.
 *
 * Must be called AFTER refreshCareerStats since player_eligible_positions reads
 * from the career_batting and career_pitching materialized views.
 */
export async function refreshPlayerEligiblePositions(
  db: PublicDb,
): Promise<void> {
  await db.execute(
    sql`REFRESH MATERIALIZED VIEW CONCURRENTLY public.player_eligible_positions`,
  );
}

/**
 * Refresh the football_player_eligible_positions materialized view (LS-10553).
 *
 * Call once after a run that writes its inputs — players.position / is_dst
 * (football player import) or career_football_passing / career_football_kicking
 * (football career-stats load) — not per player.
 *
 * CONCURRENTLY allows reads to continue during the refresh; it requires the
 * unique index created by migration 20261004_120000 to already exist.
 */
export async function refreshFootballPlayerEligiblePositions(
  db: PublicDb,
): Promise<void> {
  await db.execute(
    sql`REFRESH MATERIALIZED VIEW CONCURRENTLY public.football_player_eligible_positions`,
  );
}

/**
 * ANALYZE the season stat tables so planner stats are fresh after a bulk
 * stats-load run (LS-10554).
 *
 * Call once after the run, not per player. Autovacuum only revisits a table
 * once its pgstat modification counters cross a threshold, and those counters
 * are lost on a stats reset, so a bulk load must not rely on it alone.
 */
export async function analyzeSeasonStatTables(db: PublicDb): Promise<void> {
  await db.execute(
    sql`ANALYZE public.season_batting, public.season_fielding, public.season_pitching`,
  );
}

/**
 * Refresh the player_scoring_cache table for a given league (or the default
 * NULL baseline).
 *
 * Pass leagueId = null  → recompute default rows (used after career stat refresh)
 * Pass leagueId = X     → recompute only rows for league X (used after scoring
 *                         profile update)
 *
 * Calls the DB-side refresh_player_scoring_cache() PL/pgSQL function which
 * does a DELETE + INSERT from compute_career_scores() internally.
 */
export async function refreshPlayerScoringCache(
  db: PublicDb,
  leagueId: number | null = null,
): Promise<void> {
  await db.execute(
    sql`SELECT public.refresh_player_scoring_cache(${leagueId})`,
  );
}

/**
 * Refresh the football_player_scoring_cache table for a given league (or the
 * default NULL baseline). Football's analog of refreshPlayerScoringCache
 * (LS-9484) — a separate table/function pair, not the same underlying cache;
 * see the migration header for why they can't share one.
 *
 * Pass leagueId = null  → recompute default rows
 * Pass leagueId = X     → recompute only rows for league X (used after a
 *                         football league's scoring profile/position bonus
 *                         update)
 */
export async function refreshFootballPlayerScoringCache(
  db: PublicDb,
  leagueId: number | null = null,
): Promise<void> {
  await db.execute(
    sql`SELECT public.refresh_football_player_scoring_cache(${leagueId})`,
  );
}

export async function bulkCreatePlayers(
  db: PublicDb,
  players: CreatePlayerInput[],
): Promise<Player[]> {
  if (players.length === 0) {
    return [];
  }

  return await db
    .insert(Schema.players)
    .values(players)
    .onConflictDoNothing({
      target: [Schema.players.brefId],
    })
    .returning();
}

export function getPositionsForPlayer(
  db: PublicDb,
  playerId: number,
): Promise<PlayerEligiblePosition[]> {
  return db
    .select()
    .from(Schema.playerEligiblePositions)
    .where(eq(Schema.playerEligiblePositions.playerId, playerId));
}

export function getMatchupForLeague(
  db: PublicDb,
  leagueId: number,
  weekId: number,
): Promise<Matchup | null> {
  return db
    .select()
    .from(Schema.matchups)
    .where(
      and(
        eq(Schema.matchups.leagueId, leagueId),
        eq(Schema.matchups.weekNumber, weekId),
      ),
    )
    .then(TakeUniqueOrNull);
}

export function getPlayersForLeague(
  db: PublicDb,
  leagueId: number,
): Promise<Player[]> {
  const subQuery = db
    .select()
    .from(Schema.teamMembers)
    .where(eq(Schema.teamMembers.leagueId, leagueId))
    .as('TeamMembersForLeague');

  return db
    .select()
    .from(Schema.players)
    .where(inArray(Schema.players.id, subQuery.playerId));
}

export function getSeasonBattingStatsForPlayer(
  db: PublicDb,
  playerId: number,
): Promise<SeasonBatting[]> {
  return db
    .select()
    .from(Schema.seasonBatting)
    .where(eq(Schema.seasonBatting.playerId, playerId));
}

export function getSeasonBattingStatsForPlayerSeason(
  db: PublicDb,
  playerId: number,
  season: number,
): Promise<AggregateSeasonBatting | null> {
  return db
    .select()
    .from(Schema.aggregateSeasonBatting)
    .where(
      and(
        eq(Schema.aggregateSeasonBatting.playerId, playerId),
        eq(Schema.aggregateSeasonBatting.season, season),
      ),
    )
    .then(TakeUniqueOrNull);
}

export function getSeasonPitchingStatsForPlayerSeason(
  db: PublicDb,
  playerId: number,
  season: number,
): Promise<AggregateSeasonPitching | null> {
  return db
    .select()
    .from(Schema.aggregateSeasonPitching)
    .where(
      and(
        eq(Schema.aggregateSeasonPitching.playerId, playerId),
        eq(Schema.aggregateSeasonPitching.season, season),
      ),
    )
    .then(TakeUniqueOrNull);
}

export function getSeasonFieldingStatsForPlayerSeason(
  db: PublicDb,
  playerId: number,
  season: number,
): Promise<AggregateSeasonFieldingByPos[]> {
  return db
    .select()
    .from(Schema.aggregateSeasonFieldingByPos)
    .where(
      and(
        eq(Schema.aggregateSeasonFieldingByPos.playerId, playerId),
        eq(Schema.aggregateSeasonFieldingByPos.season, season),
      ),
    );
}

export async function getMissingMatchupRecords(
  db: PublicDb,
  matchupId: number,
): Promise<Array<Player & { teamId: number }>> {
  const populatedMatchups = db
    .select({
      playerId: Schema.matchupPlayers.playerId,
    })
    .from(Schema.matchupPlayers)
    .where(eq(Schema.matchupPlayers.matchupId, matchupId));

  const results = await db
    .select({
      id: Schema.players.id,
      firstName: Schema.players.firstName,
      lastName: Schema.players.lastName,
      brefId: Schema.players.brefId,
      statsLastFetchedAt: Schema.players.statsLastFetchedAt,
      teamId: Schema.teamMembers.teamId,
    })
    .from(Schema.players)
    .innerJoin(
      Schema.teamMembers,
      eq(Schema.players.id, Schema.teamMembers.playerId),
    )
    .innerJoin(
      Schema.matchups,
      eq(Schema.matchups.leagueId, Schema.teamMembers.leagueId),
    )
    .where(
      and(
        eq(Schema.matchups.id, matchupId),
        not(inArray(Schema.players.id, populatedMatchups)),
      ),
    );

  // Filter out any records where teamId is null (shouldn't happen with inner join, but for type safety)
  return results.filter(
    (r): r is Player & { teamId: number } => r.teamId !== null,
  );
}

export async function createMatchupRecord(
  db: PublicDb,
  record: CreateMatchupPlayer,
): Promise<MatchupPlayer | undefined> {
  const [result] = await db
    .insert(Schema.matchupPlayers)
    .values(record)
    .onConflictDoNothing({
      target: [
        Schema.matchupPlayers.matchupId,
        Schema.matchupPlayers.playerId,
        Schema.matchupPlayers.teamId,
      ],
    })
    .returning();
  return result;
}

export function getMatchup(
  db: PublicDb,
  leagueId: number,
  week: number,
): Promise<Matchup | null> {
  return db
    .select()
    .from(Schema.matchups)
    .where(
      and(
        eq(Schema.matchups.leagueId, leagueId),
        eq(Schema.matchups.weekNumber, week),
      ),
    )
    .then(TakeUniqueOrNull);
}

// Matchup query functions
export async function getMatchupById(
  db: PublicDb,
  matchupId: number,
): Promise<Matchup | null> {
  return await db
    .select()
    .from(Schema.matchups)
    .where(eq(Schema.matchups.id, matchupId))
    .then(TakeUniqueOrNull);
}

export async function getMatchupsForLeague(
  db: PublicDb,
  leagueId: number,
  weekNumber?: number,
): Promise<Matchup[]> {
  const conditions = [eq(Schema.matchups.leagueId, leagueId)];

  if (weekNumber !== undefined) {
    conditions.push(eq(Schema.matchups.weekNumber, weekNumber));
  }

  return await db
    .select()
    .from(Schema.matchups)
    .where(and(...conditions));
}

export async function getCurrentWeekForLeague(
  db: PublicDb,
  leagueId: number,
): Promise<number | null> {
  // Prefer the authoritative currentWeek column; fall back to resolving
  // week number via the legacy currentMatchup FK.
  const leagueResults = await db
    .select({
      currentWeek: Schema.leagues.currentWeek,
      currentMatchup: Schema.leagues.currentMatchup,
    })
    .from(Schema.leagues)
    .where(eq(Schema.leagues.id, leagueId))
    .limit(1);

  const leagueRow = leagueResults[0];
  if (!leagueRow) return null;

  if (leagueRow.currentWeek != null) {
    return leagueRow.currentWeek;
  }

  if (leagueRow.currentMatchup) {
    const refMatchup = await db
      .select({ weekNumber: Schema.matchups.weekNumber })
      .from(Schema.matchups)
      .where(eq(Schema.matchups.id, leagueRow.currentMatchup))
      .limit(1);
    return refMatchup[0]?.weekNumber ?? null;
  }

  return null;
}

export async function createMatchup(
  db: PublicDb,
  input: {
    leagueId: number;
    weekNumber: number;
    team1Id?: number | null;
    team2Id?: number | null;
    gamesPerMatchup?: number | null;
    startTime?: string | null;
    endTime?: string | null;
  },
): Promise<Matchup> {
  const results = await db
    .insert(Schema.matchups)
    .values({
      leagueId: input.leagueId,
      weekNumber: input.weekNumber,
      team1Id: input.team1Id ?? null,
      team2Id: input.team2Id ?? null,
      gamesPerMatchup: input.gamesPerMatchup ?? null,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      status: 'scheduled',
    })
    .returning();

  if (!results[0]) {
    throw new Error('Failed to create matchup');
  }

  return results[0];
}

/**
 * Persist a matchup's computed score.
 *
 * This is the single write site for `matchups.team1_score` / `team2_score` on
 * the *scoring* paths — the baseball stats-lambda, the football stats-lambda,
 * the game-selection all-cached path and the commissioner recalculate tool all
 * funnel through here — so it is where scoring provenance is stamped (LS-9665).
 * Stamping here rather than inside the sport-specific scoring engines covers
 * both sports; the football handler computes its score with a different engine
 * but persists it through this function.
 *
 * The two writers that do *not* come through here both take a score as input
 * rather than computing one: the admin/system `updateMatchupScore` GraphQL
 * mutation (`matchups/mutations.ts`) and the commissioner's `editMatchupScore`
 * tool (`commissioner-tools.ts`). They stamp `scoredAt` inline for the same
 * reason a computed score does — the persisted value is current as of the
 * moment it was written, and leaving it unstamped would report it stale
 * forever.
 */
export async function updateMatchupScore(
  db: PublicDb,
  matchupId: number,
  team1Score?: number | null,
  team2Score?: number | null,
): Promise<Matchup> {
  const updateData: {
    team1Score?: string;
    team2Score?: string;
    scoredAt?: Date;
  } = {};

  if (team1Score !== null && team1Score !== undefined) {
    updateData.team1Score = team1Score.toString();
  }
  if (team2Score !== null && team2Score !== undefined) {
    updateData.team2Score = team2Score.toString();
  }

  // When both scores are null/undefined, updateData is empty and Drizzle's
  // .set({}) returns 0 rows — skip the update and return the existing row.
  // Nothing was scored, so nothing is stamped.
  if (Object.keys(updateData).length === 0) {
    const existing = await db
      .select()
      .from(Schema.matchups)
      .where(eq(Schema.matchups.id, matchupId))
      .then(TakeUniqueOrNull);
    if (!existing) {
      throw new Error(`Matchup ${matchupId} not found`);
    }
    return existing;
  }

  // A score was computed, so record when. Read by `Matchup.scoringIsStale`
  // (LS-9665) to tell a score computed under the current scoring settings from
  // one computed before they last changed.
  updateData.scoredAt = new Date();

  // Row-level lock (LS-6391): two scoring workers (e.g. a live tick and a
  // stat correction re-processing the same game) can call this for the same
  // matchupId at nearly the same time. Taking `SELECT ... FOR UPDATE` first
  // serializes the two writes instead of letting them interleave, and
  // `scoreVersion` is bumped in the same write so every writer of the score
  // columns keeps it meaningful for the admin/system GraphQL mutation's
  // optimistic-concurrency check.
  const matchup = await db.transaction(async (tx) => {
    const [lockedMatchup] = await tx
      .select({ scoreVersion: Schema.matchups.scoreVersion })
      .from(Schema.matchups)
      .where(eq(Schema.matchups.id, matchupId))
      .limit(1)
      .for('update');

    if (!lockedMatchup) {
      throw new Error(`Matchup ${matchupId} not found`);
    }

    const [updated] = await tx
      .update(Schema.matchups)
      .set({
        ...updateData,
        scoreVersion: lockedMatchup.scoreVersion + 1,
      })
      .where(eq(Schema.matchups.id, matchupId))
      .returning();

    return updated;
  });

  if (!matchup) {
    throw new Error(`Matchup ${matchupId} not found`);
  }

  return matchup;
}

export async function updateMatchupStatus(
  db: PublicDb,
  matchupId: number,
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'bye',
): Promise<Matchup> {
  const results = await db
    .update(Schema.matchups)
    .set({ status })
    .where(eq(Schema.matchups.id, matchupId))
    .returning();

  if (!results[0]) {
    throw new Error('Matchup not found');
  }

  return results[0];
}

/**
 * Get game-level stats for players in a matchup
 * Used for calculating matchup scores based on selected games
 */
export async function getMatchupPlayerGameStats(
  db: PublicDb,
  matchupId: number,
): Promise<
  {
    playerId: number;
    teamId: number | null;
    season: number;
    gameNum: number;
    battingStats: typeof Schema.gameBatting.$inferSelect | null;
    pitchingStats: typeof Schema.gamePitching.$inferSelect | null;
    fieldingStats: typeof Schema.gameFielding.$inferSelect | null;
  }[]
> {
  // First get matchup info to lookup league/week
  const matchupInfo = await db
    .select({
      leagueId: Schema.matchups.leagueId,
      weekNumber: Schema.matchups.weekNumber,
    })
    .from(Schema.matchups)
    .where(eq(Schema.matchups.id, matchupId))
    .limit(1);

  if (matchupInfo.length === 0) {
    return [];
  }

  const { leagueId, weekNumber } = matchupInfo[0];

  // Get matchup players and their selected games
  const matchupPlayersResult = await db
    .select({
      matchupPlayerId: Schema.matchupPlayers.id,
      playerId: Schema.matchupPlayers.playerId,
      season: Schema.leagueWeekPlayerSeasons.season,
      matchupId: Schema.matchupPlayers.matchupId,
      positionId: Schema.matchupPlayers.positionId,
    })
    .from(Schema.matchupPlayers)
    .leftJoin(
      Schema.leagueWeekPlayerSeasons,
      and(
        eq(Schema.leagueWeekPlayerSeasons.leagueId, leagueId),
        eq(Schema.leagueWeekPlayerSeasons.weekNumber, weekNumber),
        eq(
          Schema.leagueWeekPlayerSeasons.playerId,
          Schema.matchupPlayers.playerId,
        ),
      ),
    )
    .where(eq(Schema.matchupPlayers.matchupId, matchupId));

  if (matchupPlayersResult.length === 0) {
    return [];
  }

  const matchupPlayerIds = matchupPlayersResult.map((mp) => mp.matchupPlayerId);

  // Get selected games for these players
  const gamesResult = await db
    .select()
    .from(Schema.matchupPlayerGames)
    .where(
      inArray(Schema.matchupPlayerGames.matchupPlayerId, matchupPlayerIds),
    );

  // Build map of matchup player -> selected game identifiers.
  //
  // Keyed by matchupPlayerId rather than playerId (LS-9602). matchup_players is
  // unique on (matchup_id, player_id, team_id), so one player can legitimately
  // hold two rows in a matchup when they appear for both teams. Keying by
  // playerId merged those rows' game lists and silently kept only the first
  // row's season. Keying by the matchup_player row keeps each selection set —
  // and its own resolved season — separate.
  const matchupPlayerGamesMap = new Map<
    number,
    { playerId: number; season: number; gameIdentifiers: string[] }
  >();
  const matchupPlayerMap = new Map<
    number,
    { playerId: number; season: number }
  >();

  for (const mp of matchupPlayersResult) {
    if (mp.season === null) continue; // Skip if no season selected
    // Bench players do not score (LS-10681). matchup_players holds the whole
    // roster and game selection picks games for bench rows too, so without
    // this skip the persisted score summed starters AND bench while every
    // client view (and the roster's "Starters total") counts starters only.
    if (mp.positionId == null) continue;
    matchupPlayerMap.set(mp.matchupPlayerId, {
      playerId: mp.playerId,
      season: mp.season,
    });
  }

  for (const game of gamesResult) {
    const mpInfo = matchupPlayerMap.get(game.matchupPlayerId);
    if (!mpInfo) continue;

    const gameId = game.gameIdentifier;
    if (!gameId) continue;

    let playerGames = matchupPlayerGamesMap.get(game.matchupPlayerId);
    if (!playerGames) {
      playerGames = {
        playerId: mpInfo.playerId,
        season: mpInfo.season,
        gameIdentifiers: [],
      };
      matchupPlayerGamesMap.set(game.matchupPlayerId, playerGames);
    }
    playerGames.gameIdentifiers.push(gameId);
  }

  // Get team membership for players
  const matchup = await db
    .select()
    .from(Schema.matchups)
    .where(eq(Schema.matchups.id, matchupId))
    .then(TakeUniqueOrNull);

  if (!matchup) {
    throw new Error('Matchup not found');
  }

  const teamIds = [matchup.team1Id, matchup.team2Id].filter(
    (id): id is number => id !== null,
  );

  const teamMembersResult = await db
    .select()
    .from(Schema.teamMembers)
    .where(
      and(
        inArray(Schema.teamMembers.teamId, teamIds),
        eq(Schema.teamMembers.leagueId, matchup.leagueId),
      ),
    );

  const playerTeamMap = new Map<number, number>();
  for (const tm of teamMembersResult) {
    if (tm.teamId) {
      playerTeamMap.set(tm.playerId, tm.teamId);
    }
  }

  // Fetch game stats for all player/season/game combinations
  const results: {
    playerId: number;
    teamId: number | null;
    season: number;
    gameNum: number;
    battingStats: typeof Schema.gameBatting.$inferSelect | null;
    pitchingStats: typeof Schema.gamePitching.$inferSelect | null;
    fieldingStats: typeof Schema.gameFielding.$inferSelect | null;
  }[] = [];

  // Stat rows are a pure function of (playerId, season, gameIdentifier), so the
  // same game selected into several slots resolves to the same three rows. Cache
  // per lookup key: every slot still yields its own result entry (LS-9602), but
  // the query count stays one fetch per DISTINCT triple — the same number of
  // round trips this loop issued while it was deduping.
  const statsCache = new Map<
    string,
    {
      batting: typeof Schema.gameBatting.$inferSelect | null;
      pitching: typeof Schema.gamePitching.$inferSelect | null;
      fielding: typeof Schema.gameFielding.$inferSelect | null;
    }
  >();

  for (const {
    playerId,
    season,
    gameIdentifiers,
  } of matchupPlayerGamesMap.values()) {
    // No dedupe: LS-9534 decided one real game may legitimately fill multiple
    // slots of a matchup, so a game in N slots must contribute N times.
    for (const gameIdentifier of gameIdentifiers) {
      const cacheKey = `${playerId}_${season}_${gameIdentifier}`;
      const cached = statsCache.get(cacheKey);
      if (cached) {
        results.push({
          playerId,
          teamId: playerTeamMap.get(playerId) ?? null,
          season,
          gameNum: cached.batting?.gameNum ?? 0,
          battingStats: cached.batting,
          pitchingStats: cached.pitching,
          fieldingStats: cached.fielding,
        });
        continue;
      }

      const battingRows = await db
        .select()
        .from(Schema.gameBatting)
        .where(
          and(
            eq(Schema.gameBatting.playerId, playerId),
            eq(Schema.gameBatting.season, season),
            eq(Schema.gameBatting.gameIdentifier, gameIdentifier),
          ),
        )
        .orderBy(asc(Schema.gameBatting.gameNum))
        .limit(1);
      const batting = battingRows[0] ?? null;

      const pitchingRows = await db
        .select()
        .from(Schema.gamePitching)
        .where(
          and(
            eq(Schema.gamePitching.playerId, playerId),
            eq(Schema.gamePitching.season, season),
            eq(Schema.gamePitching.gameIdentifier, gameIdentifier),
          ),
        )
        .orderBy(asc(Schema.gamePitching.gameNum))
        .limit(1);
      const pitching = pitchingRows[0] ?? null;

      const fieldingRows = await db
        .select()
        .from(Schema.gameFielding)
        .where(
          and(
            eq(Schema.gameFielding.playerId, playerId),
            eq(Schema.gameFielding.season, season),
            eq(Schema.gameFielding.gameIdentifier, gameIdentifier),
          ),
        )
        .orderBy(asc(Schema.gameFielding.gameNum))
        .limit(1);
      const fielding = fieldingRows[0] ?? null;

      statsCache.set(cacheKey, { batting, pitching, fielding });

      results.push({
        playerId,
        teamId: playerTeamMap.get(playerId) ?? null,
        season,
        gameNum: batting?.gameNum ?? 0,
        battingStats: batting,
        pitchingStats: pitching,
        fieldingStats: fielding,
      });
    }
  }

  return results;
}

/**
 * Get season-level aggregate stats for a player
 * Used for calculating matchup projections
 */
export async function getSeasonStats(
  db: PublicDb,
  playerId: number,
  season: number,
): Promise<{
  batting: SeasonBatting | null;
  pitching: SeasonPitching | null;
  fielding: SeasonFielding | null;
}> {
  const batting = await db
    .select()
    .from(Schema.seasonBatting)
    .where(
      and(
        eq(Schema.seasonBatting.playerId, playerId),
        eq(Schema.seasonBatting.season, season),
      ),
    )
    .then(TakeUniqueOrNull);

  const pitching = await db
    .select()
    .from(Schema.seasonPitching)
    .where(
      and(
        eq(Schema.seasonPitching.playerId, playerId),
        eq(Schema.seasonPitching.season, season),
      ),
    )
    .then(TakeUniqueOrNull);

  const fielding = await db
    .select()
    .from(Schema.seasonFielding)
    .where(
      and(
        eq(Schema.seasonFielding.playerId, playerId),
        eq(Schema.seasonFielding.season, season),
      ),
    )
    .then(TakeUniqueOrNull);

  return { batting, pitching, fielding };
}

/**
 * Get career stats for a player (for career projections)
 */
export async function getCareerStats(
  db: PublicDb,
  playerId: number,
): Promise<{
  batting: CareerBatting | null;
  pitching: CareerPitching | null;
  fielding: CareerFielding | null;
}> {
  const batting = await getCareerBattingStatsForPlayer(db, playerId);
  const pitching = await getCareerPitchingStatsForPlayer(db, playerId);
  const fielding = await getCareerFieldingStatsForPlayer(db, playerId);

  return { batting, pitching, fielding };
}

/**
 * Get roster lock rules for a league
 */
export async function getRosterLockRules(db: PublicDb, leagueId: number) {
  return await db
    .select()
    .from(Schema.rosterLockRules)
    .where(eq(Schema.rosterLockRules.leagueId, leagueId))
    .then(TakeUniqueOrNull);
}

/**
 * Look up each given NFL team's current kickoff instant (LS-9687).
 *
 * Returns a `Map` keyed by team abbreviation; a team with no row, or a null
 * `kickoffTime` (bye week / not yet populated), is simply absent from the
 * map — callers must treat a missing entry as "no known kickoff", never as
 * "started".
 */
export async function getTeamKickoffTimes(
  db: PublicDb,
  teamAbbreviations: string[],
): Promise<Map<string, Date>> {
  if (teamAbbreviations.length === 0) return new Map();

  const rows = await db
    .select({
      teamAbbreviation: Schema.nflTeamKickoffTimes.teamAbbreviation,
      kickoffTime: Schema.nflTeamKickoffTimes.kickoffTime,
    })
    .from(Schema.nflTeamKickoffTimes)
    .where(
      inArray(Schema.nflTeamKickoffTimes.teamAbbreviation, teamAbbreviations),
    );

  const result = new Map<string, Date>();
  for (const row of rows) {
    if (row.kickoffTime != null) {
      result.set(row.teamAbbreviation, new Date(row.kickoffTime));
    }
  }
  return result;
}

/**
 * Upsert per-team kickoff instants (LS-9687) — the write side of the
 * per-player kickoff-time data source. Pass `kickoffTime: null` to clear a
 * team's kickoff (e.g. a bye week) without deleting the row.
 *
 * Intended to be called ahead of game day by whatever populates the real
 * NFL schedule (an admin/ops script today; a future scheduled ingestion job
 * against a live schedule feed) — deliberately decoupled from any single
 * league's draft/cron state so it can be kept current independent of every
 * league's own roster-lock timing.
 */
export async function upsertTeamKickoffTimes(
  db: PublicDb,
  entries: Array<{ teamAbbreviation: string; kickoffTime: Date | null }>,
): Promise<void> {
  if (entries.length === 0) return;

  await db
    .insert(Schema.nflTeamKickoffTimes)
    .values(
      entries.map((e) => ({
        teamAbbreviation: e.teamAbbreviation,
        kickoffTime: e.kickoffTime,
        updatedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: Schema.nflTeamKickoffTimes.teamAbbreviation,
      set: {
        kickoffTime: sql`excluded.kickoff_time`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

/**
 * Compute the effective roster lock time for a matchup, given the league's
 * `rosterLockTiming` setting and any custom lock rules. Pure function shared
 * by `isRosterLocked` and the `Matchup.lockTime` GraphQL resolver (LS-6368)
 * so both stay in sync.
 */
function toValidDate(value: string | Date): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function computeRosterLockTime(
  matchupStartTime: string | Date | null | undefined,
  rosterLockTiming: string,
  lockRules?: {
    customLockTime?: string | Date | null;
    lockHoursBeforeMatchup?: number | null;
  } | null,
): Date | null {
  if (lockRules?.customLockTime) {
    return toValidDate(lockRules.customLockTime);
  }

  if (!matchupStartTime) return null;
  const matchupStart = toValidDate(matchupStartTime);
  if (!matchupStart) return null;

  switch (rosterLockTiming) {
    case 'day_before':
      return new Date(matchupStart.getTime() - 24 * 60 * 60 * 1000);
    case 'week_before':
      return new Date(matchupStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'custom':
      if (lockRules?.lockHoursBeforeMatchup) {
        return new Date(
          matchupStart.getTime() -
            lockRules.lockHoursBeforeMatchup * 60 * 60 * 1000,
        );
      }
      return matchupStart;
    case 'matchup_start':
    default:
      return matchupStart;
  }
}

/**
 * Check if roster is currently locked for a team in a matchup
 */
export async function isRosterLocked(
  db: PublicDb,
  leagueId: number,
  weekNumber: number,
): Promise<{
  isLocked: boolean;
  reason?: string;
  lockTime?: Date;
}> {
  const league = await db
    .select()
    .from(Schema.leagues)
    .where(eq(Schema.leagues.id, leagueId))
    .then(TakeUniqueOrNull);

  if (!league) {
    throw new Error(`League ${leagueId} not found`);
  }

  // Check trade deadline
  if (league.tradeDeadlineWeek && weekNumber >= league.tradeDeadlineWeek) {
    return {
      isLocked: true,
      reason: 'Trade deadline has passed',
    };
  }

  // Get matchup for the week
  const matchup = await db
    .select()
    .from(Schema.matchups)
    .where(
      and(
        eq(Schema.matchups.leagueId, leagueId),
        eq(Schema.matchups.weekNumber, weekNumber),
      ),
    )
    .then(TakeUniqueOrNull);

  if (!matchup) {
    return { isLocked: false };
  }

  // Check if matchup is in progress or completed
  if (matchup.status === 'in_progress' || matchup.status === 'completed') {
    return {
      isLocked: true,
      reason: `Matchup is ${matchup.status}`,
    };
  }

  const lockRules = await getRosterLockRules(db, leagueId);
  const now = new Date();

  const lockTime = computeRosterLockTime(
    matchup.startTime,
    league.rosterLockTiming,
    lockRules,
  );

  if (lockTime && now >= lockTime) {
    return {
      isLocked: true,
      reason: lockRules?.customLockTime
        ? 'Custom lock time reached'
        : 'Roster lock time reached',
      lockTime,
    };
  }

  return { isLocked: false };
}

/**
 * Check if a roster move is allowed (considering locks)
 */
export async function canMakeRosterMove(
  db: PublicDb,
  leagueId: number,
  weekNumber: number,
  userId: number,
): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const lockStatus = await isRosterLocked(db, leagueId, weekNumber);

  if (!lockStatus.isLocked) {
    return { allowed: true };
  }

  // Check if user is commissioner
  const member = await db
    .select()
    .from(Schema.leagueMembers)
    .where(
      and(
        eq(Schema.leagueMembers.leagueId, leagueId),
        eq(Schema.leagueMembers.userId, userId),
      ),
    )
    .then(TakeUniqueOrNull);

  const lockRules = await getRosterLockRules(db, leagueId);

  // Commissioner override
  if (
    member?.permissionLevel === 'commissioner' ||
    member?.permissionLevel === 'general_manager' ||
    member?.permissionLevel === 'assistant_manager'
  ) {
    if (lockRules?.commissionerCanOverride) {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: lockStatus.reason || 'Roster is locked',
  };
}

/**
 * Create or update roster lock rules for a league
 */
export async function upsertRosterLockRules(
  db: PublicDb,
  leagueId: number,
  rules: {
    customLockTime?: string;
    lockHoursBeforeMatchup?: number;
    commissionerCanOverride?: boolean;
  },
) {
  return await db
    .insert(Schema.rosterLockRules)
    .values({
      leagueId,
      ...rules,
    })
    .onConflictDoUpdate({
      target: Schema.rosterLockRules.leagueId,
      set: rules,
    })
    .returning();
}

// Re-export player stats utilities
export {
  getPlayersWithoutStats,
  getPlayersWithStaleStats,
  getPlayersNeedingStatsRefresh,
  getStatsRefreshSummary,
  getPlayersOrderedByLastFetch,
} from './PlayerStatsUtils';

export function normalizeNumeric(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function emptyLeagueMultipliers(): LeagueScoringMultipliers {
  return {
    batting: Object.create(null) as Record<string, number>,
    pitching: Object.create(null) as Record<string, number>,
    fielding: Object.create(null) as Record<string, number>,
  };
}

function assignMultiplier(
  multipliers: LeagueScoringMultipliers,
  definition: ScoringStatDefinition,
  value: number,
): void {
  const group = definition.statGroup;

  switch (group) {
    // Baseball groups are always present on the object, so assign directly.
    case 'batting':
    case 'pitching':
    case 'fielding':
      multipliers[group][definition.sourceColumn] = value;
      break;
    // Football groups are optional on `LeagueScoringMultipliers` and created
    // lazily, so a profile with no definitions in a group leaves the key
    // absent rather than present-but-empty. `camelCaseScoringMultipliers`
    // relies on that distinction (LS-9664).
    case 'passing':
    case 'rushing':
    case 'receiving':
    case 'kicking':
    case 'defense':
    case 'idp': {
      const weights =
        multipliers[group] ?? (Object.create(null) as Record<string, number>);
      weights[definition.sourceColumn] = value;
      multipliers[group] = weights;
      break;
    }
    default: {
      // Exhaustiveness guard — intentional, and intentionally unreachable.
      //
      // Adding a value to the `scoring_stat_group` enum without handling it
      // above is exactly how every football multiplier came to be silently
      // discarded (LS-9664). The `never` assignment makes that a COMPILE
      // error, which is the point; the `throw` only covers a row whose
      // `stat_group` is outside the enum the types promise (a hand-edited or
      // migrated-ahead database), where failing loudly beats dropping a
      // multiplier on the floor.
      //
      // So this branch is dead by construction today. Do not "simplify" it
      // away — deleting it restores the exact silent-discard bug this ticket
      // fixed, and does so invisibly.
      const unhandled: never = group;
      throw new Error(`Unhandled scoring stat group: ${String(unhandled)}`);
    }
  }
}

export async function getScoringStatDefinitions(
  db: PublicDb,
): Promise<ScoringStatDefinition[]> {
  return db.select().from(Schema.scoringStatDefinitions);
}

export async function getActiveScoringProfileForLeague(
  db: PublicDb,
  leagueId: number,
): Promise<LeagueScoringProfile | null> {
  return db
    .select()
    .from(Schema.leagueScoringProfiles)
    .where(
      and(
        eq(Schema.leagueScoringProfiles.leagueId, leagueId),
        eq(Schema.leagueScoringProfiles.isDefault, true),
      ),
    )
    .limit(1)
    .then(TakeUniqueOrNull);
}

export async function getScoringProfileEntriesForProfile(
  db: PublicDb,
  profileId: number,
): Promise<LeagueScoringProfileEntry[]> {
  return db
    .select()
    .from(Schema.leagueScoringProfileEntries)
    .where(eq(Schema.leagueScoringProfileEntries.profileId, profileId));
}

export async function updateLeagueScoringProfileEntries(
  db: PublicDb,
  profileId: number,
  updates: LeagueScoringMultiplierUpdateInput[],
  changedBy?: number | null,
): Promise<LeagueScoringProfileEntry[]> {
  if (updates.length === 0) {
    return getScoringProfileEntriesForProfile(db, profileId);
  }

  const mergedUpdates = new Map<number, LeagueScoringMultiplierUpdateInput>();

  for (const update of updates) {
    mergedUpdates.set(update.statDefinitionId, {
      ...mergedUpdates.get(update.statDefinitionId),
      ...update,
    });
  }

  const statDefinitionIds = Array.from(mergedUpdates.keys());

  return db.transaction(async (tx) => {
    const definitions = await tx
      .select()
      .from(Schema.scoringStatDefinitions)
      .where(inArray(Schema.scoringStatDefinitions.id, statDefinitionIds));

    const definitionById = new Map(
      definitions.map((definition) => [definition.id, definition]),
    );

    const missingDefinitions = statDefinitionIds.filter(
      (id) => !definitionById.has(id),
    );

    if (missingDefinitions.length > 0) {
      throw new Error(
        `Unknown scoring stat definition ids: ${missingDefinitions.join(', ')}`,
      );
    }

    const existingEntries = await tx
      .select()
      .from(Schema.leagueScoringProfileEntries)
      .where(
        and(
          eq(Schema.leagueScoringProfileEntries.profileId, profileId),
          inArray(
            Schema.leagueScoringProfileEntries.statDefinitionId,
            statDefinitionIds,
          ),
        ),
      );

    const existingByDefinitionId = new Map(
      existingEntries.map((entry) => [entry.statDefinitionId, entry]),
    );

    const values = statDefinitionIds.map((statDefinitionId) => {
      const update = mergedUpdates.get(statDefinitionId);

      if (!update) {
        throw new Error(
          `Missing multiplier update payload for stat definition ${statDefinitionId}`,
        );
      }

      const definition = definitionById.get(statDefinitionId);

      if (!definition) {
        throw new Error(
          `Unknown scoring stat definition id: ${statDefinitionId}`,
        );
      }

      const existing = existingByDefinitionId.get(statDefinitionId);

      const resolvedMultiplier =
        update.multiplier ??
        normalizeNumeric(existing?.multiplier) ??
        normalizeNumeric(definition.defaultMultiplier);

      if (resolvedMultiplier === null) {
        throw new Error(
          `Multiplier is required for stat definition ${statDefinitionId}`,
        );
      }

      const resolvedIsEnabled =
        update.isEnabled ?? (existing ? existing.isEnabled : true);

      return {
        profileId,
        statDefinitionId,
        multiplier: resolvedMultiplier.toString(),
        isEnabled: resolvedIsEnabled,
      };
    });

    await tx
      .insert(Schema.leagueScoringProfileEntries)
      .values(values)
      .onConflictDoUpdate({
        target: [
          Schema.leagueScoringProfileEntries.profileId,
          Schema.leagueScoringProfileEntries.statDefinitionId,
        ],
        set: conflictUpdateAllExcept(Schema.leagueScoringProfileEntries, [
          'id',
          'profileId',
          'statDefinitionId',
          'createdAt',
        ]),
      });

    // Write audit entries to the change log, in the same transaction as the
    // upsert above (LS-9665). One row per *changed* multiplier: a save that
    // re-sends a value identical to the one already in force logs nothing.
    //
    // "Changed" is measured against the multiplier actually in force before
    // this write — the existing entry if there is one, otherwise the stat
    // definition's default — not against the presence of an entry row. A first
    // save that merely materialises the defaults changes no scoring input, so
    // it must not log: `Matchup.scoringIsStale` and the LS-9666 chat messages
    // both read this table as "the scoring inputs changed at this time", and a
    // no-op row would mark every already-scored matchup in the league stale.
    const changeLogEntries = statDefinitionIds
      .map((statDefinitionId) => {
        const existing = existingByDefinitionId.get(statDefinitionId);
        const definition = definitionById.get(statDefinitionId);
        const update = mergedUpdates.get(statDefinitionId);
        if (!definition || !update) return null;

        const previousMultiplier =
          normalizeNumeric(existing?.multiplier) ??
          normalizeNumeric(definition.defaultMultiplier);
        const newMultiplier =
          update.multiplier ??
          normalizeNumeric(existing?.multiplier) ??
          normalizeNumeric(definition.defaultMultiplier);

        const previousIsEnabled = existing ? existing.isEnabled : true;
        const newIsEnabled = update.isEnabled ?? previousIsEnabled;

        const multiplierChanged = previousMultiplier !== newMultiplier;
        const enabledChanged = previousIsEnabled !== newIsEnabled;

        if (!multiplierChanged && !enabledChanged) return null;

        // `scoring_change_action` has no 're-enabled' label, so re-enabling a
        // stat records as 'updated'. 'created' is reserved for a first-time
        // override of a stat that had no entry row.
        const action: 'created' | 'updated' | 'disabled' = !newIsEnabled
          ? 'disabled'
          : !existing
            ? 'created'
            : 'updated';

        return {
          profileId,
          statDefinitionId,
          previousMultiplier: previousMultiplier?.toString() ?? null,
          newMultiplier: newMultiplier?.toString() ?? null,
          changedBy: changedBy ?? null,
          action,
        };
      })
      .filter((entry) => entry !== null);

    if (changeLogEntries.length > 0) {
      await tx.insert(Schema.leagueScoringChangeLog).values(changeLogEntries);
    }

    return tx
      .select()
      .from(Schema.leagueScoringProfileEntries)
      .where(eq(Schema.leagueScoringProfileEntries.profileId, profileId));
  });
}

export async function getScoringPositionBonusesForProfile(
  db: PublicDb,
  profileId: number,
): Promise<LeagueScoringPositionBonus[]> {
  return db
    .select()
    .from(Schema.leagueScoringPositionBonuses)
    .where(eq(Schema.leagueScoringPositionBonuses.profileId, profileId));
}

/**
 * Upsert position-scoped scoring bonuses for a league's active profile
 * (LS-9104). Mirrors `updateLeagueScoringProfileEntries`'s merge/upsert
 * shape but keys on (profileId, statDefinitionId, position) — the unique
 * index backing `league_scoring_position_bonuses`.
 *
 * Position bonuses ARE in scope for `league_scoring_change_log` (LS-9665 AC4).
 * A bonus change alters the multipliers a matchup is scored with exactly as a
 * base multiplier change does, so omitting it would make `Matchup.scoringIsStale`
 * silently answer "not stale" for a league whose scoring inputs just changed.
 *
 * The position is carried in its own `position` column (LS-9721).
 */
export async function updateLeagueScoringPositionBonuses(
  db: PublicDb,
  profileId: number,
  updates: LeagueScoringPositionBonusUpdateInput[],
  changedBy?: number | null,
): Promise<LeagueScoringPositionBonus[]> {
  if (updates.length === 0) {
    return getScoringPositionBonusesForProfile(db, profileId);
  }

  const mergedUpdates = new Map<
    string,
    LeagueScoringPositionBonusUpdateInput
  >();
  for (const update of updates) {
    const key = `${update.statDefinitionId}:${update.position}`;
    mergedUpdates.set(key, { ...mergedUpdates.get(key), ...update });
  }

  const statDefinitionIds = [
    ...new Set(Array.from(mergedUpdates.values(), (u) => u.statDefinitionId)),
  ];

  return db.transaction(async (tx) => {
    const definitions = await tx
      .select()
      .from(Schema.scoringStatDefinitions)
      .where(inArray(Schema.scoringStatDefinitions.id, statDefinitionIds));

    const definitionById = new Map(
      definitions.map((definition) => [definition.id, definition]),
    );

    const missingDefinitions = statDefinitionIds.filter(
      (id) => !definitionById.has(id),
    );
    if (missingDefinitions.length > 0) {
      throw new Error(
        `Unknown scoring stat definition ids: ${missingDefinitions.join(', ')}`,
      );
    }

    const existingBonuses = await tx
      .select()
      .from(Schema.leagueScoringPositionBonuses)
      .where(
        and(
          eq(Schema.leagueScoringPositionBonuses.profileId, profileId),
          inArray(
            Schema.leagueScoringPositionBonuses.statDefinitionId,
            statDefinitionIds,
          ),
        ),
      );

    const existingByKey = new Map(
      existingBonuses.map((bonus) => [
        `${bonus.statDefinitionId}:${bonus.position}`,
        bonus,
      ]),
    );

    const values = Array.from(mergedUpdates.entries()).map(([key, update]) => {
      const existing = existingByKey.get(key);

      const resolvedBonusMultiplier =
        update.bonusMultiplier ??
        normalizeNumeric(existing?.bonusMultiplier) ??
        0;

      const resolvedIsEnabled =
        update.isEnabled ?? (existing ? existing.isEnabled : true);

      return {
        profileId,
        statDefinitionId: update.statDefinitionId,
        position: update.position,
        bonusMultiplier: resolvedBonusMultiplier.toString(),
        isEnabled: resolvedIsEnabled,
      };
    });

    await tx
      .insert(Schema.leagueScoringPositionBonuses)
      .values(values)
      .onConflictDoUpdate({
        target: [
          Schema.leagueScoringPositionBonuses.profileId,
          Schema.leagueScoringPositionBonuses.statDefinitionId,
          Schema.leagueScoringPositionBonuses.position,
        ],
        set: conflictUpdateAllExcept(Schema.leagueScoringPositionBonuses, [
          'id',
          'profileId',
          'statDefinitionId',
          'position',
          'createdAt',
        ]),
      });

    // One change-log row per *changed* bonus, in the same transaction as the
    // upsert (LS-9665). Same effective-change rule as the base multipliers: a
    // re-sent value identical to the one already in force logs nothing.
    // Absent bonus == no bonus, so the baseline for a new row is 0.
    const bonusChangeLogEntries = Array.from(mergedUpdates.entries())
      .map(([key, update]) => {
        const existing = existingByKey.get(key);

        const previousBonus = normalizeNumeric(existing?.bonusMultiplier) ?? 0;
        const newBonus = update.bonusMultiplier ?? previousBonus;

        const previousIsEnabled = existing ? existing.isEnabled : true;
        const newIsEnabled = update.isEnabled ?? previousIsEnabled;

        if (previousBonus === newBonus && previousIsEnabled === newIsEnabled) {
          return null;
        }

        const action: 'created' | 'updated' | 'disabled' = !newIsEnabled
          ? 'disabled'
          : !existing
            ? 'created'
            : 'updated';

        return {
          profileId,
          statDefinitionId: update.statDefinitionId,
          previousMultiplier: previousBonus.toString(),
          newMultiplier: newBonus.toString(),
          changedBy: changedBy ?? null,
          position: update.position,
          action,
        };
      })
      .filter((entry) => entry !== null);

    if (bonusChangeLogEntries.length > 0) {
      await tx
        .insert(Schema.leagueScoringChangeLog)
        .values(bonusChangeLogEntries);
    }

    return tx
      .select()
      .from(Schema.leagueScoringPositionBonuses)
      .where(eq(Schema.leagueScoringPositionBonuses.profileId, profileId));
  });
}

export async function getScoringMultipliersForLeague(
  db: PublicDb,
  leagueId?: number | null,
): Promise<LeagueScoringMultipliers> {
  const multipliers = emptyLeagueMultipliers();
  const definitions = await getScoringStatDefinitions(db);

  let entryByDefinitionId = new Map<number, LeagueScoringProfileEntry>();

  if (leagueId !== null && leagueId !== undefined) {
    const profile = await getActiveScoringProfileForLeague(db, leagueId);

    if (profile) {
      const entries = await getScoringProfileEntriesForProfile(db, profile.id);
      entryByDefinitionId = new Map(
        entries.map((entry) => [entry.statDefinitionId, entry]),
      );
    }
  }

  for (const definition of definitions) {
    const entry = entryByDefinitionId.get(definition.id);

    if (entry && entry.isEnabled === false) {
      // Disabled stats should not contribute to scoring
      continue;
    }

    const overrideMultiplier = normalizeNumeric(entry?.multiplier);
    const defaultMultiplier = normalizeNumeric(definition.defaultMultiplier);

    if (overrideMultiplier !== null) {
      assignMultiplier(multipliers, definition, overrideMultiplier);
      continue;
    }

    if (defaultMultiplier !== null) {
      assignMultiplier(multipliers, definition, defaultMultiplier);
    }
  }

  return multipliers;
}

/**
 * The football scoring multiplier groups — optional on
 * `LeagueScoringMultipliers` because `assignMultiplier` only creates one once a
 * `scoring_stat_definitions` row in that group is assigned. A profile with no
 * football definitions therefore omits the keys entirely rather than carrying
 * empty objects (LS-9664).
 */
const OPTIONAL_SCORING_MULTIPLIER_GROUPS = [
  'passing',
  'rushing',
  'receiving',
  'kicking',
  'defense',
  'idp',
] as const;

function camelCaseWeights(
  weights: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(weights)) {
    result[key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = value;
  }
  return result;
}

/**
 * Re-key scoring multipliers from snake_case to camelCase.
 *
 * `getScoringMultipliersForLeague` keys its output by
 * `scoring_stat_definitions.source_column`, which is snake_case
 * (`outs_recorded`, `e_def`, `dp_def`). Everything downstream of it is
 * camelCase: Drizzle stat rows, the aggregates built from them, and therefore
 * the keys `computeScoring` looks weights up by. Feeding raw multipliers into
 * scoring resolves those stats to weight 0 *silently* — `outs_recorded` alone
 * carries the dominant pitching weight, so the result is a plausible-looking
 * but materially under-scored matchup rather than an error (LS-9532).
 *
 * Anything that scores must convert first. The raw
 * `getScoringMultipliersForLeague` is for displaying or editing the profile
 * itself, where the DB column names are the identifiers.
 */
export function camelCaseScoringMultipliers(
  multipliers: LeagueScoringMultipliers,
): LeagueScoringMultipliers {
  const result: LeagueScoringMultipliers = {
    batting: camelCaseWeights(multipliers.batting),
    pitching: camelCaseWeights(multipliers.pitching),
    fielding: camelCaseWeights(multipliers.fielding),
  };

  for (const group of OPTIONAL_SCORING_MULTIPLIER_GROUPS) {
    const weights = multipliers[group];
    if (weights) {
      result[group] = camelCaseWeights(weights);
    }
  }

  return result;
}

/**
 * `getScoringMultipliersForLeague` with the keys already converted to camelCase
 * — the form every scoring caller needs. See {@link camelCaseScoringMultipliers}.
 */
export async function getCamelCaseScoringMultipliersForLeague(
  db: PublicDb,
  leagueId?: number | null,
): Promise<LeagueScoringMultipliers> {
  return camelCaseScoringMultipliers(
    await getScoringMultipliersForLeague(db, leagueId),
  );
}

// Re-export matchup history utilities
export {
  queryHistoricalMatchups,
  getHeadToHeadRecord,
  calculateStandings,
  getSeasonResults,
  getPlayoffQualifications,
  getRecentMatchupsForTeam,
  getMatchupStatusCounts,
} from './matchup-history';
export type {
  HeadToHeadRecord,
  TeamStanding,
  SeasonResults,
  MatchupHistoryFilters,
  PlayoffQualification,
  MatchupStatusCounts,
} from './matchup-history';

/**
 * Why a scheduled game has no stat rows (LS-6394).
 *
 * `getMatchupFootballPlayerGameStats` emits one entry per row in
 * `matchup_player_games` — i.e. per *scheduled* game — and leaves
 * `offense`/`defense`/`idpDefense` null when no matching stat row exists.
 * A null stat row scores 0, so without this discriminator a player whose
 * stats were never ingested is indistinguishable from one who genuinely
 * scored nothing, and the team total silently under-counts.
 *
 * - `ok` — stats are present, or the ingest ran and correctly found no game
 *   data for this player (a real DNP zero).
 * - `stats_pending` — ingest has not completed for this game yet.
 * - `stats_failed` — ingest ran and failed; the 0 is not trustworthy.
 * - `stats_missing` — ingest reported success and did *not* flag the game as
 *   having no data, yet no stat row exists. This is the silent-swallow case.
 */
export type FootballGameStatsDataQuality =
  | 'ok'
  | 'stats_pending'
  | 'stats_failed'
  | 'stats_missing';

/**
 * @internal Used only by getMatchupFootballPlayerGameStats. No callers exist outside
 * lib/db-client. The `offense` field consolidates the former separate passing/rushing/
 * receiving/kicking fields via the game_football_player_offense_stats view (LS-4758).
 */
export interface FootballMatchupPlayerGameStats {
  playerId: number;
  matchupPlayerId: number;
  gameNum: number;
  gameIdentifier: string;
  offense: typeof Schema.gameFootballPlayerOffenseStats.$inferSelect | null;
  defense: typeof Schema.gameFootballDefense.$inferSelect | null;
  idpDefense: typeof Schema.gameFootballDefenseIdp.$inferSelect | null;
  /** Why this game has no stat rows, when it has none (LS-6394). */
  dataQuality: FootballGameStatsDataQuality;
}

/**
 * Classify a scheduled game that produced no stat rows (LS-6394).
 *
 * `statsLoadingStatus` / `noGameDataFound` come from `matchup_player_games`,
 * written by the stats ingest lambda. They are the only signal available for
 * "the game is done but we have nothing" — there is no NFL game-status table
 * in this schema.
 */
export function deriveFootballGameStatsDataQuality(
  statsLoadingStatus: string | null,
  noGameDataFound: boolean,
  hasAnyStats: boolean,
): FootballGameStatsDataQuality {
  if (hasAnyStats) return 'ok';
  if (statsLoadingStatus === 'failed') return 'stats_failed';
  if (statsLoadingStatus === 'pending') return 'stats_pending';
  // The ingest explicitly recorded that this player had no game data, so a
  // zero here is correct rather than missing.
  if (noGameDataFound) return 'ok';
  if (statsLoadingStatus === 'completed') return 'stats_missing';
  // No status recorded at all — treat as not-yet-ingested rather than
  // asserting the zero is real.
  return 'stats_pending';
}

export async function getMatchupFootballPlayerGameStats(
  db: PublicDb,
  matchupId: number,
): Promise<FootballMatchupPlayerGameStats[]> {
  const matchupInfo = await db
    .select({
      leagueId: Schema.matchups.leagueId,
      weekNumber: Schema.matchups.weekNumber,
    })
    .from(Schema.matchups)
    .where(eq(Schema.matchups.id, matchupId))
    .limit(1);

  if (matchupInfo.length === 0) {
    return [];
  }

  const { leagueId, weekNumber } = matchupInfo[0];

  const matchupPlayersResult = await db
    .select({
      matchupPlayerId: Schema.matchupPlayers.id,
      playerId: Schema.matchupPlayers.playerId,
      season: Schema.leagueWeekPlayerSeasons.season,
      positionType: Schema.leaguePosition.positionType,
    })
    .from(Schema.matchupPlayers)
    .leftJoin(
      Schema.leagueWeekPlayerSeasons,
      and(
        eq(Schema.leagueWeekPlayerSeasons.leagueId, leagueId),
        eq(Schema.leagueWeekPlayerSeasons.weekNumber, weekNumber),
        eq(
          Schema.leagueWeekPlayerSeasons.playerId,
          Schema.matchupPlayers.playerId,
        ),
      ),
    )
    .leftJoin(
      Schema.leaguePosition,
      eq(Schema.leaguePosition.id, Schema.matchupPlayers.positionId),
    )
    .where(eq(Schema.matchupPlayers.matchupId, matchupId));

  return buildFootballPlayerGameStats(db, matchupPlayersResult);
}

/**
 * A rostered matchup player with the season their league week assigns them
 * (`league_week_player_seasons`) and their roster slot's position type.
 */
interface FootballMatchupPlayerSeasonRow {
  matchupPlayerId: number;
  playerId: number;
  season: number | null;
  positionType: string | null;
}

/**
 * Per-scheduled-game stat rows for a set of matchup players. Shared by
 * `getMatchupFootballPlayerGameStats` (one matchup) and
 * `getLeagueFootballPlayerGameStatsThroughWeek` (a league's weeks 1..N,
 * LS-10823), so both read stats with the same season assignment and
 * DST/IDP/offense routing.
 */
async function buildFootballPlayerGameStats(
  db: PublicDb,
  matchupPlayersResult: FootballMatchupPlayerSeasonRow[],
): Promise<FootballMatchupPlayerGameStats[]> {
  if (matchupPlayersResult.length === 0) {
    return [];
  }

  const matchupPlayerIds = matchupPlayersResult.map((mp) => mp.matchupPlayerId);

  const gamesResult = await db
    .select()
    .from(Schema.matchupPlayerGames)
    .where(
      inArray(Schema.matchupPlayerGames.matchupPlayerId, matchupPlayerIds),
    );

  const matchupPlayerMap = new Map<
    number,
    { playerId: number; season: number; isDst: boolean; isIdp: boolean }
  >();

  for (const mp of matchupPlayersResult) {
    if (mp.season === null) continue;
    const isDst = mp.positionType === 'DST';
    const isIdp =
      mp.positionType === 'DL' ||
      mp.positionType === 'LB' ||
      mp.positionType === 'DB' ||
      mp.positionType === 'DP';
    matchupPlayerMap.set(mp.matchupPlayerId, {
      playerId: mp.playerId,
      season: mp.season,
      isDst,
      isIdp,
    });
  }

  type GameEntry = {
    playerId: number;
    season: number;
    gameNum: number;
    matchupPlayerId: number;
    gameIdentifier: string;
    statsLoadingStatus: string | null;
    noGameDataFound: boolean;
  };

  const dstGames: GameEntry[] = [];
  const idpGames: GameEntry[] = [];
  const offGames: GameEntry[] = [];

  for (const game of gamesResult) {
    const mpInfo = matchupPlayerMap.get(game.matchupPlayerId);
    if (!mpInfo || !game.gameIdentifier) continue;
    const entry: GameEntry = {
      playerId: mpInfo.playerId,
      season: mpInfo.season,
      gameNum: game.gameNum,
      matchupPlayerId: game.matchupPlayerId,
      gameIdentifier: game.gameIdentifier,
      statsLoadingStatus: game.statsLoadingStatus ?? null,
      noGameDataFound: game.noGameDataFound ?? false,
    };
    if (mpInfo.isDst) dstGames.push(entry);
    else if (mpInfo.isIdp) idpGames.push(entry);
    else offGames.push(entry);
  }

  const statKey = (playerId: number, season: number, gameNum: number) =>
    `${playerId}_${season}_${gameNum}`;

  // Batch fetch offensive stats via flattened view (single query)
  const offenseMap = new Map<
    string,
    typeof Schema.gameFootballPlayerOffenseStats.$inferSelect
  >();
  if (offGames.length > 0) {
    const playerIds = [...new Set(offGames.map((g) => g.playerId))];
    const gameNums = [...new Set(offGames.map((g) => g.gameNum))];
    const offenseRows = await db
      .select()
      .from(Schema.gameFootballPlayerOffenseStats)
      .where(
        and(
          inArray(Schema.gameFootballPlayerOffenseStats.playerId, playerIds),
          inArray(Schema.gameFootballPlayerOffenseStats.gameNum, gameNums),
        ),
      );
    for (const r of offenseRows)
      offenseMap.set(statKey(r.playerId, r.season, r.gameNum), r);
  }

  // Batch fetch DST defense stats
  const defenseMap = new Map<
    string,
    typeof Schema.gameFootballDefense.$inferSelect
  >();
  if (dstGames.length > 0) {
    const playerIds = [...new Set(dstGames.map((g) => g.playerId))];
    const gameNums = [...new Set(dstGames.map((g) => g.gameNum))];
    const rows = await db
      .select()
      .from(Schema.gameFootballDefense)
      .where(
        and(
          inArray(Schema.gameFootballDefense.playerId, playerIds),
          inArray(Schema.gameFootballDefense.gameNum, gameNums),
        ),
      );
    for (const r of rows)
      defenseMap.set(statKey(r.playerId, r.season, r.gameNum), r);
  }

  // Batch fetch IDP defense stats
  const idpDefenseMap = new Map<
    string,
    typeof Schema.gameFootballDefenseIdp.$inferSelect
  >();
  if (idpGames.length > 0) {
    const playerIds = [...new Set(idpGames.map((g) => g.playerId))];
    const gameNums = [...new Set(idpGames.map((g) => g.gameNum))];
    const rows = await db
      .select()
      .from(Schema.gameFootballDefenseIdp)
      .where(
        and(
          inArray(Schema.gameFootballDefenseIdp.playerId, playerIds),
          inArray(Schema.gameFootballDefenseIdp.gameNum, gameNums),
        ),
      );
    for (const r of rows)
      idpDefenseMap.set(
        statKey(r.playerId, Number(r.season), Number(r.gameNum)),
        r,
      );
  }

  const results: FootballMatchupPlayerGameStats[] = [];
  for (const game of [...dstGames, ...idpGames, ...offGames]) {
    const key = statKey(game.playerId, game.season, game.gameNum);
    const offense = offenseMap.get(key) ?? null;
    const defense = defenseMap.get(key) ?? null;
    const idpDefense = idpDefenseMap.get(key) ?? null;
    results.push({
      playerId: game.playerId,
      matchupPlayerId: game.matchupPlayerId,
      gameNum: game.gameNum,
      gameIdentifier: game.gameIdentifier,
      offense,
      defense,
      idpDefense,
      // LS-6394: a scheduled game with no stat row scores 0. Record *why* so
      // callers can tell a real zero from an ingest gap instead of silently
      // under-counting the team total.
      dataQuality: deriveFootballGameStatsDataQuality(
        game.statsLoadingStatus,
        game.noGameDataFound,
        offense !== null || defense !== null || idpDefense !== null,
      ),
    });
  }

  return results;
}

/**
 * One scheduled game for a player rostered in a league matchup, tagged with
 * the matchup week and roster slot it was played in (LS-10823).
 */
export interface FootballLeaguePlayerGameStats extends FootballMatchupPlayerGameStats {
  weekNumber: number;
  /** Roster slot position type; null for a bench slot. */
  positionType: string | null;
}

/**
 * Every scheduled game for every player rostered in `leagueId`'s matchups
 * for weeks 1..`throughWeek` inclusive (LS-10823).
 *
 * Each league week can assign a player a different historical season
 * (`league_week_player_seasons`), so stats are read per matchup week with
 * that week's assignment, exactly as `getMatchupFootballPlayerGameStats` does
 * for a single matchup. Entries are keyed by matchup player, so a player
 * traded mid-season appears under each team's matchup they were rostered in.
 *
 * Runs a fixed number of queries regardless of how many weeks or matchups the
 * league has.
 */
export async function getLeagueFootballPlayerGameStatsThroughWeek(
  db: PublicDb,
  leagueId: number,
  throughWeek: number,
): Promise<FootballLeaguePlayerGameStats[]> {
  const matchupPlayerRows = await db
    .select({
      matchupPlayerId: Schema.matchupPlayers.id,
      playerId: Schema.matchupPlayers.playerId,
      season: Schema.leagueWeekPlayerSeasons.season,
      positionType: Schema.leaguePosition.positionType,
      weekNumber: Schema.matchups.weekNumber,
    })
    .from(Schema.matchupPlayers)
    .innerJoin(
      Schema.matchups,
      eq(Schema.matchups.id, Schema.matchupPlayers.matchupId),
    )
    .leftJoin(
      Schema.leagueWeekPlayerSeasons,
      and(
        eq(Schema.leagueWeekPlayerSeasons.leagueId, Schema.matchups.leagueId),
        eq(
          Schema.leagueWeekPlayerSeasons.weekNumber,
          Schema.matchups.weekNumber,
        ),
        eq(
          Schema.leagueWeekPlayerSeasons.playerId,
          Schema.matchupPlayers.playerId,
        ),
      ),
    )
    .leftJoin(
      Schema.leaguePosition,
      eq(Schema.leaguePosition.id, Schema.matchupPlayers.positionId),
    )
    .where(
      and(
        eq(Schema.matchups.leagueId, leagueId),
        lte(Schema.matchups.weekNumber, throughWeek),
      ),
    );

  const rowByMatchupPlayerId = new Map(
    matchupPlayerRows.map((r) => [r.matchupPlayerId, r]),
  );
  const games = await buildFootballPlayerGameStats(db, matchupPlayerRows);

  const results: FootballLeaguePlayerGameStats[] = [];
  for (const game of games) {
    const row = rowByMatchupPlayerId.get(game.matchupPlayerId);
    if (!row) continue;
    results.push({
      ...game,
      weekNumber: row.weekNumber,
      positionType: row.positionType,
    });
  }
  return results;
}
