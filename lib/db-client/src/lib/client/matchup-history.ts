import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { applyScoring } from '@legacy-sports/utils';
import { getScoringMultipliersForLeague, PublicDb } from './PublicDbClient';
import * as Schema from '../../drizzle/public/schema';
import { Matchup } from '../../types/DatabaseTypes';
import { LeagueScoringMultipliers } from '../../types/ScoringTypes';

/**
 * Head-to-head record between two teams
 */
export interface HeadToHeadRecord {
  team1Id: number;
  team2Id: number;
  team1Wins: number;
  team2Wins: number;
  ties: number;
  totalMatchups: number;
  team1TotalPoints: number;
  team2TotalPoints: number;
  averageTeam1Score: number;
  averageTeam2Score: number;
}

/**
 * Team standing in a league for a season or overall
 */
export interface TeamStanding {
  teamId: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  totalMatchups: number;
  pointsFor: number;
  pointsAgainst: number;
  winPercentage: number;
  averagePointsFor: number;
  averagePointsAgainst: number;
  rank?: number;
  avatarUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  /** Division this team belongs to; null means the league has no divisions */
  divisionId?: number | null;
  /** Human-readable division label (e.g. "Division 1"); null when no divisions */
  divisionName?: string | null;
  /**
   * Median-game / "all-play" record (LS-6344): each completed week, a win if
   * the team's score beat that week's league median, a loss if below, a tie
   * if equal. Undefined when the league does not have median_game_enabled.
   */
  medianWins?: number;
  medianLosses?: number;
  medianTies?: number;
  /**
   * Playoff seeding indicator (LS-6345). Null until the league is in its
   * late-season window (see `computeClinchStatuses`) — no badge should
   * render for a null value.
   */
  clinchStatus?: ClinchStatus | null;
}

/**
 * Season results summary
 */
export interface SeasonResults {
  leagueId: number;
  season: number | null;
  totalMatchups: number;
  completedMatchups: number;
  standings: TeamStanding[];
}

/**
 * Matchup history query filters
 */
export interface MatchupHistoryFilters {
  leagueId: number;
  season?: number | null;
  teamId?: number;
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  startDate?: string;
  endDate?: string;
  /** Maximum number of matchups to return. Applied at the DB level. */
  limit?: number;
  /** Number of matchups to skip before returning results (for cursor-style pagination). */
  offset?: number;
}

/**
 * Query historical matchups with flexible filtering
 */
export async function queryHistoricalMatchups(
  db: PublicDb,
  filters: MatchupHistoryFilters,
): Promise<Matchup[]> {
  const conditions = [eq(Schema.matchups.leagueId, filters.leagueId)];

  // Note: Season filtering removed - matchups no longer have a selected_season field.
  // Seasons are now per-player (league_week_player_seasons table).

  // Filter by team participation
  if (filters.teamId !== undefined) {
    conditions.push(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Drizzle `or` typing limitation with multiple conditions
      or(
        eq(Schema.matchups.team1Id, filters.teamId),
        eq(Schema.matchups.team2Id, filters.teamId),
      ) as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Drizzle or() typing limitation
    );
  }

  // Filter by status
  if (filters.status) {
    conditions.push(eq(Schema.matchups.status, filters.status));
  }

  // Filter by date range
  if (filters.startDate) {
    conditions.push(sql`${Schema.matchups.startTime} >= ${filters.startDate}`);
  }
  if (filters.endDate) {
    conditions.push(sql`${Schema.matchups.endTime} <= ${filters.endDate}`);
  }

  const baseQuery = db
    .select()
    .from(Schema.matchups)
    .where(and(...conditions))
    .orderBy(desc(Schema.matchups.weekNumber));

  if (filters.limit !== undefined) {
    return baseQuery.limit(filters.limit).offset(filters.offset ?? 0);
  }

  return baseQuery;
}

/**
 * Get head-to-head record between two specific teams
 */
