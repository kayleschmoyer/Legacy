/**
 * Pure planning logic for `updateRosterPositions` (LS-9099): given the
 * league's current `league_positions` rows and which `team_members` rows
 * currently occupy them, decides how to reconcile the table with a new
 * per-position slot count — without touching the database. Kept separate
 * from the resolver so the reconciliation algorithm (in particular, the
 * "never orphan an already-rostered player" guarantee) is unit-testable
 * without a DB mock.
 */
import { UserInputError } from '../graphql-errors';

export interface CurrentPositionRow {
  id: number;
  positionType: string;
}

export interface OccupiedRow {
  teamMemberId: number;
  teamId: number | null;
  positionId: number | null;
  positionType: string;
}

export interface RosterPositionUpdatePlan {
  /** `{ positionType, count }` rows to insert into `league_positions`. */
  inserts: { positionType: string; count: number }[];
  /** `team_members` rows whose `positionId` must be repointed before the drop. */
  reassignments: { teamMemberId: number; positionId: number }[];
  /** `league_positions` ids to delete once any reassignments above are applied. */
  deletes: number[];
}

export interface MatchupPlayerOccupiedRow {
  matchupPlayerId: number;
  matchupId: number;
  teamId: number;
  positionId: number | null;
  positionType: string;
}

export interface MatchupPlayerReassignment {
  matchupPlayerId: number;
  positionId: number;
}

/**
 * Computes the insert/reassign/delete plan for reconciling `league_positions`
 * with `newCountByType`, or throws `UserInputError` if any position type
 * would shrink below the number of players a single team already has
 * rostered in it.
 *
 * `league_positions` rows are a shared per-league pool (not per-team) —
 * `team_members.positionId` just references one of them, and the same
 * `positionType` can be spread across different literal row ids for
 * different teams. Shrinking therefore isn't a simple truncation: any row
 * marked for deletion that's still referenced by a team's roster must first
 * be repointed onto a row that survives.
 */
export function planRosterPositionUpdate({
  currentPositions,
  occupiedRows,
  newCountByType,
}: {
  currentPositions: CurrentPositionRow[];
  occupiedRows: OccupiedRow[];
  newCountByType: Map<string, number>;
}): RosterPositionUpdatePlan {
  const currentIdsByType = new Map<string, number[]>();
  for (const row of currentPositions) {
    const list = currentIdsByType.get(row.positionType) ?? [];
    list.push(row.id);
    currentIdsByType.set(row.positionType, list);
  }

  const occupiedByType = new Map<string, OccupiedRow[]>();
  for (const row of occupiedRows) {
    const list = occupiedByType.get(row.positionType) ?? [];
    list.push(row);
    occupiedByType.set(row.positionType, list);
  }

  const allTypes = new Set<string>([
    ...currentIdsByType.keys(),
    ...newCountByType.keys(),
  ]);

  // Validate every type before planning any writes.
  for (const positionType of allTypes) {
    const newCount = newCountByType.get(positionType) ?? 0;
    const currentIds = currentIdsByType.get(positionType) ?? [];
    if (newCount >= currentIds.length) continue;

    const perTeamCounts = new Map<number, number>();
    for (const row of occupiedByType.get(positionType) ?? []) {
      if (row.teamId == null) continue;
      perTeamCounts.set(row.teamId, (perTeamCounts.get(row.teamId) ?? 0) + 1);
    }
    const maxOccupied = Math.max(0, ...perTeamCounts.values());
    if (maxOccupied > newCount) {
      throw UserInputError(
        `Cannot reduce "${positionType}" to ${newCount} slot(s) — a team already has ${maxOccupied} player(s) rostered in that position. Drop players from that position first.`,
      );
    }
  }

  const plan: RosterPositionUpdatePlan = {
    inserts: [],
    reassignments: [],
    deletes: [],
  };

  for (const positionType of allTypes) {
    const newCount = newCountByType.get(positionType) ?? 0;
    const currentIds = currentIdsByType.get(positionType) ?? [];

    if (newCount > currentIds.length) {
      plan.inserts.push({ positionType, count: newCount - currentIds.length });
      continue;
    }

    if (newCount < currentIds.length) {
      const keepIds = currentIds.slice(0, newCount);
      const dropIds = currentIds.slice(newCount);
      if (dropIds.length === 0) continue;

      const dropSet = new Set(dropIds);
      const typeOccupiedRows = occupiedByType.get(positionType) ?? [];
      const toReassign = typeOccupiedRows.filter(
        (row) => row.positionId != null && dropSet.has(row.positionId),
      );

      // Track which keep-slots each team already occupies so a displaced
      // player is reassigned to a keep-slot its own team isn't already
      // using — validated above to always fit.
      const usedKeepIdsByTeam = new Map<number, Set<number>>();
      for (const row of typeOccupiedRows) {
        if (
          row.teamId == null ||
          row.positionId == null ||
          !keepIds.includes(row.positionId)
        ) {
          continue;
        }
        const used = usedKeepIdsByTeam.get(row.teamId) ?? new Set<number>();
        used.add(row.positionId);
        usedKeepIdsByTeam.set(row.teamId, used);
      }

      for (const row of toReassign) {
        if (row.teamId == null) continue;
        const used = usedKeepIdsByTeam.get(row.teamId) ?? new Set<number>();
        const nextKeepId = keepIds.find((id) => !used.has(id));
        if (nextKeepId == null) {
          // Guarded by the validation pass above — a mismatch here means
          // that pass and this one disagree.
          throw new Error(
            `Unable to reassign roster slot for team ${row.teamId} while shrinking "${positionType}"`,
          );
        }
        used.add(nextKeepId);
        usedKeepIdsByTeam.set(row.teamId, used);
        plan.reassignments.push({
          teamMemberId: row.teamMemberId,
          positionId: nextKeepId,
        });
      }

      plan.deletes.push(...dropIds);
    }
  }

  return plan;
}

