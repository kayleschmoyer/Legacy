/**
 * Entitlement lookup keys for feature gating.
 *
 * STRIPE IS THE SOURCE OF TRUTH for which features a customer's plan unlocks
 * (LS-8638). At login/refresh the oauth-proxy mints the customer's live
 * `stripe.entitlements.activeEntitlements` into the JWT as an `entitlements`
 * claim, and the runtime gates against that token claim (fast path) or, for
 * sensitive/irreversible operations, re-reads live Stripe — it does NOT fan a
 * cached tier out through a code-side tier→entitlement map. Product changes
 * (attach a Feature to a plan, launch a new tier) are Stripe-dashboard config,
 * no code deploy.
 *
 * Code still owns the *catalog* — `ENTITLEMENTS` (the machine keys, 1:1 with
 * Stripe Feature `lookup_key`s) and `ENTITLEMENT_LABELS` (human copy for gate
 * error messages) — and every gate call site. It no longer owns tier policy;
 * that lives in Stripe. To add or gate a feature, follow the end-to-end steps
 * in `.agents/skills/add-entitlement/SKILL.md`.
 *
 * Each `ENTITLEMENT` value is the `lookup_key` of a Stripe Feature (provisioned
 * by the `seed-stripe` CLI command, `apps/cli/src/commands/seedStripe.ts`).
 *
 * Gating code should call `requireEntitlement(ctx, ENTITLEMENTS.salary_cap_leagues)`
 * (or `requireFreshEntitlement` for sensitive ops) rather than `requirePremium(ctx)`
 * so the check is framed around the capability being granted, not the coarse tier.
 *
 * This lives in `@legacy-sports/utils` (a platform-shared library) so both the
 * `lambdas/db` feature-gating code and the `seed-stripe` CLI command import a
 * single catalog — Stripe provisioning and in-app gating cannot drift.
 */
export const ENTITLEMENTS = {
  salary_cap_leagues: 'salary_cap_leagues',
  advanced_playoff_formats: 'advanced_playoff_formats',
  unlimited_mock_drafts: 'unlimited_mock_drafts',
  unlimited_leagues: 'unlimited_leagues',
  faab_waiver_type: 'faab_waiver_type',
  historical_era_filters: 'historical_era_filters',
  auction_draft: 'auction_draft',
  extended_trade_expiration: 'extended_trade_expiration',
  player_comparison: 'player_comparison',
  matchup_projections: 'matchup_projections',
  ai_matchup_recap: 'ai_matchup_recap',
  draft_recommendations: 'draft_recommendations',
  trade_analyzer: 'trade_analyzer',
  football_projections: 'football_projections',
  advanced_search_filters: 'advanced_search_filters',
  advanced_pitching_stats: 'advanced_pitching_stats',
  defensive_sabermetrics: 'defensive_sabermetrics',
  advanced_batting_stats: 'advanced_batting_stats',
  large_player_stats_page_size: 'large_player_stats_page_size',
  league_history_analytics: 'league_history_analytics',
  optimal_lineup: 'optimal_lineup',
  logo_upload: 'logo_upload',
  advanced_scheduling: 'advanced_scheduling',
} as const;

export type EntitlementKey = (typeof ENTITLEMENTS)[keyof typeof ENTITLEMENTS];

/**
 * Coarse subscription tier. Retained as a billing-state cache (driven by the
 * Stripe webhook → `users.subscription_tier`): it still governs the free-tier
 * league limit (3) and downgrade side-effects. It is NO LONGER the entitlement
 * source of truth — feature access is decided by the token's Stripe-minted
 * entitlement claim (LS-8638), not by a tier→entitlement map.
 */
export type SubscriptionTier = 'free' | 'premium';

/** Human-readable labels for error messages when an entitlement is missing. */
export const ENTITLEMENT_LABELS: Record<EntitlementKey, string> = {
  salary_cap_leagues: 'Salary cap leagues',
  advanced_playoff_formats: 'Advanced playoff formats (6-team, 8-team)',
  unlimited_mock_drafts: 'Unlimited mock drafts',
  unlimited_leagues: 'Unlimited active leagues',
  faab_waiver_type:
    'FAAB waiver type (commissioner league-creation only; members of FAAB leagues may participate regardless of tier)',
  historical_era_filters: 'Historical era filters',
  auction_draft: 'Auction draft mode',
  extended_trade_expiration: 'Extended trade expiration',
  player_comparison: 'Player comparison',
  matchup_projections: 'Matchup projections & win probability',
  ai_matchup_recap: 'AI matchup recaps',
  draft_recommendations: 'Draft recommendations',
  trade_analyzer: 'Trade analyzer',
  football_projections: 'Fantasy scoring projections (football)',
  advanced_search_filters:
    'Advanced search filters (projected fantasy points, ADP rank)',
  advanced_pitching_stats: 'Advanced pitching analytics (FIP, WHIP, K/9, BB/9)',
  defensive_sabermetrics: 'Advanced defensive sabermetrics (DRS, UZR, OAA)',
  advanced_batting_stats: 'Advanced batting sabermetrics (OPS, OPS+, BABIP)',
  large_player_stats_page_size:
    'Larger page sizes (250/500 rows) in Player Statistics',
  league_history_analytics:
    'Premium league history analytics (championship leaderboard, manager awards)',
  optimal_lineup: 'Optimal Lineup (auto-set)',
  logo_upload: 'Team logo upload (direct file upload)',
  advanced_scheduling: 'Advanced scheduling (custom in-division game ratio)',
};