export async function getHeadToHeadRecord(
  db: PublicDb,
  leagueId: number,
  team1Id: number,
  team2Id: number,
): Promise<HeadToHeadRecord> {
  // Get all completed matchups between these two teams
  const matchups = await db
    .select()
    .from(Schema.matchups)
    .where(
      and(
        eq(Schema.matchups.leagueId, leagueId),
        eq(Schema.matchups.status, 'completed'),
        or(
          and(
            eq(Schema.matchups.team1Id, team1Id),
            eq(Schema.matchups.team2Id, team2Id),
          ),
          and(
            eq(Schema.matchups.team1Id, team2Id),
            eq(Schema.matchups.team2Id, team1Id),
          ),
        ),
      ),
    );

  let team1Wins = 0;
  let team2Wins = 0;
  let ties = 0;
  let team1TotalPoints = 0;
  let team2TotalPoints = 0;

  for (const matchup of matchups) {
    const score1 = matchup.team1Score ? parseFloat(matchup.team1Score) : 0;
    const score2 = matchup.team2Score ? parseFloat(matchup.team2Score) : 0;

    // Determine which team is which in this matchup
    const isTeam1First = matchup.team1Id === team1Id;
    const team1Score = isTeam1First ? score1 : score2;
    const team2Score = isTeam1First ? score2 : score1;

    team1TotalPoints += team1Score;
    team2TotalPoints += team2Score;

    if (team1Score > team2Score) {
      team1Wins++;
    } else if (team2Score > team1Score) {
      team2Wins++;
    } else {
      ties++;
    }
  }

  const totalMatchups = matchups.length;

  return {
    team1Id,
    team2Id,
    team1Wins,
    team2Wins,
    ties,
    totalMatchups,
    team1TotalPoints,
    team2TotalPoints,
    averageTeam1Score: totalMatchups > 0 ? team1TotalPoints / totalMatchups : 0,
    averageTeam2Score: totalMatchups > 0 ? team2TotalPoints / totalMatchups : 0,
  };
}

/**
 * Convert snake_case to camelCase.
 * Scoring stat definitions store source_column in snake_case (e.g. "outs_recorded", "e_def")
 * but Drizzle returns rows with camelCase properties (e.g. "outsRecorded", "eDef").
 */
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Convert scoring multiplier keys from snake_case (DB column names) to camelCase (Drizzle property names).
 */
function camelCaseMultipliers(
  multipliers: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(multipliers)) {
    result[snakeToCamel(key)] = value;
  }
  return result;
}

/**
 * A game-stats table that can be joined on (player_id, game_identifier).
 * game_batting, game_pitching and game_fielding each carry a composite index
 * on that pair.
 */
type PairJoinableStatsTable = PgTable & {
  playerId: PgColumn;
  gameIdentifier: PgColumn;
};

/**
 * Project a table's columns under their camelCase property names, so rows from
 * a raw `db.execute` are shaped exactly like rows from `db.select().from(table)`.
 *
 * Derived from the Drizzle schema rather than hardcoded because the underlying
 * column names diverge between the stats tables (game_batting.game_number vs
 * game_pitching.game_num), and because `applyScoring` reads camelCase keys.
 */
function camelCasedProjection(
  table: PairJoinableStatsTable,
  alias: string,
): SQL {
  return sql.join(
    Object.entries(getTableColumns(table)).map(
      ([property, column]) =>
        sql`${sql.identifier(alias)}.${sql.identifier(column.name)} AS ${sql.identifier(property)}`,
    ),
    sql`, `,
  );
}

/**
 * Fetch every stats row for the (player_id, game_identifier) pairs actually
 * referenced by a league's completed + in-progress matchups, optionally bounded
 * to weeks through `throughWeek` for a historical "as of Week N" view.
 *
 * LS-9525: the pair list is built in a MATERIALIZED CTE and probed with a
 * CROSS JOIN LATERAL so the planner drives a nested loop over the existing
 * `<table>_player_id_game_identifier_idx` index, instead of scanning the whole
 * stats table as the previous two-independent-IN-lists shape did.
 *
 * `OFFSET 0` is the load-bearing part and must not be removed. It is an
 * optimisation fence that stops the lateral subquery being pulled up and
 * flattened back into a plain join; it is a semantic no-op (skipping zero
 * rows). Measured on dev RDS: without it, game_batting still plans as an index
 * scan, but the smaller game_pitching (148k rows) flattens into a Hash Join
 * over a full `Seq Scan on game_pitching`.
 *
 * MATERIALIZED is kept alongside it deliberately. The two guard different
 * failure modes -- the fence prevents pull-up, while materialising the CTE
 * makes the outer join cost against the pair set's own cardinality rather than
 * an estimate re-derived inside the correlation. On the current dev dataset the
 * fence alone is enough (a NOT MATERIALIZED variant still plans as an index
 * scan, though it under-estimates the pair set by ~3.5x); the belt-and-braces
 * form is what the ticket specified and what is verified below.
 *
 * Verified on dev RDS, league 819: `Index Scan using
 * game_batting_player_id_game_identifier_idx` and `Index Scan using
 * game_pitching_player_id_game_identifier_idx`, no Seq Scan on either stats
 * table.
 */
