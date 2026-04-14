import { and, eq, inArray, sql } from 'drizzle-orm';
import { PublicDb } from './PublicDbClient';
import * as Schema from '../../drizzle/public/schema';

/**
 * A single season in a league's history (one node in the previousLeagueId chain).
 */
export interface LeagueSeasonSummary {
  leagueId: number;
  seasonNumber: number;
  name: string;
  frozenAt: string | null;
  leaguePhase: string;
  totalMatchups: number;
  championTeamId: number | null;
  championTeamName: string | null;
  runnerUpTeamId: number | null;
  runnerUpTeamName: string | null;
  championScore: number | null;
  runnerUpScore: number | null;
}

/**
 * An all-time record across all seasons in a league's history.
 */
export interface AllTimeRecord {
  recordType: string;
  value: number;
  teamName: string;
  teamId: number;
  seasonNumber: number;
  leagueId: number;
  details: string | null;
}

/**
 * Traverse the previousLeagueId chain to collect all league IDs in the lineage.
 * Returns them in reverse chronological order (current season first).
 */
export async function getLeagueLineage(
  db: PublicDb,
  leagueId: number,
): Promise<
  Array<{
    id: number;
    name: string;
    seasonNumber: number;
    frozenAt: Date | null;
    leaguePhase: string;
    previousLeagueId: number | null;
    totalMatchups: number;
  }>
> {
  // Use a recursive CTE to traverse the chain with cycle detection and depth limit.
  // ARRAY[id] tracks visited IDs to prevent cycles; depth caps at 100 seasons.
  const MAX_DEPTH = 100;
  const result = await db.execute<{
    id: number;
    name: string;
    season_number: number;
    frozen_at: string | null;
    league_phase: string;
    previous_league_id: number | null;
    total_matchups: number;
  }>(sql`
    WITH RECURSIVE lineage AS (
      SELECT id, name, season_number, frozen_at, league_phase, previous_league_id, total_matchups,
             1 AS depth, ARRAY[id] AS visited
      FROM leagues
      WHERE id = ${leagueId}
      UNION ALL
      SELECT l.id, l.name, l.season_number, l.frozen_at, l.league_phase, l.previous_league_id, l.total_matchups,
             ln.depth + 1, ln.visited || l.id
      FROM leagues l
      INNER JOIN lineage ln ON l.id = ln.previous_league_id
      WHERE l.id <> ALL(ln.visited)
        AND ln.depth < ${MAX_DEPTH}
    )
    SELECT id, name, season_number, frozen_at, league_phase, previous_league_id, total_matchups
    FROM lineage
    ORDER BY season_number DESC
  `);

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    seasonNumber: row.season_number,
    frozenAt: row.frozen_at ? new Date(row.frozen_at) : null,
    leaguePhase: row.league_phase,
    previousLeagueId: row.previous_league_id,
    totalMatchups: row.total_matchups,
  }));
}

/**
 * Get season summaries for all seasons in a league's history,
 * including champion information from champion_trophies.
 */
export async function getLeagueSeasonSummaries(
  db: PublicDb,
  leagueId: number,
): Promise<LeagueSeasonSummary[]> {
  const lineage = await getLeagueLineage(db, leagueId);
  if (lineage.length === 0) return [];

  const leagueIds = lineage.map((l) => l.id);

  // Fetch champion trophies for all leagues in the chain
  const trophies = await db
    .select({
      leagueId: Schema.championTrophies.leagueId,
      season: Schema.championTrophies.season,
      teamId: Schema.championTrophies.teamId,
      runnerUpTeamId: Schema.championTrophies.runnerUpTeamId,
      finalScore: Schema.championTrophies.finalScore,
      runnerUpScore: Schema.championTrophies.runnerUpScore,
    })
    .from(Schema.championTrophies)
    .where(inArray(Schema.championTrophies.leagueId, leagueIds));

  // Collect team IDs from trophies to look up names
  const trophyTeamIds = new Set<number>();
  for (const t of trophies) {
    trophyTeamIds.add(t.teamId);
    if (t.runnerUpTeamId) trophyTeamIds.add(t.runnerUpTeamId);
  }

  // Fetch team names
  const teamNames = new Map<number, string>();
  if (trophyTeamIds.size > 0) {
    const teamRows = await db
      .select({ id: Schema.teams.id, name: Schema.teams.name })
      .from(Schema.teams)
      .where(inArray(Schema.teams.id, [...trophyTeamIds]));
    for (const t of teamRows) {
      teamNames.set(t.id, t.name);
    }
  }

  // Build a lookup: (leagueId, season) → trophy
  // champion_trophies is unique on (league_id, season), so a single leagueId
  // can have multiple trophy rows — keying only by leagueId would drop all but one.
  const trophyMap = new Map<string, (typeof trophies)[0]>();
  for (const t of trophies) {
    const key = `${t.leagueId}-${t.season}`;
    trophyMap.set(key, t);
  }

  return lineage.map((league) => {
    const trophy = trophyMap.get(`${league.id}-${league.seasonNumber}`);
    return {
      leagueId: league.id,
      seasonNumber: league.seasonNumber,
      name: league.name,
      frozenAt: league.frozenAt?.toISOString() ?? null,
      leaguePhase: league.leaguePhase,
      totalMatchups: league.totalMatchups,
      championTeamId: trophy?.teamId ?? null,
      championTeamName: trophy ? (teamNames.get(trophy.teamId) ?? null) : null,
      runnerUpTeamId: trophy?.runnerUpTeamId ?? null,
      runnerUpTeamName: trophy?.runnerUpTeamId
        ? (teamNames.get(trophy.runnerUpTeamId) ?? null)
        : null,
      championScore: trophy?.finalScore ? parseFloat(trophy.finalScore) : null,
      runnerUpScore: trophy?.runnerUpScore
        ? parseFloat(trophy.runnerUpScore)
        : null,
    };
  });
}

