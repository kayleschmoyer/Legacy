# Premium Gating Inventory & Stripe Entitlement Audit

> **The authoritative feature→tier mapping now lives in
> [`docs/product/subscription-tiers.md`](../product/subscription-tiers.md)** (the
> human-owned product source of truth). This file is the original audit that
> motivated it — kept for the gap analysis and history. For "what tier is feature
> X", read the product doc, not this one.
>
> **Enforcement model:** as of epic
> [LS-8638](https://legacy-sports.atlassian.net/browse/LS-8638), entitlements are
> minted into the JWT from live Stripe at login/refresh and enforced against that
> token claim (fresh-from-Stripe for sensitive ops), with a per-user
> `entitlements_updated_at` marker force-expiring stale tokens. See
> [How premium gating works here](#how-premium-gating-works-here-the-three-layers)
> and the product doc's
> [runtime enforcement section](../product/subscription-tiers.md#how-gating-is-enforced-runtime).

**Generated:** 2026-06-13 · **Enforcement model updated:** 2026-07-26 (LS-8646)
**Purpose:** Catalogue every feature that is presented or enforced as "premium"
across the codebase and reconcile it against the Stripe entitlements that are
actually provisioned. Flags the gaps where something is gated in the product
but has **no backing Stripe entitlement** (or no backend enforcement at all).

---

## How premium gating works here (the three layers)

> **Model update (LS-8638, enforced by LS-8643/8644):** entitlements are now
> **carried in the JWT**, minted from live Stripe at login/refresh, and enforced
> against that token claim for non-admin ops (fresh-from-Stripe for sensitive
> ops). The description below reflects the shipped model. The gap analysis that
> follows (Gap A / Gap B) is preserved from the 2026-06-13 audit for history — it
> predates the cutover and describes billing-coverage gaps, which are orthogonal
> to _how_ a held entitlement is enforced.

1. **Stripe entitlements (runtime source of truth).** Which features a customer's
   plan unlocks is **Stripe-dashboard configuration** — the Features attached to the
   Product/price. At login (`createJwt`) and refresh (`RefreshJwt`) the oauth-proxy
   reads the customer's live `stripe.entitlements.activeEntitlements.list` and mints
   the matching `lookup_key`s into the JWT as an `entitlements` claim
   ([`lambdas/oauth-proxy/src/util/jwt.ts`](../../lambdas/oauth-proxy/src/util/jwt.ts)).
   The code owns only the **catalog** —
   [`lib/utils/src/lib/entitlements.ts`](../../lib/utils/src/lib/entitlements.ts)'s
   `ENTITLEMENTS` map (machine keys, 1:1 with Stripe Feature `lookup_key`s). The
   `seed-stripe` CLI ([`apps/cli/src/commands/seedStripe.ts`](../../apps/cli/src/commands/seedStripe.ts))
   provisions one Stripe Feature per catalog key. There is exactly **one product**
   (`Legacy Sports Premium`) with two prices (`premium_monthly` $4.99,
   `premium_annual` $39.99). The former `TIER_ENTITLEMENTS` array that fanned a coarse
   tier out to feature keys in code was **deleted** by LS-8643 — Stripe, not code,
   decides which plan grants which feature. There is **no local entitlements cache
   table** (rejected in LS-8638 as a drift risk).

2. **Backend enforcement (GraphQL resolvers).** Non-admin gates
   `requireEntitlement(ctx, ENTITLEMENTS.x)` / `hasEntitlement(...)` read the token's
   entitlement claim (fast path, no per-request Stripe call), from
   [`lambdas/db/src/schema/authorization.ts`](../../lambdas/db/src/schema/authorization.ts).
   A per-user `app_internal.users.entitlements_updated_at` marker (bumped by the Stripe
   webhook) force-expires a token whose `iat` predates it: the gate throws
   `ENTITLEMENTS_STALE`, and the client silently refreshes the JWT and retries.
   Sensitive / irreversible operations instead call `requireFreshEntitlement(...)`
   ([`lambdas/db/src/schema/fresh-entitlements.ts`](../../lambdas/db/src/schema/fresh-entitlements.ts)),
   which reads live Stripe and ignores the token. `subscription_tier`
   (`app_internal.users.subscription_tier`) is retained only as a coarse billing-state
   cache (free-tier league limit + downgrade side-effects); admins are treated as
   premium for reads. The legacy `requirePremium(ctx)` (raw tier check, no entitlement
   key) remains for coarse cases.

3. **Frontend gates (`PremiumGate` upsell overlays).** Purely presentational —
   they blur/overlay content and show an "Upgrade" CTA based on an `isPremium`
   boolean and a free-text `featureName` string. **A `PremiumGate` is NOT tied
   to an entitlement key** and does not, by itself, enforce anything server-side.

The headline risk the original audit confirmed: **layers 2 and 3 contained "premium"
features that did not exist in layer 1** (no Stripe billing object), and one Stripe
entitlement was enforced nowhere. Those billing-coverage findings are recorded below.

---

## 1. Stripe entitlements (provisioned & auto-synced)

These 8 keys are in the `ENTITLEMENTS` catalog and seeded into Stripe by
`seedStripe.ts`, and each is attached to the premium plan in the Stripe dashboard
(post-LS-8638, plan→feature attachment is Stripe config, not a code-side
`TIER_ENTITLEMENTS` map). Billing coverage for these is **guaranteed** (the seed
derives from the same catalog); a customer on the premium plan receives them in
their JWT entitlement claim at login/refresh.

| Entitlement key             | Label                               | Backend enforced? | Where                                                            |
| --------------------------- | ----------------------------------- | ----------------- | ---------------------------------------------------------------- |
| `salary_cap_leagues`        | Salary cap leagues                  | ✅                | `leagues/mutations.ts` (create/update league)                    |
| `advanced_playoff_formats`  | Advanced playoff formats (6/8-team) | ✅                | `leagues/mutations.ts`                                           |
| `unlimited_mock_drafts`     | Unlimited mock drafts               | ✅                | `drafts/queries.ts`, `drafts/mutations/initialize-mock-draft.ts` |
| `unlimited_leagues`         | Unlimited active leagues            | ✅                | `leagues/mutations.ts` (create/renew league cap)                 |
| `faab_waiver_type`          | FAAB waivers                        | ✅                | `leagues/mutations.ts`                                           |
| `historical_era_filters`    | Historical era filters              | ✅                | `leagues/mutations.ts`                                           |
| `auction_draft`             | Auction draft mode                  | ✅                | `leagues/mutations.ts`                                           |
| `extended_trade_expiration` | Extended trade expiration           | ✅                | `trades/mutations.ts`                                            |

### ✅ Gap A (resolved, LS-6475 — code removal completed 2026-07-02) — `advanced_football_stats` removed

Previously the entitlement was seeded into Stripe and attached to the premium
product, but (at audit time, 2026-06-13) **no resolver or UI gate referenced
it**, and the underlying stats (snap %, target share, air yards, EPA, red-zone
touches) exist nowhere in the schema, resolver, GraphQL, UI, or any data
source — Pro Football Reference does not publish them. Rather than bill for a
feature that could not be delivered, the entitlement was **removed** from
`ENTITLEMENTS` (LS-6475 / FPL-028). If these stats are ever sourced (e.g. an
nflverse / Next Gen Stats ingestion pipeline), re-add the key and gate it then.

**Note the decision-to-code lag:** the removal was decided 2026-06-14 but the
key stayed live until **2026-07-02**, and LS-8045 (2026-06-28) shipped a UI
gate keyed on it in the interim (since re-keyed to `advanced_search_filters`).
Full record: the 2026-07-02 entry in the
[`subscription-tiers.md` change log](../product/subscription-tiers.md#change-log).

---

## 2. Frontend `PremiumGate` overlays and what they map to

Every `featureName` string passed to a `PremiumGate` across web (`apps/web`),
mobile (`apps/app`), and shared (`lib/shared-components`). The "Maps to
entitlement?" column is the crux of your concern.

| `featureName` (UI string)                             | Location(s)                                                                          | Maps to a Stripe entitlement?                                                                     | Backend enforced?                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Salary Cap                                            | web/app league create, Commish, `LeagueSettingsControl`, `SalaryCapManagementCard`   | ✅ `salary_cap_leagues`                                                                           | ✅                                                                                              |
| Advanced Playoff Format                               | `LeagueSettingsControl`                                                              | ✅ `advanced_playoff_formats`                                                                     | ✅                                                                                              |
| FAAB Waiver Settings / FAAB Waiver Processing         | web/app league create, `Commish`                                                     | ✅ `faab_waiver_type`                                                                             | ✅                                                                                              |
| Historical Era Filter / Historical Era Selection      | `DraftSettingsControl`, `LeagueCreatePage`                                           | ✅ `historical_era_filters`                                                                       | ✅                                                                                              |
| Unlimited League Creation / Unlimited league creation | `LeagueCreatePage`, `FootballHubPage`, `LeagueDetailPageV2` ("Fantasy League")       | ✅ `unlimited_leagues`                                                                            | ✅                                                                                              |
| Mock Draft Simulator                                  | `MockDraftPage`                                                                      | ⚠️ partial — UI gates the simulator; backend only gates the **count** via `unlimited_mock_drafts` | ✅ (count only)                                                                                 |
| **Player Comparison**                                 | `PlayerComparisonPage` (web), `PremiumGate` (app)                                    | ❌ **none**                                                                                       | ❌ no `comparePlayers` premium gate exists                                                      |
| **Matchup Projections**                               | `MatchupDetailPage` (web), `MatchupDetailScreen` (app), `MatchupWinProbabilityPanel` | ❌ **none**                                                                                       | ❌ `getPlayoffProjections` is **auth-only** (see `analytics.ts`)                                |
| **AI Matchup Recap** (narratives)                     | `MatchupDetailPage` (web), `MatchupDetailScreen` (app)                               | ✅ `ai_matchup_recap` (this PR)                                                                   | ✅ server-enforced — `recap` field returns null for non-entitled (`matchups/types.ts`, this PR) |
| **Draft Recommendations**                             | `DraftSidebar` (shared)                                                              | ✅ `draft_recommendations` (this PR)                                                              | ✅ server-enforced — `getDraftRecommendations` (`drafts/queries.ts`, this PR)                   |
| **Live Draft**                                        | `EliteDraftBoard` (web)                                                              | n/a — **now FREE** (this PR)                                                                      | n/a — premium gate removed (this PR)                                                            |
| **Trade Analyzer**                                    | `TradeCenterPage`                                                                    | ❌ **none** (distinct from `extended_trade_expiration`)                                           | ❌ no backend gate                                                                              |
| **Projections teaser** (`PROJECTIONS_FEATURE_NAME`)   | `FootballPlayerDetailPage`                                                           | ❌ **none**                                                                                       | ❌ no backend gate                                                                              |
| Logo Upload                                           | Team tab (`league-detail-v2/tabs/Team.tsx`, web) — LS-5946                           | ✅ `logo_upload`                                                                                  | 🖥️ UI-gated only — the `image-upload` Lambda enforces team **ownership**, not premium           |

### ⚠️ Gap B — UI-gated "premium" features (status updated by this PR)

> **Update (2026-06-13, this PR):** every feature below now has a Stripe
> entitlement key (`ENTITLEMENTS` in `@legacy-sports/utils`), so the
> "no Stripe entitlement" half of this gap is **closed**. **Live Draft** moved
> to **Free** (gate removed). **AI Matchup Recap** and **Draft Recommendations**
> are now **server-enforced** via `requireEntitlement`/`hasEntitlement`. The
> rest — **Player Comparison, Matchup Projections / Win Probability, Trade
> Analyzer, Football projections teaser** — are tracked + UI-gated but **not yet
> server-enforced** because their data is client-side or the resolver isn't built
> yet; see [`docs/product/subscription-tiers.md`](../product/subscription-tiers.md)
> (🖥️ rows) for the remaining work. The original gap analysis is preserved below
> for history.

Originally (pre-PR), the bolded rows were presented to users as premium (blur +
"Upgrade" CTA) but:

- had **no Stripe entitlement**, so even after purchasing premium there was no
  billing object that represented them; and
- had **no server-side enforcement**, so the data was reachable by any
  authenticated user who calls the GraphQL API directly (the gate was cosmetic).

> Note: [`SubscriptionDowngradeService.ts`](../../lib/db-client/src/lib/services/SubscriptionDowngradeService.ts)
> previously claimed those resolvers were "gated at the GraphQL resolver level
> via getSubscriptionTier." That comment was inaccurate at the time and has been
> **corrected in this PR** to describe the actual enforcement (server-gated for
> recap + draft recommendations; UI-gated/tracked for the rest).

---

## 3. Marketing / plan-comparison surface

[`apps/app/src/features/subscription/constants.ts`](../../apps/app/src/features/subscription/constants.ts)
(`PREMIUM_FEATURES`) is the free-vs-premium table shown on the upgrade screen.
It advertises:

- Join up to 3 leagues (free + premium)
- Unlimited active leagues → `unlimited_leagues` ✅
- Salary cap leagues → `salary_cap_leagues` ✅
- Advanced playoff formats (6/8-team) → `advanced_playoff_formats` ✅
- Unlimited mock drafts → `unlimited_mock_drafts` ✅
- FAAB waivers → `faab_waiver_type` ✅
- Historical era filters → `historical_era_filters` ✅

This marketing list is **internally consistent** with Stripe, but it **omits**
several things that exist as entitlements (`auction_draft`,
`extended_trade_expiration`) and several things the
app gates in the UI (Player Comparison, Matchup Projections, AI Recap, Draft
Recommendations). Worth aligning the three lists.

---

## 4. Planned / documented but not yet built

None currently. The previously listed **expert injury analysis** (Football
Player Detail, intended key `expert_injury_analysis`, LS-6254 / FPD-026) was
cancelled by the platform-wide injury-feature removal (LS-8604) — Legacy Sports
is a historical-data platform, so injuries cannot occur. It was never added to
`ENTITLEMENTS` or Stripe, so no billing cleanup was needed.

---

## Summary of action items

1. ~~**Gap A:** `advanced_football_stats` is in Stripe but enforced nowhere~~ —
   **resolved (LS-6475, code removal completed 2026-07-02):** the stats have no
   data source, so the entitlement was removed from `ENTITLEMENTS` rather than
   left billed-but-dead. Re-add when/if the stats are sourced. Manual owner
   step outstanding: detach/archive the orphaned Feature in any live Stripe
   account (`seed-stripe` never deletes).
2. ~~**Gap B:** … no Stripe entitlement and no backend enforcement~~ —
   **addressed by this PR:** all listed features now carry an `ENTITLEMENTS` key;
   Live Draft is Free; AI Matchup Recap + Draft Recommendations are
   server-enforced. Player Comparison, Matchup Projections / Win Probability,
   Trade Analyzer, and the football projections teaser remain UI-gated +
   tracked, with server enforcement to follow when their backends exist.
3. ~~Fix the inaccurate `SubscriptionDowngradeService` comment~~ — **done in this PR.**
4. Align the three "what's premium" lists: `ENTITLEMENTS`, the app's
   `PREMIUM_FEATURES` marketing table, and the `PremiumGate` overlays.
   (`subscription-tiers.md` is now the source of truth they should converge on.)

**Bottom line:** Your instinct is correct. Of the features the product treats as
premium, only the 8 league/draft/trade-configuration entitlements are fully
covered end-to-end. The dead `advanced_football_stats` entitlement has since been
removed (LS-6475; code removal completed 2026-07-02), and at least seven UI-gated
"premium" features have no Stripe entitlement behind them at all.
