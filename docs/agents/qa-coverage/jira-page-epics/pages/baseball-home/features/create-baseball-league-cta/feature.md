# Feature: Create Baseball League CTA

**Jira:** LS-5337
**Page:** `baseball-home` (Epic LS-5258)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Quick-action CTA on the baseball home page that lets a user create a new baseball
league. Pressing the button opens the `CreateLeagueDialog` modal (quick-create
form). Inside that dialog, an "Advanced settings" link closes the modal and
navigates to `/baseball/league/create` with the partially-entered league name
pre-filled as a query param (`?name=...`).

The button appears in two visual variants depending on whether the user already
has leagues:

| Variant          | Condition               | Label                        |
| ---------------- | ----------------------- | ---------------------------- |
| Full hero        | No leagues yet          | `"Create League"`            |
| Compact hero     | User has ≥ 1 league     | `"+ Create"`                 |
| Empty-state card | No leagues, inside card | `"Create your first league"` |

All variants share the same `accessibilityLabel`: `"Create a new baseball league"`.

On mobile (Android / mobile-web), free-tier users are limited to 3 leagues
(`FREE_TIER_LEAGUE_LIMIT`). When `atLimit: true` the button is **disabled**
(`opacity: 0.5`) and a league-cap indicator ("Your leagues: X/3") with an
"— Upgrade to add more" link is rendered.

## Source

Extracted from: `docs/agents/pages/baseball/leagues.md`

## Implementation

**Shared component:** `lib/shared-components/src/features/baseball/MLBHome.tsx`

The CTA is rendered by `MLBHome` (presentational, cross-platform). Pressing it
sets local state `createDialogOpen: true`, which mounts `CreateLeagueDialog`.

**Quick-create dialog:** `lib/shared-components/src/features/baseball/CreateLeagueDialog.tsx`

The dialog collects 9 fields (league name, number of teams, divisions, player
pool, draft mode, selection method, draft order, max roster size, visibility).
On submit it invokes the `onCreateLeague` callback. An "Advanced settings" link
calls the `onAdvancedCreate(leagueName)` callback, which the web wrapper uses to
navigate.

**Web data wrapper:** `apps/web/src/components/baseball/BaseballScreen.tsx`

```ts
onAdvancedCreate={(name) => {
  const params = name.trim() ? `?name=${encodeURIComponent(name.trim())}` : '';
  navigate(`/baseball/league/create${params}`);
}}
```

The `onCreateLeague` callback fires `useCreateLeagueAndTeamsMutation` and
navigates to `/baseball/league/{newLeagueId}` on success.

**Mobile data wrapper:** `apps/app/src/app/(app)/baseball/index.tsx`

Passes `leagueCap={{ count, limit: 3, atLimit, onUpgrade }}` to `MLBHome` when
the free-tier cap is reached. The `onAdvancedCreate` prop is omitted on mobile
(no advanced-form route on the native side).

**Advanced create destination:** `apps/web/src/pages/baseball/LeagueCreatePage.tsx`

Route `/baseball/league/create` — reads the `?name` param to pre-fill the league
name input.

## Test Coverage

### Unit tests

File: `lib/shared-components/src/features/baseball/MLBHome.spec.tsx`

`describe('MLBHome')`:

- Shows the full hero and empty state when the user has no leagues
- Shows the compact hero and league list when the user has leagues
- Opens the create dialog when "Create League" is pressed
- Renders the league-cap indicator and disables Create at the cap

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/baseball-ui.spec.ts`

`describe('Baseball Hub Page @critical')`:

- Displays Create League and Join League action buttons
- Create League button navigates to league creation page

## Related

- **Epic:** LS-5258 — QA — Page: Baseball Home
- **Quick-create dialog:** `lib/shared-components/src/features/baseball/CreateLeagueDialog.tsx`
- **Advanced create page:** `apps/web/src/pages/baseball/LeagueCreatePage.tsx`
- **Implementation ref:** `docs/agents/pages/baseball/leagues.md`
