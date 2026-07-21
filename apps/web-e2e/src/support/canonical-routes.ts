/**
 * Canonical route shapes for the web app's resolver / redirect routes (LS-8464).
 *
 * Single source of truth for the URLs the resolver pages
 * (`MatchupRedirectPage`, `StandingsRedirectPage`) and the legacy aliases
 * resolve to. The same canonical destinations are what `apps/app`'s
 * `+native-intent.ts` rewrites on native (LS-8453) — centralising them here
 * keeps the web E2E assertions and the native intent map asserting identical
 * targets, so a shape change is caught in one place rather than drifting per
 * platform.
 *
 * Route builders only — no Playwright / element concerns live here (ADR-0016).
 */

// ── Source (resolver) routes a user or crawler hits ────────────────────────

/** `/matchup/:matchupId` — resolved by `MatchupRedirectPage`. */
export const resolverMatchupPath = (matchupId: number | string): string =>
  `/matchup/${matchupId}`;

/** `/standings` — resolved by `StandingsRedirectPage`. */
export const RESOLVER_STANDINGS_PATH = '/standings';

// ── Canonical destinations the resolvers redirect to ───────────────────────

/** `/baseball/league/:leagueId/matchups/:matchupId` — canonical matchup URL. */
export const canonicalMatchupPath = (
  leagueId: number | string,
  matchupId: number | string,
): string => `/baseball/league/${leagueId}/matchups/${matchupId}`;

/** `/baseball/league/:leagueId/standings` — canonical standings tab URL. */
export const canonicalStandingsPath = (leagueId: number | string): string =>
  `/baseball/league/${leagueId}/standings`;

/** The app root (home). */
export const HOME_PATH = '/';

/** Canonical mock-draft route. */
export const MOCK_DRAFT_PATH = '/baseball/mock-draft';

// ── Legacy aliases (assert final URL + rendered destination page) ──────────

export interface LegacyAlias {
  /** The legacy source path a user or crawler still reaches. */
  readonly from: string;
  /** The canonical path it must redirect to. */
  readonly to: string;
}

/**
 * Legacy path aliases that redirect to a canonical route (LS-8464 AC3).
 *
 * `/faq → /pricing` is intentionally excluded — it is already covered by
 * `pricing-page.spec.ts` and is out of scope for this ticket.
 */
export const LEGACY_ALIASES: readonly LegacyAlias[] = [
  { from: '/home', to: HOME_PATH },
  { from: '/draft/mock', to: MOCK_DRAFT_PATH },
];
