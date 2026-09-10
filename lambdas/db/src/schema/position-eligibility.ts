/**
 * Slot-eligibility helpers for roster-position mutations (LS-6427).
 *
 * `lib/shared-components/src/features/roster/rosterEligibility.ts` documents
 * that the client's `canPlayerPlayPosition` is only an affordance and that
 * "the server-side mutation is the final gate". Until LS-6427 no such gate
 * existed: `updateTeamMemberPosition` and `swapTeamMemberPositions` guarded
 * only authorization and lock state, so a direct API call could put a kicker
 * in a QB slot or a defense in a FLEX. This module is that gate.
 *
 * It lives at the `schema/` root rather than under `teams/` because
 * `swapMatchupPlayerPositions` (LS-6372) has the same hole and must reuse
 * exactly this rule — one implementation, not two. It deliberately mirrors
 * the shape of the neighbouring `sport-eligibility.ts`: a pure predicate plus
 * an `assert*` wrapper that throws a descriptive GraphQL error.
 *
 * The eligibility crosswalk is always read sport-scoped, via
 * `ALLOWED_POSITIONS_BY_SPORT[league.sport]` — never the legacy baseball-only
 * `ALLOWED_POSITIONS` alias, which is what made the football tables
 * unreachable in the first place.
 */

import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import {
  ALLOWED_POSITIONS_BY_SPORT,
  type SportKind,
} from '@legacy-sports/utils';
import { eq, inArray } from 'drizzle-orm';
import { NotFoundError, PositionIneligibleError } from './graphql-errors';

/** A single "put this player in this slot" intent awaiting validation. */
export interface PositionAssignment {
  /** `players.id` of the player being moved. */
  playerId: number;
  /**
   * Target `league_positions.id`, or `null` to clear the slot (bench).
   * Benching is always permitted — see {@link canFillSlot}.
   */
  positionId: number | null;
}

/**
 * True when a player with `eligiblePositions` may fill a `slotType` slot in a
 * league of `sport`.
 *
 * Two rules fail **open**, and both are deliberate:
 *
 *  - **No eligibility data → eligible.** Both clients already treat an empty
 *    list as universally eligible, and the seeded/unclassified players that
 *    produce it are real: a player with no `career_fielding_by_position` rows
 *    resolves to `[]`. Rejecting those would make unclassified players
 *    permanently unassignable and would make the server *stricter* than the
 *    UI — the client would offer a move the server then refuses. Enforcing
 *    data completeness is a separate concern from enforcing slot eligibility.
 *
 *  - **Slot code absent from the crosswalk → eligible.** The `position_slot`
 *    enum can be (and has been — see `KP`, closed by LS-9675) wider than
 *    `ALLOWED_POSITIONS_BY_SPORT`. Treating an unmapped slot as a rejection
 *    would make every such slot unassignable before its crosswalk entry
 *    lands. A gate may only reject what it positively knows to be wrong; an
 *    incomplete crosswalk is a data gap, not a violation.
 *
 * Note this differs on the second rule from the client's
 * `canPlayerPlayPosition`, which returns `false` for an unmapped slot. That
 * is the correct asymmetry: greying out a button you are unsure about is
 * cautious, while refusing a write you are unsure about is a regression.
 */
export function canFillSlot(
  eligiblePositions: readonly string[],
  slotType: string | null | undefined,
  sport: SportKind,
): boolean {
  if (eligiblePositions.length === 0) return true;

  const allowed = ALLOWED_POSITIONS_BY_SPORT[sport][slotType ?? ''];
  if (!allowed) return true;

  return eligiblePositions.some((position) => allowed.includes(position));
}

/**
 * Loads each player's eligible stat positions from the view that matches the
 * league's sport.
 *
 * The two sports are backed by different objects — `player_eligible_positions`
 * (materialized, baseball) and `football_player_eligible_positions` (plain
 * view over `players.position` / `players.is_dst`) — and the lookups are
 * disjoint, which is why this branches rather than unioning. Mirrors the same
 * branch in `drafts/helpers.ts`.
 *
 * Players with no rows are absent from the returned map; callers must treat
 * that as "no eligibility data", not as "eligible for nothing".
 */