async function fetchStatsForLeaguePairs<T extends PairJoinableStatsTable>(
  db: PublicDb,
  table: T,
  leagueId: number,
  throughWeek: number | null,
): Promise<T['$inferSelect'][]> {
  // Must mirror the matchup filter in _computeStandings exactly. If the two
  // drift, the pair set stops matching the matchups actually being scored and
  // the fetch silently goes back to over-reading rows the lookups discard.
  const weekFilter =
    throughWeek != null
      ? sql`AND m.${sql.identifier(Schema.matchups.weekNumber.name)} <= ${throughWeek}`
      : sql``;

  const result = await db.execute<T['$inferSelect']>(sql`
    WITH pairs AS MATERIALIZED (
      SELECT DISTINCT mp.player_id, mpg.game_identifier
      FROM matchups m
      JOIN matchup_players mp ON mp.matchup_id = m.id
      JOIN matchup_player_games mpg ON mpg.matchup_player_id = mp.id
      WHERE m.league_id = ${leagueId}
        AND m.status IN ('completed', 'in_progress')
        AND mpg.game_identifier IS NOT NULL
        ${weekFilter}
    )
    SELECT ${camelCasedProjection(table, 'stats')}
    FROM pairs p
    CROSS JOIN LATERAL (
      SELECT *
      FROM ${table}
      WHERE ${table.playerId} = p.player_id
        AND ${table.gameIdentifier} = p.game_identifier
      OFFSET 0
    ) stats
  `);

  return result.rows;
}

/**
 * Fetch fielding stats only when game_fielding actually holds data.
 *
 * game_fielding is empty in every environment today, so the unconditional
 * fetch it replaced was pure overhead on every standings computation. The
 * scoring path in computeTeamMatchupScore is deliberately left in place --
 * leagues still carry fielding multipliers in their scoring profile, so the
 * moment fielding rows are ingested they flow through the same pair-join path
 * with no further code change. The guard is a zero-page existence probe
 * (game_fielding has relpages = 0), issued in parallel with the batting and
 * pitching fetches.
 */
async function fetchFieldingStatsIfPopulated(
  db: PublicDb,
  leagueId: number,
  throughWeek: number | null,
): Promise<(typeof Schema.gameFielding)['$inferSelect'][]> {
  const probe = await db.execute(
    sql`SELECT 1 FROM ${Schema.gameFielding} LIMIT 1`,
  );
  if (probe.rows.length === 0) return [];

  return fetchStatsForLeaguePairs(
    db,
    Schema.gameFielding,
    leagueId,
    throughWeek,
  );
}

/**
 * In-flight promise cache for calculateStandings, keyed by db instance →
 * leagueId → cache key (leagueId alone for current standings, or
 * `${leagueId}:${throughWeek}` for a historical "as of Week N" view).
 *
 * Purpose: deduplicate concurrent calls within the same request lifecycle
 * (e.g. multiple GraphQL resolvers asking for the same league's standings).
 * The entry is removed once the promise settles, so subsequent requests always
 * compute fresh standings.
 */
const standingsInFlight = new WeakMap<
  object,
  Map<string, Promise<TeamStanding[]>>
>();

function getInFlightCache(db: object): Map<string, Promise<TeamStanding[]>> {
  let cache = standingsInFlight.get(db);
  if (!cache) {
    cache = new Map();
    standingsInFlight.set(db, cache);
  }
  return cache;
}

