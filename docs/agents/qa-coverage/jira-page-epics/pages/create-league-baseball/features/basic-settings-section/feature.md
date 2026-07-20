# Feature: Basic Settings Section

**Jira:** LS-5365
**Page:** `create-league-baseball` (Epic LS-5262)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

The first (and default-expanded) section of the Create League — Baseball form.
Covers the essentials needed to establish a league's identity and shape:

- **League name** — free text, 3–50 characters, required.
- **Number of teams** — button group, 4–16.
- **Number of divisions** — button group, filtered to the options compatible
  with the current team count's parity (divisions must share the same
  odd/even parity as the team count so teams split evenly). Switching the
  team count to a value with the opposite parity of the current division
  selection snaps it to the nearest same-parity option (LS-6060).
- **League visibility** — Private/Public pill toggle, defaults to Private.

The section is expanded by default on form load; all other Create League
sections start collapsed.

## Source

Extracted from: `docs/agents/pages/baseball/league/create.md`

## Implementation

**Component:** `apps/web/src/pages/baseball/LeagueCreatePage.tsx`

The Basic Settings `CollapsibleSection` (`id="basic"`) renders four fields via
the local `FieldRow` / `ButtonGroup` / `PillToggle` helpers, backed by
`CreateLeagueFormData` local state:

| Field               | State key           | Control                                        |
| ------------------- | ------------------- | ---------------------------------------------- |
| League Name         | `leagueName`        | `Input`, bound via `handleInputChange`         |
| Number of Teams     | `numberOfTeams`     | `ButtonGroup` over `TEAM_COUNT_OPTIONS` (4–16) |
| Number of Divisions | `numberOfDivisions` | `ButtonGroup`, options filtered by parity      |
| League Visibility   | `isPublic`          | `PillToggle` (Private / Public)                |

**Parity filter:** `ALL_DIVISION_COUNT_OPTIONS.filter(d => d <= numberOfTeams && numberOfTeams % 2 === d % 2)`.

**Parity reset:** `handleInputChange` snaps `numberOfDivisions` to the nearest
same-parity option when `numberOfTeams` changes to a value whose parity no
longer matches the current `numberOfDivisions` (LS-6060; e.g. even divisions
selected, team count flips to odd — divisions moves to the closest of the
remaining odd options, not hardcoded to `1`).

**Validation:** `validateFormFull` additionally rejects `numberOfDivisions >
numberOfTeams` and a team/division parity mismatch at submit time.

## Test Coverage

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/league-creation.spec.ts`

`describe('League Creation @critical')`:

- "Create League button is always enabled; submitting with short name shows a validation error"
- "should create league successfully with valid data" (fills league name, selects a team count)
- "should validate all form fields correctly" (league name length validation, all team-count options visible)
- "should preserve form state during selection changes" (league name + team count persist across other field changes)

File: `apps/web-e2e/src/tests/league-creation-advanced.spec.ts`

`describe('League Creation — Advanced Settings @regression')`:

- "should display division count section with heading and helper text"
- "should select a division count and submit it as numberOfDivisions (LS-5365)" — selects division count 4 (team count 12) and asserts the submitted `numberOfDivisions` mutation variable
- "should filter division options to team-count parity and reset an invalid selection (LS-5365)" — selects division count 4, switches team count to 7, asserts the odd-only division options (1, 3) render, the even options (2, 4) are hidden, the parity hint text updates, and the submitted `numberOfDivisions` snaps to the nearest odd option (3)
- "should display Private and Public league visibility options"
- "should change visibility description when switching to Public"

The division-count _selection_ and parity-reset behavior were previously
undocumented and untested (only the section's static display was covered) —
LS-5365 added the two tests above to close that gap. Selecting a specific
team-count or division-count option now goes through the new
`leaguePage.selectTeamCount()` / `leaguePage.selectDivisionCount()` actions,
scoped to `numberOfTeams-field` / `numberOfDivisions-field` test ids
(`FieldRow`'s new `testId` prop) — the two button groups can render an
identically-labelled numeral (e.g. "4"), so an unscoped `leaguePage.button('4')`
is ambiguous between them.

## Related

- **Epic:** LS-5262 — QA — Page: Create League — Baseball
- **Implementation ref:** `docs/agents/pages/baseball/league/create.md`
