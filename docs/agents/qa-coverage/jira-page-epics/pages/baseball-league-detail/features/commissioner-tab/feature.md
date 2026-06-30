# Feature: Commissioner Tab

**Jira:** LS-5340
**Page:** `baseball-league-detail` (Epic LS-5259)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Commissioner-only accordion tab on the Baseball League Detail page
(`/baseball/league/:id/commissioner`). Only the league owner sees the
"Commissioner" tab in the tab bar; it is filtered out of the DOM entirely for
non-commissioners. The tab renders an accordion where "Next Step" is open by
default and all other sections start collapsed. Toggling a section opens it and
collapses whatever was previously open (single-open accordion).

### Accordion Sections (in render order)

| #   | Section label     | Icon class | Component(s)                                                       | Notes                               |
| --- | ----------------- | ---------- | ------------------------------------------------------------------ | ----------------------------------- |
| 1   | Next Step         | gold       | `NextStepControl`                                                  | Open by default; "Ready" badge      |
| 2   | Announcements     | gold       | `CommissionerAnnouncementsPanel`                                   |                                     |
| 3   | League Settings   | gold       | `LeagueSettingsControl`                                            |                                     |
| 4   | Draft Settings    | gold       | `DraftSettingsControl`                                             | Baseball only — absent for football |
| 5   | League Dues       | gold       | `LeagueDuesControl` + `LeagueDuesStatusDashboard`                  |                                     |
| 6   | Season Awards     | gold       | `SeasonAwardsControl`                                              |                                     |
| 7   | Scoring Rules     | —          | `LeagueScoringEditor` (baseball) / football placeholder (football) |                                     |
| 8   | Waiver Processing | gold       | `WaiverProcessControl` (wrapped in `PremiumGate` for FAAB)         | FAAB leagues require Premium        |
| 9   | Danger Zone       | red        | `DeleteLeagueControl`                                              | `data-testid="danger-zone-toggle"`  |

### Next Step Control

Contextual controls driven by `draftStatus` + current matchup state:

| League state                              | Control shown                                             |
| ----------------------------------------- | --------------------------------------------------------- |
| `draftStatus: 'not-started'`              | "Start Draft" button (`data-testid="start-draft-button"`) |
| `draftStatus: 'in-progress'`              | "Join Draft Room" button → `/baseball/league/{id}/draft`  |
| `draftStatus: 'completed'`, no matchups   | "Create Week 1 Matchups" button                           |
| Season active, games remain               | "Select Game N of M" button                               |
| Season active, all games selected         | "Advance League Week" button                              |
| Season complete (no current week/matchup) | "Season Complete" indicator + "Start New Season" button   |

Game selection and advancement use confirmation dialogs (role="dialog") before
firing mutations. `draftStatus: 'completed'` or `draftStatus: 'active'` causes
a "Season Active" badge to appear after the page reaches networkidle (LS-4296).

Error messages from NextStep mutations render in a `role="alert"` banner at the
top of the tab. Waiver processing errors and success messages render in their
own `role="alert"` / `role="status"` banners.

The tab subscribes to `useLeagueWebSocket({ onMatchupStatsComplete })` so the
NextStep label (game-selection vs. advance-week) updates automatically when the
server signals stats have been recalculated.

### Draft Settings (baseball only)

Hidden entirely for football leagues (`league.sport === Sport.Football`). Shows
player pool, era filter options, and draft mode save with a `data-testid="option-automated"`
button for the automated draft mode. The "Save Draft Settings" button becomes
disabled while the mutation is in-flight (LS-4352). Premium status gates the
auction draft mode via `isPremium` prop.

### League Settings

Passes `isPremium` from `useIsPremium()` into `LeagueSettingsControl`. Premium
gates: 6-team / 8-team playoff formats and salary cap settings. Settings are
locked (read-only) when `draftStatus === 'completed'`.

### Waiver Processing

Wrapped in `PremiumGate`: leagues using `waiverType: 'faab'` require Premium
to trigger manual waiver processing. Standard waiver leagues see the control
ungated. "Process Waivers Now" opens a confirmation dialog; confirming fires the
`processWaiverClaims` mutation.

