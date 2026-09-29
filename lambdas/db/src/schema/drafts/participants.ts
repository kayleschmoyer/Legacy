/**
 * Draft domain — draft seats (`draft_participants`), LS-10074.
 *
 * `draft_teams` mapped a draft slot to a league team, which is exactly the
 * assumption a draft-first mock draft (epic LS-9252) cannot satisfy: it has no
 * league and no teams. `draft_participants` (LS-10073) replaces it with a seat
 * that may be held by a team, a user, or nobody.
 *
 * This module is the only place the draft domain reads or writes seats. League
 * drafts keep one seat per league team, so every function here is a
 * like-for-like replacement for the `draft_teams` statement it supersedes —
 * this slice is behavior-neutral.
 *
 * `draft_teams` is no longer written by any of these paths. The table stays
 * (and its commit-time reconcile trigger with it) until slice 8 drops it, so
 * an in-flight draft written by the previously deployed lambdas keeps working.
 */

import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

type ParticipantRow = typeof PublicSchema.draftParticipants.$inferSelect;

/** Who drives a seat: a human (`user`), auto-pick (`ai`), or nobody yet (`open`). */
export type SeatController = ParticipantRow['controller'];

/** A draft seat, in the shape the draft engine consumes. */
export interface DraftSeat {
  /** `draft_participants.id` — the `participant_id` written onto picks/queue/auction rows. */
  id: number;
  draftId: number;
  /** 1-based draft position (the old `draft_teams.draft_order`). */
  slot: number;
  teamId: number | null;
  leagueId: number | null;
  userId: number | null;
  controller: SeatController;
  seatName: string;
  autoPick: boolean;
}

/**
 * Seat projection, built per call rather than once at module load: several
 * resolver specs mock `@legacy-sports/db-client` with only the tables they
 * exercise, and a module-level map would dereference an absent
 * `PublicSchema.draftParticipants` the moment this module is imported.
 */
const seatColumns = () =>
  ({
    id: PublicSchema.draftParticipants.id,
    draftId: PublicSchema.draftParticipants.draftId,
    slot: PublicSchema.draftParticipants.slot,
    teamId: PublicSchema.draftParticipants.teamId,
    leagueId: PublicSchema.draftParticipants.leagueId,
    userId: PublicSchema.draftParticipants.userId,
    controller: PublicSchema.draftParticipants.controller,
    seatName: PublicSchema.draftParticipants.seatName,
    autoPick: PublicSchema.draftParticipants.autoPick,
  }) as const;

/** `seat_name` is `varchar(40)`; team names are not. */
const SEAT_NAME_MAX_LENGTH = 40;

/**
 * Every seat in a draft, ordered by slot — the replacement for
 * `SELECT ... FROM draft_teams ORDER BY draft_order`.
 */
export async function getDraftSeats(
  db: PublicDb,
  draftId: number,
): Promise<DraftSeat[]> {
  return db
    .select(seatColumns())
    .from(PublicSchema.draftParticipants)
    .where(eq(PublicSchema.draftParticipants.draftId, draftId))
    .orderBy(asc(PublicSchema.draftParticipants.slot));
}

/** One seat by its `draft_participants.id`, or `null` when it is gone. */
export async function getSeatById(
  db: PublicDb,
  participantId: number,
): Promise<DraftSeat | null> {
  const [seat] = await db
    .select(seatColumns())
    .from(PublicSchema.draftParticipants)
    .where(eq(PublicSchema.draftParticipants.id, participantId))
    .limit(1);

  return seat ?? null;
}

/**
 * The seat a user holds in a draft, or `null` when they hold none.
 *
 * A mock-draft seat is held by its `user_id` (LS-10076). A league seat holds a
 * team rather than a user, so this only ever matches mock-draft seats; league
 * drafts resolve a seat through the caller's team ({@link getSeatForTeam}).
 */
