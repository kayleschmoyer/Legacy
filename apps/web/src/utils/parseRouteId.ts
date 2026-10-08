/**
 * Strictly parses a numeric route param (`/league/:id`, `/teams/:teamId`, …).
 *
 * `parseInt` alone accepts trailing junk — `parseInt('14109abc', 10)` is
 * `14109` — which let `/baseball/league/14109abc` render league 14109 under a
 * non-canonical URL (LS-10778). Only a plain run of ASCII digits naming a
 * positive safe integer is accepted; anything else returns `null` so the page
 * can show its not-found state.
 */
export function parseRouteId(param: string | null | undefined): number | null {
  if (param == null || !/^\d+$/.test(param)) return null;
  const value = Number(param);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
