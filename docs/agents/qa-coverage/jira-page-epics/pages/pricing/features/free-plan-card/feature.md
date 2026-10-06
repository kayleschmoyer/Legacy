# Feature: Free Plan Card

**Jira:** LS-5622
**Page:** `pricing` (Epic LS-5291)
**Platforms:** web, mobile-web, android
**Entitlement:** non-premium

## Description

Free plan card showing $0 price, the Free feature list, and a viewer-dependent CTA: "Get Started Free" (→ `/`) for signed-out visitors, a disabled "Current plan" marker for signed-in free users, and a disabled "Includes Free tier" badge for Premium users (LS-7184, LS-7185).

## Source

Extracted from: `docs/agents/pages/pricing.md`

## Implementation

`apps/web/src/pages/pricing/PricingPage.tsx` — `PlanCard data-testid="plan-card-free"`, `FREE_FEATURES` (derived from `PREMIUM_FEATURES`), `showFreeCta`, `data-testid="free-plan-current"`, `data-testid="free-plan-included-badge"`.

## Platform coverage

| Platform | Harness    | Spec / Flow                                             | Status  |
| -------- | ---------- | ------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/pricing-free-plan-card.spec.ts` | pending |
| android  | Maestro    | `maestro/flows/pricing/pricing.yaml`                    | pending |

Web is `pending` (partial): signed-out and Premium-user paths are proven; the signed-in free-user state and card content are not. **Android: no native Free plan card — scope decision needed** (see epic.md).

## Test Coverage

### Existing — E2E (hermetic)

File: `apps/web-e2e/src/tests/pricing-page.spec.ts`

- `page load` › "shows Free and Premium plan cards" (Premium user: `$0` visible, no "Get Started Free")
- `unauthenticated visitor` › "shows Free plan card on /pricing when not authenticated", "\"Get Started Free\" button is visible and navigates to / …"
- `unauthenticated content guard (LS-3516)` › "shows Free and Premium plan cards…", "\"Get Started Free\" button is visible…"
- `/pricing — unauthenticated access`, `sign-in CTA from /pricing` (LS-3559), `/faq` redirect variants — "Get Started Free" → sign-in

### Existing — unit

File: `apps/web/src/pages/pricing/PricingPage.spec.tsx` — `Free plan card CTA by viewer state (LS-7184, LS-7185)`: signed-out CTA; free-user disabled "Current plan"; Premium "Includes Free tier".

### Pending assertions (target: `pricing-free-plan-card.spec.ts`)

1. Free user (`useTier(page, 'free')`): `free-plan-current` shows a **disabled** "Current plan" button; no "Get Started Free" anywhere on the page.
2. Premium user (default): `free-plan-included-badge` ("Includes Free tier") is visible and disabled; no "Current plan" inside `plan-card-free`.
3. Card content: within `plan-card-free` assert "FREE", "$0", "Forever free. No credit card needed.", and the included-feature bullets rendered from `PREMIUM_FEATURES` (count derived from the constant, not hardcoded as 6).
4. Signed-out: the card CTA and the bottom CTA are two distinct "Get Started Free" buttons (`toHaveCount(2)`), the card one scoped to `plan-card-free` — closes the LS-3517 `.last()`/`.first()` ambiguity.

## Known findings (do not re-file)

LS-7184, LS-7185 (Done); LS-7183 PRC-012 (To Do, critical — "3 leagues" claim vs unlimited joins).

## Related

- **Epic:** LS-5291 — QA — Page: Pricing Page
- **Implementation ref:** `docs/agents/pages/pricing.md`
