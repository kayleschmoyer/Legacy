# Feature: Team Detail Analytics Tracking

**Jira:** LS-8581
**Page:** `baseball-team-detail` (Epic LS-5261)
**Platforms:** web
**Entitlement:** all

## Description

On team roster load, the Baseball Team Detail page fires a GA4 `team_viewed` event via
`trackTeamViewed(teamId, leagueId)`. This is a pure analytics side effect — it has no visible
UI and is not user-facing DOM behavior — but it is a feature the QA-coverage inventory should
enumerate: when it fires, how it behaves on repeated renders, and how it degrades when GA is
unconfigured.

This Feature Story was created from code-audit GAP-002 (LS-7686): the tracking call was live
and unit-mocked but had no Feature Story and no assertion that it was actually invoked with the
right arguments.

## Source

Extracted from code audit (Feature Discovery From Code lens), GAP-002 under the Baseball Team
Detail page epic (LS-5261). Recommendation: create Feature Story
`team-detail-analytics-tracking`.

## Implementation

**File:** `apps/web/src/pages/baseball/TeamDetailPage.tsx`

```tsx
useEffect(() => {
  if (teamIdNum && leagueId) {
    trackTeamViewed(teamIdNum, leagueId);
  }
}, [teamIdNum, leagueId]);
```

(`TeamDetailPage.tsx:297-301`)

### Trigger conditions

The effect fires whenever `teamIdNum` (parsed from the route `:teamId` param) and `leagueId`
are both truthy. `leagueId` resolves from one of two GraphQL sources, whichever returns first:
`membersData?.teamMembers?.[0]?.leagueId` (populated once the roster has members) falling back
to `teamByIdData?.team?.leagueId` (covers empty-roster teams, LS-1330) — see
`TeamDetailPage.tsx:236-237`. Because `teamIdNum` defaults to `0` for an invalid team ID and `0`
is falsy, the effect never fires for an invalid/unparseable team ID.

### Dedupe: no component-level ref guard, but the analytics util has its own

**Component layer:** unlike `MatchupDetailPage.tsx`, `TeamDetailPage.tsx` keeps **no ref-based
dedupe key** — the `useEffect` dependency array `[teamIdNum, leagueId]` is the only guard
against a duplicate fire at the call site. Compare `MatchupDetailPage.tsx:83-94`, which is the
"matchup page's approach" the original GAP-002 finding referenced:

```tsx
const lastTrackedMatchupViewKeyRef = useRef<string | null>(null);
useEffect(() => {
  if (!matchup || !matchupIdNum || !leagueIdNum || currentWeek == null) return;
  const key = `${leagueIdNum}-${matchupIdNum}-${currentWeek}`;
  if (lastTrackedMatchupViewKeyRef.current === key) return;
  trackMatchupViewed(matchupIdNum, leagueIdNum, currentWeek);
  lastTrackedMatchupViewKeyRef.current = key;
}, [matchup, matchupIdNum, leagueIdNum, currentWeek]);
```

`MatchupDetailPage` builds a composite key in the component itself and short-circuits a repeat
fire with the same key. `TeamDetailPage` has no equivalent component-level ref/key guard — if
`teamIdNum`/`leagueId` change and change back (e.g. `leagueId` flips between its two possible
sources as queries resolve at different times), the _call_ to `trackTeamViewed` can happen more
than once for what is effectively the same team view. This scenario is exactly what
`TeamDetailPage.spec.tsx`'s "fires again when leagueId changes between renders" test documents.

**Analytics-utility layer:** `trackTeamViewed` itself is _not_ a thin pass-through to
`trackEvent` — it has its own dedupe, added under LS-6050, via the `isTeamViewedDeduped`
helper (`analytics.ts:170-188`):

```tsx
export function trackTeamViewed(teamId: number, leagueId: number): void {
  if (isTeamViewedDeduped(teamId, leagueId)) return;

  trackEvent('team_viewed', {
    team_id: teamId,
    league_id: leagueId,
    category: 'team',
  });
}
```

(`analytics.ts:197-205`)

