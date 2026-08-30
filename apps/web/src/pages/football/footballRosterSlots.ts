/**
 * Canonical football starter-slot ordering for the web Team Detail page
 * (LS-6438).
 *
 * `leaguePositions` comes back from the server ordered by `positionType`
 * alphabetically (`lambdas/db/src/schema/leagues/queries.ts` — the
 * `leaguePositions` resolver's `.orderBy(leaguePosition.positionType)`), which
 * for football yields DST, FLEX, K, QB, RB, RB, TE, WR, WR. `RosterBoard`
 * renders football slots in the order it receives them (it does not re-sort —
 * `RosterBoard.tsx`'s football branch returns `[...positions]`), so the board
 * would present that alphabetical order verbatim.
 *
 * These orders mirror `FOOTBALL_ROSTER_SLOTS_BY_DEFENSIVE_FORMAT` in
 * `lib/shared-components/src/features/leagues/create-wizard/constants.ts`,
 * minus `BN` — bench is not a `leaguePosition` row, it is the absence of one
 * (`positionId == null`), and `RosterBoard` derives the bench itself.
 */

/** Slot order for the `dst` defensive format (team defense). */
const DST_SLOT_ORDER = [
  'QB',
  'RB',
  'WR',
  'TE',
  'FLEX',
  'SFLEX',
  'K',
  'DST',
] as const;

/** Slot order for the `idp` defensive format (individual defensive players). */
const IDP_SLOT_ORDER = [
  'QB',
  'RB',
  'WR',
  'TE',
  'FLEX',
  'SFLEX',
  'K',
  'DL',
  'LB',
  'DB',
] as const;

/**
 * Resolves the canonical slot order for a league's defensive format. Anything
 * other than `'idp'` (including `null`/`undefined`, which is how pre-LS-4152
 * football leagues and every baseball league read) falls back to `dst` — the
 * same default `getDefaultRosterPositions` applies in
 * `lib/utils/src/lib/sport-defaults.ts`.
 */
export function getFootballSlotOrder(
  defensiveFormat?: string | null,
): readonly string[] {
  return defensiveFormat === 'idp' ? IDP_SLOT_ORDER : DST_SLOT_ORDER;
}

interface OrderablePosition {
  readonly positionType?: string | null;
}

/**
 * Sorts league position slots into canonical football order for the league's
 * defensive format.
 *
 * Stable in two respects that matter on the board:
 * - duplicate slot types (a 2-RB league has two `RB` rows) keep their incoming
 *   relative order, so RB1/RB2 do not shuffle between renders;
 * - slot types absent from the canonical order (a premium slot this ticket
 *   does not model, or a future server-side addition) sort after every known
 *   slot, in their incoming order, rather than being dropped or interleaved
 *   arbitrarily.
 */
export function orderFootballPositions<T extends OrderablePosition>(
  positions: readonly T[],
  defensiveFormat?: string | null,
): readonly T[] {
  const order = getFootballSlotOrder(defensiveFormat);
  const rank = (p: T): number => {
    const idx = order.indexOf((p.positionType ?? '').toUpperCase());
    return idx === -1 ? order.length : idx;
  };
  // `Array.prototype.toSorted` is not available in the browser baseline this
  // app targets, so this copies then sorts to keep the caller's array intact.
  // `Array.prototype.sort` is stable per spec (ES2019+), which is what keeps
  // duplicate slot types (RB1/RB2) in their incoming order.
  return [...positions].sort((a, b) => rank(a) - rank(b));
}
