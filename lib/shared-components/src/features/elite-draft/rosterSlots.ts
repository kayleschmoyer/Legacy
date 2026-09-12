/**
 * rosterSlots — the single source for draft-room roster slot occupancy
 * (LS-10004).
 *
 * The draft room shows the same occupancy in two places: the "My Depth Chart"
 * view / Team tab (one row per slot) and the bottom-pinned slot strip (one
 * chip per slot). The design's constraint for the strip is explicit — it
 * "mirrors the depth chart counts exactly so the two views can never
 * disagree" — so the bucket fill lives here, once, and
 * {@link buildRosterSlotInstances} is its only expansion into per-slot
 * entries. Both views consume that; nothing re-derives occupancy.
 *
 * `buildDepthChartBuckets` used to live in `DraftPlayerBoard.tsx` and is
 * re-exported from there for existing callers. It moved here so this module
 * has no dependency on a component (LS-10004): a consumer that mocks
 * `./DraftPlayerBoard` in a test would otherwise lose the fill algorithm too.
 */
import {
  ALLOWED_POSITIONS_BY_SPORT,
  DEFAULT_ROSTER_SIZE_BY_SPORT,
} from '@legacy-sports/utils';
import type { DraftPlayer } from './types';
import type { SportKind } from '../../config/sports';
import { isPitcherSlot } from '../roster/rosterEligibility';

/** A single depth-chart slot bucket: one or more league-configured roster
 *  positions of the same canonical type (e.g. all SP/RP rows collapse into
 *  a single 'P' bucket), plus whichever of the user's drafted players have
 *  been greedily assigned to fill it. */
export interface DepthChartBucket {
  positionType: string;
  total: number;
  players: DraftPlayer[];
  /** Stat positions this slot accepts (the union across every roster row
   *  that collapsed into it), or `null` for BENCH, which accepts anyone.
   *  Lets the player dock (LS-10005) ask "does this player fill an open
   *  slot?" without re-deriving slot eligibility. */
  accepts: ReadonlySet<string> | null;
}

export const BENCH_SLOT = 'BENCH';

/** A drafted player's eligible position strings, falling back to their
 *  single canonical `position` when granular eligibility wasn't loaded. */
const eligiblePositionsOf = (player: DraftPlayer): string[] =>
  player.eligiblePositions?.length
    ? player.eligiblePositions
    : [player.position];

/**
 * Groups `myTeam`'s drafted players into the league's real configured roster
 * slots (`leaguePositions`, the same data RosterBoard renders elsewhere)
 * instead of a hardcoded, baseball-only slot list (LS-8785). Pitcher slot
 * rows (SP/RP/P) collapse into one 'P' bucket, matching `isPitcherSlot`'s
 * existing cross-sport definition of "the same slot" (LS-8069's fix,
 * generalized). Any players beyond the league's starter slots — including
 * true roster overflow — land in a synthetic BENCH bucket so no drafted
 * player is ever silently dropped from view.
 *
 * Eligibility is checked directly against `ALLOWED_POSITIONS_BY_SPORT[sport]`
 * rather than `rosterEligibility.ts`'s `canPlayerPlayPosition`, which reads
 * the legacy baseball-only `ALLOWED_POSITIONS` alias and would silently
 * reject every football slot.
 */
