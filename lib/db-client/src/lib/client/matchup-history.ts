import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Drizzle `or` typing limitation with multiple conditions
        or(
          and(
            eq(Schema.matchups.team1Id, team1Id),
            eq(Schema.matchups.team2Id, team2Id),
          ),
          and(
            eq(Schema.matchups.team1Id, team2Id),
            eq(Schema.matchups.team2Id, team1Id),
          ),
        ) as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Drizzle or() typing limitation
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
 * In-flight promise cache for calculateStandings, keyed by db instance → leagueId.
 *
 * Purpose: deduplicate concurrent calls within the same request lifecycle
 * (e.g. multiple GraphQL resolvers asking for the same league's standings).
 * The entry is removed once the promise settles, so subsequent requests always
 * compute fresh standings.
 */
const standingsInFlight = new WeakMap<
  object,
  Map<number, Promise<TeamStanding[]>>
>();

function getInFlightCache(db: object): Map<number, Promise<TeamStanding[]>> {
  let cache = standingsInFlight.get(db);
  if (!cache) {
    cache = new Map();
    standingsInFlight.set(db, cache);
  }
  return cache;
}

/**
 * Calculate standings for a league.
 *
 * Points (pointsFor / pointsAgainst) are computed from game stats
 * (batting, pitching, fielding) using the league's scoring profile.
 * Points accumulate from BOTH completed AND in-progress matchups.
 * Win/loss/tie record is determined only from completed matchups.
 *
 * Concurrent calls with the same db + leagueId share a single in-flight
 * promise, eliminating redundant DB queries within a single request.
 */
export function calculateStandings(
  db: PublicDb,
  leagueId: number,
): Promise<TeamStanding[]> {
  const cache = getInFlightCache(db as object);
  const existing = cache.get(leagueId);
  if (existing) return existing;

  const promise = _computeStandings(db, leagueId);
  cache.set(leagueId, promise);
  // Remove from cache once settled so the next request always fetches fresh data.
  promise.then(
    () => cache.delete(leagueId),
    () => cache.delete(leagueId),
  );
  return promise;
}

async function _computeStandings(
  db: PublicDb,
  leagueId: number,
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

  // Initialize standings map
  const standingsMap = new Map<number, TeamStanding>();
  for (const team of teams) {
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
      divisionId: team.divisionId ?? null,
    });
  }

  // Get scoring multipliers for this league (converted to camelCase for Drizzle rows)
  const rawMultipliers = await getScoringMultipliersForLeague(db, leagueId);
  const scoringWeights: LeagueScoringMultipliers = {
    batting: camelCaseMultipliers(rawMultipliers.batting),
    pitching: camelCaseMultipliers(rawMultipliers.pitching),
    fielding: camelCaseMultipliers(rawMultipliers.fielding),
  };

  // Get all completed + in_progress matchups for the league
  const matchups = await db
    .select()
    .from(Schema.matchups)
    .where(
      and(
        eq(Schema.matchups.leagueId, leagueId),
        or(
          eq(Schema.matchups.status, 'completed'),
          eq(Schema.matchups.status, 'in_progress'),
        ),
      ),
    );

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

  // Collect unique game identifiers and player IDs for batch stat queries
  const gameIdentifiers = [
    ...new Set(
      mpGameRows
        .map((g) => g.gameIdentifier)
        .filter((g): g is string => g != null),
    ),
  ];
  const playerIds = [...new Set(matchupPlayerRows.map((mp) => mp.playerId))];

  // Batch query game stats (batting, pitching, fielding) in parallel
  const [battingRows, pitchingRows, fieldingRows] =
    gameIdentifiers.length > 0 && playerIds.length > 0
      ? await Promise.all([
          db
            .select()
            .from(Schema.gameBatting)
            .where(
              and(
                inArray(Schema.gameBatting.playerId, playerIds),
                inArray(Schema.gameBatting.gameIdentifier, gameIdentifiers),
              ),
            ),
          db
            .select()
            .from(Schema.gamePitching)
            .where(
              and(
                inArray(Schema.gamePitching.playerId, playerIds),
                inArray(Schema.gamePitching.gameIdentifier, gameIdentifiers),
              ),
            ),
          db
            .select()
            .from(Schema.gameFielding)
            .where(
              and(
                inArray(Schema.gameFielding.playerId, playerIds),
                inArray(Schema.gameFielding.gameIdentifier, gameIdentifiers),
              ),
            ),
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
          totalScore += applyScoring(
            batting as unknown as Record<string, unknown>,
            scoringWeights.batting,
          );
        }

        const pitching = pitchingLookup.get(key);
        if (pitching) {
          totalScore += applyScoring(
            pitching as unknown as Record<string, unknown>,
            scoringWeights.pitching,
          );
        }

        const fielding = fieldingLookup.get(key);
        if (fielding) {
          totalScore += applyScoring(
            fielding as unknown as Record<string, unknown>,
            scoringWeights.fielding,
          );
        }
      }
    }

    return totalScore;
  }

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Drizzle `or` typing limitation with multiple conditions
        or(
          eq(Schema.matchups.team1Id, teamId),
          eq(Schema.matchups.team2Id, teamId),
        ) as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Drizzle or() typing limitation
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
  const conditions = [eq(Schema.matchups.leagueId, leagueId)];

  // Note: Season filtering removed - matchups no longer have a selected_season field.
  // Seasons are now per-player (league_week_player_seasons table).

  const matchups = await db
    .select()
    .from(Schema.matchups)
    .where(and(...conditions));

  const counts = {
    scheduled: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
    total: matchups.length,
  };

  for (const matchup of matchups) {
    switch (matchup.status) {
      case 'scheduled':
        counts.scheduled++;
        break;
      case 'in_progress':
        counts.inProgress++;
        break;
      case 'completed':
        counts.completed++;
        break;
      case 'cancelled':
        counts.cancelled++;
        break;
    }
  }

  return counts;
}