/**
 * Computes how to repoint `matchup_players.positionId` rows (a week's
 * starter assignment, for matchups past, present, and future) that reference
 * a `league_positions` row `planRosterPositionUpdate` is about to drop, onto
 * a retained slot row of the same `positionType` (LS-9354).
 *
 * Without this, dropping a `league_positions` row lets the
 * `matchup_players_position_fk` FK's `ON DELETE SET NULL` silently null out
 * every historical starter assignment that ever referenced it — including
 * *already-completed* matchups, whose roster-comparison view then renders
 * those players as bench (or, once no slot matches at all, invisible) even
 * though the week's score was already locked in with them as a starter.
 * `team_members.positionId` gets the same treatment in
 * `planRosterPositionUpdate`, but that only covers the live roster — a
 * player can hold a different slot in every week's `matchup_players` row,
 * so slot availability has to be tracked per (matchupId, teamId), not once
 * per team.
 *
 * When a position type has no surviving slot to reassign onto (e.g. shrunk
 * to zero), the affected rows are left out of the result — the FK's
 * `ON DELETE SET NULL` is the only remaining option for those, same as if
 * the position type had never existed for that week.
 */
export function planMatchupPlayerReassignments({
  currentPositions,
  newCountByType,
  matchupPlayerOccupiedRows,
}: {
  currentPositions: CurrentPositionRow[];
  newCountByType: Map<string, number>;
  matchupPlayerOccupiedRows: MatchupPlayerOccupiedRow[];
}): MatchupPlayerReassignment[] {
  const currentIdsByType = new Map<string, number[]>();
  for (const row of currentPositions) {
    const list = currentIdsByType.get(row.positionType) ?? [];
    list.push(row.id);
    currentIdsByType.set(row.positionType, list);
  }

  const occupiedByType = new Map<string, MatchupPlayerOccupiedRow[]>();
  for (const row of matchupPlayerOccupiedRows) {
    if (row.positionId == null) continue;
    const list = occupiedByType.get(row.positionType) ?? [];
    list.push(row);
    occupiedByType.set(row.positionType, list);
  }

  const reassignments: MatchupPlayerReassignment[] = [];

  for (const [positionType, currentIds] of currentIdsByType) {
    const newCount = newCountByType.get(positionType) ?? 0;
    if (newCount >= currentIds.length) continue; // nothing dropped for this type

    const keepIds = currentIds.slice(0, newCount);
    const dropSet = new Set(currentIds.slice(newCount));
    const typeRows = occupiedByType.get(positionType) ?? [];

    // Slot availability is scoped per (matchupId, teamId) — the same slot id
    // is reused week over week, so two different weeks reassigning onto the
    // same keep-slot is not a conflict; two players in the *same* week/team
    // landing on the same keep-slot would violate
    // matchup_players_unique_slot_idx.
    const usedByMatchupTeam = new Map<string, Set<number>>();
    for (const row of typeRows) {
      if (row.positionId == null || !keepIds.includes(row.positionId)) continue;
      const key = `${row.matchupId}:${row.teamId}`;
      const used = usedByMatchupTeam.get(key) ?? new Set<number>();
      used.add(row.positionId);
      usedByMatchupTeam.set(key, used);
    }

    for (const row of typeRows) {
      if (row.positionId == null || !dropSet.has(row.positionId)) continue;
      const key = `${row.matchupId}:${row.teamId}`;
      const used = usedByMatchupTeam.get(key) ?? new Set<number>();
      const nextKeepId = keepIds.find((id) => !used.has(id));
      if (nextKeepId == null) continue;
      used.add(nextKeepId);
      usedByMatchupTeam.set(key, used);
      reassignments.push({
        matchupPlayerId: row.matchupPlayerId,
        positionId: nextKeepId,
      });
    }
  }

  return reassignments;
}
