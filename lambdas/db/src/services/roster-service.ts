/**
 * Roster Service
 *
 * Shared utilities for common roster operations used across drafts, waivers,
 * and commissioner tools. Eliminates duplicated teamMembers queries.
 */

import { type GenericDatabase, PublicSchema } from '@legacy-sports/db-client';
import { and, count, eq } from 'drizzle-orm';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AddPlayerToRosterParams {
  teamId: number;
  leagueId: number;
  playerId: number;
  acquisitionType: string;
  positionId?: number | null;
  draftRound?: number | null;
  draftPick?: number | null;
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
  } = params;
  await db.insert(PublicSchema.teamMembers).values({
    teamId,
    leagueId,
    playerId,
    acquisitionType,
    positionId,
    draftRound,
    draftPick,
  });
}
