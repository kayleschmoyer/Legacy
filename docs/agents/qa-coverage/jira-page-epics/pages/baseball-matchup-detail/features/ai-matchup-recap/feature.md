# Feature: AI Matchup Recap (Premium)

**Jira:** LS-5349
**Page:** `baseball-matchup-detail` (Epic LS-5260)
**Platforms:** web, mobile-web, android
**Entitlement:** premium

## Description

Premium-gated, AI-generated narrative recap for a completed matchup. Shows a
headline, narrative paragraph, and a "standout performances" highlights list,
with a BLOWOUT or CLOSE GAME badge depending on matchup type. Only shown when
matchup status is `Completed`. The recap is generated server-side by the
`@legacy-sports/narrative` library and exposed via the `recap` field on the
`Matchup` GraphQL type, cached in `matchups.recap_json` after first
generation (LS-5878).

## Source

Extracted from: `docs/agents/pages/baseball/league/detail/matchups/detail.md`

## Implementation

**Shared component (web + mobile/Android):**
`lib/shared-components/src/features/matchup/MatchupRecapPanel.tsx`

Unlike `MatchupWinProbabilityPanel` (implemented separately per platform),
`MatchupRecapPanel` is a single shared component consumed by both:

- `apps/web/src/pages/matchup/MatchupDetailPage.tsx` (web)
- `apps/app/src/features/matchup/screens/MatchupDetailScreen.tsx` (mobile/Android)

Both call it identically as `recapPanel` on `MatchupDetailLayout`:

```
recapPanel={
  matchup.status === MatchupStatus.Completed && matchupIdNum != null ? (
    <PremiumGate
      isPremium={canSeeRecap}
      featureName="AI Matchup Recap"
      featureDescription="Get AI-generated narrative recaps that summarize
      your matchup story, highlights, and standout performances."
    >
      <MatchupRecapPanel matchupId={matchupIdNum} />
    </PremiumGate>
  ) : undefined
}
```

**Data:** `useGetMatchupRecapQuery({ variables: { id: matchupId }, fetchPolicy:
'cache-and-network' })`. `cache-and-network` (not `cache-first`) is
deliberate: a stale cached recap must never be served on its own if a user's
subscription status flips (LS-5875).

**Gate:** `canSeeRecap = useHasEntitlement(ENTITLEMENTS.ai_matchup_recap)` on
both platforms, wrapped in `PremiumGate` with
`featureName="AI Matchup Recap"`. Server-side defense-in-depth: the GraphQL
`Matchup.recap` field resolver
(`lambdas/db/src/schema/matchups/types.ts`) independently gates on
`hasEntitlement(ctx, 'ai_matchup_recap')` and returns `null` for
unauthenticated or free-tier callers, before any team/player data is loaded.

**Visibility/render condition:** the panel is only mounted (on both
platforms) when `matchup.status === MatchupStatus.Completed`. Within the
component itself:

- Loading: renders a `Spinner`.
- Fetch/library error: renders `ErrorState` with a "Matchup recap
  unavailable — we are working on it." message and a retry button that calls
  `refetch()` (deliberately distinct from the "not generated yet" empty
  state, so a real failure never looks the same as a normal `null` recap).
- `data.getMatchupById.recap` is null/undefined: renders `EmptyState` with
  "Recap not generated yet".
- Recap present: renders headline, narrative, and (when
  `highlights.length > 0`) a "STANDOUT PERFORMANCES" section
  (`data-testid="matchup-recap-standout-performances"`), plus a BLOWOUT or
  CLOSE GAME badge based on `matchupType`.

**Backend:** GraphQL field resolver for `Matchup.recap` in
`lambdas/db/src/schema/matchups/` (types.ts), backed by:

- `lambdas/db/src/schema/matchups/recap-entitlement.resolver.spec.ts` —
  entitlement gate ordering (non-completed matchup → unauthenticated → free
  tier → entitled).
- `lambdas/db/src/schema/matchups/recap-cache.resolver.spec.ts` — persisted
  cache in `matchups.recap_json` (LS-5878): serves cached value without
  re-running the ~75-DataLoader fan-out, regenerates on schema-invalid cache
  entries, persists on cache miss, and still returns the recap if persisting
  fails (non-fatal).

## Test Coverage

### Unit tests

File: `lib/shared-components/src/features/matchup/MatchupRecapPanel.spec.tsx`

`describe('MatchupRecapPanel')`:

- renders the headline when data is loaded
- renders the narrative text
- renders highlights
- renders a spinner when loading
- shows a retryable error message instead of a blank space on error
- calls refetch when the retry button is pressed after an error
- logs the error to LOGGER (Rollbar-forwarded) when the query fails
- shows a "recap pending" message (not a blank space) when there is no recap yet
- shows BLOWOUT badge for blowout matchupType
- shows CLOSE GAME badge for close matchupType
- renders the MATCHUP RECAP header
- always re-asks the server instead of trusting a stale cache entry (LS-5875)

Backend field-resolver coverage (entitlement gate + persisted cache) is in
`lambdas/db/src/schema/matchups/recap-entitlement.resolver.spec.ts` and
`recap-cache.resolver.spec.ts` — see `describe('Matchup.recap field —
entitlement gate')` and `describe('Matchup.recap field — persisted cache')`
above under Implementation.

### E2E tests (live backend / integration)

File:
`apps/web-e2e/src/integration/tests/matchup-roster-recap-ui.integration.spec.ts`
(originally filed under LS-597)

`describe.serial('Matchup Roster Comparison & Recap Panel (Live Backend)
@integration @critical')`:

- Phase 0: Provision a completed matchup with a recap
- Phase 3: Recap panel renders for a completed matchup (verifies "MATCHUP
  RECAP" header, non-empty headline, non-empty narrative paragraph, and the
  `matchup-recap-standout-performances` testid section)
- Phase 5: Manager identity can view the recap panel (cross-user visibility)

### E2E tests (hermetic) — gap

Unlike the sibling `win-probability-panel` feature, which has dedicated
hermetic (mocked-backend) E2E coverage in
`apps/web-e2e/src/tests/matchup-week-navigation.spec.ts`, there is **no**
hermetic E2E spec under `apps/web-e2e/src/tests/` that exercises
`MatchupRecapPanel` directly. The only hit for "recap" under
`apps/web-e2e/src/tests/` is an unrelated mock in
`games-remaining-visualization.spec.ts` (a `GetMatchupRecap` GraphQL mock
that returns `recap: null` so that spec's own panel doesn't interfere — it
does not assert anything about the recap panel itself). Live-backend
coverage (Phase 3/5 above) exercises the real rendering path; a hermetic spec
covering the loading/error/empty/blowout/close-game states plus the
free-vs-premium gate would close this gap but is out of scope for this
ticket (documentation-only) — see Open Questions on the parent spec.

## Related

- **Epic:** LS-5260 — QA coverage for `baseball-matchup-detail`
- **Originating gap ticket:** LS-8468 (GAP-001)
- **Implementation ref:** `docs/agents/pages/baseball/league/detail/matchups/detail.md`
- **Sibling:** `win-probability-panel/feature.md` — same page, same gating
  pattern (`PremiumGate` + `useHasEntitlement`), but implemented per-platform
  rather than as a shared component, and does have hermetic E2E coverage.
- **Cache implementation:** LS-5878 (persisted `recap_json` cache)
- **Stale-cache fix:** LS-5875 (`cache-and-network` fetch policy)
