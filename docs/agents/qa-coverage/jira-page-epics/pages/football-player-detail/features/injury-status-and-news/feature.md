# Feature: Injury Status and News

**Jira:** LS-5436
**Page:** `football-player-detail` (Epic LS-5270)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Displays current injury status, designations, and player news/notes on the
Football Player Detail page when the data is available. The feature renders
below the player identity header and above the career stats section.

## Source

Extracted from: `inferred from docs/agents/pages/football/players.md`

## Implementation

**Component:** `lib/shared-components/src/features/football/FootballPlayerDetail.tsx`

### Injury Banner

Shown when `player.injuryStatus` is a non-empty string. The banner renders a
colour-coded pill whose tint maps to the severity of the designation:

| Status (case-insensitive)    | Colour     |
| ---------------------------- | ---------- |
| `Out`, `IR`, `PUP`           | Seam Red   |
| `Doubtful`                   | Orange     |
| `Questionable`, `Day-to-day` | Amber      |
| Any other value              | Muted grey |

The `injuryDesignation` (e.g. `"Right Knee"`) is appended inline when present.

`data-testid="injury-banner"` — used by unit and E2E tests.

### News Card

Shown when `player.news` is a non-empty string. Renders a dark card labelled
**"Latest News"** (brand-gold eyebrow) with the news text in body copy below.

`data-testid="news-card"` — used by unit and E2E tests.

### GraphQL

The `FootballPlayer` GraphQL type was extended with three nullable fields
(LS-5436):

```graphql
injuryStatus: String
injuryDesignation: String
news: String
```

These fields are included in the `FootballPlayer` fragment
(`lib/shared-components/src/api/db/footballPlayer.fragment.graphql`) and
therefore flow through `useGetFootballPlayerQuery` to both the web page
(`apps/web/src/pages/football/FootballPlayerDetailPage.tsx`) and the mobile
screen (`apps/app/src/app/(app)/football/players/[playerId].tsx`) without
any additional page-level changes.

## Test Coverage

### Unit tests

File: `lib/shared-components/src/features/football/FootballPlayerDetail.spec.tsx`

`describe('injury status and news (LS-5436)')`:

- Shows the injury banner when `injuryStatus` is provided
- Shows injury designation alongside the status
- Does not render the injury banner when `injuryStatus` is absent
- Shows the news card when `news` is provided
- Does not render the news card when `news` is absent
- Shows both injury banner and news card together

## Related

- **Epic:** LS-5270 — QA — Page: Football Player Detail
- **Schema change:** `lambdas/db/schema.graphql` — `FootballPlayer` type
- **Fragment:** `lib/shared-components/src/api/db/footballPlayer.fragment.graphql`