export interface CalculateStandingsOptions {
  /** When set, only matchups through this week (inclusive) count — "standings as of Week N". */
  throughWeek?: number | null;
}

/**
 * Calculate standings for a league.
 *
 * Points (pointsFor / pointsAgainst) are computed from game stats
 * (batting, pitching, fielding) using the league's scoring profile.
 * Points accumulate from BOTH completed AND in-progress matchups.
 * Win/loss/tie record is determined only from completed matchups.
 *
 * When `throughWeek` is set, only matchups with `weekNumber <= throughWeek`
 * are considered, producing historical standings as of that week.
 *
 * Concurrent calls with the same db + leagueId + throughWeek share a single
 * in-flight promise, eliminating redundant DB queries within a single request.
 */
export function calculateStandings(
  db: PublicDb,
  leagueId: number,
  options?: CalculateStandingsOptions,
): Promise<TeamStanding[]> {
  const throughWeek = options?.throughWeek ?? null;
  const cache = getInFlightCache(db);
  const cacheKey =
    throughWeek != null ? `${leagueId}:${throughWeek}` : `${leagueId}`;
  const existing = cache.get(cacheKey);
  if (existing) return existing;

  const promise = _computeStandings(db, leagueId, throughWeek);
  cache.set(cacheKey, promise);
  // Remove from cache once settled so the next request always fetches fresh data.
  promise.then(
    () => cache.delete(cacheKey),
    () => cache.delete(cacheKey),
  );
  return promise;
}

