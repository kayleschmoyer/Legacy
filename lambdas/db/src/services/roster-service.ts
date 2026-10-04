/**
 * Roster Service
 *
 * Shared utilities for common roster operations used across drafts, waivers,
 * and commissioner tools. Eliminates duplicated teamMembers queries.
 */

import { type GenericDatabase, PublicSchema } from '@legacy-sports/db-client';
import { and, count, eq, inArray } from 'drizzle-orm';

import { RosterOverLimitError } from '../schema/graphql-errors';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AddPlayerToRosterParams {
  teamId: number;
  leagueId: number;
  playerId: number;
  acquisitionType: string;
  positionId?: number | null;
  draftRound?: number | null;
  draftPick?: number | null;
  /** Salary cap hit for this roster slot. Null in non-salary-cap leagues. (LS-643) */
  salary?: number | null;
}

// ── isPlayerOnRoster ───────────────────────────────────────────────────────

/**
 * Returns true if `playerId` is already on any team's roster in `leagueId`.
 */
export async function isPlayerOnRoster(
  db: GenericDatabase<typeof PublicSchema>,
  leagueId: number,
  playerId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: PublicSchema.teamMembers.id })
    .from(PublicSchema.teamMembers)
    .where(
      and(
        eq(PublicSchema.teamMembers.leagueId, leagueId),
        eq(PublicSchema.teamMembers.playerId, playerId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// ── checkRosterCapacity ────────────────────────────────────────────────────

/**
 * Returns the current roster size and whether the team is at maximum capacity.
 * Callers decide how to handle a full roster based on their context
 * (e.g. throw, fail a claim, block with a conditional drop, etc.).
 */
export async function checkRosterCapacity(
  db: GenericDatabase<typeof PublicSchema>,
  teamId: number,
  leagueId: number,
  maxRosterSize: number,
): Promise<{ currentSize: number; isFull: boolean }> {
  const [row] = await db
    .select({ total: count() })
    .from(PublicSchema.teamMembers)
    .where(
      and(
        eq(PublicSchema.teamMembers.teamId, teamId),
        eq(PublicSchema.teamMembers.leagueId, leagueId),
      ),
    );
  const currentSize = Number(row?.total ?? 0);
  return { currentSize, isFull: currentSize >= maxRosterSize };
}

// ── Roster limit lock (LS-10477) ───────────────────────────────────────────

/**
 * Over-limit state for one team. A trade always completes even if it takes a
 * team over `maxRosterSize`; afterwards that team is locked from every roster
 * move except releasing players until it is back at or below the limit.
 */
export interface RosterLimitStatus {
  rosterSize: number;
  maxRosterSize: number;
  isOverLimit: boolean;
  /** How many players the team must release to get back to the limit (0 when not over). */
  playersToRelease: number;
}

/** Pure computation behind {@link getRosterLimitStatus}. */
export function computeRosterLimitStatus(
  rosterSize: number,
  maxRosterSize: number,
): RosterLimitStatus {
  const playersToRelease = Math.max(0, rosterSize - maxRosterSize);
  return {
    rosterSize,
    maxRosterSize,
    isOverLimit: playersToRelease > 0,
    playersToRelease,
  };
}

/** Counts the team's roster and compares it to `maxRosterSize`. */
export async function getRosterLimitStatus(
  db: GenericDatabase<typeof PublicSchema>,
  teamId: number,
  leagueId: number,
  maxRosterSize: number,
): Promise<RosterLimitStatus> {
  const { currentSize } = await checkRosterCapacity(
    db,
    teamId,
    leagueId,
    maxRosterSize,
  );
  return computeRosterLimitStatus(currentSize, maxRosterSize);
}

/**
 * Shared guard for every roster-changing mutation except releases/drops.
 *
 * Throws `ROSTER_OVER_LIMIT` when the team is currently over the limit and
 * the move would leave it over the limit. `netChange` is the move's effect on
 * the team's roster size (+1 for a free-agent add, 0 for an add/drop swap,
 * incoming − outgoing for a trade), so a trade that sends out enough players
 * to bring the team back to the limit is still allowed. Teams at or under
 * the limit are never blocked here — capacity checks for normal adds stay
 * with each caller (e.g. "Roster is full. You must drop a player").
 */
export async function assertRosterNotOverLimit(
  db: GenericDatabase<typeof PublicSchema>,
  params: {
    teamId: number;
    leagueId: number;
    maxRosterSize: number;
    netChange?: number;
    /** True when the team belongs to the caller; shapes the error message. */
    isOwnTeam?: boolean;
    teamName?: string | null;
  },
): Promise<void> {
  const {
    teamId,
    leagueId,
    maxRosterSize,
    netChange = 0,
    isOwnTeam = true,
    teamName = null,
  } = params;
  const status = await getRosterLimitStatus(
    db,
    teamId,
    leagueId,
    maxRosterSize,
  );
  if (status.isOverLimit && status.rosterSize + netChange > maxRosterSize) {
    throw RosterOverLimitError({
      teamId,
      teamName,
      rosterSize: status.rosterSize,
      maxRosterSize,
      isOwnTeam,
    });
  }
}

// ── addPlayerToRoster ──────────────────────────────────────────────────────

/**
 * Inserts a player into a team's roster (teamMembers table).
 * Optional fields (`positionId`, `draftRound`, `draftPick`) default to null.
 */
export async function addPlayerToRoster(
  db: GenericDatabase<typeof PublicSchema>,
  params: AddPlayerToRosterParams,
): Promise<void> {
  const {
    teamId,
    leagueId,
    playerId,
    acquisitionType,
    positionId = null,
    draftRound = null,
    draftPick = null,
    salary = null,
  } = params;
  await db.insert(PublicSchema.teamMembers).values({
    teamId,
    leagueId,
    playerId,
    acquisitionType,
    positionId,
    draftRound,
    draftPick,
    salary,
  });
}

// ── removePlayerFromRoster ─────────────────────────────────────────────────

/**
 * Releases `playerId` from the team's roster: deletes the team_members row and
 * removes the player from the team's *scheduled* matchups, in one transaction
 * so a matchup cleanup failure cannot leave the team short a roster row.
 * Locked (`in_progress`) matchups are intentionally untouched — scoring for
 * the in-flight week must use the roster as it was when the week started.
 *
 * Returns false (and changes nothing) when the player is not on the roster.
 * Shared by waiver add/drop claims and the over-limit `releasePlayer`
 * mutation (LS-10477).
 */
export async function removePlayerFromRoster(
  db: GenericDatabase<typeof PublicSchema>,
  params: { teamId: number; leagueId: number; playerId: number },
): Promise<boolean> {
  const { teamId, leagueId, playerId } = params;
  const member = await db
    .select({ id: PublicSchema.teamMembers.id })
    .from(PublicSchema.teamMembers)
    .where(
      and(
        eq(PublicSchema.teamMembers.teamId, teamId),
        eq(PublicSchema.teamMembers.leagueId, leagueId),
        eq(PublicSchema.teamMembers.playerId, playerId),
      ),
    )
    .limit(1);

  if (member.length === 0) return false;

  // Fetch scheduled matchup IDs inside the transaction and only run the
  // delete when non-empty (guards against an empty-array inArray()).
  await db.transaction(async (tx) => {
    await tx
      .delete(PublicSchema.teamMembers)
      .where(eq(PublicSchema.teamMembers.id, member[0].id));

    const scheduledMatchups = await tx
      .select({ id: PublicSchema.matchups.id })
      .from(PublicSchema.matchups)
      .where(
        and(
          eq(PublicSchema.matchups.leagueId, leagueId),
          eq(PublicSchema.matchups.status, 'scheduled'),
        ),
      );
    const scheduledMatchupIds = scheduledMatchups.map((m) => m.id);

    if (scheduledMatchupIds.length > 0) {
      await tx
        .delete(PublicSchema.matchupPlayers)
        .where(
          and(
            eq(PublicSchema.matchupPlayers.teamId, teamId),
            eq(PublicSchema.matchupPlayers.playerId, playerId),
            inArray(PublicSchema.matchupPlayers.matchupId, scheduledMatchupIds),
          ),
        );
    }
  });

  return true;
}
