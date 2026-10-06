# Feature: Testimonials

**Jira:** LS-5627
**Page:** `pricing` (Epic LS-5291)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Three testimonial cards under "What commissioners are saying", each with a 5-star rating, quote, author name, and role/meta. Rendered as `<blockquote>` with the author in a `<cite>` (LS-7201).

## Source

Extracted from: `docs/agents/pages/pricing.md`

## Implementation

`apps/web/src/pages/pricing/PricingPage.tsx` — `TESTIMONIALS` constant, `TestimonialCard`.

## Platform coverage

| Platform | Harness    | Spec / Flow                                           | Status  |
| -------- | ---------- | ----------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/pricing-testimonials.spec.ts` | pending |
| android  | Maestro    | `maestro/flows/pricing/pricing.yaml`                  | pending |

Web is `pending`: unit-tested only, **no E2E**. **Android: no native testimonials — scope decision needed** (see epic.md).

## Test Coverage

### Existing — E2E (hermetic)

None.

### Existing — unit

File: `apps/web/src/pages/pricing/PricingPage.spec.tsx` — `testimonial semantics (LS-7201)` › "renders each testimonial as a blockquote with the author in a cite".

### Pending assertions (target: `pricing-testimonials.spec.ts`)

1. Section: heading "What commissioners are saying" is visible and exactly 3 `blockquote` elements render.
2. Each blockquote has non-empty quote text and a `cite` with an author name, plus a role/meta line (check one distinctive author per card rather than all copy — the copy is under review in LS-7200).
3. Each card shows 5 star icons; the section renders identically for signed-out (`unauthTest`) and Premium viewers (entitlement `all`).

## Known findings (do not re-file)

LS-7201 PRC-034 (Done); LS-7200 PRC-033 (To Do, high — testimonials may be fictional; if the copy is replaced, update assertion 2).

## Related

- **Epic:** LS-5291 — QA — Page: Pricing Page
- **Implementation ref:** `docs/agents/pages/pricing.md`
