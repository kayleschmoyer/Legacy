/**
 * Lineup optimizer (LS-6378 / FMD-021): given a team's rostered players and
 * a league's starting-slot definitions, finds the assignment of players to
 * slots that maximizes total projected points, respecting each slot's
 * position eligibility.
 *
 * This is the classic assignment problem (maximum-weight bipartite
 * matching between players and slots), solved exactly via the Kuhn-Munkres
 * ("Hungarian") algorithm rather than a greedy heuristic, so the result is
 * always the true optimum, not just a locally-good approximation.
 */

/** A player eligible for lineup placement. */
export interface OptimizerPlayer {
  id: number;
  /** Projected fantasy points for the week. */
  points: number;
  /** Stat positions this player qualifies at (e.g. ['QB'], ['RB', 'WR']). */
  eligibleStatPositions: readonly string[];
}

/** A starting roster slot to fill. */
export interface OptimizerSlot {
  id: number;
  /** Slot type (e.g. 'QB', 'FLEX') — looked up in the eligibility map. */
  positionType: string;
}

/** Where a player landed after optimization. */
export interface OptimizedAssignment {
  playerId: number;
  /** The starting slot's id, or `null` if the player is benched. */
  slotId: number | null;
}

function isEligible(
  player: OptimizerPlayer,
  slot: OptimizerSlot,
  allowedPositionsBySlotType: Readonly<Record<string, readonly string[]>>,
): boolean {
  const allowed = allowedPositionsBySlotType[slot.positionType] ?? [];
  return player.eligibleStatPositions.some((pos) => allowed.includes(pos));
}

/**
 * Solves the maximum-weight assignment problem via the Hungarian algorithm
 * (Kuhn-Munkres, O(n^3)) on a square weight matrix. Returns, for each row,
 * the index of the column it was assigned to.
 */
function hungarianMaxWeight(weights: readonly number[][]): number[] {
  const n = weights.length;
  const INF = Number.POSITIVE_INFINITY;

  // Internally minimizes; negate to turn "maximize weight" into "minimize cost".
  const cost = weights.map((row) => row.map((w) => -w));

  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  // p[j] = 1-indexed row currently assigned to column j; p[0] is a scratch sentinel.
  const p = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(INF);
    const used = new Array<boolean>(n + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = -1;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const rowToColumn = new Array<number>(n).fill(-1);
  for (let j = 1; j <= n; j++) {
    if (p[j] > 0) rowToColumn[p[j] - 1] = j - 1;
  }
  return rowToColumn;
}

/**
 * Assigns each player to at most one starting slot to maximize total
 * projected points. Players who cannot improve on the bench (no eligible
 * slot, or every eligible slot is better used by someone else) come back
 * with `slotId: null`.
 *
 * Ineligible player/slot pairs are weighted 0 (same as the bench) rather
 * than excluded outright — this keeps the weight matrix square and dense
 * (required by the Hungarian algorithm) while still being safe: a
 * maximum-weight matching never prefers a 0-weight pairing over a
 * strictly-positive one elsewhere, and the eligibility re-check below
 * guarantees an ineligible pairing is never returned as a real assignment.
 */
export function optimizeLineup(
  players: readonly OptimizerPlayer[],
  slots: readonly OptimizerSlot[],
  allowedPositionsBySlotType: Readonly<Record<string, readonly string[]>>,
): OptimizedAssignment[] {
  if (players.length === 0) return [];
  if (slots.length === 0) {
    return players.map((player) => ({ playerId: player.id, slotId: null }));
  }

  const n = Math.max(players.length, slots.length);
  const weights: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      const player = players[i];
      const slot = slots[j];
      const eligible =
        player != null &&
        slot != null &&
        isEligible(player, slot, allowedPositionsBySlotType);
      row.push(eligible ? player.points : 0);
    }
    weights.push(row);
  }

  const rowToColumn = hungarianMaxWeight(weights);

  return players.map((player, i) => {
    const j = rowToColumn[i];
    const slot = j >= 0 && j < slots.length ? slots[j] : undefined;
    const eligible =
      slot != null && isEligible(player, slot, allowedPositionsBySlotType);
    return { playerId: player.id, slotId: eligible ? slot.id : null };
  });
}