export async function getSeatForUser(
  db: PublicDb,
  draftId: number,
  userId: number,
): Promise<DraftSeat | null> {
  const [seat] = await db
    .select(seatColumns())
    .from(PublicSchema.draftParticipants)
    .where(
      and(
        eq(PublicSchema.draftParticipants.draftId, draftId),
        eq(PublicSchema.draftParticipants.userId, userId),
      ),
    )
    .orderBy(asc(PublicSchema.draftParticipants.slot))
    .limit(1);

  return seat ?? null;
}

/** The seat a league team holds in a draft, or `null` when it holds none. */
export async function getSeatForTeam(
  db: PublicDb,
  draftId: number,
  teamId: number,
): Promise<DraftSeat | null> {
  const [seat] = await db
    .select(seatColumns())
    .from(PublicSchema.draftParticipants)
    .where(
      and(
        eq(PublicSchema.draftParticipants.draftId, draftId),
        eq(PublicSchema.draftParticipants.teamId, teamId),
      ),
    )
    .limit(1);

  return seat ?? null;
}

/**
 * The `participant_id` for a league team's seat, or `null` when it has none.
 *
 * Pick / queue / auction writers pass this explicitly instead of relying on
 * the LS-10073 bridge trigger to resolve it from `team_id` — the trigger stays
 * in place for the previously deployed lambdas, but a writer that knows its
 * own seat should say so.
 */
export async function getParticipantIdForTeam(
  db: PublicDb,
  draftId: number,
  teamId: number,
): Promise<number | null> {
  const seat = await getSeatForTeam(db, draftId, teamId);
  return seat?.id ?? null;
}

/**
 * Controller for a league seat, mirroring the `draft_seat_controller` SQL
 * function the LS-10073 backfill and its bridge trigger use: a seat is driven
 * by `ai` only when it auto-picks *and* no league member manages the team.
 * A managed team that turned auto-pick on is still `user`-controlled — a human
 * is there, they just stepped away from the board.
 */
function seatController(autoPick: boolean, hasMember: boolean): SeatController {
  return autoPick && !hasMember ? 'ai' : 'user';
}

/** Team ids in `teamIds` that some league member manages (any permission level). */
async function teamIdsWithMember(
  db: PublicDb,
  leagueId: number,
  teamIds: number[],
): Promise<Set<number>> {
  if (teamIds.length === 0) return new Set();

  const rows = await db
    .select({ teamId: PublicSchema.leagueMembers.teamId })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, leagueId),
        inArray(PublicSchema.leagueMembers.teamId, teamIds),
      ),
    );

  return new Set(
    rows.map((r) => r.teamId).filter((id): id is number => id !== null),
  );
}

/**
 * Replace a league draft's seats with one seat per team, in the given order.
 *
 * Supersedes the `DELETE FROM draft_teams` + `INSERT INTO draft_teams`
 * pair that `initializeDraft` and `autoStartScheduledDrafts` ran at draft
 * start. Callers delete `draft_picks` first: `draft_picks.participant_id`
 * cascades, so dropping a seat that still has picks would take the picks with
 * it.
 *
 * Must run inside the caller's transaction.
 */
