---
name: add-entitlement
description: 'How premium feature gating works and how to add or gate a feature behind a Stripe entitlement end-to-end. Load when: adding a new premium feature, gating an existing feature, editing lib/utils/src/lib/entitlements.ts, adding a subscription tier, or touching requireEntitlement/hasEntitlement/PremiumGate/useHasEntitlement.'
---

# Skill: Add / Gate a Premium Entitlement

Covers how premium features are gated in this codebase and the exact end-to-end steps to add a new entitlement or put an existing feature behind one. Load this before editing `lib/utils/src/lib/entitlements.ts` or adding any `requireEntitlement` / `PremiumGate` call.

## First, the mental model — what the map is (and is NOT)

The `ENTITLEMENTS` map in [`lib/utils/src/lib/entitlements.ts`](../../../lib/utils/src/lib/entitlements.ts) is the **single source of truth for the feature catalog and tier policy**. It is **not** a cache, mirror, or read-model of Stripe's entitlements — Stripe is provisioned _from_ this map, not the other way around.

Split the responsibilities cleanly:

| Concern                                            | Owner      | Where                                                                  |
| -------------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| What premium features exist + their labels         | **Code**   | `ENTITLEMENTS`, `ENTITLEMENT_LABELS`                                   |
| Which tier unlocks which features (product policy) | **Code**   | `TIER_ENTITLEMENTS`                                                    |
| Whether _this user_ is premium right now           | **Stripe** | subscription status → webhook → `app_internal.users.subscription_tier` |
| Billing, prices, checkout, subscription lifecycle  | **Stripe** | `seedStripe.ts` prices + Stripe dashboard                              |

Two consequences that resolve the usual confusion:

1. **The runtime never calls Stripe's entitlements API per request.** A resolver reads the cached `subscription_tier` column (set by the `stripe-webhook` lambda) and consults the in-memory `TIER_ENTITLEMENTS` map. The map _is_ the gating logic.
2. **The `lookup_key` is the contract.** Each `ENTITLEMENTS` string value is the `lookup_key` of a Stripe **Feature**. The [`seed-stripe` CLI command](../../../apps/cli/src/commands/seedStripe.ts) derives Stripe Features directly from `Object.values(ENTITLEMENTS)`, so code and Stripe cannot drift — but only if you re-seed after editing the map (Step 4 below).

So: gate by **capability**, not tier. Call `requireEntitlement(ctx, ENTITLEMENTS.salary_cap_leagues)`, not `requirePremium(ctx)` — a future mid-tier plan that grants only a subset then still produces correct gating and error copy with zero changes at the call site.

## Critical preconditions

- **Before editing `entitlements.ts`, confirm the product policy.** The authoritative free-vs-premium decision is human-owned in [`docs/product/subscription-tiers.md`](../../../docs/product/subscription-tiers.md). Add or confirm the feature's row there first; code conforms to that doc, not the reverse.
- **`entitlements.ts` and `authorization.ts` are CODEOWNERS-gated.** PRs touching `lib/utils/src/lib/entitlements.ts` or `lambdas/db/src/schema/authorization*.ts` require code-owner (`@bkrupa`) approval — bot approval is insufficient and the merge queue will 405 without it. Expect that review round; keep the diff surgical.
- **`TIER_ENTITLEMENTS.premium` is a silent footgun.** `ENTITLEMENT_LABELS` is a `Record<EntitlementKey, …>`, so omitting a label is a **compile error** that protects you. But `TIER_ENTITLEMENTS.premium` is a plain array — forgetting to add your new key there produces **no type error** and silently leaves the feature on the free tier. Always verify the key is in the `premium` array.

## Workflow — adding a new entitlement end-to-end

Transcribe these into TaskCreate entries at the start of the work; each gates the next.

1. **Policy.** Add/confirm the feature's tier in [`docs/product/subscription-tiers.md`](../../../docs/product/subscription-tiers.md), with the enforcement marker (🔒 server-enforced / 🖥️ UI-gated only / ➖ limit-based).
2. **Define the entitlement** in [`lib/utils/src/lib/entitlements.ts`](../../../lib/utils/src/lib/entitlements.ts) — three edits:
   - Add `my_feature: 'my_feature'` to `ENTITLEMENTS`.
   - Add `my_feature: 'Human Readable Label'` to `ENTITLEMENT_LABELS` (typecheck forces this).
   - Add `ENTITLEMENTS.my_feature` to the `TIER_ENTITLEMENTS.premium` array (the silent-footgun step).
   - The `EntitlementKey` type is derived via `as const` + `typeof` — no manual type edit.
