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

(`TeamDetailPage.tsx:140-144`)

### Trigger conditions

The effect fires whenever `teamIdNum` (parsed from the route `:teamId` param) and `leagueId`
are both truthy. `leagueId` resolves from one of two GraphQL sources, whichever returns first:
`membersData?.teamMembers?.[0]?.leagueId` (populated once the roster has members) falling back
to `teamByIdData?.team?.leagueId` (covers empty-roster teams, LS-1330) — see
`TeamDetailPage.tsx:92-94`. Because `teamIdNum` defaults to `0` for an invalid team ID and `0`
is falsy, the effect never fires for an invalid/unparseable team ID.

### No dedupe guard (gap vs. the matchup page)

Unlike `MatchupDetailPage.tsx`, `TeamDetailPage.tsx` keeps **no ref-based dedupe key** — the
`useEffect` dependency array `[teamIdNum, leagueId]` is the only guard against a duplicate
fire. Compare `MatchupDetailPage.tsx:83-94`, which is the "matchup page's approach" the GAP-002
finding referenced:

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

`MatchupDetailPage` builds a composite key and short-circuits a repeat fire with the same key,
even across re-renders where the dependency array identity is unchanged but the effect would
otherwise re-run for other reasons. `TeamDetailPage` has no equivalent ref/key guard — if
`teamIdNum`/`leagueId` change and change back (e.g. `leagueId` flips between its two possible
sources as queries resolve at different times), the event can fire more than once for what is
effectively the same team view. This is a documented gap, not a fix — see
[Out of scope](#out-of-scope-carried-from-ls-7686) below.

### Silent no-op when GA is unconfigured

`trackTeamViewed` (`apps/web/src/utils/analytics.ts:166-172`) delegates to `trackEvent`
(`analytics.ts:93-106`), which early-returns with no side effect when `!window.gtag ||
!env.googleAnalyticsMeasurementId` (`analytics.ts:96-98`). `env.googleAnalyticsMeasurementId` is
wired from `apps/web/src/config/environment.ts`. Practically: in local dev and any environment
without a configured GA4 measurement ID, calling `trackTeamViewed` is a safe no-op — no error,
no network call, no console noise beyond the module's own `LOGGER.info` calls (which are gated
behind the same guard and never reached in the no-op path).

## Test Coverage

### Unit tests

**File:** `apps/web/src/pages/baseball/TeamDetailPage.spec.tsx`

- Asserts `trackTeamViewed` is called once with the resolved `(teamIdNum, leagueId)` once both
  values are available.
- Asserts `trackTeamViewed` is not called before `leagueId` resolves.
- Documents current behavior when `leagueId` changes between renders for the same team (fires
  again — no dedupe ref exists today, the test asserts today's actual call count rather than an
  aspirational deduped one).
- Documents current behavior on a no-op re-render with an unchanged `teamId`/`leagueId` (does
  not fire again — React's own dependency-array diffing, not an explicit dedupe ref).

### E2E tests

No E2E spec exists or is required — GA4 emission has no user-facing DOM signal, so it falls
outside the Playwright hermetic-spec model. Confirmed no existing
`apps/web-e2e/src/tests/**` spec references `trackTeamViewed`, `trackMatchupViewed`, or `gtag`.

## Out of scope (carried from LS-7686)

- Adding a dedupe ref (`lastTrackedTeamViewKeyRef`, matching `MatchupDetailPage.tsx:83`) to
  `TeamDetailPage.tsx` is optional and was not made as part of documenting this feature —
  production tracking behavior was intentionally left unchanged. A follow-up ticket should
  decide this explicitly if dedupe parity with the matchup page is wanted.
- Broader GA4/analytics architecture changes (e.g. changing `trackEvent`'s no-op guard) are out
  of scope.

## Related

- **Epic:** LS-5261 — QA — Page: Baseball Team Detail
- **Origin finding:** LS-7686 (GAP-002), re-parented under this Feature Story per the
  QA-coverage model
- **Implementation ref:** `apps/web/src/pages/baseball/TeamDetailPage.tsx:140-144`
- **Analytics util:** `apps/web/src/utils/analytics.ts` (`trackTeamViewed`, `trackEvent`)
- **Dedupe-ref pattern reference:** `apps/web/src/pages/matchup/MatchupDetailPage.tsx:83-94`
  (`trackMatchupViewed`)