export async function reseatLeagueDraft(
  tx: PublicDb,
  params: {
    draftId: number;
    leagueId: number;
    /** Team ids in final pick order; index 0 takes slot 1. */
    orderedTeamIds: number[];
    /** Teams that start with auto-pick on. Defaults to none. */
    autoPickTeamIds?: number[];
  },
): Promise<void> {
  const { draftId, leagueId, orderedTeamIds, autoPickTeamIds = [] } = params;

  await tx
    .delete(PublicSchema.draftParticipants)
    .where(eq(PublicSchema.draftParticipants.draftId, draftId));

  if (orderedTeamIds.length === 0) return;

  // Issued sequentially, not via Promise.all: `tx` is a single transaction
  // connection, and overlapping queries on one connection are a footgun even
  // where the driver happens to serialize them.
  const teamNames = await tx
    .select({ id: PublicSchema.teams.id, name: PublicSchema.teams.name })
    .from(PublicSchema.teams)
    .where(inArray(PublicSchema.teams.id, orderedTeamIds));
  const managedTeamIds = await teamIdsWithMember(tx, leagueId, orderedTeamIds);

  const nameByTeamId = new Map(teamNames.map((t) => [t.id, t.name]));
  const autoPickSet = new Set(autoPickTeamIds);

  await tx.insert(PublicSchema.draftParticipants).values(
    orderedTeamIds.map((teamId, index) => {
      const autoPick = autoPickSet.has(teamId);
      return {
        draftId,
        slot: index + 1,
        teamId,
        leagueId,
        controller: seatController(autoPick, managedTeamIds.has(teamId)),
        seatName: (nameByTeamId.get(teamId) ?? `Team ${String(teamId)}`).slice(
          0,
          SEAT_NAME_MAX_LENGTH,
        ),
        autoPick,
      };
    }),
  );
}

/**
 * Permute a draft's seat order to `orderedTeamIds`, preserving each seat's id,
 * auto-pick flag and controller — so picks, queue entries and auction rows
 * that reference a seat follow their team to its new slot.
 *
 * Supersedes `setDraftOrder`/`randomizeDraftOrder`'s delete-and-reinsert of
 * `draft_teams`, which existed only to dodge that table's NOT DEFERRABLE
 * unique constraint. `draft_participants_uk_draft_slot` is DEFERRABLE
 * INITIALLY IMMEDIATE — checked at end of statement — so one `UPDATE ... FROM
 * (VALUES ...)` may permute every slot at once without a transient collision.
 *
 * Must run inside the caller's transaction.
 */
export async function setLeagueDraftSeatOrder(
  tx: PublicDb,
  draftId: number,
  orderedTeamIds: number[],
): Promise<void> {
  if (orderedTeamIds.length === 0) return;

  const assignments = sql.join(
    orderedTeamIds.map(
      (teamId, index) => sql`(${teamId}::integer, ${index + 1}::integer)`,
    ),
    sql`, `,
  );

  await tx.execute(sql`
    UPDATE draft_participants AS p
    SET slot = v.slot, updated_at = NOW()
    FROM (VALUES ${assignments}) AS v(team_id, slot)
    WHERE p.draft_id = ${draftId} AND p.team_id = v.team_id
  `);
}

/**
 * Swap two teams' slots within a draft, atomically.
 *
 * Supersedes `swapDraftTeamOrders`. `draft_participants_uk_draft_slot` is
 * checked at end of statement, so the two rows are permuted in one statement
 * rather than routed through the old sentinel dance.
 *
 * Must run inside the caller's transaction.
 *
 * @returns each team's slot *after* the swap.
 */
export async function swapLeagueDraftSeats(
  tx: PublicDb,
  draftId: number,
  teamAId: number,
  teamBId: number,
): Promise<{ teamAOrder: number; teamBOrder: number }> {
  const rows = await tx
    .select({
      teamId: PublicSchema.draftParticipants.teamId,
      slot: PublicSchema.draftParticipants.slot,
    })
    .from(PublicSchema.draftParticipants)
    .where(
      and(
        eq(PublicSchema.draftParticipants.draftId, draftId),
        inArray(PublicSchema.draftParticipants.teamId, [teamAId, teamBId]),
      ),
    );

  const teamASlot = rows.find((r) => r.teamId === teamAId)?.slot;
  const teamBSlot = rows.find((r) => r.teamId === teamBId)?.slot;

  if (teamASlot == null || teamBSlot == null) {
    throw new Error('One or both teams are not part of this draft order');
  }
  if (teamASlot === teamBSlot) {
    return { teamAOrder: teamASlot, teamBOrder: teamBSlot };
  }

  await tx.execute(sql`
    UPDATE draft_participants AS p
    SET slot = v.slot, updated_at = NOW()
    FROM (VALUES
      (${teamAId}::integer, ${teamBSlot}::integer),
      (${teamBId}::integer, ${teamASlot}::integer)
    ) AS v(team_id, slot)
    WHERE p.draft_id = ${draftId} AND p.team_id = v.team_id
  `);

  return { teamAOrder: teamBSlot, teamBOrder: teamASlot };
}