async function _computeStandings(
  db: PublicDb,
  leagueId: number,
  throughWeek: number | null,
): Promise<TeamStanding[]> {
  // Get all teams in the league
  const teams = await db
    .select({
      id: Schema.teams.id,
      name: Schema.teams.name,
      avatarUrl: Schema.teams.avatarUrl,
      primaryColor: Schema.teams.primaryColor,
      secondaryColor: Schema.teams.secondaryColor,
      divisionId: Schema.teams.divisionId,
    })
    .from(Schema.teams)
    .where(eq(Schema.teams.leagueId, leagueId));

  if (teams.length === 0) {
    return [];
  }

  // Median-game / "all-play" scoring option (LS-6344) — only computed when
  // the league has it enabled, to avoid the extra per-week grouping work for
  // the common (disabled) case.
  const [leagueRow] = await db
    .select({ medianGameEnabled: Schema.leagues.medianGameEnabled })
    .from(Schema.leagues)
    .where(eq(Schema.leagues.id, leagueId))
    .limit(1);
  const medianGameEnabled = leagueRow?.medianGameEnabled ?? false;

  // Build a sorted ordinal map so division labels read "Division 1", "Division 2", …
  // regardless of the raw integer IDs stored in the DB.
  const sortedDivisionIds = Array.from(
    new Set(
      teams.map((t) => t.divisionId).filter((id): id is number => id != null),
    ),
  ).sort((a, b) => a - b);
  const divisionOrdinal = new Map(
    sortedDivisionIds.map((id, idx) => [id, idx + 1]),
  );

  // Initialize standings map
  const standingsMap = new Map<number, TeamStanding>();
  for (const team of teams) {
    const divId = team.divisionId ?? null;
    const ordinal = divId != null ? (divisionOrdinal.get(divId) ?? null) : null;
    standingsMap.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      wins: 0,
      losses: 0,
      ties: 0,
      totalMatchups: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      winPercentage: 0,
      averagePointsFor: 0,
      averagePointsAgainst: 0,
      avatarUrl: team.avatarUrl,
      primaryColor: team.primaryColor,
      secondaryColor: team.secondaryColor,
      divisionId: divId,
      divisionName: ordinal != null ? `Division ${ordinal}` : null,
    });
  }

  // Get scoring multipliers for this league (converted to camelCase for Drizzle rows)
  const rawMultipliers = await getScoringMultipliersForLeague(db, leagueId);
  const scoringWeights: LeagueScoringMultipliers = {
    batting: camelCaseMultipliers(rawMultipliers.batting),
    pitching: camelCaseMultipliers(rawMultipliers.pitching),
    fielding: camelCaseMultipliers(rawMultipliers.fielding),
  };

  // Get all completed + in_progress matchups for the league, optionally
  // bounded to weeks through `throughWeek` for a historical "as of" view.
  const matchupConditions = [
    eq(Schema.matchups.leagueId, leagueId),
    or(
      eq(Schema.matchups.status, 'completed'),
      eq(Schema.matchups.status, 'in_progress'),
    ),
  ];
  if (throughWeek != null) {
    matchupConditions.push(lte(Schema.matchups.weekNumber, throughWeek));
  }
  const matchups = await db
    .select()
    .from(Schema.matchups)
    .where(and(...matchupConditions));

  const matchupIds = matchups.map((m) => m.id);
  if (matchupIds.length === 0) {
    return Array.from(standingsMap.values()).map((s, i) => ({
      ...s,
      rank: i + 1,
    }));
  }

  // Batch query: all matchup players across these matchups
  const matchupPlayerRows = await db
    .select()
    .from(Schema.matchupPlayers)
    .where(inArray(Schema.matchupPlayers.matchupId, matchupIds));

  // Batch query: all matchup player games
  const mpIds = matchupPlayerRows.map((mp) => mp.id);
  const mpGameRows =
    mpIds.length > 0
      ? await db
          .select()
          .from(Schema.matchupPlayerGames)
          .where(inArray(Schema.matchupPlayerGames.matchupPlayerId, mpIds))
      : [];

  // Batch query game stats (batting, pitching) in parallel.
  //
  // LS-9525: these used to filter on two independent IN lists
  // (`player_id IN (...) AND game_identifier IN (...)`). That shape cannot use
  // the composite (player_id, game_identifier) index — Postgres has to
  // materialise the cross-product predicate and falls back to scanning the
  // whole stats table — and it over-fetches rows for players who happened to
  // appear in a game selected for a *different* player's matchup, which the
  // `playerId_gameIdentifier` lookups below silently discard. Feeding the
  // query the actual (player_id, game_identifier) pairs fixes both.
  const hasGamePairs = mpGameRows.some((g) => g.gameIdentifier != null);

  const [battingRows, pitchingRows, fieldingRows] = hasGamePairs
    ? await Promise.all([
        fetchStatsForLeaguePairs(db, Schema.gameBatting, leagueId, throughWeek),
        fetchStatsForLeaguePairs(
          db,
          Schema.gamePitching,
          leagueId,
          throughWeek,
        ),
        fetchFieldingStatsIfPopulated(db, leagueId, throughWeek),
      ])
    : [[], [], []];

  // Build lookups keyed by "playerId_gameIdentifier"
  const battingLookup = new Map<string, (typeof battingRows)[0]>();
  for (const row of battingRows) {
    battingLookup.set(`${row.playerId}_${row.gameIdentifier}`, row);
  }
  const pitchingLookup = new Map<string, (typeof pitchingRows)[0]>();
  for (const row of pitchingRows) {
    pitchingLookup.set(`${row.playerId}_${row.gameIdentifier}`, row);
  }
  const fieldingLookup = new Map<string, (typeof fieldingRows)[0]>();
  for (const row of fieldingRows) {
    fieldingLookup.set(`${row.playerId}_${row.gameIdentifier}`, row);
  }

  // Build matchup player lookup
  const mpLookup = new Map(matchupPlayerRows.map((mp) => [mp.id, mp]));

  // Group matchup_player_games by matchupPlayerId
  const mpGamesGrouped = new Map<number, (typeof mpGameRows)[0][]>();
  for (const mpGame of mpGameRows) {
    const group = mpGamesGrouped.get(mpGame.matchupPlayerId) ?? [];
    group.push(mpGame);
    mpGamesGrouped.set(mpGame.matchupPlayerId, group);
  }

  // Group matchup players by matchupId → teamId → matchupPlayerId[]
  const mpByMatchupAndTeam = new Map<number, Map<number, number[]>>();
  for (const mp of matchupPlayerRows) {
    if (!mpByMatchupAndTeam.has(mp.matchupId)) {
      mpByMatchupAndTeam.set(mp.matchupId, new Map());
    }
    const teamMap =
      mpByMatchupAndTeam.get(mp.matchupId) ?? new Map<number, number[]>();
    if (!teamMap.has(mp.teamId)) {
      teamMap.set(mp.teamId, []);
    }
    const teamMpIds = teamMap.get(mp.teamId) ?? [];
    teamMpIds.push(mp.id);
    teamMap.set(mp.teamId, teamMpIds);
    mpByMatchupAndTeam.set(mp.matchupId, teamMap);
  }

  // Compute a team's total fantasy score for a single matchup
  function computeTeamMatchupScore(matchupId: number, teamId: number): number {
    const teamMpIds = mpByMatchupAndTeam.get(matchupId)?.get(teamId) ?? [];
    let totalScore = 0;

    for (const mpId of teamMpIds) {
      const mp = mpLookup.get(mpId);
      if (!mp) continue;

      const games = mpGamesGrouped.get(mpId) ?? [];
      for (const game of games) {
        if (!game.gameIdentifier) continue;
        const key = `${mp.playerId}_${game.gameIdentifier}`;

        const batting = battingLookup.get(key);
        if (batting) {
          totalScore += applyScoring(batting, scoringWeights.batting);
        }

        const pitching = pitchingLookup.get(key);
        if (pitching) {
          totalScore += applyScoring(pitching, scoringWeights.pitching);
        }

        const fielding = fieldingLookup.get(key);
        if (fielding) {
          totalScore += applyScoring(fielding, scoringWeights.fielding);
        }
      }
    }

    return totalScore;
  }

  // Per-week team scores for the median-game / "all-play" option (LS-6344),
  // populated below only when medianGameEnabled. Keyed by weekNumber →
  // team's completed-matchup score that week.
  const weeklyScoresByWeek = new Map<
    number,
    { teamId: number; score: number }[]
  >();

  // Process each matchup
  for (const matchup of matchups) {
    if (!matchup.team1Id || !matchup.team2Id) continue;

    const score1 = computeTeamMatchupScore(matchup.id, matchup.team1Id);
    const score2 = computeTeamMatchupScore(matchup.id, matchup.team2Id);

    const team1Standing = standingsMap.get(matchup.team1Id);
    const team2Standing = standingsMap.get(matchup.team2Id);
    if (!team1Standing || !team2Standing) continue;

    // Points accumulate from ALL matchups (completed + in_progress)
    team1Standing.pointsFor += score1;
    team1Standing.pointsAgainst += score2;
    team2Standing.pointsFor += score2;
    team2Standing.pointsAgainst += score1;

    // Win/loss/tie record only from completed matchups
    if (matchup.status === 'completed') {
      team1Standing.totalMatchups++;
      team2Standing.totalMatchups++;

      if (score1 > score2) {
        team1Standing.wins++;
        team2Standing.losses++;
      } else if (score2 > score1) {
        team2Standing.wins++;
        team1Standing.losses++;
      } else {
        team1Standing.ties++;
        team2Standing.ties++;
      }

      if (medianGameEnabled) {
        const weekScores = weeklyScoresByWeek.get(matchup.weekNumber) ?? [];
        weekScores.push(
          { teamId: matchup.team1Id, score: score1 },
          { teamId: matchup.team2Id, score: score2 },
        );
        weeklyScoresByWeek.set(matchup.weekNumber, weekScores);
      }
    }
  }

  // Tally the median-game record: each week, a team beats/loses to/ties the
  // median of every team's score that week (the "all-play" comparison).
  if (medianGameEnabled) {
    for (const standing of standingsMap.values()) {
      standing.medianWins = 0;
      standing.medianLosses = 0;
      standing.medianTies = 0;
    }

    for (const weekScores of weeklyScoresByWeek.values()) {
      if (weekScores.length === 0) continue;

      const sorted = [...weekScores].map((s) => s.score).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median =
        sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];

      for (const { teamId, score } of weekScores) {
        const standing = standingsMap.get(teamId);
        if (!standing) continue;

        if (score > median) {
          standing.medianWins = (standing.medianWins ?? 0) + 1;
        } else if (score < median) {
          standing.medianLosses = (standing.medianLosses ?? 0) + 1;
        } else {
          standing.medianTies = (standing.medianTies ?? 0) + 1;
        }
      }
    }
  }

  // Calculate derived stats and convert to array
  const standings = Array.from(standingsMap.values()).map((standing) => {
    const totalGames = standing.wins + standing.losses + standing.ties;
    // For averages, count all matchups with points (completed + in_progress)
    const matchupsWithPoints =
      standingsMap.size > 0
        ? matchups.filter(
            (m) =>
              (m.team1Id === standing.teamId ||
                m.team2Id === standing.teamId) &&
              m.team1Id != null &&
              m.team2Id != null,
          ).length
        : 0;

    return {
      ...standing,
      winPercentage:
        totalGames > 0 ? (standing.wins + standing.ties * 0.5) / totalGames : 0,
      averagePointsFor:
        matchupsWithPoints > 0 ? standing.pointsFor / matchupsWithPoints : 0,
      averagePointsAgainst:
        matchupsWithPoints > 0
          ? standing.pointsAgainst / matchupsWithPoints
          : 0,
    };
  });

  // Sort by win percentage (primary), then by points for (tiebreaker)
  standings.sort((a, b) => {
    if (b.winPercentage !== a.winPercentage) {
      return b.winPercentage - a.winPercentage;
    }
    return b.pointsFor - a.pointsFor;
  });

  // Assign ranks
  standings.forEach((standing, index) => {
    standing.rank = index + 1;
  });

  return standings;
}

