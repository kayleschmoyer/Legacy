# QA — Page: Pricing Page

**Jira:** LS-5291
**Page slug:** `pricing`
**Route:** `/pricing` (public — reachable unauthenticated; `/faq` redirects here)
**Implementation:** `apps/web/src/pages/pricing/PricingPage.tsx`
**Reference doc:** `docs/agents/pages/pricing.md`

The public subscription page where prospective and free-tier users compare Free vs. Premium, toggle monthly/annual billing, read the comparison table, testimonials and FAQ, and convert via a CTA. Prices come from Stripe via `useStripePrices()`.

## Coverage goal

A feature is covered only when a passing hermetic automated flow proves its user journey on every declared platform (see [`../../README.md`](../../README.md) and `.agents/skills/plan-ticket/references/qa-coverage-model.md`): Playwright in `apps/web-e2e/src/tests/` for web, Maestro in `maestro/flows/pricing/` for android.

## Platform notes (read before picking up a feature)

- **web / mobile-web** — the same Playwright spec runs at desktop and mobile viewports, so one spec proves both rows. Default hermetic user is **Premium**; use `useTier(page, 'free')` (`apps/web-e2e/src/fixtures/shared-mocks.ts`) for free users and `unauthTest` for signed-out visitors. Stripe prices default to `getstripeprices` = $4.99/mo, $39.99/yr, `trialPeriodDays: 0`; override per test the way `apps/web-e2e/src/tests/subscription.spec.ts` does. New specs must be registered in `apps/web-e2e/src/e2e-surface-map.json` (testing skill).
- **android** — the native app has **no `/pricing` screen**. Its only analogue is the IAP-backed `apps/app/src/features/subscription/AndroidSubscriptionScreen.tsx` (Google Play products, "Monthly Plan" / "Annual Plan"), not Stripe. There is no pricing Maestro flow today (`maestro/flows/` has none). Only the billing-toggle and premium-plan-card stories have a plausible native counterpart (target: `maestro/flows/pricing/subscription-plans.yaml`); every other story's android row is `pending` **with an open scope decision** — the sections it describes do not exist natively (recorded per feature). Cross-platform pricing divergence is already tracked as GAP-002 (LS-7666). Note the testing skill says Maestro is a visual/AI-judging sweep, not functional regression — keep any Maestro flow to landing-anchor + screenshot assertions.
- **Per-feature spec files** — each feature targets its own `apps/web-e2e/src/tests/pricing-<slug>.spec.ts` so parallel per-feature chips don't collide in one file. Existing assertions stay in `pricing-page.spec.ts`; do not move them.

## Existing test inventory

| Layer          | File                                              | Notes                                                                                     |
| -------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| E2E (hermetic) | `apps/web-e2e/src/tests/pricing-page.spec.ts`     | page load, cards, toggle, comparison, FAQ, unauth CTAs, `/faq` redirect                   |
| E2E (hermetic) | `apps/web-e2e/src/tests/faq-page.spec.ts`         | `/faq` → `/pricing` redirect and FAQ presence                                             |
| E2E (hermetic) | `apps/web-e2e/src/tests/subscription.spec.ts`     | `/profile/subscription` + checkout (destination of the CTAs), not the pricing page itself |
| Unit           | `apps/web/src/pages/pricing/PricingPage.spec.tsx` | per-finding unit cases (LS-7167…LS-8813)                                                  |
| Unit           | `apps/web/src/hooks/useStripePrices.spec.ts`      | live/fallback/loading/error                                                               |
| Unit           | `apps/web/src/constants/pricing.spec.ts`          | `derivePricing`                                                                           |

## Feature stories

| Story   | Feature                         | Slug                       | Entitlement |
| ------- | ------------------------------- | -------------------------- | ----------- |
| LS-5618 | Monthly / Annual Billing Toggle | `billing-toggle`           | all         |
| LS-5619 | Bottom CTA Section              | `bottom-cta-section`       | mixed       |
| LS-5620 | Pricing FAQ Accordion           | `faq-accordion`            | all         |
| LS-5621 | Feature Comparison Table        | `feature-comparison-table` | all         |
| LS-5622 | Free Plan Card                  | `free-plan-card`           | non-premium |
| LS-5623 | Help Center Link                | `help-center-link`         | all         |
| LS-5624 | Hero Section                    | `hero-section`             | all         |
| LS-5625 | Premium Plan Card               | `premium-plan-card`        | mixed       |
| LS-5626 | Dynamic Stripe Pricing          | `stripe-price-hook`        | all         |
| LS-5627 | Testimonials                    | `testimonials`             | all         |

Also under the epic: `LS-7610` Feature Discovery Gaps Bucket (GAP-001..003) and the PRC-001..035 findings (LS-7167..LS-7201).

## In-flight work — do not conflict

- LS-7189 (PRC-025, hero "current plan" badge) — PR in review; owns hero premium-state assertions.
- LS-7191 (PRC-016, annual per-month price shown as approximate) — PR in review; changes the annual per-month price text, so new price assertions must tolerate an "≈"/"~" prefix (match digits, not the full string).
- LS-7190 (PRC-015) is already Done.

## Permanence

This epic is permanent — never close it when a run finishes.