`isTeamViewedDeduped` keys a `sessionStorage` entry as `` `analytics:team_viewed:${teamId}:${leagueId}` ``
and suppresses a repeat call for the **same** `(teamId, leagueId)` tuple within a 5-minute
window (`TEAM_VIEWED_DEDUPE_WINDOW_MS`), surviving unmount/remount (e.g. back-forward
navigation), not just re-renders. So in practice: a genuine duplicate fire for the _same_ team
view within 5 minutes is suppressed at this layer even without a component-level ref guard. The
residual gap noted above (leagueId flipping between two _different_ values and back) is **not**
covered by this dedupe, because each distinct `leagueId` produces a distinct
`sessionStorage` key — this is the one case where a real double-fire can still reach `gtag`.

This two-layer split — no ref guard in the component, a time-windowed dedupe in the analytics
util — is a documented characteristic of the current code, not a fix; see
[Out of scope](#out-of-scope-carried-from-ls-7686) below.

### Silent no-op when GA is unconfigured

`trackEvent` (`analytics.ts:93-106`, called by `trackTeamViewed` after the dedupe check above)
early-returns with no side effect when `!window.gtag || !env.googleAnalyticsMeasurementId`
(`analytics.ts:96-98`). `env.googleAnalyticsMeasurementId` is wired from
`apps/web/src/config/environment.ts`. Practically: in local dev and any environment without a
configured GA4 measurement ID, calling `trackTeamViewed` is a safe no-op — no error, no network
call, no console noise beyond the module's own `LOGGER.info` calls (which are gated behind the
same guard and never reached in the no-op path).

## Test Coverage

### Unit tests

**File:** `apps/web/src/pages/baseball/TeamDetailPage.spec.tsx` (`trackTeamViewed` is mocked in
this file, so these tests exercise the component's call site, not the analytics-utility dedupe
below):

- Asserts `trackTeamViewed` is called once with the resolved `(teamIdNum, leagueId)` once both
  values are available.
- Asserts `trackTeamViewed` is not called before `leagueId` resolves.
- Documents current behavior when `leagueId` changes between renders for the same team (fires
  again — no component-level dedupe ref exists today, the test asserts today's actual call
  count rather than an aspirational deduped one).
- Documents current behavior on a no-op re-render with an unchanged `teamId`/`leagueId` (does
  not fire again — React's own dependency-array diffing, not an explicit dedupe ref).

**File:** `apps/web/src/utils/analytics.spec.ts` (`describe('trackTeamViewed de-dupe (LS-6050)')`
— exercises the real `isTeamViewedDeduped` sessionStorage guard, unmocked):

- Fires once for a repeated `(teamId, leagueId)` tuple within the 5-minute window.
- Fires again for the same tuple once the window has elapsed.
- Does not de-dupe across different `(teamId, leagueId)` tuples.
- Does not throw when `sessionStorage` is unavailable (falls back to always tracking).

### E2E tests

No E2E spec exists or is required — GA4 emission has no user-facing DOM signal, so it falls
outside the Playwright hermetic-spec model. Confirmed no existing
`apps/web-e2e/src/tests/**` spec references `trackTeamViewed`, `trackMatchupViewed`, or `gtag`.

## Out of scope (carried from LS-7686)

- Adding a _component-level_ dedupe ref (`lastTrackedTeamViewKeyRef`, matching
  `MatchupDetailPage.tsx:83`) to `TeamDetailPage.tsx` is optional and was not made as part of
  documenting this feature — production tracking behavior was intentionally left unchanged. In
  particular the residual leagueId-flip double-fire case (see above) is not addressed by the
  existing `analytics.ts` sessionStorage dedupe. A follow-up ticket should decide this
  explicitly if full dedupe parity with the matchup page is wanted.
- Broader GA4/analytics architecture changes (e.g. changing `trackEvent`'s no-op guard or
  `isTeamViewedDeduped`'s window/key scheme) are out of scope.

## Related

- **Epic:** LS-5261 — QA — Page: Baseball Team Detail
- **Origin finding:** LS-7686 (GAP-002), re-parented under this Feature Story per the
  QA-coverage model
- **Implementation ref:** `apps/web/src/pages/baseball/TeamDetailPage.tsx:297-301`
- **Analytics util:** `apps/web/src/utils/analytics.ts` (`trackTeamViewed`, `isTeamViewedDeduped`,
  `trackEvent`)
- **Dedupe-ref pattern reference:** `apps/web/src/pages/matchup/MatchupDetailPage.tsx:83-94`
  (`trackMatchupViewed`)
