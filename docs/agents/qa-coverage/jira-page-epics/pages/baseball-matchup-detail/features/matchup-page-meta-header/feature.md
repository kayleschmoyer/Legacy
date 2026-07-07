# Feature: Page Meta & Header

**Jira:** LS-5354
**Page:** `baseball-matchup-detail` (Epic LS-5260)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

The top of the Matchup Detail page (`/baseball/league/{leagueId}/matchups/{matchupId}`)
establishes page identity and the primary exit affordance:

- **Dynamic page title/description** — `PageMeta` sets a document `<title>` that reflects
  the current matchup's week (`Week {n} Matchup | Legacy Sports`, falling back to
  `Matchup Details | Legacy Sports` when the week is unknown) and a `meta` description
  that names the week so the page is share-friendly and SEO-legible.
- **"Matchup Details" heading** — an `H2` rendered in the layout header so users always
  know which view they are on.
- **"Back to League" button** — a header button that navigates back to the league detail
  route (`/baseball/league/{leagueId}`). The same affordance is repeated in the error and
  not-found states so the user is never stranded on a dead page.

Because the title and description are derived from the resolved matchup, they only appear
after the matchup query resolves — while loading, the page shows the spinner branch and no
matchup-specific meta.

## Source

Extracted from: `docs/agents/pages/baseball/league/detail/matchups/detail.md`

## Implementation

**Page:** `apps/web/src/pages/matchup/MatchupDetailPage.tsx`

The page composes three pieces at the top of its rendered tree:

| Component / hook      | File                                                                 | Purpose                                                                       |
| --------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `MatchupDetailPage`   | `apps/web/src/pages/matchup/MatchupDetailPage.tsx`                   | Resolves the matchup and renders `PageMeta` + the header slot                 |
| `PageMeta`            | `apps/web/src/components/PageMeta.tsx`                               | Emits `<title>`, `<meta name="description">`, canonical, OG, and Twitter tags |
| `MatchupDetailLayout` | `lib/shared-components/src/features/matchup/MatchupDetailLayout.tsx` | Cross-platform layout that renders the `header` slot (heading + Back button)  |
| `useMatchupById`      | `apps/web/src/hooks/useMatchup.ts`                                   | Supplies `matchup.weekNumber`, which drives the dynamic title/description     |

**Title/description logic** (`MatchupDetailPage.tsx`):

- `title` = `` `Week ${matchup.weekNumber} Matchup` `` when `weekNumber != null`, else
  `'Matchup Details'`. `PageMeta` appends `" | Legacy Sports"`.
- `description` = `` `View Week ${matchup.weekNumber ?? ''} fantasy baseball matchup scores, rosters, and stats on Legacy Sports.` ``

**Header slot** — an `XStack` containing `<H2>Matchup Details</H2>` and a `Back to League`
`Button` whose `onPress` calls `navigate(`/baseball/league/${leagueId}`)`.

## Test Coverage

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/matchup-detail.spec.ts`

All GraphQL responses are mocked (`route.fulfill`); no live backend is required.
`MOCK_MATCHUP.weekNumber === 3`, so the dynamic title/description resolve to Week 3.

`describe('Matchup Detail – page meta @regression')`:

- Sets a dynamic document title reflecting the matchup week (`Week 3 Matchup | Legacy Sports`)
- Sets a meta description mentioning the matchup week

`describe('Matchup Detail – page structure @smoke')`:

- Loads the matchup detail page without errors
- Shows the "Matchup Details" heading
- Shows the "Back to League" button
- Clicking "Back to League" navigates back to the league route

## Related

- **Epic:** LS-5260 — QA — Page: Baseball Matchup Detail
- **Source doc:** `docs/agents/pages/baseball/league/detail/matchups/detail.md`
