# Subscription Tiers — Product Source of Truth

**Owner:** Product (human-maintained). **Status:** active.

This document is the **authoritative, human-owned statement of which features
belong to which subscription tier.** It captures product _intent_ — the
decisions made by the team about what is free and what is premium — independent
of how the code happens to enforce it today.

> **Why this file exists.** Feature gating intent was previously implied by
> scattered `PremiumGate` overlays and resolver checks added piecemeal. That let
> intent drift (features marketed as premium with no billing object behind them;
> a fundamental feature accidentally gated). This document is the single place
> the team decides tiering. **Code and Stripe conform to this file, not the
> other way around.** When intent changes, edit this file first, then update
> `ENTITLEMENTS` and the gates to match.

## How the layers connect

- **This doc** = intent (free vs. premium per feature) — owned by Product.
- **`ENTITLEMENTS`** in [`lib/utils/src/lib/entitlements.ts`](../../lib/utils/src/lib/entitlements.ts) = the machine-readable key per premium feature. `TIER_ENTITLEMENTS` maps tiers → keys.
- **Stripe** = billing. The `seed-stripe` CLI ([`apps/cli/src/commands/seedStripe.ts`](../../apps/cli/src/commands/seedStripe.ts)) derives Stripe Features directly from `ENTITLEMENTS`, so every key here is provisioned automatically.
- **Backend gates** = `requireEntitlement(ctx, ENTITLEMENTS.x)` / `hasEntitlement(...)` in resolvers (the real enforcement).
- **Frontend gates** = `PremiumGate` + `useHasEntitlement(ENTITLEMENTS.x)` (web) / the mobile equivalent in `useSubscription.ts`. These are UX upsell surfaces; they are NOT a security boundary.

To change a feature's tier: edit the table below → add/remove its key in `TIER_ENTITLEMENTS` → adjust the resolver gate and the `useHasEntitlement` call. The Stripe seed and the marketing comparison table should then be re-synced.

## Tiers

| Tier    | Price                 | Stripe price lookup_key             |
| ------- | --------------------- | ----------------------------------- |
| Free    | $0                    | —                                   |
| Premium | $4.99/mo or $39.99/yr | `premium_monthly`, `premium_annual` |

Free tier includes **up to 3 active leagues** and **2 mock drafts/week**; Premium lifts both limits.

## Feature → tier matrix

Legend for **Enforcement**: 🔒 server-enforced (resolver gate) · 🖥️ UI-gated only (no server resolver yet — see notes) · ➖ limit-based.

### Premium features

| Feature                                            | Tier    | Entitlement key             | Enforcement | Backend resolver                                                                                    | Frontend gate                    |
| -------------------------------------------------- | ------- | --------------------------- | ----------- | --------------------------------------------------------------------------------------------------- | -------------------------------- |
| Salary cap leagues                                 | Premium | `salary_cap_leagues`        | 🔒          | `leagues/mutations.ts`                                                                              | league create/settings           |
| Advanced playoff formats (6/8-team)                | Premium | `advanced_playoff_formats`  | 🔒          | `leagues/mutations.ts`                                                                              | `LeagueSettingsControl`          |
| Unlimited active leagues                           | Premium | `unlimited_leagues`         | 🔒 ➖       | `leagues/mutations.ts` (cap)                                                                        | league create                    |
| Unlimited mock drafts                              | Premium | `unlimited_mock_drafts`     | 🔒 ➖       | `drafts/queries.ts`, `initialize-mock-draft.ts`                                                     | `MockDraftPage`                  |
| FAAB waivers                                       | Premium | `faab_waiver_type`          | 🔒          | `leagues/mutations.ts`                                                                              | league create, Commish           |
| Historical era filters                             | Premium | `historical_era_filters`    | 🔒          | `leagues/mutations.ts`                                                                              | `DraftSettingsControl`           |
| Auction draft mode                                 | Premium | `auction_draft`             | 🔒          | `leagues/mutations.ts`                                                                              | league create                    |
| Extended trade expiration                          | Premium | `extended_trade_expiration` | 🔒          | `trades/mutations.ts`                                                                               | TradingCenter                    |
| AI matchup recaps                                  | Premium | `ai_matchup_recap`          | 🔒          | `matchups/types.ts` (`recap` field)                                                                 | MatchupDetail recap panel        |
| Draft recommendations                              | Premium | `draft_recommendations`     | 🔒          | `drafts/queries.ts` (`getDraftRecommendations`)                                                     | `DraftSidebar`                   |
| Player comparison                                  | Premium | `player_comparison`         | 🖥️          | _none yet — `comparePlayers` resolver not built_                                                    | `PlayerComparisonPage`           |
| Matchup projections & win probability              | Premium | `matchup_projections`       | 🖥️          | _none — computed client-side in `MatchupWinProbabilityPanel`_                                       | MatchupDetail win-prob panel     |
| Trade analyzer                                     | Premium | `trade_analyzer`            | 🖥️          | _none yet — analyzer is a “coming soon” teaser_                                                     | `TradeCenterPage`                |
| Fantasy scoring projections (football)             | Premium | `football_projections`      | 🖥️          | _none yet — `ProjectionsTeaser` is an upsell teaser_                                                | `FootballPlayerDetailPage`       |
| Advanced pitching analytics (FIP, WHIP, K/9, BB/9) | Premium | `advanced_pitching_stats`   | 🖥️          | _none — column display is client-side; `playerSeasonPitching` already gated by `player_comparison`_ | `PlayerDetailModal` pitching tab |
| Advanced defensive sabermetrics (DRS, UZR, OAA)    | Premium | `defensive_sabermetrics`    | 🔒 🖥️       | `statistics.ts` (`playerSeasonFielding` — nulls non-premium)                                        | `PlayerDetailModal` Fielding tab |