async function loadEligiblePositions(
  db: PublicDb,
  playerIds: number[],
  sport: SportKind,
): Promise<Map<number, string[]>> {
  const rows =
    sport === 'football'
      ? await db
          .select({
            playerId: PublicSchema.footballPlayerEligiblePositions.playerId,
            position: PublicSchema.footballPlayerEligiblePositions.position,
          })
          .from(PublicSchema.footballPlayerEligiblePositions)
          .where(
            inArray(
              PublicSchema.footballPlayerEligiblePositions.playerId,
              playerIds,
            ),
          )
      : await db
          .select({
            playerId: PublicSchema.playerEligiblePositions.playerId,
            position: PublicSchema.playerEligiblePositions.position,
          })
          .from(PublicSchema.playerEligiblePositions)
          .where(
            inArray(PublicSchema.playerEligiblePositions.playerId, playerIds),
          );

  const byPlayer = new Map<number, string[]>();
  for (const row of rows) {
    const existing = byPlayer.get(row.playerId);
    if (existing) {
      existing.push(row.position);
    } else {
      byPlayer.set(row.playerId, [row.position]);
    }
  }
  return byPlayer;
}

/**
 * Throws {@link PositionIneligibleError} if any assignment would put a player
 * into a slot their eligible positions do not permit.
 *
 * Call this **before** opening the mutation's transaction: the resolvers wrap
 * their transaction bodies in a `try` that `LOGGER.error`s and rethrows, and a
 * rejected user input is an expected condition that must not be logged as a
 * system error (see the `UserInputError` note in `graphql-errors.ts`).
 *
 * Assignments that clear a slot (`positionId: null`) are skipped — benching a
 * player is always legal, and is the escape hatch that keeps a pre-existing
 * ineligible row from becoming unfixable once this gate is live.
 */
export async function assertPositionAssignmentsEligible(
  db: PublicDb,
  leagueId: number,
  assignments: readonly PositionAssignment[],
): Promise<void> {
  const assigned = assignments.filter(
    (a): a is PositionAssignment & { positionId: number } =>
      a.positionId != null,
  );
  if (assigned.length === 0) return;

  const [league] = await db
    .select({ sport: PublicSchema.leagues.sport })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, leagueId))
    .limit(1);
  if (!league) {
    // Not one of the fail-open rules above. Those apply *after* a successful
    // evaluation found no basis to reject; here the sport is unknown, so
    // eligibility cannot be evaluated at all. Returning would silently admit
    // the exact writes this gate exists to reject, so refuse instead.
    // Unreachable while `team_members.league_id` is intact — it signals
    // corrupt data rather than ordinary user input.
    throw NotFoundError(`League ${leagueId} not found`);
  }

  const sport: SportKind = league.sport;

  // Resolve each target slot's `position_type` code ('QB', 'FLEX', 'C', …).
  // `team_members.position_id` / `matchup_players.position_id` are FKs to
  // `league_positions.id`, so the code is never on the assignment itself.
  const positionIds = [...new Set(assigned.map((a) => a.positionId))];
  const slotRows = await db
    .select({
      id: PublicSchema.leaguePosition.id,
      positionType: PublicSchema.leaguePosition.positionType,
    })
    .from(PublicSchema.leaguePosition)
    .where(inArray(PublicSchema.leaguePosition.id, positionIds));
  const slotTypeById = new Map(slotRows.map((r) => [r.id, r.positionType]));

  const playerIds = [...new Set(assigned.map((a) => a.playerId))];
  const eligibleByPlayer = await loadEligiblePositions(db, playerIds, sport);

  for (const assignment of assigned) {
    const slotType = slotTypeById.get(assignment.positionId);
    if (!slotType) {
      // Same category as the missing league: an unresolved slot code cannot be
      // evaluated, so it must not pass silently. `positionId` is caller-supplied,
      // so this is reachable with a bogus id and is worth a clean NOT_FOUND
      // rather than a raw foreign-key violation from the transaction.
      throw NotFoundError(`League position ${assignment.positionId} not found`);
    }

    const playerPositions = eligibleByPlayer.get(assignment.playerId) ?? [];
    if (canFillSlot(playerPositions, slotType, sport)) continue;

    // Name the player in the message rather than just their id. The lookup
    // runs at most once — the next statement throws.
    const [nameRow] = await db
      .select({
        firstName: PublicSchema.players.firstName,
        lastName: PublicSchema.players.lastName,
      })
      .from(PublicSchema.players)
      .where(eq(PublicSchema.players.id, assignment.playerId))
      .limit(1);

    throw PositionIneligibleError({
      playerId: assignment.playerId,
      playerName: nameRow
        ? `${nameRow.firstName} ${nameRow.lastName}`.trim()
        : `Player ${assignment.playerId}`,
      positionId: assignment.positionId,
      slotType,
      allowedPositions: [
        ...(ALLOWED_POSITIONS_BY_SPORT[sport][slotType] ?? []),
      ],
      playerPositions,
    });
  }
}