export function buildDepthChartBuckets(
  leaguePositions: ReadonlyArray<{ positionType: string }>,
  myTeam: DraftPlayer[],
  sport: SportKind,
  maxRosterSize: number | null,
): DepthChartBucket[] {
  const order: string[] = [];
  const totals = new Map<string, number>();
  // Union of every real position type (e.g. both 'SP' and 'RP') that
  // collapsed into a given bucket key, so eligibility checks against the
  // canonical 'P' bucket still accept SP/RP-eligible players.
  const allowedByBucket = new Map<string, Set<string>>();
  const positionEligibility = ALLOWED_POSITIONS_BY_SPORT[sport];
  for (const { positionType } of leaguePositions) {
    const key = isPitcherSlot(positionType) ? 'P' : positionType;
    if (!totals.has(key)) {
      order.push(key);
      allowedByBucket.set(key, new Set());
    }
    totals.set(key, (totals.get(key) ?? 0) + 1);
    for (const accepted of positionEligibility[positionType] ?? []) {
      allowedByBucket.get(key)?.add(accepted);
    }
  }
  const startersTotal = leaguePositions.length;
  const effectiveRosterSize =
    maxRosterSize ?? DEFAULT_ROSTER_SIZE_BY_SPORT[sport];
  order.push(BENCH_SLOT);
  totals.set(BENCH_SLOT, Math.max(0, effectiveRosterSize - startersTotal));

  const buckets = new Map<string, DepthChartBucket>(
    order.map((key) => [
      key,
      {
        positionType: key,
        total: totals.get(key) ?? 0,
        players: [],
        accepts: key === BENCH_SLOT ? null : (allowedByBucket.get(key) ?? null),
      },
    ]),
  );

  // Fill the most specific (narrowest eligible-position) slots first, so a
  // player eligible for both a dedicated slot and a broad one (DH/FLEX) fills
  // the dedicated slot — mirroring the fix in LS-8069.
  const acceptListSize = (key: string): number =>
    allowedByBucket.get(key)?.size ?? Infinity;
  const fillOrder = order
    .filter((key) => key !== BENCH_SLOT)
    .sort((a, b) => acceptListSize(a) - acceptListSize(b));

  let unassigned = [...myTeam];
  for (const key of fillOrder) {
    const bucket = buckets.get(key);
    const allowed = allowedByBucket.get(key);
    if (!bucket || !allowed) continue;
    const stillUnassigned: DraftPlayer[] = [];
    for (const player of unassigned) {
      const eligible = eligiblePositionsOf(player).some((p) => allowed.has(p));
      if (bucket.players.length < bucket.total && eligible) {
        bucket.players.push(player);
      } else {
        stillUnassigned.push(player);
      }
    }
    unassigned = stillUnassigned;
  }

  // Whatever's left — including true overflow beyond the configured roster
  // size — always lands in BENCH, growing it past `total` if needed.
  const bench = buckets.get(BENCH_SLOT);
  if (bench) {
    bench.players.push(...unassigned);
    bench.total = Math.max(bench.total, bench.players.length);
  }

  // `buckets` was built from the same `order` array, so this always yields
  // one entry per key in the original order (Map preserves insertion order).
  return Array.from(buckets.values());
}

/** One roster slot instance — a single chip in the strip, a single row in the depth chart. */
export interface RosterSlotInstance {
  /** Stable React key: bucket key + ordinal within the bucket. */
  key: string;
  /** League-configured bucket key this slot belongs to, e.g. `'P'`, `'OF'`, `'BENCH'`. */
  positionType: string;
  /** 0-based ordinal of this slot within its bucket. */
  index: number;
  /** Player occupying the slot, or `null` when the slot is open. */
  player: DraftPlayer | null;
  /** True for the synthetic overflow bucket — rendered as "BN" and de-accented. */
  isBench: boolean;
}

/**
 * Expand the depth chart buckets into one entry per slot, in league-configured
 * lineup order, with the synthetic BENCH bucket last.
 */
export function buildRosterSlotInstances(
  leaguePositions: ReadonlyArray<{ positionType: string }>,
  players: DraftPlayer[],
  sport: SportKind,
  maxRosterSize: number | null,
): RosterSlotInstance[] {
  return buildDepthChartBuckets(
    leaguePositions,
    players,
    sport,
    maxRosterSize,
  ).flatMap((bucket) =>
    Array.from({ length: bucket.total }, (_, index) => ({
      key: `${bucket.positionType}-${index}`,
      positionType: bucket.positionType,
      index,
      player: bucket.players[index] ?? null,
      isBench: bucket.positionType === BENCH_SLOT,
    })),
  );
}

/**
 * The "next priority hole": the first open **starter** slot in lineup order.
 * Bench slots are never a priority — a bench hole is filled by any pick, so
 * calling one out would be noise. Returns `null` once every starter is filled.
 */
export function nextPrioritySlotKey(
  slots: readonly RosterSlotInstance[],
): string | null {
  return slots.find((s) => !s.isBench && s.player == null)?.key ?? null;
}

/** `{ filled, total }` across every slot — the strip's "3 / 23 slots" counter. */
export function rosterSlotFillCounts(slots: readonly RosterSlotInstance[]): {
  filled: number;
  total: number;
} {
  return {
    filled: slots.filter((s) => s.player != null).length,
    total: slots.length,
  };
}

/**
 * Distinct starter slot types still open, in lineup order — the phone squad
 * strip's "Open slots: 1B, SS" summary (LS-10001, design `.mob-squad .hd .open`).
 *
 * Bench slots are excluded for the same reason {@link nextPrioritySlotKey}
 * skips them: "bench" is not a need you draft *for*. Deduplicated because a
 * roster with four open SP slots should read "SP", not "SP, SP, SP, SP".
 * Empty when every starter is filled, which the caller renders as "Roster set".
 */
export function openStarterSlotLabels(
  slots: readonly RosterSlotInstance[],
): string[] {
  const seen = new Set<string>();
  for (const slot of slots) {
    if (slot.isBench || slot.player != null) continue;
    seen.add(slot.positionType);
  }
  return [...seen];
}
