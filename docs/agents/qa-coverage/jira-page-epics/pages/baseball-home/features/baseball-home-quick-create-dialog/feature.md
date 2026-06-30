# Feature: Baseball Home Quick-Create League Dialog

**Jira:** LS-7624
**Page:** `baseball-home` (Epic LS-5258)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

The baseball home page (`/baseball`) hosts a quick-create league dialog that lets a
user configure and create a new baseball league **without leaving the home page**.
This is a distinct surface from the full league wizard at `/baseball/league/create`
(the `LeagueCreatePage`). Both paths invoke the same `useCreateLeagueAndTeamsMutation`
but the quick-create dialog has a reduced, opinionated form with sensible defaults so
commissioners can get a league created in seconds.

The dialog is opened when any "Create League" CTA on `MLBHome` is pressed (see
`create-baseball-league-cta` feature). It is implemented as the shared, data-free
`CreateLeagueDialog` component (`lib/shared-components/src/features/baseball/CreateLeagueDialog.tsx`),
which is consumed by both the web and mobile data wrappers.

### Form Fields and Defaults

| Field             | Type           | Default    | Validation                                                                             |
| ----------------- | -------------- | ---------- | -------------------------------------------------------------------------------------- |
| League Name       | Text input     | _(empty)_  | 3–50 characters; required                                                              |
| Number of Teams   | Option buttons | `12`       | One of: 4, 6, 8, 10, 12, 14, 16                                                        |
| Divisions         | Option buttons | `2`        | One of: 1, 2, 3, 4                                                                     |
| Player Pool       | Option buttons | `all`      | `all` \| `nl` \| `al`                                                                  |
| Draft Mode        | Option buttons | `live`     | `live` \| `automated`                                                                  |
| Selection Method  | Option buttons | `standard` | `standard` \| `auction` \| `random`; locked to `random` when Draft Mode is `automated` |
| Draft Order       | Option buttons | `snake`    | `snake` \| `linear`                                                                    |
| Max Roster Size   | Option buttons | `25`       | One of: 20, 22, 25, 30, 35, 40                                                         |
| League Visibility | Option buttons | `private`  | `private` \| `public`                                                                  |

The **Create League** submit button is disabled until the league name meets the
minimum length requirement (≥ 3 characters, trimmed). Inputs are disabled during
submission (`busy` state combines external `submitting` prop and internal `pending`
flag).

### Error Handling

If `onSubmit` rejects (e.g. GraphQL mutation failure), the dialog:

- Stays open so the user can retry without re-entering their settings
- Renders an inline error banner (role `alert`) with the error message
- Re-enables inputs for retry

A generic fallback message is shown when the error carries no message:
`"Failed to create league. Please try again."`

Closing the dialog at any time (Cancel button or overlay click) resets all form
fields to their defaults and clears any displayed error.

### Advanced Settings Link (web only)

On the web wrapper, an **"Advanced settings →"** link is visible at the bottom-left
of the dialog footer. Pressing it:

1. Closes the dialog (form is reset)
2. Navigates to `/baseball/league/create` — the full `LeagueCreatePage`
3. Pre-fills the league name via query param: `?name=<encodedName>` (only appended
   when the name field is non-empty after trimming)

On mobile (`apps/app`) the `onAdvanced` prop is omitted so the link is hidden; the
full advanced-create route does not exist on the native side.

### Parity with the Full Wizard

| Aspect                 | Quick-create dialog          | Full wizard (`/baseball/league/create`) |
| ---------------------- | ---------------------------- | --------------------------------------- |
| Fields collected       | 9 (see table above)          | Superset — additional scheduling,       |
|                        |                              | scoring, and playoff settings           |
| Navigation on success  | Stay on `/baseball`          | Navigate to new league page             |
| Inline validation      | Name length only             | Full field-level validation per step    |
| Platform support       | Web + mobile                 | Web only                                |
| Advanced-settings link | Present (web) / hidden (app) | N/A                                     |

## Source

- **Shared dialog component:** `lib/shared-components/src/features/baseball/CreateLeagueDialog.tsx`
- **Web data wrapper:** `apps/web/src/components/baseball/BaseballScreen.tsx`
- **Mobile data wrapper:** `apps/app/src/app/(app)/baseball/index.tsx`
- **Advanced create destination:** `apps/web/src/pages/baseball/LeagueCreatePage.tsx`

## Test Coverage

### Unit tests

**File:** `lib/shared-components/src/features/baseball/CreateLeagueDialog.spec.tsx`

`describe('CreateLeagueDialog')`:

- `'renders the settings form when open'`
  — asserts form description text and league-name placeholder are present
- `'renders nothing when closed'`
  — asserts dialog content is absent when `open={false}`
- `'labels the one-division option as 1 (not None)'`
  — asserts the 1-division option button displays "1" (not "None")
- `'disables submit until the league name is valid'`
  — fills 2-char name (still disabled), then 8-char name (enabled)
- `'submits the form payload and closes on success'`
  — fills name, clicks Create League, asserts `onSubmit` called with correct payload,
  asserts `onOpenChange(false)` fired on resolution
- `'shows an inline error and stays open when creation fails'`
  — mocks rejected `onSubmit`; asserts `role="alert"` banner shows the error message
  and `onOpenChange(false)` is NOT called
- `'submits when Enter is pressed in the league name input'`
  — asserts keyboard submission via the `onSubmitEditing` / Enter keydown path

### E2E tests (hermetic — web only)

> No dedicated E2E spec file exists yet for the quick-create dialog flow. The
> `baseball-ui.spec.ts` suite covers the CTA button click and navigation but does
> not enter the dialog form itself. Adding dialog-level E2E coverage is the next
> gap (form submission, error banner, Advanced settings navigation).

## Related

- **Epic:** LS-5258 — QA — Page: Baseball Home
- **CTA entry point:** `docs/agents/qa-coverage/jira-page-epics/pages/baseball-home/features/create-baseball-league-cta/feature.md`
- **Advanced create page:** `apps/web/src/pages/baseball/LeagueCreatePage.tsx`
- **Dialog component:** `lib/shared-components/src/features/baseball/CreateLeagueDialog.tsx`
- **Unit spec:** `lib/shared-components/src/features/baseball/CreateLeagueDialog.spec.tsx`