### Free features (explicit decisions)

| Feature                          | Tier     | Notes                                                                                                                                                                                          |
| -------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Live draft board**             | **Free** | Fundamental to the product — drafting is core, not a premium add-on. Premium gate removed 2026-06-13. Draft _recommendations_ shown inside the board remain premium (`draft_recommendations`). |
| Join up to 3 leagues             | Free     | 4th+ active league requires `unlimited_leagues`.                                                                                                                                               |
| Up to 2 mock drafts/week         | Free     | Beyond that requires `unlimited_mock_drafts`.                                                                                                                                                  |
| Career & season stats            | Free     | Authenticated, all tiers (deliberate — see `football.ts` `careerStats` note, LS-6248).                                                                                                         |
| Football injury **status** badge | Free     | Status + freshness are free; expert injury _analysis_ is a planned premium feature (see below).                                                                                                |

## Enforcement gaps to close (tracked work)

The 🖥️ rows above are tracked in Stripe and gated in the UI, but have **no
server-side enforcement yet** because the underlying data is client-side or the
resolver doesn't exist. The UI gate is cosmetic for these until a resolver
lands. When each backend is built, add the `requireEntitlement` gate so the
matrix becomes fully 🔒:

- `player_comparison` — build/gate a `comparePlayers` resolver.
- `matchup_projections` — if/when win-probability moves server-side, gate it; today it's a pure client calculation.
- `trade_analyzer` — gate when the analyzer ships (currently a teaser).
- `football_projections` — gate the projections resolver when built.

## Planned (not yet a tier decision in code)

| Feature                                                                             | Intended key             | Reference                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expert injury analysis (practice log, analyst note, IR timeline, game-time tracker) | `expert_injury_analysis` | [`docs/architecture/injury-analysis-tiers.md`](../architecture/injury-analysis-tiers.md) (LS-6254 / FPD-026). Not yet in `ENTITLEMENTS` or Stripe — lands with FPD-026. |

## Change log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-14 | Dropped the `advanced_football_stats` premium feature (LS-6475 / FPL-028). The promised stats (snap %, target share, air yards, EPA, red-zone touches) exist in no schema, resolver, GraphQL, UI, or data source — Pro Football Reference does not publish them. Rather than bill for an undeliverable feature, the entitlement was removed. Re-add the key + gate if these stats are ever sourced (e.g. an nflverse / Next Gen Stats ingestion pipeline). |
| 2026-06-13 | Initial source-of-truth. Live draft board moved to Free. Added entitlement keys `player_comparison`, `matchup_projections`, `ai_matchup_recap`, `draft_recommendations`, `trade_analyzer`, `football_projections`; server-enforced `ai_matchup_recap` and `draft_recommendations`.                                                                                                                                                                         |
