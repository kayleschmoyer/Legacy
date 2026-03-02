import { and, eq, inArray, not, sql } from 'drizzle-orm';
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
 * Refresh the player_eligible_positions materialized view.
 *
 * Should be called once after a bulk stats-load run (not per-player) so the
 * draft picker always sees up-to-date eligibility data.
 *
 * CONCURRENTLY allows reads to continue during the refresh; it requires the
 * unique index created by migration 20260302_120000 to already exist.
 */
export async function refreshPlayerEligiblePositions(
  db: PublicDb,
): Promise<void> {
  await db.execute(
    sql`REFRESH MATERIALIZED VIEW CONCURRENTLY public.player_eligible_positions`,
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
): Promise<MatchupPlayer> {
  const [result] = await db
    .insert(Schema.matchupPlayers)
    .values(record)
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

export async function getCurrentMatchupForLeague(
  db: PublicDb,
  leagueId: number,
): Promise<Matchup | null> {
  // Get the current matchup ID from the league
  const leagueResults = await db
    .select({ currentMatchup: Schema.leagues.currentMatchup })
    .from(Schema.leagues)
    .where(eq(Schema.leagues.id, leagueId))
    .limit(1);

  if (!leagueResults[0]?.currentMatchup) {
    return null;
  }

  return await db
    .select()
    .from(Schema.matchups)
    .where(eq(Schema.matchups.id, leagueResults[0].currentMatchup))
    .then(TakeUniqueOrNull);
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

export async function updateMatchupScore(
  db: PublicDb,
  matchupId: number,
  team1Score?: number | null,
  team2Score?: number | null,
): Promise<Matchup> {
  const updateData: { team1Score?: string; team2Score?: string } = {};

  if (team1Score !== null && team1Score !== undefined) {
    updateData.team1Score = team1Score.toString();
  }
  if (team2Score !== null && team2Score !== undefined) {
    updateData.team2Score = team2Score.toString();
  }

  const results = await db
    .update(Schema.matchups)
    .set(updateData)
    .where(eq(Schema.matchups.id, matchupId))
    .returning();

  if (!results[0]) {
    throw new Error('Matchup not found');
  }

  return results[0];
}

export async function updateMatchupStatus(
  db: PublicDb,
  matchupId: number,
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled',
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

  // Build map of player -> game identifiers
  const playerGamesMap = new Map<
    number,
    { season: number; gameIdentifiers: string[] }
  >();
  const matchupPlayerMap = new Map<
    number,
    { playerId: number; season: number }
  >();

  for (const mp of matchupPlayersResult) {
    if (mp.season === null) continue; // Skip if no season selected
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

    if (!playerGamesMap.has(mpInfo.playerId)) {
      playerGamesMap.set(mpInfo.playerId, {
        season: mpInfo.season,
        gameIdentifiers: [],
      });
    }
    const playerGames = playerGamesMap.get(mpInfo.playerId);
    if (playerGames) {
      playerGames.gameIdentifiers.push(gameId);
    }
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

  for (const [playerId, { season, gameIdentifiers }] of playerGamesMap) {
    const uniqueGameIds = [...new Set(gameIdentifiers)];
    for (const gameIdentifier of uniqueGameIds) {
      const batting = await db
        .select()
        .from(Schema.gameBatting)
        .where(
          and(
            eq(Schema.gameBatting.playerId, playerId),
            eq(Schema.gameBatting.season, season),
            eq(Schema.gameBatting.gameIdentifier, gameIdentifier),
          ),
        )
        .then(TakeUniqueOrNull);

      const pitching = await db
        .select()
        .from(Schema.gamePitching)
        .where(
          and(
            eq(Schema.gamePitching.playerId, playerId),
            eq(Schema.gamePitching.season, season),
            eq(Schema.gamePitching.gameIdentifier, gameIdentifier),
          ),
        )
        .then(TakeUniqueOrNull);

      const fielding = await db
        .select()
        .from(Schema.gameFielding)
        .where(
          and(
            eq(Schema.gameFielding.playerId, playerId),
            eq(Schema.gameFielding.season, season),
            eq(Schema.gameFielding.gameIdentifier, gameIdentifier),
          ),
        )
        .then(TakeUniqueOrNull);

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

  // Check custom lock time
  if (lockRules?.customLockTime) {
    const customLock = new Date(lockRules.customLockTime);
    if (now >= customLock) {
      return {
        isLocked: true,
        reason: 'Custom lock time reached',
        lockTime: customLock,
      };
    }
  }

  // Check matchup start time with lock timing rules
  if (matchup.startTime && league.rosterLockTiming) {
    const matchupStart = new Date(matchup.startTime);
    let lockTime = matchupStart;

    switch (league.rosterLockTiming) {
      case 'day_before':
        lockTime = new Date(matchupStart.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week_before':
        lockTime = new Date(matchupStart.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'custom':
        if (lockRules?.lockHoursBeforeMatchup) {
          lockTime = new Date(
            matchupStart.getTime() -
              lockRules.lockHoursBeforeMatchup * 60 * 60 * 1000,
          );
        }
        break;
      case 'matchup_start':
      default:
        lockTime = matchupStart;
    }

    if (now >= lockTime) {
      return {
        isLocked: true,
        reason: 'Roster lock time reached',
        lockTime,
      };
    }
  }

  return { isLocked: false };
}

/**
 * Check if a roster move is allowed (considering locks and emergency subs)
 */
export async function canMakeRosterMove(
  db: PublicDb,
  leagueId: number,
  weekNumber: number,
  userId: number,
  isEmergencySubstitution = false,
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

  // Emergency substitution rules
  if (isEmergencySubstitution && lockRules?.allowEmergencySubs) {
    if (lockRules.emergencySubRule !== 'none') {
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
    allowEmergencySubs?: boolean;
    emergencySubRule?:
      | 'none'
      | 'injury_only'
      | 'injury_or_rest'
      | 'commissioner_approval';
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

function normalizeNumeric(value: unknown): number | null {
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
  switch (definition.statGroup) {
    case 'batting':
      multipliers.batting[definition.sourceColumn] = value;
      break;
    case 'pitching':
      multipliers.pitching[definition.sourceColumn] = value;
      break;
    case 'fielding':
      multipliers.fielding[definition.sourceColumn] = value;
      break;
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

    // Write audit entries to the change log
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

        const action: 'created' | 'updated' | 'disabled' = !existing
          ? 'created'
          : update.isEnabled === false
            ? 'disabled'
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
      .filter(
        (
          entry,
        ): entry is {
          profileId: number;
          statDefinitionId: number;
          previousMultiplier: string | null;
          newMultiplier: string | null;
          changedBy: number | null;
          action: 'created' | 'updated' | 'disabled';
        } => entry !== null,
      );

    if (changeLogEntries.length > 0) {
      await tx.insert(Schema.leagueScoringChangeLog).values(changeLogEntries);
    }

    return tx
      .select()
      .from(Schema.leagueScoringProfileEntries)
      .where(eq(Schema.leagueScoringProfileEntries.profileId, profileId));
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
