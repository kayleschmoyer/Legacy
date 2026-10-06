# Feature: Hero Section

**Jira:** LS-5624
**Page:** `pricing` (Epic LS-5291)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Pricing hero with badge ("Simple, transparent pricing"), title ("The plan that fits your game") and subtitle introducing the plans. The billing toggle lives in the hero but is owned by the Billing Toggle story (LS-5618).

## Source

Extracted from: `docs/agents/pages/pricing.md`

## Implementation

`apps/web/src/pages/pricing/PricingPage.tsx` — `HeroSection`, `<H1>` with non-breaking space + gold "game" span (LS-7187), `PageMeta`. **LS-7189 (PR in review) changes the badge to a "current plan" indicator for subscribed users** — this story's assertions cover the default/non-subscriber hero only.

## Platform coverage

| Platform | Harness    | Spec / Flow                                           | Status  |
| -------- | ---------- | ----------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/pricing-hero-section.spec.ts` | pending |
| android  | Maestro    | `maestro/flows/pricing/pricing.yaml`                  | pending |

Web is `pending` (partial): the H1 is asserted widely but badge and subtitle are not. **Android: no native pricing hero — scope decision needed** (see epic.md).

## Test Coverage

### Existing — E2E (hermetic)

File: `apps/web-e2e/src/tests/pricing-page.spec.ts`

- `page load` › "renders page heading and billing toggle" (H1 "the plan that fits")
- Unauthenticated variants (LS-3515/3516/3561): H1 visible on `/pricing` and after `/faq` redirect; landing page ("build your dynasty") is not shown

### Existing — unit

File: `apps/web/src/pages/pricing/PricingPage.spec.tsx` — `hero heading wrapping (LS-7187)` › "joins \"your\" and the gold \"game\" with a non-breaking space".

### Pending assertions (target: `pricing-hero-section.spec.ts`)

1. Free user (`useTier(page, 'free')`) and signed-out visitor: hero badge reads "Simple, transparent pricing".
2. Subtitle "Start free and play as long as you want. Upgrade to Premium when you're ready for the full experience." is visible beneath the H1 (match a stable fragment, not the full string).

Premium-subscriber hero state belongs to LS-7189's PR — do not duplicate; if it lands without an E2E case, add it here as a follow-up assertion.

## Known findings (do not re-file)

LS-7187 PRC-023 (Done); LS-7188 PRC-024 (To Do, PageMeta localization); LS-7189 PRC-025 (In Review).

## Related

- **Epic:** LS-5291 — QA — Page: Pricing Page
- **Implementation ref:** `docs/agents/pages/pricing.md`
