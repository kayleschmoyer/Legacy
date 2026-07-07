# Feature: Premium Upgrade Modal

**Jira:** LS-5370
**Page:** `create-league-baseball` (Epic LS-5262)
**Platforms:** web, mobile-web, android
**Entitlement:** `non-premium`

## Description

Blocks submission with upgrade modal when free user selects FAAB waivers,
salary cap, or non-free historical eras.

## Source

Extracted from: `docs/agents/pages/baseball/league/create.md`

## Implementation

**Web page:** `apps/web/src/pages/baseball/LeagueCreatePage.tsx`
**Shared field components:** `lib/shared-components/src/features/leagues/premium/`
(`WaiverFields.tsx`, `EraFilterGrid.tsx`, `SalaryCapField.tsx`)
**E2E page object:** `apps/web-e2e/src/pages/league.page.ts` — `upgradeModal`,
`salaryCapAmountInput`, `fillSalaryCapAmount`, `clickPremiumGateUpgrade`,
`closeUpgradeModal`, `expectUpgradeModalVisible`, `expectNoUpgradeModal`
(semantic POM per ADR-0015 / LS-8096 — the spec never calls raw Playwright
selectors)

Three premium-gated settings live in the create-league form, each gating a
free user _before_ the value can ever be set — none of them can reach
`handleSubmit` in a premium-only state for a free user:

| Setting                 | Gate mechanism                                                                                                                                                                                                                    | Upgrade copy               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| FAAB waivers            | `WaiverSystemField`'s `OptionButtonGroup` renders the FAAB option locked (dashed gold border + lock icon); tapping it calls `onUpgrade` instead of `onChange`, so `waiverType` never becomes `'faab'`.                            | "FAAB Waiver Settings"     |
| Non-free historical era | `EraFilterGrid` renders premium-only eras (e.g. Golden Age, Dead Ball, Custom Era) locked the same way — tapping calls `onUpgrade`, `eraFilter` never changes.                                                                    | "Historical Era Selection" |
| Salary cap              | `SalaryCapField` is wrapped in the full-page `PremiumGate` (blur overlay, `pointerEvents: 'none'` for children) — the toggle itself is unreachable for a free user; only the gate's own "Upgrade to Premium" button is clickable. | "Salary Cap"               |

In every case the upgrade attempt opens `UpgradeModal` (`apps/web/src/components/UpgradeModal.tsx`),
a `BaseModal` dialog titled "Upgrade to Premium" with a subtitle of
`Unlock <featureName> and more`. `handleSubmit` additionally re-checks
`waiverType === 'faab'` and the era filter as defense-in-depth before calling
`createLeagueAndTeams`, in case entitlement state changes mid-session.

## Test Coverage

### E2E tests (hermetic)

**File:** `apps/web-e2e/src/tests/create-league-premium-upgrade-modal.spec.ts`

- `describe('Create League (Baseball) – Premium Upgrade Modal for free users @regression')`:
  - `'clicking the FAAB waiver option opens the upgrade modal (does not select FAAB)'`
    — asserts the `UpgradeModal` dialog opens with "Unlock FAAB Waiver
    Settings and more" copy, and that the FAAB budget field never renders.
  - `'clicking a locked historical era opens the upgrade modal (does not select the era)'`
    — taps the "Golden Age" era card and asserts the "Unlock Historical Era
    Selection and more" copy.
  - `'Salary Cap field is behind a premium gate; upgrading opens the upgrade modal'`
    — asserts the `premium-feature-gate` overlay is visible and its own
    "Upgrade to Premium" button opens the "Unlock Salary Cap and more" modal.
- `describe('Create League (Baseball) – premium user bypasses the upgrade modal @regression')`
  (admin identity, treated as premium):
  - `'can select FAAB, a premium era, and enable the salary cap, then submit without seeing an upgrade modal'`
    — selects all three premium settings, asserts no upgrade dialog appears,
    and submits the form successfully.

## Related

- **Page Epic:** LS-5262 — QA — Page: Create League — Baseball
- **Implementation ref:** `docs/agents/pages/baseball/league/create.md`
- **Web page:** `apps/web/src/pages/baseball/LeagueCreatePage.tsx`
- **Base E2E tests:** `apps/web-e2e/src/tests/create-league-premium-upgrade-modal.spec.ts`
