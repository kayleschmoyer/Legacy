# Feature: `football_enabled` Feature-Flag Gate

**Jira:** LS-7687
**Page:** `create-league-football` (Epic LS-5263)
**Platforms:** web
**Entitlement:** all

## Description

Access to Football league creation (`/football/league/create`) is controlled
by the GrowthBook `football_enabled` flag at two independent layers: a
route-level redirect guard and an in-page sport-switcher control. Both layers
currently use the **same fail-open fallback**, so they agree with each other
in every SDK state (loading, keyless, resolved true, resolved false).

This doc corrects the premise of the original finding (GAP-001): the route is
**not** ungated, and as of LS-9128/LS-9130 the sport-switcher tile is no
longer a separate fail-closed filter either — see [Corrected repro
conditions](#corrected-repro-conditions-vs-original-finding) below.

## Source

Extracted from finding `GAP-001` (feature-discovery-gaps, non-premium
variant) against `apps/web/src/pages/baseball/LeagueCreatePage.tsx`.

## Folder

`docs/agents/qa-coverage/jira-page-epics/pages/create-league-football/features/feature-flag-gate/feature.md`

## Implementation

### Route-level gate (redirect)

**Component:** `FootballGate` — `apps/web/src/app/app.tsx:217-225`

```typescript
function FootballGate({ children }: { children: React.ReactNode }): React.ReactNode {
  const footballEnabled = useFeatureValue('football_enabled', true);
  if (footballEnabled === false) return <Navigate to="/" replace />;
  return children;
}
```

Every `/football/*` route, including `/football/league/create`
(`app.tsx:665-670`), is wrapped in `FootballGate`. The fallback is `true`
(fail-open): only an **explicit** `false` resolution redirects to `/`. While
GrowthBook is still loading, or no client key is configured, `footballEnabled`
stays `true` and the route renders normally. This is deliberate — see
`docs/feature-flags.md` § "asymmetric fallbacks" — a `false` fallback would
flash-redirect users mid-load and break keyless E2E environments.

### In-page sport-switcher control

**Component:** `LeagueCreatePage.tsx:1655-1670` (hook), `SportSwitcher`
(`LeagueCreatePage.tsx:890-910`, rendered at `:2725`)

```typescript
// Falls back to `true` (rather than `useFeatureIsOn`'s implicit `false`)
// so the tab doesn't lock while GrowthBook is still loading or the flag is
// unconfigured (LS-9130) — same default as the route guard in app.tsx.
const footballEnabled = useFeatureValue('football_enabled', true);
// Sports the flag hasn't unlocked yet stay in the tab list but render
// disabled (LS-9128) — filtering them out entirely hid the option instead
// of showing the user it exists but isn't available.
const unavailableSports = useMemo(
  () => new Set<SportId>(footballEnabled ? [] : ['football']),
  [footballEnabled],
);
```

`unavailableSports` is passed to `SportSwitcher`, which renders the Football
tab with `aria-disabled`, a Lock affordance, `opacity={0.5}`, and a blocked
`onPress` (`LeagueCreatePage.tsx:902-960`) rather than removing the tab.

`selectedSport` (`LeagueCreatePage.tsx:1719`) is derived independently from
`location.pathname` via `sportFromPathname`, not from the flag — it doesn't
need to be, because by the time this component renders, `FootballGate` has
already redirected away for the one state (`footballEnabled === false`) where
football access should be blocked.

## Corrected repro conditions (vs. original finding)

The original finding assumed: (a) the route is ungated, and (b)
`LeagueCreatePage.tsx` fail-closed-filters the Football tile out of the
switcher, disagreeing with the route. Both are inaccurate against current
code:

- **(a) is false** — `FootballGate` redirects `/football/league/create` to
  `/` whenever GrowthBook has resolved `football_enabled` to `false`. The
  "form fully renders despite the flag being off" repro step only reproduces
  during the fail-open window (SDK still loading, or no client key
  configured) — not against a live GrowthBook key with the flag explicitly
  off, which is what the original repro implied.
- **(b) is no longer true** — as of LS-9128/LS-9130 (after this ticket was
  filed), the sport-switcher hook was changed from `useFeatureIsOn`
  (fail-closed) to `useFeatureValue('football_enabled', true)` (fail-open),
  matching the route guard, and the Football tile is now rendered disabled
  rather than removed. The two layers no longer disagree in any SDK state.

**No code change is required by this ticket.** Both gates already agree and
already implement a deliberate, documented soft-gate policy (see
`docs/feature-flags.md`).

## Test Coverage

### Coverage gaps

No hermetic E2E test currently asserts the `FootballGate` redirect for
`/football/league/create` when `football_enabled` resolves to `false`, nor
that the Football tab is disabled-but-visible in `SportSwitcher` under the
same condition. Candidate follow-up under `apps/web-e2e` (see
`.agents/skills/testing/SKILL.md` for `seedFeatureFlags` conventions) — not
added under this ticket (docs-only scope).

## Related

- **Epic:** LS-5263 — QA — Page: Create League — Football
- **Flag inventory / fallback policy:** `docs/feature-flags.md`
- **Route guard:** `apps/web/src/app/app.tsx:217-225`
- **Sport-switcher fail-open fix:** LS-9128, LS-9130
