# Feature: AI Matchup Recap Premium Gate

**Jira:** LS-8467
**Page:** `baseball-matchup-detail` (Epic LS-5260)
**Platforms:** web
**Entitlement:** `ai_matchup_recap`

## Description

Premium-gated wrapper around the AI-generated narrative recap on the matchup
detail page. Only shown once a matchup is `completed`. This is a distinct
feature surface from the recap content itself (covered by the separate
ai-matchup-recap Feature Story) — it documents the gating layer: the
free-user overlay, upgrade CTA copy, click-to-upgrade modal trigger, and the
analytics events fired on block/click.

## Implementation

**Web component:** `apps/web/src/pages/matchup/MatchupDetailPage.tsx:250-260`

The recap panel block wraps `MatchupRecapPanel` in `PremiumGate`:

```tsx
<PremiumGate
  isPremium={canSeeRecap}
  featureName="AI Matchup Recap"
  featureDescription="Get AI-generated narrative recaps that summarize your matchup story, highlights, and standout performances."
>
  <MatchupRecapPanel matchupId={matchupIdNum} />
</PremiumGate>
```

`canSeeRecap` is defined at `MatchupDetailPage.tsx:71` as
`useHasEntitlement(ENTITLEMENTS.ai_matchup_recap)`. The panel block is only
rendered when `matchup.status === MatchupStatus.Completed`
(`MatchupDetailPage.tsx:251`) — the recap does not exist for matchups that
have not finished.

**Gate component:** `apps/web/src/components/PremiumGate.tsx` always mounts
`children` (blurred, `pointer-events: none` for free users — lines 118-131),
renders the `data-testid="premium-feature-gate"` overlay with "Premium
Feature" copy and an "Upgrade to Premium" button only for free users (lines
134-205), and fires `trackPremiumFeatureClick(featureName)` on CTA click
(line 97) before opening `UpgradeModal` (lines 208-215). A blocked-view event
(`trackPremiumFeatureBlocked`) fires once per session the first time a free
user sees the gate (lines 85-94).

**Gated content:** `lib/shared-components/src/features/matchup/MatchupRecapPanel.tsx`
fetches the recap via `useGetMatchupRecapQuery` (`fetchPolicy:
'cache-and-network'`) regardless of entitlement — because `PremiumGate`
always mounts its children, this query fires even for free users, so any
E2E mock must stub `GetMatchupRecap` on both the free and premium paths.

## Test Coverage

### Unit tests

`trackPremiumFeatureClick` / `trackPremiumFeatureBlocked` are already
unit-asserted generically (module-mocked) in
`apps/web/src/components/PremiumGate.spec.tsx` — no page-specific analytics
unit test is needed here.

`apps/web/src/pages/matchup/MatchupDetailPage.spec.tsx` mocks `PremiumGate`
to a pass-through (`({ children }) => children`), so the page-level unit
test does not exercise gating — the gate is covered only at the E2E layer
below.

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/matchup-detail-recap-premium-gate.spec.ts`

`describe('Matchup Detail Recap – premium gate (free user) @regression')`:

- Free user sees the `premium-feature-gate` overlay instead of the recap
  for a completed matchup
- Free user sees the recap's `featureDescription` copy in the overlay
- "Upgrade to Premium" CTA opens the `UpgradeModal` dialog

`describe('Matchup Detail Recap – premium gate (premium user) @regression')`:

- Premium user does not see the `premium-feature-gate` overlay
- Premium user sees the recap content (headline text from the mocked recap)

## Related

- **Epic:** LS-5260 — QA coverage for `baseball-matchup-detail`
- **Originating gap ticket:** LS-7629 (GAP-002)
- **Sibling pattern:** `features/win-probability-panel/feature.md` (LS-5358) — the
  Matchup Projections gate on the same page, documented the same way
