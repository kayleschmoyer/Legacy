# Feature: Feature Comparison Table

**Jira:** LS-5621
**Page:** `pricing` (Epic LS-5291)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Table comparing Free vs Premium across key features with booleans/text, driven by `COMPARISON_ROWS` (each row pinned to an entitlement key). Rendered as a real ARIA table named "Free versus Premium feature comparison" with rowgroups, column headers and cells.

## Source

Extracted from: `docs/agents/pages/pricing.md`

## Implementation

`apps/web/src/pages/pricing/PricingPage.tsx` — exported `COMPARISON_ROWS`, `TableRow` / `TableCell` (`role="table"`, `columnheader`, `cell`). Boolean cells render `Check` / `X` icons.

## Platform coverage

| Platform | Harness    | Spec / Flow                                                       | Status  |
| -------- | ---------- | ----------------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/pricing-feature-comparison-table.spec.ts` | pending |
| android  | Maestro    | `maestro/flows/pricing/pricing.yaml`                              | pending |

Web is `pending` (partial): the existing E2E checks are text-presence only and would pass with the wrong cells. **Android: no native comparison table — scope decision needed** (see epic.md).

## Test Coverage

### Existing — E2E (hermetic)

File: `apps/web-e2e/src/tests/pricing-page.spec.ts` (`Pricing page — feature comparison`)

- "displays \"Compare plans\" section heading"
- "comparison table has Free and Premium column headers"
- "comparison table rows include leagues and mock drafts" (also asserts "unlimited" text)

### Existing — unit

File: `apps/web/src/pages/pricing/PricingPage.spec.tsx`

- `COMPARISON_ROWS ↔ entitlements catalog` › "pins every comparison row to its expected entitlement…", "boolean rows are premium-only (free=false, premium=true)" (LS-7182)
- `feature comparison table semantics (LS-7180)` › "exposes a named table with rowgroups, rows, column headers and cells"

### Pending assertions (target: `pricing-feature-comparison-table.spec.ts`)

1. Structure: `getByRole('table', { name: 'Free versus Premium feature comparison' })` has 3 `columnheader`s (Feature, Free, Premium) and exactly `COMPARISON_ROWS.length` body rows (currently 10 — derive from the exported constant rather than hardcoding).
2. Premium-only row (e.g. "Player comparison"): within that `row`, the Premium cell contains an included marker and the Free cell an excluded marker. The icons have no accessible name today — assert via the cell's `svg` and distinguish by position/colour-independent structure, or raise the missing `aria-label` as a product follow-up (do not edit product code in the spec chip).
3. Text-valued row (e.g. leagues): Free cell shows the capped value and Premium cell shows "Unlimited", asserted per cell rather than via page-wide `getByText`.
4. Signed-out and free-tier viewers see the identical table (loop `unauthTest` + `useTier('free')`) — the table is not entitlement-gated.

## Known findings (do not re-file)

LS-7180, LS-7181, LS-7182 (Done); LS-7179 PRC-019 (To Do, critical — "3 max leagues" copy vs no enforcement; assertion 3 should be updated if that copy changes).

## Related

- **Epic:** LS-5291 — QA — Page: Pricing Page
- **Implementation ref:** `docs/agents/pages/pricing.md`