### Scoring Rules

Baseball: renders `LeagueScoringEditor` (batting / pitching / fielding stat
point values, load/save scoring profiles). Football: renders a static placeholder
mentioning the football scoring editor is forthcoming; the placeholder references
`DST` or `IDP` depending on `league.defensiveFormat`.

### Danger Zone

Single "Delete League" button inside `DeleteLeagueControl`. Requires a
confirmation modal. Irreversible — includes a league name + team-count warning.

## Source

Extracted from: `docs/agents/pages/baseball/league/detail/tabs/commissioner.md`

## Implementation

### Web

**Tab component:** `apps/web/src/pages/baseball/league-detail-v2/tabs/Commish.tsx`
**Tab config:** `apps/web/src/pages/baseball/league-detail-v2/tabConfig.ts`
**Page host:** `apps/web/src/pages/baseball/league-detail-v2/LeagueDetailPageV2.tsx`

Settings toast state (`onSettingsSuccess` / `onSettingsError`) is lifted into
`LeagueDetailPageV2` so it survives a transient `CommishTab` unmount during the
save flow (LS-4542).

**Web commissioner control components** (`apps/web/src/components/commissioner/`):

| File                            | Role                                         |
| ------------------------------- | -------------------------------------------- |
| `DraftSettingsControl.tsx`      | Thin re-export of the shared component       |
| `LeagueSettingsControl.tsx`     | Thin re-export of the shared component       |
| `LeagueDuesControl.tsx`         | Dues setup — set amount, due date            |
| `LeagueDuesStatusDashboard.tsx` | Per-team payment status tracking             |
| `SeasonAwardsControl.tsx`       | Award definitions, recipients, voting period |

**Web features** (`apps/web/src/features/commissioner/`, `apps/web/src/features/baseball/`):

| File                                                   | Role                                                 |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `features/commissioner/index.ts`                       | Re-exports `NextStepControl`, `WaiverProcessControl` |
| `features/commissioner/DeleteLeagueControl.tsx`        | League deletion with confirmation modal              |
| `features/baseball/CommissionerAnnouncementsPanel.tsx` | League announcements panel                           |
| `features/baseball/LeagueScoringEditor.tsx`            | Scoring rules editor                                 |

**Shared components** (`lib/shared-components/src/features/commissioner/`):

| File                                 | Role                                             |
| ------------------------------------ | ------------------------------------------------ |
| `NextStepControl.tsx`                | Draft/game-selection/advance-week contextual CTA |
| `DraftSettingsControl.tsx`           | Player pool, era filter, draft mode settings     |
| `LeagueSettingsControl.tsx`          | League parameters, playoff settings, salary cap  |
| `WaiverProcessControl.tsx`           | Waiver claim processing trigger + FAAB settings  |
| `DeleteLeagueControl.tsx`            | Destructive league deletion with confirmation    |
| `SeasonAwardsControl.tsx`            | MVP/Cy Young/awards management                   |
| `TiebreakerConfig.tsx`               | Primary/secondary/tertiary tiebreaker rules      |
| `AchievementRestrictionsControl.tsx` | Achievement toggles and restrictions             |
| `SeasonRenewalControl.tsx`           | New season creation and carryover                |
| `LeagueBrandingControl.tsx`          | Logo, banner, color customization                |
| `DraftOrderControl.tsx`              | Drag-and-drop draft order reordering             |

**GraphQL:** `lib/graphql/src/commissioner.graphql`

### Mobile (apps/app)

**Screen:** `apps/app/src/features/commissioner/CommissionerScreen.tsx`
**Dues:** `apps/app/src/features/commissioner/LeagueDuesSetup.tsx`,
`apps/app/src/features/commissioner/LeagueDuesPaymentStatus.tsx`
**Tiebreakers:** `apps/app/src/components/league/TiebreakerConfig.tsx`

## Test Coverage

### Unit tests

**File:** `apps/web/src/pages/baseball/league-detail-v2/tabs/Commish.spec.tsx`

`describe('CommishTab — football-awareness')`:

- `'shows "Draft Settings" accordion for a baseball league'`
- `'hides "Draft Settings" accordion for a football league'`
- `'shows football scoring placeholder when "Scoring Rules" is opened for a football league'`
- `'shows "DST" in scoring placeholder when defensiveFormat is dst'`
- `'shows "IDP" in scoring placeholder when defensiveFormat is idp'`
- `'shows the baseball scoring editor when "Scoring Rules" is opened for a baseball league'`

`describe('CommishTab — premium gating (LS-5205)')`:

- `'wires isPremium=false into LeagueSettingsControl for free commissioners so the playoff-format PremiumGate stays locked'`
- `'wires isPremium=true into LeagueSettingsControl for premium commissioners so all playoff formats unlock'`

`describe('CommishTab — DraftSettingsControl premium wiring (LS-5017)')`:

- `'wires isPremium=false into DraftSettingsControl for free commissioners so auction draft stays locked'`
- `'wires isPremium=true into DraftSettingsControl for premium commissioners so auction draft unlocks'`

**File:** `apps/web/src/components/commissioner/LeagueDuesControl.spec.tsx`

`describe('LeagueDuesControl')`:

- Dues setup and form interaction tests

**File:** `lib/shared-components/src/features/commissioner/NextStepControl.spec.tsx`

`describe('NextStepControl')`:

- Step control rendering and contextual CTA tests

**File:** `lib/shared-components/src/features/commissioner/LeagueSettingsControl.spec.tsx`

`describe('LeagueSettingsControl')`:

- Settings form, playoff settings, and premium gate tests

**File:** `lib/shared-components/src/features/commissioner/DeleteLeagueControl.spec.tsx`

`describe('DeleteLeagueControl')`:

- Delete button, confirmation modal, and irreversibility warning tests

**File:** `apps/web/src/pages/baseball/league-detail-v2/CommissionerSettingsToast.spec.tsx`

- Settings toast state persistence across tab unmount/remount

**Mobile:**
`apps/app/src/features/commissioner/CommissionerScreen.spec.tsx`

### E2E tests (hermetic)

**File:** `apps/web-e2e/src/tests/commissioner-tab-nav.spec.ts`

`describe('Commissioner Tab — navigation @smoke')`:

- `'navigates to commissioner tab without error'`
- `'commissioner tab is visible in tab bar for commissioner'`
- `'shows the league name on the commissioner page'`

`describe('Commissioner Tab — non-commissioner access @regression')`:

- `'commissioner tab button is hidden for non-commissioner members'`

`describe('Next Step — pre-season states @critical')`:

- `'shows "Start Draft" button when league draft has not started'`
- `'shows "Create Week 1 Matchups" when draft is complete but no matchups exist'`

**File:** `apps/web-e2e/src/tests/commissioner-draft-status.spec.ts`

`describe('Commissioner — Season Active badge (LS-4296)')`:

- `'shows "Season Active" for draftStatus completed after networkidle'`
- `'shows "Season Active" for draftStatus active after networkidle'`
- `'does not show "Season Active" for draftStatus not-started'`
- `'does not show "Season Active" for draftStatus queued'`

`describe('Commissioner — poll-cycle Season Active detection (LS-4296)')`:

- `'detects Season Active on second poll after queued→completed transition'`

`describe('Commissioner — reload vs goto after draft-start navigation (LS-4306)')`:

- `'page.reload() misses Season Active when page has navigated away from commissioner'`
- `'page.goto(commissionerUrl) detects Season Active even after navigation away'`

`describe('Commissioner — deterministic api-polling path (LS-4344)')`:

- `'waitForSeasonActive with api waits for backend draftStatus before asserting UI badge'`

`describe('Commissioner — draft mode save-completion guard (LS-4352)')`:

- `'Save button becomes disabled during/after slow UpdateDraftSettings'`

`describe('Commissioner — unauthenticated access guard (LS-4296)')`:

- `'unauthenticated user sees login page and cannot see "Season Active"'`

**File:** `apps/web-e2e/src/tests/commissioner-game-selection.spec.ts`

`describe('Next Step — game selection state @critical')`:

- `'shows "Select Game 1 of 5" when draft is complete and games remain'`
- `'shows "Select Game 3 of 5" when 2 games are already selected'`
- `'game selection button opens a confirmation dialog'`
- `'game selection confirm dialog can be cancelled'`
- `'confirms game selection and calls autoSelectGames mutation'`

`describe('Next Step — matchup advancement state @critical')`:

- `'shows "Advance League Week" when all games are selected'`
- `'advance button opens a confirmation dialog with week info'`
- `'confirms matchup advancement and calls autoAdvanceMatchups mutation'`

`describe('Sequential game selection — multi-round @critical')`:

- `'clicking Select Game through all rounds updates button label and transitions to Advance'`

`describe('Advance blocked when games incomplete @critical')`:

- `'Advance League Week button is NOT visible when games remain unselected'`
- `'shows game selection button for first incomplete game when some games selected'`

`describe('Advance week flow — UI refresh @critical')`:

- `'advancing from week 1 to week 2 refreshes UI to show new week state'`

**File:** `apps/web-e2e/src/tests/commissioner-waiver-errors.spec.ts`

`describe('Waiver Processing — commissioner control @critical')`:

- `'shows "Waiver Processing" section heading'`
- `'shows "Process Waivers Now" button'`
- `'"Process Waivers Now" opens a confirmation dialog'`
- `'waiver confirm dialog shows description text'`
- `'cancel button closes the waiver confirm dialog'`

`describe('Waiver Processing — confirm mutation @regression')`:

- `'confirms waiver processing and calls processWaiverClaims mutation'`

`describe('Error handling — mutation failure @regression')`:

- `'shows error message when autoSelectGames mutation returns GraphQL error'`
- `'shows error message when autoAdvanceMatchups mutation returns GraphQL error'`

`describe('Final week advance — season completion @regression')`:

- `'shows "Season Complete" indicator when all weeks have been played'`
- `'shows "Season Complete" when currentMatchup is null and totalMatchups is not set (LS-3835)'`
- `'advancing the final week transitions to season complete state'`

**File:** `apps/web-e2e/src/tests/commissioner-scoring-editor.spec.ts`

`describe('Commissioner Scoring Editor (LS-681)')`:

- Scoring Settings heading renders
- Loading state while profile fetches
- Stat groups (Batting, Pitching, Fielding) render with input fields
- "N unsaved" badge appears when values are changed
- Save triggers UpdateLeagueScoringProfile mutation
- Error state when GetLeagueScoringProfile fails
- Empty state when profile has no stats
- Locked state when draftStatus === 'completed'
- Reset clears pending changes

**File:** `apps/web-e2e/src/tests/commissioner-league-settings.spec.ts`

`describe('Commissioner League Settings (LS-682)')`:

- "League Settings" heading renders
- Games Per Matchup section and options visible
- SP Starts Per Matchup section visible
- Minimum Career Games section visible
- Save Settings button present
- Reset button present
- Locked state when draftStatus === 'completed'
- Save triggers UpdateLeagueSettings mutation

**File:** `apps/web-e2e/src/tests/commissioner-announcements.spec.ts`

Commissioner announcements panel tests.

**File:** `apps/web-e2e/src/tests/commissioner-audit-delete.spec.ts`

Danger Zone deletion and audit log tests.

### Integration tests (live backend)

**File:** `apps/web-e2e/src/integration/tests/commissioner-settings-ui.integration.spec.ts`

Full settings workflow against live backend.

**File:** `apps/web-e2e/src/integration/tests/commissioner-announcements-ui.integration.spec.ts`

Announcements UI integration against live backend.

## Related

- **Epic:** LS-5259 — QA — Page: Baseball League Detail
- **Source doc:** `docs/agents/pages/baseball/league/detail/tabs/commissioner.md`
- **Tab component:** `apps/web/src/pages/baseball/league-detail-v2/tabs/Commish.tsx`
- **Unit spec:** `apps/web/src/pages/baseball/league-detail-v2/tabs/Commish.spec.tsx`
- **Shared commissioner components:** `lib/shared-components/src/features/commissioner/`
- **GraphQL schema:** `lib/graphql/src/commissioner.graphql`
