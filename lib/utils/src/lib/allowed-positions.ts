/**
 * Position eligibility mapping — single source of truth for all layers.
 *
 * Maps each league roster slot type to the player stat-position keys that qualify,
 * scoped by sport (`baseball` | `football`). Most live data is baseball today; the
 * football entry is sourced from the Draft Board sport-toggle design (ADR 0011).
 *
 * Consumed by:
 *  - lib/db-client  (lineup auto-assignment)
 *  - lambdas/db    (draft auto-pick via ALLOWED_POSITIONS_FOR_AUTO_PICK alias)
 *  - lib/shared-components  (re-exported from PositionModels.ts)
 *
 * NOTE: the baseball mapping is also persisted in
 * `public.position_slot_mapping` (seeded by migration, consumed by the draft
 * auto-pick query in lambdas/db/src/schema/drafts/candidate-pool.ts — see
 * LS-4694). When updating the baseball entry, add a follow-up migration to
 * keep that table in sync.
 */

export type SportKind = 'baseball' | 'football';

const BASEBALL_ALLOWED_POSITIONS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    '1B': ['1B'],
    '2B': ['2B'],
    '3B': ['3B'],
    C: ['C'],
    CF: ['CF'],
    DH: ['1B', '2B', '3B', 'SS', 'LF', 'RF', 'CF', 'OF', 'C', 'DH'],
    IF: ['1B', '2B', '3B', 'SS'],
    LF: ['LF'],
    OF: ['LF', 'RF', 'CF', 'OF'],
    RF: ['RF'],
    RP: ['RP', 'P'],
    SP: ['SP', 'P'],
    SS: ['SS'],
    XDH: ['DH'],
  });

const FOOTBALL_ALLOWED_POSITIONS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    QB: ['QB'],
    RB: ['RB'],
    WR: ['WR'],
    TE: ['TE'],
    K: ['K'],
    /** DST slot maps to the synthetic DST team-defense player (LS-245). */
    DST: ['DST'],
    /** FLEX accepts RB, WR, or TE — the canonical football flex eligibility rule. */
    FLEX: ['RB', 'WR', 'TE'],
    BENCH: ['QB', 'RB', 'WR', 'TE', 'K', 'DST'],
  });

/**
 * Slot → eligible-position mapping, keyed by sport. New code should read this
 * with the active `league.sport` rather than touching `ALLOWED_POSITIONS`.
 */
export const ALLOWED_POSITIONS_BY_SPORT: Readonly<
  Record<SportKind, Readonly<Record<string, readonly string[]>>>
> = Object.freeze({
  baseball: BASEBALL_ALLOWED_POSITIONS,
  football: FOOTBALL_ALLOWED_POSITIONS,
});

/**
 * Baseball-only slot mapping, retained as a back-compat alias. New code should
 * use `ALLOWED_POSITIONS_BY_SPORT[league.sport]` instead.
 */
export const ALLOWED_POSITIONS: Readonly<Record<string, readonly string[]>> =
  BASEBALL_ALLOWED_POSITIONS;

/** Baseball stat positions that count as pitching (includes generic 'P'). */
export const PITCHING_POSITIONS: ReadonlySet<string> = Object.freeze(
  new Set(['SP', 'RP', 'P']),
);

/** Baseball stat positions that count as batting. */
export const BATTING_POSITIONS: ReadonlySet<string> = Object.freeze(
  new Set(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH']),
);

/** Football positions that count as offense. */
export const OFFENSIVE_POSITIONS: ReadonlySet<string> = Object.freeze(
  new Set(['QB', 'RB', 'WR', 'TE', 'K', 'FLEX']),
);

/** Football positions that count as defense (DST = team defense/special teams, LS-245). */
export const DEFENSIVE_POSITIONS: ReadonlySet<string> = Object.freeze(
  new Set(['DST']),
);
