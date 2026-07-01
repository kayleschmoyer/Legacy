/**
 * Entitlement lookup keys for feature gating.
 *
 * THIS MAP IS THE SOURCE OF TRUTH, NOT A MIRROR OF STRIPE. Stripe is
 * provisioned *from* this map (the `seed-stripe` CLI derives its Features from
 * `Object.values(ENTITLEMENTS)`), and the runtime gates by reading the cached
 * `users.subscription_tier` column against `TIER_ENTITLEMENTS` — it never queries
 * Stripe's entitlements API per request. Code owns the feature catalog
 * (`ENTITLEMENTS`/`ENTITLEMENT_LABELS`) and tier policy (`TIER_ENTITLEMENTS`);
 * Stripe owns *who is premium right now* (subscription status → webhook → tier
 * column) and billing/prices. To add or gate a feature, follow the end-to-end
 * steps in `.agents/skills/add-entitlement/SKILL.md`.
 *
 * Each `ENTITLEMENT` value is the `lookup_key` of a Stripe Feature
 * (provisioned by the `seed-stripe` CLI command,
 * `apps/cli/src/commands/seedStripe.ts`). Product tiers attach a subset
 * of these features; future tiers (e.g. a mid-level plan) require no code
 * changes — only a new entry in `TIER_ENTITLEMENTS` and a new Stripe price.
 *
 * Gating code should call `requireEntitlement(ctx, ENTITLEMENTS.salary_cap_leagues)`
 * rather than `requirePremium(ctx)` so the check is framed around the capability
 * being granted, not the tier that currently grants it.
 *
 * This lives in `@legacy-sports/utils` (a platform-shared library) so both the
 * `lambdas/db` feature-gating code and the `seed-stripe` CLI command can import
 * a single source of truth — Stripe provisioning and in-app gating cannot drift.
 *
 * Follow-up (tracked separately): sync the authoritative entitlement set from
 * Stripe's Entitlements API (`entitlements.activeEntitlements.list`) on each
 * subscription webhook event so downgrade/upgrade side effects don't depend
 * on the tier column.
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
  advanced_football_stats: 'advanced_football_stats',
  advanced_pitching_stats: 'advanced_pitching_stats',
  defensive_sabermetrics: 'defensive_sabermetrics',
  advanced_batting_stats: 'advanced_batting_stats',
  large_player_stats_page_size: 'large_player_stats_page_size',
  league_history_analytics: 'league_history_analytics',
} as const;

export type EntitlementKey = (typeof ENTITLEMENTS)[keyof typeof ENTITLEMENTS];

export type SubscriptionTier = 'free' | 'premium';

/**
 * Static mapping of tier → granted entitlements. The single source of truth
 * for which features a tier unlocks in-app. To introduce a new tier:
 *   1. Add a Stripe Price with a matching `lookup_key` in `seedStripe.ts`.
 *   2. Attach the desired Features to the Product.
 *   3. Add the tier here with its entitlement subset.
 *   4. Extend the `SubscriptionTier` union.
 *
 * The tier→entitlement fan-out exists in code (not DB) so that adding a tier
 * is a pure schema-less code change; Stripe remains the pricing/billing
 * source of truth, and this map expresses the product policy.
 */
export const TIER_ENTITLEMENTS: Record<SubscriptionTier, EntitlementKey[]> = {
  free: [],
  premium: [
    ENTITLEMENTS.salary_cap_leagues,
    ENTITLEMENTS.advanced_playoff_formats,
    ENTITLEMENTS.unlimited_mock_drafts,
    ENTITLEMENTS.unlimited_leagues,
    ENTITLEMENTS.faab_waiver_type,
    ENTITLEMENTS.historical_era_filters,
    ENTITLEMENTS.auction_draft,
    ENTITLEMENTS.extended_trade_expiration,
    ENTITLEMENTS.player_comparison,
    ENTITLEMENTS.matchup_projections,
    ENTITLEMENTS.ai_matchup_recap,
    ENTITLEMENTS.draft_recommendations,
    ENTITLEMENTS.trade_analyzer,
    ENTITLEMENTS.football_projections,
    ENTITLEMENTS.advanced_search_filters,
    ENTITLEMENTS.advanced_football_stats,
    ENTITLEMENTS.advanced_pitching_stats,
    ENTITLEMENTS.defensive_sabermetrics,
    ENTITLEMENTS.advanced_batting_stats,
    ENTITLEMENTS.large_player_stats_page_size,
    ENTITLEMENTS.league_history_analytics,
  ],
};

/** Human-readable labels for error messages when an entitlement is missing. */
export const ENTITLEMENT_LABELS: Record<EntitlementKey, string> = {
  salary_cap_leagues: 'Salary cap leagues',
  advanced_playoff_formats: 'Advanced playoff formats (6-team, 8-team)',
  unlimited_mock_drafts: 'Unlimited mock drafts',
  unlimited_leagues: 'Unlimited active leagues',
  faab_waiver_type: 'FAAB waivers',
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
    'Advanced search filters (projected fantasy points, ADP rank, injury status)',
  advanced_football_stats: 'Advanced football stats',
  advanced_pitching_stats: 'Advanced pitching analytics (FIP, WHIP, K/9, BB/9)',
  defensive_sabermetrics: 'Advanced defensive sabermetrics (DRS, UZR, OAA)',
  advanced_batting_stats: 'Advanced batting sabermetrics (OPS, OPS+, BABIP)',
  large_player_stats_page_size:
    'Larger page sizes (250/500 rows) in Player Statistics',
  league_history_analytics:
    'Premium league history analytics (championship leaderboard, manager awards)',
};

export function tierHasEntitlement(
  tier: SubscriptionTier,
  key: EntitlementKey,
): boolean {
  return TIER_ENTITLEMENTS[tier].includes(key);
}
