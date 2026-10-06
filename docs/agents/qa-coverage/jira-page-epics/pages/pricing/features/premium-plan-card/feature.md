# Feature: Premium Plan Card

**Jira:** LS-5625
**Page:** `pricing` (Epic LS-5291)
**Platforms:** web, mobile-web, android
**Entitlement:** mixed

_Premium and non-premium variants exist._

## Description

Premium plan card with dynamic Stripe price, "Most Popular" badge, the Premium feature list, and a viewer-dependent CTA: "Upgrade to Premium" (→ `/profile/subscription`) for signed-out and free users; "Manage subscription" (→ `/profile/subscription`) plus a "Current plan" label for Premium subscribers (LS-7193, LS-7199).

## Source

Extracted from: `docs/agents/pages/pricing.md`

## Implementation

`apps/web/src/pages/pricing/PricingPage.tsx` — `PlanCard data-testid="plan-card-premium"`, `PREMIUM_PLAN_FEATURES` (derived from `PREMIUM_FEATURES`), `premium-plan-current`, `premium-plan-manage`, `showUpgradeCta` / `showManageCta`. Android analogue: `AndroidSubscriptionScreen.tsx` (IAP plan cards with subscribe CTA).

## Platform coverage

| Platform | Harness    | Spec / Flow                                                | Status  |
| -------- | ---------- | ---------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/pricing-premium-plan-card.spec.ts` | pending |
| android  | Maestro    | `maestro/flows/pricing/subscription-plans.yaml`            | pending |

Web is `pending` (partial): CTA variants by tier and the badge are proven; CTA destinations, price copy and feature list are not. The android flow is shared with the Billing Toggle story (LS-5618) — one flow can satisfy both.

## Test Coverage

### Existing — E2E (hermetic)

File: `apps/web-e2e/src/tests/pricing-page.spec.ts` (`page load`)

- "shows Free and Premium plan cards" (Premium user: "PREMIUM", "Manage subscription", no Upgrade)
- "shows \"Upgrade to Premium\" on the Premium card for free users"
- "marks the Premium card as the current plan for premium users (LS-7199)"
- "shows \"Most Popular\" badge on premium plan"

### Existing — unit

File: `apps/web/src/pages/pricing/PricingPage.spec.tsx` — `Premium card CTA by viewer state (LS-7193)` (4 cases incl. tier-loading), the Premium-card "Current plan" cases (LS-7199), `Premium plan price loading state (LS-8813)`.

### Pending assertions (target: `pricing-premium-plan-card.spec.ts`)

1. Free user clicks "Upgrade to Premium" in `plan-card-premium` → URL is `/profile/subscription`.
2. Premium user clicks `premium-plan-manage` ("Manage subscription") → URL is `/profile/subscription`.
3. Price copy scoped to `plan-card-premium`: annual (default) shows the per-month figure (3.33) and "Billed annually ($39.99/yr)"; after switching to Monthly shows 4.99. Match digits only (LS-7191 in flight changes the annual per-month format).
4. Feature list: the card lists every `PREMIUM_PLAN_FEATURES` entry marked included (derive the expected set from `PREMIUM_FEATURES` in `@legacy-sports/shared-components/premium-features`; do not hardcode 11).

### Pending assertions (android, `maestro/flows/pricing/subscription-plans.yaml`)

5. On the subscription screen each plan card shows a price and a subscribe CTA (landing-anchor + screenshot; shared with LS-5618 assertion 6). IAP prices come from Google Play — see GAP-002 / LS-7666.

## Known findings (do not re-file)

LS-7190, LS-7193 (Done); LS-7191 PRC-016 (In Review); LS-7192 PRC-017 (To Do — trial not communicated on CTA).

## Related

- **Epic:** LS-5291 — QA — Page: Pricing Page
- **Implementation ref:** `docs/agents/pages/pricing.md`
