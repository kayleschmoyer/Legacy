# Feature: Pricing FAQ Accordion

**Jira:** LS-5620
**Page:** `pricing` (Epic LS-5291)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

5-item FAQ accordion covering trial, downgrade, annual billing, payment methods, and multi-league access. One item open at a time (`openFaq` state); each item is `data-testid="pricing-faq-item-<i>"` with `data-open`. The trial answer (index 0) is derived from `trialPeriodDays`. `/faq` redirects to this page.

## Source

Extracted from: `docs/agents/pages/pricing.md`

## Implementation

`apps/web/src/pages/pricing/PricingPage.tsx` — `faqItems` (`TRIAL_FAQ_QUESTION` + `OTHER_FAQ_ITEMS`), `FAQItem` / `FAQQuestion` (aria-controls → `faq-panel-<i>`, `role="region"` answer).

## Platform coverage

| Platform | Harness    | Spec / Flow                                            | Status  |
| -------- | ---------- | ------------------------------------------------------ | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/pricing-faq-accordion.spec.ts` | pending |
| android  | Maestro    | `maestro/flows/pricing/pricing.yaml`                   | pending |

Web is `pending` (partial): expand of item 0 and ARIA linkage are proven, collapse / single-open / content are not. **Android: no native FAQ accordion exists — scope decision needed** (see epic.md).

## Test Coverage

### Existing — E2E (hermetic)

File: `apps/web-e2e/src/tests/pricing-page.spec.ts`

- `FAQ section` › "FAQ section heading is visible"
- `FAQ section` › "FAQ items exist and are expandable" (item 0: `data-open` false → true)
- `FAQ section` › "FAQ question is linked to its answer panel via aria-controls" (LS-7175)
- `/faq — FAQ content visible to unauthenticated users` › "shows FAQ section heading…", "shows FAQ accordion items after /faq redirect", "does not show homepage hero content at /faq"

File: `apps/web-e2e/src/tests/faq-page.spec.ts` — `/faq` → `/pricing` redirect, FAQ presence (signed-in and unauth).

### Existing — unit

None specific to the accordion in `PricingPage.spec.tsx` (React key / aria-controls findings LS-7175/7176 are covered at E2E level only).

### Pending assertions (target: `pricing-faq-accordion.spec.ts`)

1. Collapse: click item 0 (→ `data-open="true"`, answer visible), click again → `data-open="false"` and answer hidden.
2. Single-open: open item 0, then item 1 → item 0 `data-open="false"`, item 1 `"true"`.
3. Inventory: exactly 5 `pricing-faq-item-*` elements render, in order — trial, downgrade, annual billing, payment methods, multi-league — by question text.
4. Answer content: expanding each item shows its non-empty answer in `#faq-panel-<i>` (spot-check one distinctive phrase per item, e.g. "read-only" for downgrade).
5. Trial answer follows config: with default mock (`trialPeriodDays: 0`) item 0's answer contains "cancel at any time"; overriding `getstripeprices` with `trialPeriodDays: 14` makes it contain "14-day free trial". (Whether the 14-day claim matches Stripe reality is LS-7177 — assert only that copy follows the config.)

## Known findings (do not re-file)

LS-7175, LS-7176 (Done); LS-7177 PRC-031 (To Do), LS-7178 PRC-032 (To Do).

## Related

- **Epic:** LS-5291 — QA — Page: Pricing Page
- **Implementation ref:** `docs/agents/pages/pricing.md`