/**
 * Get season results summary with standings.
 *
 * Runs calculateStandings and a lightweight SQL COUNT in parallel, eliminating
 * the previous full-table matchup fetch that duplicated the work inside
 * calculateStandings.
 */
export async function getSeasonResults(
  db: PublicDb,
  leagueId: number,
): Promise<SeasonResults> {
  // Note: Season filtering removed - matchups no longer have a selected_season field.
  // Seasons are now per-player (league_week_player_seasons table).
  const [standings, countRows] = await Promise.all([
    calculateStandings(db, leagueId),
    db
      .select({
        status: Schema.matchups.status,
        count: sql<number>`count(*)::int`,
      })
      .from(Schema.matchups)
      .where(eq(Schema.matchups.leagueId, leagueId))
      .groupBy(Schema.matchups.status),
  ]);

  let totalMatchups = 0;
  let completedMatchups = 0;
  for (const row of countRows) {
    const n = Number(row.count);
    totalMatchups += n;
    if (row.status === 'completed') completedMatchups = n;
  }

  return {
    leagueId,
    season: null,
    totalMatchups,
    completedMatchups,
    standings,
  };
}

/**
 * Get playoff qualification data for teams
 * Returns teams sorted by standings, with playoff indicators
 */
export interface PlayoffQualification {
  teamId: number;
  teamName: string;
  isQualified: boolean;
  seedNumber: number | null;
  standing: TeamStanding;
}

