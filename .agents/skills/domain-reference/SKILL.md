---
name: domain-reference
description: 'Product and data-model ground truth for Legacy Sports — what the product actually is, the users→leagues→matchups→scoring entity chain, the lifecycle invariants agents most often get wrong, and domain rules that exist only in code. Load when: starting work without product context, reasoning about leagues/drafts/matchups/seasons/scoring, writing queries against the fantasy schema, debugging game selection or week advancement, or deciding whether a schema doc can be trusted.'
metadata:
  scope: '**'
---

# Skill: Domain Reference

What Legacy Sports is and where the real data model lives. `README.md` calls this "a sports data management platform" — that description omits everything that matters. This skill is the reference; it contains no how-to steps (see [When NOT to use this skill](#when-not-to-use-this-skill)).

## The product in one paragraph

Legacy Sports is a **freemium fantasy-sports product played entirely with historical (archived) stats** — users draft real _historical_ players, not current-season ones. Baseball players are keyed by `brefId` (Baseball Reference); football players by `pfrId` (Pro Football Reference) — see `players` in [`lib/db-client/src/drizzle/public/models/Players.ts`](../../../lib/db-client/src/drizzle/public/models/Players.ts). For each league week, every rostered player is assigned a **random real season** from their career (`league_week_player_seasons`, unique on `(league_id, week_number, player_id)`; assignment logic `selectSeasonsForPlayers` in [`lib/db-client/src/lib/matchup-utils.ts`](../../../lib/db-client/src/lib/matchup-utils.ts) — a uniform random pick over seasons meeting the league's `min_games_per_season`). A **nightly EventBridge job** (`autoSelectGames`, daily 00:00 EST, [`terraform/main/eventbridge.tf`](../../../terraform/main/eventbridge.tf)) then picks a **random real game** from that assigned season for each player (`cryptoRandomInt` game picks in [`lambdas/game-selection/src/services/season-game-selector.ts`](../../../lambdas/game-selection/src/services/season-game-selector.ts)). Team scores are a pure `sum(multiplier × stat)` (`computeScoring` in [`lib/scoring/src/ComputeScoring.ts`](../../../lib/scoring/src/ComputeScoring.ts)) against **versioned per-league scoring profiles** (`league_scoring_profiles` — exactly one `is_default` per league, enforced by unique index — plus `league_scoring_profile_entries`; [`lib/db-client/src/drizzle/public/models/Scoring.ts`](../../../lib/db-client/src/drizzle/public/models/Scoring.ts)). **Per-game scores are never persisted** — only `matchups.team1_score` / `team2_score` totals are stored, and history is recomputed on demand ([`docs/architecture/matchup-system.md`](../../../docs/architecture/matchup-system.md), "Per-game scores are **not** persisted"). Weekly head-to-head matchups advance through playoffs to a champion. Monetization is a free/premium tier axis (see [Entitlements](#entitlement-pipeline-direction-not-how-to)).

## Where the data-model ground truth lives

Before trusting any prose doc about the schema, check these — they are generated from / define the live system:

| Topic                              | Ground truth                                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Table shapes, columns, constraints | Drizzle models in `lib/db-client/src/drizzle/public/models/` (fantasy data) and `lib/db-client/src/drizzle/internal/` (`app_internal` schema: users, auth) |
| Postgres enums                     | [`lib/db-client/src/drizzle/public/models/Enums.ts`](../../../lib/db-client/src/drizzle/public/models/Enums.ts)                                            |
| GraphQL API surface                | [`lambdas/db/schema.graphql`](../../../lambdas/db/schema.graphql) (Pothos-built snapshot)                                                                  |
| Migration history                  | `lib/db-client/migrations/` (filename-ordered — see [landmines](#migration-order-landmines))                                                               |

Two Postgres schemas exist: `public` (fantasy/stat data) and `app_internal` (users, auth). `public.users` is a **view** over `app_internal.users` (`pgView` in [`lib/db-client/src/drizzle/public/models/Users.ts`](../../../lib/db-client/src/drizzle/public/models/Users.ts)) — schema-qualify when querying users directly.

## Matchup status: two orthogonal axes

The single most-misread fact in the domain. Per [`docs/architecture/league-state-machine.md`](../../../docs/architecture/league-state-machine.md) §2, each matchup has **two independent status fields**:

| Axis                         | Values                                                                       | Meaning                                                                                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `matchup.status`             | `scheduled` → `in_progress` → `completed` (`cancelled` = admin-only escape)  | Lifecycle of the matchup itself. Lineups are editable **only** while `scheduled`; locked when the week activates — deliberately, so managers cannot react to real historical game outcomes |
| `matchup.statsLoadingStatus` | `not_started` \| `queued` \| `loading` \| `completed` \| `failed` \| `retry` | The per-game selection/scoring sub-state; only meaningful while `in_progress`. Cycles once per game, up to `gamesPerMatchup` times                                                         |

Do not conflate them: a matchup can be `in_progress` with `statsLoadingStatus = 'failed'` (retryable), and `completed` matchups keep whatever terminal loading status they last had.

## The five lifecycle invariants

Quoted verbatim from [`league-state-machine.md` → "Critical invariants"](../../../docs/architecture/league-state-machine.md#critical-invariants) (that doc is the home; these are reproduced here because agents most often violate exactly these):

> 1. **All weeks pre-created at draft completion.** Weeks are never created on demand; the `autoAdvanceMatchups` repair logic relies on this assumption.
> 2. **Lineup lock is at week start, not matchup creation.** Matchups are `scheduled` (lineup editable) until the first `autoSelectGames` of their week promotes them to `in_progress`.
> 3. **`currentWeek` is the source of truth for "what week is it?"** — never derive it from matchup rows.
> 4. **`weekAdvanceStatus` guards concurrency.** A league with status `queued` or `processing` is skipped by subsequent EventBridge firings until it returns to `idle`.
> 5. **Null pointers mean "no active week."** When `currentWeek` is `null`, the league is between seasons (all matchups `completed` or no draft yet). `autoAdvanceMatchups` simply skips these — there is no implicit repair path.

For the full state machines (league lifecycle, week progression, playoff bracket, game-selection sequence, EventBridge schedule table) read `league-state-machine.md` itself.

## Entitlement pipeline direction (not how-to)

The direction of truth trips people up, so it is stated once here; the end-to-end how-to is [add-entitlement](../add-entitlement/SKILL.md) and the human-owned tier policy is [`docs/product/subscription-tiers.md`](../../../docs/product/subscription-tiers.md).

- **Code → Stripe, never the reverse.** `ENTITLEMENTS` in [`lib/utils/src/lib/entitlements.ts`](../../../lib/utils/src/lib/entitlements.ts) is the feature catalog; the `seed-stripe` CLI (`apps/cli/src/commands/seedStripe.ts`) provisions Stripe Features _from_ it.
- **Runtime tier comes from the DB column, never Stripe per-request.** Gates read the cached `app_internal.users.subscription_tier` (kept current by subscription webhooks) via `requireEntitlement` / `hasEntitlement` in [`lambdas/db/src/schema/authorization.ts`](../../../lambdas/db/src/schema/authorization.ts). Admins are treated as premium unless `context.impersonatedTier === 'free'`.
- **PremiumGate UI overlays are not a security boundary** — server-side `requireEntitlement` is the enforcement.
- As of **2026-07-02**, the undeliverable `advanced_football_stats` entitlement (LS-6475 — PFR does not publish the promised data) is deleted from `ENTITLEMENTS`; `subscription-tiers.md` and `premium-gating-inventory.md` describe that removal. If you find the key in `entitlements.ts`, code and docs have re-diverged — re-check before relying on either.

## Migration-order landmines

Migrations live in `lib/db-client/migrations/` and run in filename order. Two standing traps:

1. **`20250206_000000_remove_notification_system.ts` is mis-dated** (2025 instead of 2026): it sorts _before_ the initial schema `20251108_000000_initial_schema.ts` even though it drops tables created by `20251108_030000_add_notification_system.ts`. When reasoning about migration order, mentally treat it as `20260206`. The filename must stay — the applied-migrations ledger keys on it.
2. **The duplicate football migrations are permanent shims — do not dedupe.** The May-2026 football rollout left near-duplicates by design (idempotent prereq/preflight shims, not mistakes): two `*_add_defensive_format_to_leagues` (`20260524_000000`, `20260524_100000`) plus `20260524_100000_add_leagues_defensive_format.ts`, two `*_add_football_columns_to_players` (`_000100`, `_100100`), two `*_create_career_football_tables` (`_000000`, `_100400`), and three `*_drop_career_football_defense_idp*` variants (`_100245`, `_100250`, `_100260`). Consolidating or renumbering them breaks the applied ledger — express any schema change as a **new forward migration** instead.

House pattern for schema-drift recovery: `20260526_100000_rescue_leagues_baseball_column_renames.ts` — a fully idempotent migration whose header enumerates every possible DB state and reconciles each (written after LS-4870, where a column rename reached Lambda code before the DB). Model drift-rescue migrations on it.

## References

| Load when                                                                                                                         | File                                                           |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| You need the table/model map — which Drizzle model owns which table, plus the sport-discriminator invariants                      | [references/entity-chain.md](references/entity-chain.md)       |
| Scoring or draft output looks "random" or wrong (SP starts, position eligibility, football auto-pick, AI recap, free-tier limits) | [references/code-only-rules.md](references/code-only-rules.md) |
| You are about to trust an architecture doc — check it here first                                                                  | [references/stale-docs.md](references/stale-docs.md)           |

## When NOT to use this skill

- **Adding or gating a premium feature** → [add-entitlement](../add-entitlement/SKILL.md) (end-to-end how-to; this skill only states the pipeline direction).
- **Schema changes, migrations, running SQL, DB connectivity** → [database](../database/SKILL.md).
- **Full lifecycle/state-machine detail** → [`docs/architecture/league-state-machine.md`](../../../docs/architecture/league-state-machine.md) (home of the invariants quoted above).
- **Code layout / which project owns what** → [architecture](../architecture/SKILL.md).

## Provenance and maintenance

Created 2026-07-02 from the Phase-1 skills audit (domain-model area; see `scratch/skills-audit/` while the audit branch lives). Every claim above was verified against code on that date. Volatile facts and their one-line re-verification commands (run from repo root):

| Fact                          | Re-verify                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Five invariants quote         | `grep -n -A 12 "Critical invariants" docs/architecture/league-state-machine.md` |
| Random season assignment      | `grep -n "Math.random" lib/db-client/src/lib/matchup-utils.ts`                  |
| Migration landmine filenames  | `ls lib/db-client/migrations \| grep -E "20250206\|20260524"`                   |
| Per-game scores not persisted | `grep -n "not.*persisted" docs/architecture/matchup-system.md`                  |
