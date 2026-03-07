/**
 * Salary Cap Service
 *
 * Shared utilities for computing team payroll and enforcing the salary cap
 * across roster transactions (FAAB claims, trades, commissioner actions).
 */

import { type GenericDatabase, PublicSchema } from '@legacy-sports/db-client';
import { and, eq, inArray, notInArray, sql, sum } from 'drizzle-orm';

// ── computeTeamPayroll ─────────────────────────────────────────────────────

/**
 * Returns the current total payroll for a team in a league.
 * Sums `team_members.salary` — null salary slots (non-cap leagues) are treated
 * as 0 via COALESCE in the SQL expression.
 */
export async function computeTeamPayroll(
  db: GenericDatabase<typeof PublicSchema>,
  teamId: number,
  leagueId: number,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(${sum(PublicSchema.teamMembers.salary)}, 0)`,
    })
    .from(PublicSchema.teamMembers)
    .where(
      and(
        eq(PublicSchema.teamMembers.teamId, teamId),
        eq(PublicSchema.teamMembers.leagueId, leagueId),
      ),
    );
  return Number(row?.total ?? 0);
}

// ── computeTeamPayrollExcluding ────────────────────────────────────────────

/**
 * Returns the payroll for a team excluding the salary of specific players.
 * Used during trade validation to compute post-trade payroll for the team
 * that is giving players away.
 */
export async function computeTeamPayrollExcluding(
  db: GenericDatabase<typeof PublicSchema>,
  teamId: number,
  leagueId: number,
  excludePlayerIds: number[],
): Promise<number> {
  if (excludePlayerIds.length === 0) {
    return computeTeamPayroll(db, teamId, leagueId);
  }
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(${sum(PublicSchema.teamMembers.salary)}, 0)`,
    })
    .from(PublicSchema.teamMembers)
    .where(
      and(
        eq(PublicSchema.teamMembers.teamId, teamId),
        eq(PublicSchema.teamMembers.leagueId, leagueId),
        notInArray(PublicSchema.teamMembers.playerId, excludePlayerIds),
      ),
    );
  return Number(row?.total ?? 0);
}

// ── fetchPlayerSalaries ────────────────────────────────────────────────────

/**
 * Returns a map of playerId → current salary for a set of players in a league.
 * Falls back to `minSalary` for players with no `player_salaries` record.
 */
export async function fetchPlayerSalaries(
  db: GenericDatabase<typeof PublicSchema>,
  leagueId: number,
  playerIds: number[],
  minSalary: number,
): Promise<Map<number, number>> {
  if (playerIds.length === 0) return new Map();
  const rows = await db
    .select({
      playerId: PublicSchema.playerSalaries.playerId,
      currentSalary: PublicSchema.playerSalaries.currentSalary,
    })
    .from(PublicSchema.playerSalaries)
    .where(
      and(
        eq(PublicSchema.playerSalaries.leagueId, leagueId),
        inArray(PublicSchema.playerSalaries.playerId, playerIds),
      ),
    );
  const map = new Map<number, number>(
    rows.map((r) => [r.playerId, r.currentSalary]),
  );
  // Fill in minSalary for any player without a record
  for (const pid of playerIds) {
    if (!map.has(pid)) map.set(pid, minSalary);
  }
  return map;
}

// ── assertCapSpace ─────────────────────────────────────────────────────────

/**
 * Throws if adding `incomingSalary` (minus `outgoingSalary`) would push
 * `currentPayroll` over `salaryCap`.
 *
 * @param currentPayroll   Team's payroll before the transaction
 * @param incomingSalary   Total salary being added (bid, claimed salary, etc.)
 * @param outgoingSalary   Total salary being removed (players sent in trade, etc.)
 * @param salaryCap        League salary cap ceiling
 */
export function assertCapSpace(
  currentPayroll: number,
  incomingSalary: number,
  outgoingSalary: number,
  salaryCap: number,
): void {
  const projectedPayroll = currentPayroll + incomingSalary - outgoingSalary;
  if (projectedPayroll > salaryCap) {
    const over = projectedPayroll - salaryCap;
    throw new Error(
      `This transaction would put the team $${over} over the salary cap ` +
        `(cap: $${salaryCap}, projected payroll: $${projectedPayroll})`,
    );
  }
}