/**
 * Compute all-time records across all seasons in a league's lineage.
 *
 * Records computed:
 * - most_wins: Most wins (all matchups including playoffs) in a single season
 * - highest_score: Highest single-matchup team score
 * - longest_win_streak: Longest consecutive win streak within a season
 * - most_points_season: Most total points scored in a season
 */
export async function getAllTimeRecords(
  db: PublicDb,
  leagueId: number,
): Promise<AllTimeRecord[]> {
  const lineage = await getLeagueLineage(db, leagueId);
  if (lineage.length === 0) return [];

  const leagueIds = lineage.map((l) => l.id);
  const leagueSeasonMap = new Map(lineage.map((l) => [l.id, l.seasonNumber]));

  // Fetch all completed matchups across the lineage
  const matchups = await db
    .select({
      id: Schema.matchups.id,
      leagueId: Schema.matchups.leagueId,
      weekNumber: Schema.matchups.weekNumber,
      team1Id: Schema.matchups.team1Id,
      team2Id: Schema.matchups.team2Id,
      team1Score: Schema.matchups.team1Score,
      team2Score: Schema.matchups.team2Score,
    })
    .from(Schema.matchups)
    .where(
      and(
        inArray(Schema.matchups.leagueId, leagueIds),
        eq(Schema.matchups.status, 'completed'),
      ),
    )
    .orderBy(Schema.matchups.leagueId, Schema.matchups.weekNumber);

  // Fetch all teams across the lineage for name lookups
  const allTeams = await db
    .select({
      id: Schema.teams.id,
      name: Schema.teams.name,
      leagueId: Schema.teams.leagueId,
    })
    .from(Schema.teams)
    .where(inArray(Schema.teams.leagueId, leagueIds));

  const teamNameMap = new Map(allTeams.map((t) => [t.id, t.name]));

  const records: AllTimeRecord[] = [];

  // ── Highest single-matchup score ──
  let highestScore = 0;
  let highestScoreTeamId = 0;
  let highestScoreLeagueId = 0;

  for (const m of matchups) {
    const s1 = m.team1Score ? parseFloat(m.team1Score) : 0;
    const s2 = m.team2Score ? parseFloat(m.team2Score) : 0;

    if (s1 > highestScore && m.team1Id) {
      highestScore = s1;
      highestScoreTeamId = m.team1Id;
      highestScoreLeagueId = m.leagueId;
    }
    if (s2 > highestScore && m.team2Id) {
      highestScore = s2;
      highestScoreTeamId = m.team2Id;
      highestScoreLeagueId = m.leagueId;
    }
  }

  if (highestScoreTeamId) {
    records.push({
      recordType: 'highest_score',
      value: highestScore,
      teamName: teamNameMap.get(highestScoreTeamId) ?? 'Unknown',
      teamId: highestScoreTeamId,
      seasonNumber: leagueSeasonMap.get(highestScoreLeagueId) ?? 0,
      leagueId: highestScoreLeagueId,
      details: `${highestScore.toFixed(1)} points in a single matchup`,
    });
  }

  // ── Per-season W/L/Points aggregation ──
  // Group matchups by league (season) and team
  const seasonTeamStats = new Map<
    string, // `${leagueId}_${teamId}`
    {
      wins: number;
      losses: number;
      pointsFor: number;
      leagueId: number;
      teamId: number;
    }
  >();

  for (const m of matchups) {
    if (!m.team1Id || !m.team2Id) continue;
    const s1 = m.team1Score ? parseFloat(m.team1Score) : 0;
    const s2 = m.team2Score ? parseFloat(m.team2Score) : 0;

    const key1 = `${m.leagueId}_${m.team1Id}`;
    const key2 = `${m.leagueId}_${m.team2Id}`;

    if (!seasonTeamStats.has(key1)) {
      seasonTeamStats.set(key1, {
        wins: 0,
        losses: 0,
        pointsFor: 0,
        leagueId: m.leagueId,
        teamId: m.team1Id,
      });
    }
    if (!seasonTeamStats.has(key2)) {
      seasonTeamStats.set(key2, {
        wins: 0,
        losses: 0,
        pointsFor: 0,
        leagueId: m.leagueId,
        teamId: m.team2Id,
      });
    }

    const stat1 = seasonTeamStats.get(key1);
    const stat2 = seasonTeamStats.get(key2);
    if (!stat1 || !stat2) continue;

    stat1.pointsFor += s1;
    stat2.pointsFor += s2;

    if (s1 > s2) {
      stat1.wins++;
      stat2.losses++;
    } else if (s2 > s1) {
      stat2.wins++;
      stat1.losses++;
    }
  }

  // Most wins in a season
  let mostWins = 0;
  let mostWinsEntry: { leagueId: number; teamId: number } | null = null;

  // Most points in a season
  let mostPoints = 0;
  let mostPointsEntry: { leagueId: number; teamId: number } | null = null;

  for (const stat of seasonTeamStats.values()) {
    if (stat.wins > mostWins) {
      mostWins = stat.wins;
      mostWinsEntry = { leagueId: stat.leagueId, teamId: stat.teamId };
    }
    if (stat.pointsFor > mostPoints) {
      mostPoints = stat.pointsFor;
      mostPointsEntry = { leagueId: stat.leagueId, teamId: stat.teamId };
    }
  }

  if (mostWinsEntry) {
    records.push({
      recordType: 'most_wins',
      value: mostWins,
      teamName: teamNameMap.get(mostWinsEntry.teamId) ?? 'Unknown',
      teamId: mostWinsEntry.teamId,
      seasonNumber: leagueSeasonMap.get(mostWinsEntry.leagueId) ?? 0,
      leagueId: mostWinsEntry.leagueId,
      details: `${mostWins} wins in Season ${leagueSeasonMap.get(mostWinsEntry.leagueId) ?? '?'}`,
    });
  }

  if (mostPointsEntry) {
    records.push({
      recordType: 'most_points_season',
      value: Math.round(mostPoints * 10) / 10,
      teamName: teamNameMap.get(mostPointsEntry.teamId) ?? 'Unknown',
      teamId: mostPointsEntry.teamId,
      seasonNumber: leagueSeasonMap.get(mostPointsEntry.leagueId) ?? 0,
      leagueId: mostPointsEntry.leagueId,
      details: `${mostPoints.toFixed(1)} total points in Season ${leagueSeasonMap.get(mostPointsEntry.leagueId) ?? '?'}`,
    });
  }

  // ── Longest win streak (within each season) ──
  let longestStreak = 0;
  let longestStreakTeamId = 0;
  let longestStreakLeagueId = 0;

  // Group matchups by league, then for each team compute streaks
  const matchupsByLeague = new Map<number, typeof matchups>();
  for (const m of matchups) {
    let leagueList = matchupsByLeague.get(m.leagueId);
    if (!leagueList) {
      leagueList = [];
      matchupsByLeague.set(m.leagueId, leagueList);
    }
    leagueList.push(m);
  }

  for (const [lid, leagueMatchups] of matchupsByLeague) {
    // Collect all team IDs in this league
    const teamIds = new Set<number>();
    for (const m of leagueMatchups) {
      if (m.team1Id) teamIds.add(m.team1Id);
      if (m.team2Id) teamIds.add(m.team2Id);
    }

    for (const teamId of teamIds) {
      // Get matchups involving this team, sorted by week
      const teamMatchups = leagueMatchups
        .filter((m) => m.team1Id === teamId || m.team2Id === teamId)
        .sort((a, b) => a.weekNumber - b.weekNumber);

      let streak = 0;
      for (const m of teamMatchups) {
        const isTeam1 = m.team1Id === teamId;
        const teamScore = isTeam1
          ? parseFloat(m.team1Score ?? '0')
          : parseFloat(m.team2Score ?? '0');
        const oppScore = isTeam1
          ? parseFloat(m.team2Score ?? '0')
          : parseFloat(m.team1Score ?? '0');

        if (teamScore > oppScore) {
          streak++;
          if (streak > longestStreak) {
            longestStreak = streak;
            longestStreakTeamId = teamId;
            longestStreakLeagueId = lid;
          }
        } else {
          streak = 0;
        }
      }
    }
  }

  if (longestStreakTeamId) {
    records.push({
      recordType: 'longest_win_streak',
      value: longestStreak,
      teamName: teamNameMap.get(longestStreakTeamId) ?? 'Unknown',
      teamId: longestStreakTeamId,
      seasonNumber: leagueSeasonMap.get(longestStreakLeagueId) ?? 0,
      leagueId: longestStreakLeagueId,
      details: `${longestStreak} consecutive wins in Season ${leagueSeasonMap.get(longestStreakLeagueId) ?? '?'}`,
    });
  }

  return records;
}
