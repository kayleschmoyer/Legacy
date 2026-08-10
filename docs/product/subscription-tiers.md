# Subscription Tiers — Product Source of Truth

**Owner:** Product (human-maintained). **Status:** active.

This document is the **authoritative, human-owned statement of which features
belong to which subscription tier.** It captures product _intent_ — the
decisions made by the team about what is free and what is premium.

> **Why this file exists.** Feature gating intent was previously implied by
> scattered `PremiumGate` overlays and resolver checks added piecemeal. That let
> intent drift (features marketed as premium with no billing object behind them;
> a fundamental feature accidentally gated). This document is the single place
> the team records tiering intent.
>
> **The _runtime_ source of truth is Stripe, not this file.** As of epic
> [LS-8638](https://legacy-sports.atlassian.net/browse/LS-8638), what a customer
> can actually access is decided by their **live Stripe entitlements**, minted
> into the JWT at login/refresh and enforced against that token claim (see
> [How gating is enforced](#how-gating-is-enforced-runtime) below). This doc and
> the Stripe dashboard configuration should agree; when they diverge, Stripe is
> authoritative for access and this doc must be corrected to match reality.

## How the layers connect

- **This doc** = product intent (free vs. premium per feature) — owned by Product.
- **Stripe** = the runtime source of truth. A Product's attached Features (per price/plan) decide which entitlement `lookup_key`s a customer holds. The `seed-stripe` CLI ([`apps/cli/src/commands/seedStripe.ts`](../../apps/cli/src/commands/seedStripe.ts)) provisions a Stripe Feature for every catalog key, but which features a _plan_ unlocks is Stripe-dashboard configuration.
- **`ENTITLEMENTS`** in [`lib/utils/src/lib/entitlements.ts`](../../lib/utils/src/lib/entitlements.ts) = the code **catalog** — the machine keys (1:1 with Stripe Feature `lookup_key`s) plus `ENTITLEMENT_LABELS`. It is the shared vocabulary for gate call sites and the Stripe seed; it is **not** a tier→feature policy map (the former `TIER_ENTITLEMENTS` array that fanned a coarse tier out to keys was deleted in LS-8638 — Stripe now owns which plan grants which feature).
- **JWT entitlement claim** = the live Stripe `lookup_key` set, minted into the token by the oauth-proxy at login and refresh. This is what non-admin gates read.
- **Backend gates** = `requireEntitlement(ctx, ENTITLEMENTS.x)` / `hasEntitlement(...)` (fast path, reads the token claim) or `requireFreshEntitlement(...)` (fresh from live Stripe, for sensitive ops) in resolvers — the real enforcement.
- **Frontend gates** = `PremiumGate` + `useHasEntitlement(ENTITLEMENTS.x)` (web) / the mobile equivalent in `useSubscription.ts`. These are UX upsell surfaces; they are NOT a security boundary.

To change a feature's tier: attach/detach its Stripe **Feature** on the plan in the Stripe dashboard — **no code deploy** — then update the table below and the marketing comparison table to match. Access changes after each user's next token refresh (see force-expiry below). The `ENTITLEMENTS` catalog key and the gate call site stay in code; you only add/remove them when introducing or retiring a _capability_, not when re-pricing an existing one.

## Tiers

| Tier    | Price                 | Stripe price lookup_key             |
| ------- | --------------------- | ----------------------------------- |
| Free    | $0                    | —                                   |
| Premium | $4.99/mo or $39.99/yr | `premium_monthly`, `premium_annual` |

Free tier includes **up to 3 active leagues** and **2 mock drafts/week**; Premium lifts both limits.

## How gating is enforced (runtime)

Enacted by epic [LS-8638](https://legacy-sports.atlassian.net/browse/LS-8638). The
model is **JWT-carried, Stripe-driven entitlements with per-user force-expiry**:

1. **Mint from live Stripe.** At login (`createJwt`) and refresh (`RefreshJwt`) the
   oauth-proxy reads the customer's live
   `stripe.entitlements.activeEntitlements.list`, filters to the code catalog, and
   embeds the resulting `lookup_key` array as an `entitlements` claim in the JWT
   ([`lambdas/oauth-proxy/src/util/jwt.ts`](../../lambdas/oauth-proxy/src/util/jwt.ts)).
   A free user / user with no Stripe customer mints an **empty claim** and is gated
   out of every premium feature. On a persistent Stripe read failure the mint falls
   back per the epic's Resolved Decision #1 (refresh carries the prior claim forward;
   a fresh login fails closed to empty and self-heals on the next refresh).
2. **Non-admin enforcement reads the token claim (fast path).**
   `hasEntitlement(ctx, key)` / `requireEntitlement(ctx, key)` in
   [`lambdas/db/src/schema/authorization.ts`](../../lambdas/db/src/schema/authorization.ts)
   return true iff `key` is in the token's claim — **no per-request Stripe call**.
3. **Force-expiry of stale tokens.** A per-user
   `app_internal.users.entitlements_updated_at` marker is bumped by the Stripe webhook
   on any tier/entitlement change ([`lambdas/stripe-webhook/src/index.ts`](../../lambdas/stripe-webhook/src/index.ts)).
   When a gate finds the token's `iat` older than that marker, it throws a GraphQL
   error with `extensions.code = "ENTITLEMENTS_STALE"` (distinct from
   `UNAUTHENTICATED`). The web/app Apollo error link intercepts it, calls the
   oauth-proxy `RefreshJwt` endpoint to re-mint a token with fresh entitlements + a
   new `iat`, and retries the operation once; the proactive `subscription_updated`
   notification triggers the same silent refresh so most changes propagate before any
   request is rejected. If refresh/retry still fails, the client treats the user as
   free (fail-safe) and prompts re-login.
4. **Admin + sensitive ops validate fresh from Stripe.** Admin callers are
   all-entitled for reads (admin _authority_ for admin-only actions is re-checked
   fresh via `requireAdmin`). Any irreversible or financial/commissioner operation
   tied to a paid capability bypasses the token entirely and reads live Stripe via
   `requireFreshEntitlement` ([`lambdas/db/src/schema/fresh-entitlements.ts`](../../lambdas/db/src/schema/fresh-entitlements.ts)),
   so a change that has not yet propagated into a refreshed token cannot be exploited
   inside the refresh window. The concrete gated mutations are enumerated in
   [Fresh-validation call sites](#fresh-validation-call-sites-sensitive-ops).
5. **`subscription_tier` is a coarse billing-state cache** (Stripe webhook →
   `users.subscription_tier`), **not** the entitlement source of truth. It still
   governs the free-tier league limit (3) and downgrade side-effects; the local
   grace period (`STRIPE_GRACE_PERIOD_DAYS`, default 7) governs `subscription_tier` +
   downgrade timing only. Entitlements themselves follow Stripe's live
   `activeEntitlements` as-is (no local entitlement grace override).

The `ENTITLEMENTS` catalog and every gate call site remain in code (1:1 with Stripe
Feature `lookup_key`s). There is **no local `user_entitlements` cache/projection
table** — that approach was explicitly rejected in LS-8638 as a drift risk;
entitlements live in the JWT and are re-minted from Stripe.

## Feature → tier matrix

Legend for **Enforcement**: 🔒 server-enforced (resolver gate) · 🖥️ UI-gated only (no server resolver yet — see notes) · ➖ limit-based. Sensitive league-configuration writes marked 🔒 validate **fresh from Stripe** (`requireFreshEntitlement`), not the token claim — see [Fresh-validation call sites](#fresh-validation-call-sites-sensitive-ops).

### Premium features

| Feature                                                                                     | Tier    | Entitlement key                | Enforcement | Backend resolver                                                                                                                                        | Frontend gate                                                        |
| ------------------------------------------------------------------------------------------- | ------- | ------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Salary cap leagues                                                                          | Premium | `salary_cap_leagues`           | 🔒          | `leagues/mutations.ts`                                                                                                                                  | league create/settings                                               |
| Advanced playoff formats (6/8-team)                                                         | Premium | `advanced_playoff_formats`     | 🔒          | `leagues/mutations.ts`                                                                                                                                  | `LeagueSettingsControl`                                              |
| Unlimited active leagues                                                                    | Premium | `unlimited_leagues`            | 🔒 ➖       | `leagues/mutations.ts` (cap)                                                                                                                            | league create                                                        |
| Unlimited mock drafts                                                                       | Premium | `unlimited_mock_drafts`        | 🔒 ➖       | `drafts/queries.ts`, `initialize-mock-draft.ts`                                                                                                         | `MockDraftPage`                                                      |
| FAAB waivers                                                                                | Premium | `faab_waiver_type`             | 🔒          | `leagues/mutations.ts`                                                                                                                                  | league create, Commish                                               |
| Historical era filters                                                                      | Premium | `historical_era_filters`       | 🔒          | `leagues/mutations.ts`                                                                                                                                  | `DraftSettingsControl`                                               |
| Advanced scheduling (custom in-division vs out-of-division game ratio, Divisional strategy) | Premium | `advanced_scheduling`          | 🔒          | `leagues/mutations.ts`                                                                                                                                  | `LeagueCreatePage` (Roster & Schedule section)                       |
| Auction draft mode                                                                          | Premium | `auction_draft`                | 🔒          | `leagues/mutations.ts`                                                                                                                                  | league create                                                        |
| Draft slot trading (pre-draft slot swaps)                                                   | Premium | `draft_slot_trading`           | 🔒          | `leagues/mutations.ts`                                                                                                                                  | league create (Draft Settings)                                       |
| Custom roster positions (Superflex, K/P) (football)                                         | Premium | `custom_roster_positions`      | 🔒          | `leagues/mutations.ts` (`createLeagueAndTeams` hard gate via `requireFreshEntitlement`, LS-9107)                                                        | _none yet — sibling tickets LS-9109 (web) / LS-9110 (app)_           |
| Extended trade expiration                                                                   | Premium | `extended_trade_expiration`    | 🔒          | `trades/mutations.ts`                                                                                                                                   | TradingCenter                                                        |
| AI matchup recaps                                                                           | Premium | `ai_matchup_recap`             | 🔒          | `matchups/types.ts` (`recap` field)                                                                                                                     | MatchupDetail recap panel                                            |
| Draft recommendations                                                                       | Premium | `draft_recommendations`        | 🔒          | `drafts/queries.ts` (`getDraftRecommendations`)                                                                                                         | `DraftSidebar`                                                       |
| Player comparison                                                                           | Premium | `player_comparison`            | 🖥️          | _none yet — `comparePlayers` resolver not built_                                                                                                        | `PlayerComparisonPage`                                               |
| Matchup projections & win probability                                                       | Premium | `matchup_projections`          | 🖥️          | _none — computed client-side in `MatchupWinProbabilityPanel`_                                                                                           | MatchupDetail win-prob panel                                         |
| Trade analyzer                                                                              | Premium | `trade_analyzer`               | 🖥️          | _none yet — analyzer is a “coming soon” teaser_                                                                                                         | `TradeCenterPage`                                                    |
| Fantasy scoring projections (football)                                                      | Premium | `football_projections`         | 🖥️          | _none yet — `ProjectionsTeaser` is an upsell teaser_                                                                                                    | `FootballPlayerDetailPage`                                           |
| Custom scoring multipliers (position-scoped, e.g. TE-premium PPR, IDP point values)         | Premium | `custom_scoring_multipliers`   | 🔒          | `scoring.ts` (`updateLeagueScoringPositionBonuses` hard gate via `requireFreshEntitlement`, LS-9104)                                                    | _none yet — sibling tickets (web/mobile UI gating)_                  |
| Advanced search filters (projected pts, ADP rank) + team-filter bye/SoS badges              | Premium | `advanced_search_filters`      | 🔒 🖥️       | `football.ts` (`footballPlayers` premium filter args, `footballPlayerLeagueAvailability`); badge metadata (`nflTeamSeasonMetadata`) is not server-gated | `FootballPlayersPage` filters, `FootballTeamFilter` badges (LS-8045) |
| Advanced pitching analytics (FIP, WHIP, K/9, BB/9)                                          | Premium | `advanced_pitching_stats`      | 🖥️          | _none — column display is client-side; `playerSeasonPitching` already gated by `player_comparison`_                                                     | `PlayerDetailModal` pitching tab                                     |
| Advanced defensive sabermetrics (DRS, UZR, OAA)                                             | Premium | `defensive_sabermetrics`       | 🔒 🖥️       | `statistics.ts` (`playerSeasonFielding` — nulls non-premium)                                                                                            | `PlayerDetailModal` Fielding tab                                     |
| Advanced batting sabermetrics (OPS, OPS+, BABIP)                                            | Premium | `advanced_batting_stats`       | 🔒 🖥️       | `statistics.ts` (`playerSeasonBatting` — nulls `onbasePlusSluggingPlus` for non-premium)                                                                | `PlayerDetailModal` career batting card                              |
| Larger page sizes (250/500 rows) in Player Stats                                            | Premium | `large_player_stats_page_size` | 🔒 🖥️       | `statistics.ts` (`careerBattingStats` — caps `first` at 100 for non-premium)                                                                            | `PlayerStatsPage` rows-per-page select                               |
| Premium league history analytics (championship leaderboard, manager awards)                 | Premium | `league_history_analytics`     | 🖥️          | _none — computed client-side from `getLeagueHistory` data_                                                                                              | League History tabs (v1 & v2)                                        |
| Team logo upload (S3 direct upload)                                                         | Premium | `logo_upload`                  | 🖥️          | _UI-gated only — image-upload Lambda validates ownership; no resolver gate needed_                                                                      | Team tab `PremiumGate` upload button (LS-5946)                       |

### Free features (explicit decisions)

| Feature                                        | Tier     | Notes                                                                                                                                                                                                                                                       |
| ---------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Live draft board**                           | **Free** | Fundamental to the product — drafting is core, not a premium add-on. Premium gate removed 2026-06-13. Draft _recommendations_ shown inside the board remain premium (`draft_recommendations`).                                                              |
| Join up to 3 leagues                           | Free     | 4th+ active league requires `unlimited_leagues`.                                                                                                                                                                                                            |
| Up to 2 mock drafts/week                       | Free     | Beyond that requires `unlimited_mock_drafts`.                                                                                                                                                                                                               |
| Career & season stats                          | Free     | Authenticated, all tiers (deliberate — see `football.ts` `careerStats` note, LS-6248).                                                                                                                                                                      |
| Assistant manager invites (team collaboration) | Free     | Unlimited assistant-manager invites per team, no cap or entitlement — collaboration/delegation features (assistant manager, and any future co-commissioner role) are explicit non-premium decisions, not a marketed Stripe entitlement (LS-6030 / BTD-007). |

## Fresh-validation call sites (sensitive ops)

Per the epic's fresh-validation rule, irreversible / financial / commissioner
operations tied to a paid capability read **live Stripe** (`requireFreshEntitlement`)
rather than trusting the token claim. The current call sites, all in
[`lambdas/db/src/schema/leagues/mutations.ts`](../../lambdas/db/src/schema/leagues/mutations.ts):

| Mutation                        | Fresh-validated entitlement(s)                                                                                                        | Trigger                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createLeagueAndTeams` (create) | `faab_waiver_type`, `salary_cap_leagues`, `auction_draft`, `advanced_scheduling`, `historical_era_filters`, `custom_roster_positions` | Creating a league with FAAB waivers, salary cap, auction draft, custom in-division ratio, a non-free era, a Hall-of-Fame-only pool, or a Superflex/K-P roster slot |
| `updateLeagueSettings`          | `advanced_playoff_formats`, `salary_cap_leagues`, `faab_waiver_type`                                                                  | Switching to a 6/8-team playoff format, enabling/editing salary-cap fields, or switching to FAAB waivers / setting a FAAB budget                                   |
| `renewLeague`                   | `faab_waiver_type`, `salary_cap_leagues`, `historical_era_filters`, `advanced_playoff_formats`, `auction_draft`                       | Carrying forward any of these premium settings when retiring a league into a new season (a downgraded owner must re-qualify)                                       |

The free-tier **league cap** (3 active non-mock leagues) gates on `unlimited_leagues`
via the **fast path** (`hasEntitlement`) in `createLeague`, `createLeagueAndTeams`,
`renewLeague`, and the join guards (`joinLeagueByCode` / `joinPublicLeague`) — it is a
soft product limit, not an irreversible paid-feature write, so it does not use the
fresh-from-Stripe path.

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

| Feature                                                | Intended key     | Reference                                                                                                                                                           |
| ------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optimal Lineup (auto-set your best lineup before lock) | `optimal_lineup` | LS-5959. Entitlement key + UI placeholder added; full implementation (resolver + optimizer) tracked separately. Enforcement: 🖥️ UI-gated only until resolver ships. |

## Change log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-10 | Added `custom_roster_positions` (LS-9107, foundation ticket for LS-6151's other 3 children). Gates Superflex (`SFLEX`) and the new combined kicker/punter (`KP`) roster slots in `createLeagueAndTeams` via `requireFreshEntitlement`, following the `salary_cap_leagues` hard-reject pattern — a non-entitled account submitting either slot is rejected outright. Added the `KP` value to the `position_slot` DB enum (accepted-but-inert like `SFLEX` today — no player eligibility/queries/stats yet). `updateRosterPositions` (post-creation slot edits) is not yet gated — tracked as a follow-up (LS-9277). Web/mobile UI gating are sibling tickets (LS-9109/LS-9110).                                                                                                                                                                                                                                                                                                                                        |
| 2026-08-09 | Wired `custom_scoring_multipliers` resolver + GraphQL gating (LS-9104, third child of LS-6158, depends on LS-9102 + LS-9103). Added `ScoringConfig.positionBonuses` and the `updateLeagueScoringPositionBonuses` mutation (`scoring.ts`), hard-gated behind `requireFreshEntitlement` the same way `advanced_scheduling` gates `updateLeagueSettings` — a free-tier commissioner is rejected outright, not just on specific field values. `applyScoring`/`computeScoring` (and the football fantasy-points path: `computeFootballOffenseFantasyPoints`/`computeFootballIdpFantasyPoints`/`getFootballScoringSettingsForLeague`) now take an optional position-scoped bonus, applied additively on top of the base multiplier, so a configured bonus actually changes computed matchup fantasy points/standings, not just stored configuration. `updateLeagueScoringPositionBonuses` triggers `refreshPlayerScoringCache` on change (LS-696 precedent). Web/mobile UI gating remain sibling tickets (LS-9105/LS-9106). |
| 2026-08-07 | Added `custom_scoring_multipliers` (LS-9102, inherited from LS-6158). New Stripe-backed entitlement key to gate position-scoped scoring customization (TE-premium PPR, IDP point values) for premium football leagues. Catalog-only in this ticket — no resolver or UI gates yet; the key is unused until LS-6158 child 3 lands. `seed-stripe` run against the sandbox key; the Feature was created and auto-attached to the single premium product (there is only one paid product today, so every catalog key attaches automatically — the old `TIER_ENTITLEMENTS.premium` array this ticket's AC referenced no longer exists post-LS-8643, and no equivalent manual attach step exists either).                                                                                                                                                                                                                                                                                                                    |
| 2026-07-26 | Added `draft_slot_trading` (LS-8675, child 1 of LS-8387). Premium commissioners can enable pre-draft slot trading at league creation; server-enforced in `createLeagueAndTeams` (entitlement gate + auction-league rejection — auction drafts have no slots to trade). The trade lifecycle (propose/respond/approve/execute) ships in the LS-8387 follow-up children. Stripe: re-run `seed-stripe` to provision the new Feature and attach it to the premium plan (tier policy is Stripe-side per LS-8643).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-07-26 | **Rewrote the enforcement framing to the JWT-carried, Stripe-driven model (LS-8646, epic [LS-8638](https://legacy-sports.atlassian.net/browse/LS-8638)).** Docs-only, no feature moved tiers. Stripe (via the live entitlements minted into the JWT), not this file, is now the runtime source of truth for access. Documented mint-at-login/refresh, non-admin token-claim enforcement, `ENTITLEMENTS_STALE` force-expiry + silent client refresh, fresh-from-Stripe validation for sensitive league-config mutations, and `subscription_tier` as a coarse billing-state cache. Dropped all `TIER_ENTITLEMENTS`-as-policy language (the array was deleted by LS-8643) and clarified there is no local entitlements cache table (rejected as a drift risk).                                                                                                                                                                                                                                                           |
| 2026-07-22 | **Removed all injury-related tiering (LS-8604 / LS-8610).** Product decision: Legacy Sports is a historical-data platform — players cannot get injured — so every injury feature is being removed. Dropped the "Football injury status badge" Free row, the planned "Expert injury analysis" (`expert_injury_analysis`) row (never in `ENTITLEMENTS` or Stripe, so no billing cleanup), and "injury status" from the `advanced_search_filters` scope (the resolver-side filter arg is removed by the LS-8604 code tickets). Marketing copy touting "no injuries" is intentionally kept — it supports the historical-only positioning.                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-07-22 | Recorded assistant-manager invites (team collaboration) as an explicit Free decision (LS-6030 / BTD-007). QA flagged the feature's flat parity as a possible missed upsell opportunity; product decision is that collaboration/delegation features are not premium — no entitlement key exists or is planned for this.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-07-07 | Added `advanced_scheduling` (LS-6106 / CLB-014). Marketing already positioned "advanced scheduling" as a Premium capability but no control existed — the create-league UI showed 3 fixed strategies regardless of tier. Premium users creating a Divisional-strategy league can now set a custom in-division vs out-of-division game ratio; free users are unaffected and the default 100% in-division split (existing behavior) is unchanged when unset.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-07-02 | **Completed the LS-6475 code removal of `advanced_football_stats`.** The 2026-06-14 decision (below) was recorded here but never landed in code: the key stayed in `ENTITLEMENTS`/`TIER_ENTITLEMENTS`/`ENTITLEMENT_LABELS` and kept being provisioned to Stripe by `seed-stripe`. Meanwhile LS-8045 (2026-06-28) shipped bye-week/SoS team-filter badges keyed on it. Today: key deleted everywhere; the LS-8045 badges re-keyed to `advanced_search_filters` (also added to the matrix above — it was missing), which already gates the other premium search surfaces on the same page. No user-visible change (both keys were premium-only). Owner cleanup: live Stripe accounts may still hold the orphaned `advanced_football_stats` Feature — `seed-stripe` never deletes; detach/archive it in the Stripe dashboard. If product wants to market bye/SoS badges as a distinct feature, mint a dedicated key via [add-entitlement](../../.agents/skills/add-entitlement/SKILL.md).                                |
| 2026-06-14 | Dropped the `advanced_football_stats` premium feature (LS-6475 / FPL-028). The promised stats (snap %, target share, air yards, EPA, red-zone touches) exist in no schema, resolver, GraphQL, UI, or data source — Pro Football Reference does not publish them. Rather than bill for an undeliverable feature, the entitlement was removed. Re-add the key + gate if these stats are ever sourced (e.g. an nflverse / Next Gen Stats ingestion pipeline).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-06-13 | Initial source-of-truth. Live draft board moved to Free. Added entitlement keys `player_comparison`, `matchup_projections`, `ai_matchup_recap`, `draft_recommendations`, `trade_analyzer`, `football_projections`; server-enforced `ai_matchup_recap` and `draft_recommendations`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