/**
 * Turn auto-pick on or off for a set of league teams' seats, keeping
 * `controller` consistent with {@link seatController}.
 *
 * Supersedes every `UPDATE draft_teams SET auto_pick = ...`.
 */
export async function setSeatAutoPick(
  tx: PublicDb,
  params: {
    draftId: number;
    leagueId: number;
    teamIds: number[];
    autoPick: boolean;
  },
): Promise<void> {
  const { draftId, leagueId, teamIds, autoPick } = params;
  if (teamIds.length === 0) return;

  const managedTeamIds = await teamIdsWithMember(tx, leagueId, teamIds);

  // Managed and unmanaged teams resolve to different controllers, so group the
  // update rather than issuing one statement per team.
  const groups: { controller: SeatController; teamIds: number[] }[] = [
    {
      controller: seatController(autoPick, true),
      teamIds: teamIds.filter((id) => managedTeamIds.has(id)),
    },
    {
      controller: seatController(autoPick, false),
      teamIds: teamIds.filter((id) => !managedTeamIds.has(id)),
    },
  ];

  for (const group of groups) {
    if (group.teamIds.length === 0) continue;
    await tx
      .update(PublicSchema.draftParticipants)
      .set({ autoPick, controller: group.controller, updatedAt: new Date() })
      .where(
        and(
          eq(PublicSchema.draftParticipants.draftId, draftId),
          inArray(PublicSchema.draftParticipants.teamId, group.teamIds),
        ),
      );
  }
}

/**
 * Turn auto-pick on or off for one seat, by seat id.
 *
 * The by-team variant above resolves `controller` from league membership; a
 * mock-draft seat has none, so its controller is whatever it already is — a
 * human who turned auto-pick on is still `user`-controlled, they have just
 * stepped away from the board (LS-10076).
 */
export async function setSeatAutoPickById(
  tx: PublicDb,
  participantId: number,
  autoPick: boolean,
): Promise<void> {
  await tx
    .update(PublicSchema.draftParticipants)
    .set({ autoPick, updatedAt: new Date() })
    .where(eq(PublicSchema.draftParticipants.id, participantId));
}

/**
 * Seat a league draft's teams if — and only if — it has no seats yet,
 * preserving any order already seeded.
 *
 * Supersedes `ensureDraftTeamsSeeded` (draft-slot-trades): a slot trade needs
 * a draft order to trade slots in, and pre-draft there may be none yet.
 *
 * Must run inside the caller's transaction.
 */
export async function ensureLeagueDraftSeated(
  tx: PublicDb,
  draftId: number,
  leagueId: number,
): Promise<void> {
  const existing = await tx
    .select({ id: PublicSchema.draftParticipants.id })
    .from(PublicSchema.draftParticipants)
    .where(eq(PublicSchema.draftParticipants.draftId, draftId))
    .limit(1);

  if (existing.length > 0) return;

  const teams = await tx
    .select({ id: PublicSchema.teams.id })
    .from(PublicSchema.teams)
    .where(eq(PublicSchema.teams.leagueId, leagueId))
    .orderBy(asc(PublicSchema.teams.id));

  if (teams.length === 0) {
    throw new Error(
      `League ${String(leagueId)} has no teams to seed a draft order for`,
    );
  }

  await reseatLeagueDraft(tx, {
    draftId,
    leagueId,
    orderedTeamIds: teams.map((t) => t.id),
  });
}
