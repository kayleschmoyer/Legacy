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

/**
 * Generic 'P' is intentionally absent as a *slot* key here (LS-9675 audit).
 * It appears only as an eligible *stat position* folded into SP/RP below —
 * every pitcher slot the app actually creates is SP or RP, and the
 * `position_slot` DB enum has no bare 'P' value, so there is no slot for a
 * 'P' entry to serve. Add one only if a generic pitcher slot type is ever
 * introduced.
 */
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
    /** KP (combined kicker/punter, LS-9107) is a premium slot
     *  (`PREMIUM_ROSTER_SLOT_TYPES` in `leagues/mutations.ts`). There is no
     *  separate punter stat position anywhere in the data model — 'K' is the
     *  only football position code that exists for the kicking game — so any
     *  player eligible at K is eligible at KP (LS-9675). */
    KP: ['K'],
    /** DST slot maps to the synthetic DST team-defense player (LS-245). Only
     *  reachable for a 'dst'-format league. */
    DST: ['DST'],
    /** IDP (individual defensive player) slots — only reachable for an
     *  'idp'-format league (LS-9475). A league only ever configures one of
     *  DST or DL/LB/DB, never both, so having both sets of keys here is
     *  harmless: a given league's `leaguePositions` only ever looks up the
     *  keys that format actually seeded. */
    DL: ['DL'],
    LB: ['LB'],
    DB: ['DB'],
    /** FLEX accepts RB, WR, or TE — the canonical football flex eligibility rule. */
    FLEX: ['RB', 'WR', 'TE'],
    /** SFLEX (Superflex, premium slot) accepts QB, RB, WR, or TE (LS-6337). */
    SFLEX: ['QB', 'RB', 'WR', 'TE'],
    BENCH: ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DL', 'LB', 'DB'],
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

/** Football positions that count as defense: DST = team defense/special
 *  teams (LS-245); DL/LB/DB = individual defensive players (LS-9475). */
export const DEFENSIVE_POSITIONS: ReadonlySet<string> = Object.freeze(
  new Set(['DST', 'DL', 'LB', 'DB']),
);

/**
 * Canonical starting-slot display order for football, spanning every slot
 * type a league might configure — DST-format or IDP-format, Superflex or
 * not. A given league only ever has a subset of these types configured as
 * actual `leaguePosition` rows (never both DST and DL/LB/DB); pass those
 * rows to `deriveFootballSlotOrder` to get that league's real slot order.
 */
export const FOOTBALL_STARTING_SLOT_DISPLAY_ORDER: readonly string[] =
  Object.freeze([
    'QB',
    'SFLEX',
    'RB',
    'WR',
    'TE',
    'FLEX',
    'K',
    'DST',
    'DL',
    'LB',
    'DB',
    /** IDP_FLEX (any of DL/LB/DB) and ST (special teams) — configurable IDP
     *  slot types alongside DL/LB/DB (LS-6448). */
    'IDP_FLEX',
    'ST',
  ]);

/**
 * Derives a league's actual starting-slot order from its real roster-slot
 * rows (the `leaguePositions` query / `LeaguePositionFragment`), rather than
 * a hardcoded per-format array — so any current or future slot
 * configuration (e.g. Superflex's QB2/SFLEX slot, LS-9734) renders
 * correctly without special-casing it here.
 */
export function deriveFootballSlotOrder(
  leaguePositions:
    | readonly ({ positionType?: string | null } | null | undefined)[]
    | null
    | undefined,
): readonly string[] {
  const configuredSlotTypes = new Set<string>();
  for (const position of leaguePositions ?? []) {
    if (position?.positionType) {
      configuredSlotTypes.add(position.positionType);
    }
  }
  return FOOTBALL_STARTING_SLOT_DISPLAY_ORDER.filter((slot) =>
    configuredSlotTypes.has(slot),
  );
}
