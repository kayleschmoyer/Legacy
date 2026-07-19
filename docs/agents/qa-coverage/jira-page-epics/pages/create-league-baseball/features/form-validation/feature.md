# Feature: Form Validation

**Jira:** LS-5369
**Page:** `create-league-baseball` (Epic LS-5262)
**Platforms:** web, mobile-web, android
**Entitlement:** mixed

## Description

Validates league name length (3-50), team/division parity, roster size,
future draft date, custom era range, and premium gating for FAAB and
historical eras.

## Source

Extracted from: `docs/agents/pages/baseball/league/create.md`

## Implementation

**Component:** `apps/web/src/pages/baseball/LeagueCreatePage.tsx`

`validateFormFull` computes all validation errors up front (not just the
first) and surfaces the first one both inline in the sticky action bar and,
on submit, in a `role="alert"` error card. Premium gating for FAAB waivers
and historical eras is enforced by the shared `WaiverSystemField` /
`EraFilterGrid` components (`lib/shared-components/src/features/leagues/premium/`),
which route a locked selection to `onUpgrade` (opens `UpgradeModal`) instead
of applying it. The draft-date picker (`DateTimePicker`, `minDate={new Date()}`)
disables past-date cells outright rather than relying on post-hoc validation.

## Test Coverage

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/create-league-form-validation.spec.ts`

`describe('Create League (Baseball) — Form Validation @regression')`:

- League name under 3 characters shows a validation error on submit
- League name over 50 characters shows a validation error on submit
- A name within 3–50 characters submits with no validation error
- Switching to an odd team count restricts divisions to odd counts and stays valid
- Roster size selections (boundary presets 20 and 40) stay within the valid 15–50 range
- Past dates are disabled in the draft-date picker; today is selectable
- Custom era requires both years and enforces start ≤ end
- Free user selecting FAAB waivers sees the premium upgrade gate
- Free user selecting a historical baseball era opens the premium upgrade modal

Complementary coverage (name length, FAAB gating, custom-era input
visibility) also exists in `league-creation.spec.ts` and
`league-creation-advanced.spec.ts`; this file is the dedicated Feature Story
spec for LS-5369 and additionally covers team/division parity and the
custom-era start ≤ end range, which were previously untested.

## Related

- **Epic:** LS-5262 — QA — Page: Create League — Baseball
- **Implementation ref:** `docs/agents/pages/baseball/league/create.md`