/**
 * Playoff seeding indicator shown on the standings table (LS-6345).
 * `CLINCHED` — mathematically guaranteed a playoff spot; `IN` — currently
 * holds a playoff spot but could still be caught; `OUT` — currently outside
 * the playoff line.
 */
export type ClinchStatus = 'CLINCHED' | 'IN' | 'OUT';

/**
 * Deterministic (non-probabilistic) playoff clinch computation.
 *
 * A team holding a playoff spot is `CLINCHED` once no team currently outside
 * the playoff line could catch it even by winning every one of its remaining
 * matchups; every other playoff-spot team is `IN`, and every team below the
 * cutoff is `OUT`. Ties are resolved the same way `calculateStandings` ranks
 * them (win percentage, then points for), so `rank` alone determines the
 * cutoff line — no separate tiebreak logic is needed here.
 *
 * @param standings Teams with their current `rank` (1-based, best first) and
 *   `wins`, as produced by `calculateStandings`.
 * @param remainingMatchupsByTeam Regular-season matchups each team has left
 *   to play.
 * @param playoffSpots Number of teams that make the playoffs.
 */
export function computeClinchStatuses(
  standings: Array<Pick<TeamStanding, 'teamId' | 'wins' | 'rank'>>,
  remainingMatchupsByTeam: Map<number, number>,
  playoffSpots: number,
): Map<number, ClinchStatus> {
  const result = new Map<number, ClinchStatus>();
  if (playoffSpots <= 0 || standings.length === 0) return result;

  const chasers = standings.filter(
    (s) => s.rank == null || s.rank > playoffSpots,
  );
  const maxChaserPossibleWins = chasers.reduce(
    (max, s) =>
      Math.max(max, s.wins + (remainingMatchupsByTeam.get(s.teamId) ?? 0)),
    -Infinity,
  );

  for (const team of standings) {
    if (team.rank == null || team.rank > playoffSpots) {
      result.set(team.teamId, 'OUT');
      continue;
    }
    const clinched = chasers.length === 0 || team.wins > maxChaserPossibleWins;
    result.set(team.teamId, clinched ? 'CLINCHED' : 'IN');
  }

  return result;
}

