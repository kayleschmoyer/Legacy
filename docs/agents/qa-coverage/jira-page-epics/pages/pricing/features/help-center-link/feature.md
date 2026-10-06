# Feature: Help Center Link

**Jira:** LS-5623
**Page:** `pricing` (Epic LS-5291)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

"Visit our Help Center" link beside the FAQ heading routes to `/help` (rendered as a real anchor via react-router `Link`, LS-7186).

## Source

Extracted from: `docs/agents/pages/pricing.md`

## Implementation

`apps/web/src/pages/pricing/PricingPage.tsx` — `<Link to="/help" data-testid="pricing-help-center-link">` in the FAQ section header. Destination page is covered by `apps/web-e2e/src/tests/help-page.spec.ts`.

## Platform coverage

| Platform | Harness    | Spec / Flow                                               | Status  |
| -------- | ---------- | --------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/pricing-help-center-link.spec.ts` | pending |
| android  | Maestro    | `maestro/flows/pricing/pricing.yaml`                      | pending |

Web is `pending`: there is **no E2E** on the pricing page for this link (unit only). **Android: no native pricing FAQ/link — scope decision needed** (see epic.md).

## Test Coverage

### Existing — E2E (hermetic)

None on `/pricing`. (`help-page.spec.ts` covers the `/help` page itself, not navigation from pricing.)

### Existing — unit

File: `apps/web/src/pages/pricing/PricingPage.spec.tsx` — `Help Center link (LS-7186)` › "renders \"Visit our Help Center\" as an anchor pointing at /help".

### Pending assertions (target: `pricing-help-center-link.spec.ts`)

1. The link `getByTestId('pricing-help-center-link')` is visible with text "Visit our Help Center" and `href="/help"` (real anchor — `getByRole('link', { name: /help center/i })` resolves).
2. Clicking it navigates to `/help` and the "Help & Support" level-1 heading is visible (reuse the heading assertion from `help-page.spec.ts`).

## Known findings (do not re-file)

LS-7186 PRC-035 (Done).

## Related

- **Epic:** LS-5291 — QA — Page: Pricing Page
- **Implementation ref:** `docs/agents/pages/pricing.md`