3. **Barrels** — `entitlements` is already re-exported from all three `lib/utils` barrels (`src/index.ts`, `src/mobile.ts`, `src/index.native.ts`), so an added _key_ needs no barrel change. (Only relevant if you ever add a _new file_ to `lib/utils` — then it must be exported from all three or it's `undefined` on Hermes / in RN Jest.)
4. **Provision Stripe.** Re-run the seed so a Stripe Feature with the new `lookup_key` is created and attached to the product: `STRIPE_SECRET_KEY=sk_test_… ls-cli seed-stripe` (idempotent; refuses live-mode keys). A _new tier_ (not just a feature) also needs a new `PriceSpec` in `seedStripe.ts` + the tier added to `TIER_ENTITLEMENTS` and the `SubscriptionTier` union. Live-mode provisioning is a deliberate human step — flag it, don't autorun it.
5. **Gate the backend** in the resolver (`lambdas/db/src/schema/**`). Import `ENTITLEMENTS` from `@legacy-sports/utils` and use the right tool:
   - **Hard gate** (feature is all-or-nothing) — `await requireEntitlement(context, ENTITLEMENTS.my_feature)`. Throws `PremiumRequiredError` with a label-derived message. Example: [`drafts/queries.ts:691`](../../../lambdas/db/src/schema/drafts/queries.ts), [`leagues/mutations.ts:1787`](../../../lambdas/db/src/schema/leagues/mutations.ts).
   - **Graceful degrade / limits** — `if (!(await hasEntitlement(context, ENTITLEMENTS.my_feature))) { … }` to branch (return a teaser, enforce a count limit) instead of throwing. Example: [`matchups/types.ts:156`](../../../lambdas/db/src/schema/matchups/types.ts) (AI recap), `leagues/mutations.ts` (league-count limit).
   - Server enforcement is the real gate — anything that returns premium _data_ must be gated here, not only in the UI.
6. **Gate the UI.** Prefer [`useHasEntitlement(ENTITLEMENTS.my_feature)`](../../../apps/web/src/hooks/useIsPremium.ts) over `useIsPremium()` so the gate names the capability. Wrap premium content in [`PremiumGate`](../../../lib/shared-components/src/components/PremiumGate.tsx) (`isPremium` + `featureName` + `onUpgrade`). Note: `PremiumGate.featureName` is a free-text display string, _not_ an `EntitlementKey` — keep it consistent with `ENTITLEMENT_LABELS` by hand.
7. **Test the boundary.** Add a resolver spec asserting the free tier is rejected and premium/admin passes (admins short-circuit to premium unless `impersonatedTier === 'free'`). Add or extend an e2e in `apps/web-e2e/src/tests/premium-gating.spec.ts` for the UI gate. Premium status in e2e is sourced from the `GetUserById.subscriptionTier` mock, not the JWT.
8. **Validate & ship.** `make pc`, self-review, then the normal PR flow. Call out the CODEOWNERS approval requirement in the PR description.

## Gating an _existing_ feature (no new key)

Skip Steps 2–4 — reuse the existing `ENTITLEMENTS` key — and do Steps 5–8. Check [`docs/architecture/premium-gating-inventory.md`](../../../docs/architecture/premium-gating-inventory.md) first: several features (player comparison, matchup projections, trade analyzer, football projections) already have keys + Stripe Features but are **UI-gated only**. "Gating" them properly usually means _adding the missing server-side `requireEntitlement` call_, not inventing a new key.

## Related skills & docs

- [standards](../standards/SKILL.md) — coding standards for the resolver/UI edits.
- [database](../database/SKILL.md) — the `subscription_tier` column is denormalized onto `app_internal.users` by the `stripe-webhook` lambda; no migration is needed to add an entitlement.
- `docs/product/subscription-tiers.md` — authoritative tier policy (read first).
- `docs/architecture/premium-gating-inventory.md` — enforcement-coverage gap inventory (what's gated where).
- `docs/architecture/injury-analysis-tiers.md` — worked example of tiering a green-field feature.
