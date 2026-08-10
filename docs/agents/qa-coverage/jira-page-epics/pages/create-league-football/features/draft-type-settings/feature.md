# Feature: Draft Type & Settings

**Jira:** LS-5375
**Page:** `create-league-football` (Epic LS-5263)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

The Draft Settings section of the Create Football League form lets a
commissioner configure how the league's draft will run: draft mode
(live/automated), selection method (standard/auction/random), draft order
(snake/linear), auction budget/minimum bid (auction only), and pick-timer
length (live drafts only).

Selecting "Automated" for draft mode forces the selection method to
"Random". Auction budget/min-bid inputs only render when "Auction" is the
selection method and the draft is not automated. The pick timer only
renders for live drafts.

## Source

Extracted from: `docs/agents/pages/football/league/create.md`

## Folder

`docs/agents/qa-coverage/jira-page-epics/pages/create-league-football/features/draft-type-settings/feature.md`

## Implementation

**Component:** `apps/web/src/pages/baseball/LeagueCreatePage.tsx` — despite
the file's path, this is the shared, sport-aware Create League form used for
both `/baseball/league/create` and `/football/league/create` (branches
internally on `formData.sport`). Draft Settings is `CollapsibleSection`
`id="draft"`.

**Form state:** `draftMode`, `selectionMethod`, `draftOrder`, `auctionBudget`,
`auctionMinBid`, `pickTimeLimitSeconds` on `CreateLeagueFormData`. Selecting
`draftMode: 'automated'` forces `selectionMethod` to `'random'` (see
`handleInputChange` in `LeagueCreatePage.tsx`).

**GraphQL:** `CreateLeagueAndTeamsInput` (`lambdas/db/schema.graphql`) persists
these as `draftOrder`, `selectionMethod`, `draftMode`, `pickTimeLimitSeconds`,
`auctionBudget`, `auctionMinBid` on the created `League`.

## Test Coverage

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/league-creation-draft-settings-football.spec.ts`

- Selection Method (Standard/Auction) and Draft Order (Snake/Linear) options
  are visible in the football Draft Settings section
- Selecting Auction reveals the Auction Budget / Minimum Bid inputs;
  selecting Standard hides them again
- A live draft shows the pick-timer control (Time Per Pick); switching to
  Automated Draft hides it
- Submitting with Auction + Snake + a chosen pick-timer value persists
  `selectionMethod`, `draftOrder`, `draftMode`, `pickTimeLimitSeconds`,
  `auctionBudget`, and `auctionMinBid` on the `CreateLeagueAndTeams`
  mutation input
- Submitting with Automated Draft persists the forced `selectionMethod:
'random'` and omits the pick timer

## Related

- **Epic:** LS-5263 — QA — Page: Create League — Football
- **Baseball analog:** LS-5367 — `create-league-baseball/features/draft-settings-section/feature.md`
