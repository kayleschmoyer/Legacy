# Feature: URL Pre-fill and Cancel Navigation

**Jira:** LS-5372
**Page:** `create-league-baseball` (Epic LS-5262)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

League name pre-populated via `?name=` query param; Cancel button navigates
to `/baseball`.

## Source

Extracted from: `docs/agents/pages/baseball/league/create.md`

## Implementation

**Web:** `apps/web/src/pages/baseball/LeagueCreatePage.tsx`

- The `leagueName` field of `formData` is initialized from
  `useSearchParams().get('name')` (trimmed, truncated to
  `MAX_LEAGUE_NAME_LENGTH`).
- The Cancel button (sticky action bar) calls
  `navigate(\`/${formData.sport}\`)`, which resolves to `/baseball` on this page.

**App (mobile-web, android):** `apps/app/src/app/(app)/league/create.tsx`

- Fixed by this ticket — the screen previously ignored the `name` route param
  entirely (`leagueName` always initialized to `''`) and the Cancel button
  called `router.back()` instead of navigating to the sport home route.
- Now reads `useLocalSearchParams<{ name?: string }>()` and seeds both the
  baseball and football form state from it (trimmed, truncated to 50 chars,
  matching this file's existing inline league-name-length validation).
- Cancel now calls `router.navigate(\`/${sport}\`)`, matching the pattern used
elsewhere in the app (e.g. `apps/app/src/app/(app)/baseball/index.tsx`).
- The sibling route wrapper `apps/app/src/app/(app)/baseball/league/create.tsx`
  already forwarded the `name` query param to `/league/create?name=...` via
  `Redirect` — it was simply dropped at the destination screen.

## Test Coverage

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/league-creation-advanced.spec.ts`

`describe('League Creation — Advanced Settings @regression')`:

- "should pre-fill the league name from the `?name=` query param"
- "should navigate to /baseball when Cancel is clicked" (pre-existing)

## Related

- **Epic:** LS-5262 — QA — Page: Create League — Baseball
- **Implementation ref:** `docs/agents/pages/baseball/league/create.md`
