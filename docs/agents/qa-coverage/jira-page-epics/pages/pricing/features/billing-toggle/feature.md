# Feature: Monthly / Annual Billing Toggle

**Jira:** LS-5618
**Page:** `pricing` (Epic LS-5291)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Toggle switches between monthly and annual pricing; annual shows per-month equivalent and a "Save X%" badge. Implemented as an ARIA radiogroup ("Billing period", Annual checked by default, roving tabindex, arrow-key navigation). Annual Premium subscribers see "Your plan: Annual" instead of the toggle (LS-7171).

## Source

Extracted from: `docs/agents/pages/pricing.md`

## Implementation

`apps/web/src/pages/pricing/PricingPage.tsx` — hero billing toggle (`role="radiogroup"`), `isAnnual` state, `useMyBillingInterval`, `ToggleContainer data-testid="billing-current-plan"`. Android analogue: `apps/app/src/features/subscription/AndroidSubscriptionScreen.tsx` (two IAP plan cards, no toggle).

## Platform coverage

| Platform | Harness    | Spec / Flow                                             | Status  |
| -------- | ---------- | ------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/pricing-billing-toggle.spec.ts` | pending |
| android  | Maestro    | `maestro/flows/pricing/subscription-plans.yaml`         | pending |

Web is `pending` (partial): the click-to-switch happy path exists in `pricing-page.spec.ts`, but keyboard operation, aria state, billed-amount copy and subscriber variants are unproven end to end. mobile-web is proven by the same spec at mobile viewport.

## Test Coverage

### Existing — E2E (hermetic)

File: `apps/web-e2e/src/tests/pricing-page.spec.ts`

- `Pricing page — billing toggle` › "switches between monthly and annual pricing" (clicks Monthly → `4.99`, Annual → `3.33`)
- `Pricing page — billing toggle` › "\"Save 30%\" discount badge is visible on annual toggle option"
- `Pricing page — billing toggle` › "every \"Save X%\" instance on the page shows the same percentage" (both cycles, LS-7169)
- `Pricing page – page load` › "renders page heading and billing toggle"

### Existing — unit

File: `apps/web/src/pages/pricing/PricingPage.spec.tsx`

- `billing toggle keyboard accessibility (LS-7167)` — radiogroup + Annual checked + roving tabindex; Enter/Space select; arrow keys move selection and focus
- `billing toggle for Premium subscribers (LS-7171)` — annual subscriber sees "Your plan: Annual"; monthly subscriber and unknown interval keep the toggle; no badge flash while interval loads; non-Premium skip the lookup
- `annual option accessible name (LS-7168)` — names the savings; omits % while loading

### Pending assertions (target: `pricing-billing-toggle.spec.ts`)

1. Default state: `getByRole('radiogroup', { name: 'Billing period' })` has Annual `aria-checked="true"` and Monthly `"false"`; clicking Monthly flips both; clicking Annual flips back.
2. Annual copy: in annual state the Premium card shows "Billed annually ($39.99/yr)"; in monthly state it shows "Billed monthly. Switch to annual and save N%" (scope to `plan-card-premium`; match digits only — LS-7191 may add an approximate prefix).
3. Keyboard: focus Annual, press `ArrowLeft` → Monthly is checked and focused and the price flips to monthly; `ArrowRight` flips back (journey-level counterpart of the LS-7167 unit case).
4. Annual subscriber: override `getmybillinginterval` to `annual` for the Premium user → `billing-current-plan` ("Your plan: Annual") is visible and the radiogroup and "Save N%" badge are absent.
5. Monthly subscriber: override `getmybillinginterval` to `monthly` → radiogroup and badge remain.

### Pending assertions (android, `maestro/flows/pricing/subscription-plans.yaml`)

6. Landing-anchor the subscription screen, then assert both "Monthly Plan" and "Annual Plan" cards are visible with `/month` and `/year` suffixes plus a screenshot. (The native screen has no toggle and prices come from Google Play, not Stripe — see epic.md platform notes and GAP-002 / LS-7666.)

## Known findings (do not re-file)

LS-7167, LS-7168, LS-7169, LS-7171 (Done); LS-7170 PRC-010 (To Do — checkout does not carry the selected interval).

## Related

- **Epic:** LS-5291 — QA — Page: Pricing Page
- **Implementation ref:** `docs/agents/pages/pricing.md`
