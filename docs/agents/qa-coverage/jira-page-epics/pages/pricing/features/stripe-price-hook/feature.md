# Feature: Dynamic Stripe Pricing

**Jira:** LS-5626
**Page:** `pricing` (Epic LS-5291)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

`useStripePrices()` loads the live monthly/annual price, currency, trial days and savings percentage from the `GetStripePrices` GraphQL query; hardcoded fallbacks render when the API fails, and a skeleton shows on a cold first load.

## Source

Extracted from: `docs/agents/pages/pricing.md`

## Implementation

`apps/web/src/hooks/useStripePrices.ts`, `apps/web/src/constants/pricing.ts` (`derivePricing`), consumed by `PricingPage.tsx` (`PriceSkeleton`). Native app has its own `apps/app/src/features/subscription/useStripePrices.ts` but the Android screen prices from Google Play IAP.

## Platform coverage

| Platform | Harness    | Spec / Flow                                                | Status  |
| -------- | ---------- | ---------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/pricing-stripe-price-hook.spec.ts` | pending |
| android  | Maestro    | `maestro/flows/pricing/subscription-plans.yaml`            | pending |

Web is `pending`: hook and derivation are thoroughly unit-tested, but **no E2E overrides the Stripe payload** — the page E2E only ever sees the default mock, so a hardcoded price would pass. **Android: prices come from Google Play IAP, not Stripe — scope decision needed** (tracked as GAP-002 / LS-7666); no concrete native assertion until decided.

## Test Coverage

### Existing — E2E (hermetic)

`pricing-page.spec.ts` asserts `4.99` / `3.33` and the Save-% consistency, but only against the default `getstripeprices` mock (499 / 3999) — it does not prove the values come from the response. `subscription.spec.ts` exercises `GetStripePrices` price IDs / null on the checkout flow (`/profile/subscription`), not `/pricing`.

### Existing — unit

- `apps/web/src/hooks/useStripePrices.spec.ts` — live prices; currency formatting (LS-7195); fallbacks on null / loading / error; stale-while-revalidate; cold-load loading=true; warn filtering; `skip`; annual monthly-equivalent
- `apps/web/src/constants/pricing.spec.ts` — `derivePricing` defaults, price points, zero prices, non-USD / JPY / invalid currency, savings clamp 0–100%
- `apps/web/src/pages/pricing/PricingPage.spec.tsx` — `Premium plan price loading state (LS-8813)`: live price, no fallback flash, hidden savings while loading, fallback on genuine failure

### Pending assertions (target: `pricing-stripe-price-hook.spec.ts`)

1. Live price from payload: override `getstripeprices` with `monthlyPriceCents: 799, annualTotalCents: 6999` → `plan-card-premium` shows 7.99 monthly and 5.83 per month annual, and the toggle badge shows the derived Save % (not 30%); the default 4.99/3.33 is absent.
2. Fallback on failure: respond to `GetStripePrices` with `{ data: { stripePrices: null } }` (pattern: `subscription.spec.ts` "returns null") → the card still renders the hardcoded fallback price and the page is usable (CTA present, no error banner).
3. Loading skeleton: hold the `GetStripePrices` response with a deferred `route.fulfill()` → `price-skeleton` is visible and the fallback price is not; releasing it swaps in the live price (journey-level counterpart of LS-8813).
4. Currency: payload with `currency: 'eur'` renders a € symbol, not `$`, in the Premium card price.

## Known findings (do not re-file)

LS-7194, LS-7195, LS-7196, LS-7199 (Done); LS-7197 PRC-004 (To Do), LS-7198 PRC-005 (To Do). Cross-platform divergence: LS-7666 GAP-002.

## Related

- **Epic:** LS-5291 — QA — Page: Pricing Page
- **Implementation ref:** `docs/agents/pages/pricing.md`
- **Open refactor (not coverage):** LS-10277 — shared `derivePricing` lib
