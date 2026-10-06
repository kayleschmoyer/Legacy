# Feature: Bottom CTA Section

**Jira:** LS-5619
**Page:** `pricing` (Epic LS-5291)
**Platforms:** web, mobile-web, android
**Entitlement:** mixed

_Premium and non-premium variants exist (signed-out, free, Premium)._

## Description

Bottom CTA ("Ready to level up your league?") with "Upgrade to Premium" (→ `/profile/subscription`), "Manage subscription" for Premium subscribers (→ `/profile/subscription`), and "Get Started Free" (→ `/`) for signed-out visitors only.

## Source

Extracted from: `docs/agents/pages/pricing.md`

## Implementation

`apps/web/src/pages/pricing/PricingPage.tsx` — bottom `YStack` after the FAQ; visibility from `showUpgradeCta` / `showManageCta` / `showFreeCta`; Premium variant button `data-testid="premium-bottom-manage"`.

## Platform coverage

| Platform | Harness    | Spec / Flow                                                 | Status  |
| -------- | ---------- | ----------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/pricing-bottom-cta-section.spec.ts` | pending |
| android  | Maestro    | `maestro/flows/pricing/pricing.yaml`                        | pending |

Web is `pending` (partial): only the signed-out "Get Started Free" path is proven. **Android: the native app has no pricing page or bottom CTA — scope decision needed** (either mark the story web-only/n/a on the Jira Platforms line, or define a native equivalent). Until decided the row stays `pending` with no concrete native assertions.

## Test Coverage

### Existing — E2E (hermetic)

File: `apps/web-e2e/src/tests/pricing-page.spec.ts`

- `bottom CTA "Get Started Free" clickable` › "bottom CTA \"Get Started Free\" on /pricing navigates to sign-in (LS-3517)" (unauth)
- `/faq — sign-in CTA for unauthenticated users (LS-3521)` › "\"Get Started Free\" on /faq leads to sign-in CTA…"
- `/pricing — unauthenticated access` › "\"Get Started Free\" button is visible…"

### Existing — unit

File: `apps/web/src/pages/pricing/PricingPage.spec.tsx`

- `Free plan card CTA by viewer state (LS-7184, LS-7185)` › "shows \"Get Started Free\" (card and bottom CTA) to unauthenticated visitors"
- `Premium card CTA by viewer state (LS-7193)` › "shows \"Upgrade to Premium\" (card and bottom CTA)…", "replaces … with \"Manage subscription\" for premium users", "shows neither CTA while … tier is still loading"

### Pending assertions (target: `pricing-bottom-cta-section.spec.ts`)

1. Section content: heading "Ready to level up your league?" is visible after scrolling to the bottom (`scrollIntoViewIfNeeded`).
2. Free user (`useTier(page, 'free')`): bottom "Upgrade to Premium" is visible, "Get Started Free" and "Manage subscription" are absent; clicking Upgrade lands on `/profile/subscription` (mock `getmysubscription` null).
3. Premium user (default): `premium-bottom-manage` ("Manage subscription") is visible, Upgrade and Get Started Free are absent; clicking it lands on `/profile/subscription`.
4. Signed-out (`unauthTest`): both "Upgrade to Premium" and "Get Started Free" are visible in the bottom section; "Get Started Free" → `/` is already covered, so assert only the Upgrade destination is reached (`waitForURL(/profile\/subscription|\//)`, then assert whichever the auth guard renders). **Depends on GAP-001 (LS-7665)** — if that finding changes the signed-out Upgrade behaviour, align this assertion to the fixed behaviour rather than the current one.

## Known findings (do not re-file)

LS-7172 PRC-026, LS-7173 PRC-027, LS-7174 PRC-028 (all To Do); LS-7665 GAP-001 (To Do).

## Related

- **Epic:** LS-5291 — QA — Page: Pricing Page
- **Implementation ref:** `docs/agents/pages/pricing.md`