export async function getPlayoffQualifications(
  db: PublicDb,
  leagueId: number,
  season: number | null,
  playoffSpots: number,
): Promise<PlayoffQualification[]> {
  // Note: Season parameter preserved for API compatibility but ignored
  // Standings are now calculated across all seasons
  const standings = await calculateStandings(db, leagueId);

  return standings.map((standing, index) => ({
    teamId: standing.teamId,
    teamName: standing.teamName,
    isQualified: index < playoffSpots,
    seedNumber: index < playoffSpots ? index + 1 : null,
    standing,
  }));
}

/**
 * Get recent matchups for a team (most recent first)
 */
export async function getRecentMatchupsForTeam(
  db: PublicDb,
  teamId: number,
  limit = 10,
): Promise<Matchup[]> {
  return await db
    .select()
    .from(Schema.matchups)
    .where(
      and(
        or(
          eq(Schema.matchups.team1Id, teamId),
          eq(Schema.matchups.team2Id, teamId),
        ),
        eq(Schema.matchups.status, 'completed'),
      ),
    )
    .orderBy(desc(Schema.matchups.endTime))
    .limit(limit);
}

/**
 * Lean projection of matchup fields needed for win-streak calculation.
 * Only the four columns required by getTeamWinStreak are fetched, avoiding
 * a full SELECT * over the (potentially large) matchups table.
 */
export interface WinStreakMatchup {
  team1Id: number | null;
  team2Id: number | null;
  team1Score: string | null;
  team2Score: string | null;
}

/**
 * Get recent completed matchups for a team, projecting only the four columns
 * needed to compute a win streak (team1Id, team2Id, team1Score, team2Score).
 * The composite indexes matchups_team1_id_end_time_idx /
 * matchups_team2_id_end_time_idx help the planner use index scans for this query.
 */
export async function getWinStreakMatchupsForTeam(
  db: PublicDb,
  teamId: number,
  limit = 50,
): Promise<WinStreakMatchup[]> {
  return await db
    .select({
      team1Id: Schema.matchups.team1Id,
      team2Id: Schema.matchups.team2Id,
      team1Score: Schema.matchups.team1Score,
      team2Score: Schema.matchups.team2Score,
    })
    .from(Schema.matchups)
    .where(
      and(
        or(
          eq(Schema.matchups.team1Id, teamId),
          eq(Schema.matchups.team2Id, teamId),
        ),
        eq(Schema.matchups.status, 'completed'),
      ),
    )
    .orderBy(desc(Schema.matchups.endTime))
    .limit(limit);
}

/**
 * Get matchup count by status for a league
 */
export interface MatchupStatusCounts {
  scheduled: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  total: number;
}

export async function getMatchupStatusCounts(
  db: PublicDb,
  leagueId: number,
): Promise<MatchupStatusCounts> {
  // Note: Season filtering removed - matchups no longer have a selected_season field.
  // Seasons are now per-player (league_week_player_seasons table).

  const rows = await db
    .select({
      status: Schema.matchups.status,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(Schema.matchups)
    .where(eq(Schema.matchups.leagueId, leagueId))
    .groupBy(Schema.matchups.status);

  const counts = {
    scheduled: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
    total: 0,
  };

  for (const row of rows) {
    const n = Number(row.count);
    switch (row.status) {
      case 'scheduled':
        counts.scheduled += n;
        break;
      case 'in_progress':
        counts.inProgress += n;
        break;
      case 'completed':
        counts.completed += n;
        break;
      case 'cancelled':
        counts.cancelled += n;
        break;
    }
    counts.total += n;
  }

  return counts;
}
