# Feature: Cross-League Trade Center Overview

**Jira:** LS-5680
**Page:** `trade-center` (Epic LS-5299)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Standalone Trade Center entry showing pending offers, submit-new sections, and
completed history across all of the user's leagues.

The page lives at `/trade-center` and aggregates one `TradingCenter` panel per
league the authenticated user belongs to. Each panel shows:

- Incoming pending trade offers (Accept / Reject)
- Outgoing pending trade offers (Cancel)
- "Propose Trade" multi-step flow
- Completed trade history (collapsed by default)
- Trade block

Leagues are sourced from `getUserLeagueSummaries`. The user's team within each
league is resolved via `userTeamId(leagueId)`. If the user has no team in a
league (result is `null`) the section is hidden.

## Source

Extracted from: `docs/agents/pages/trade-center.md`

## Implementation

**Page component:** `apps/web/src/pages/trade-center/TradeCenterPage.tsx`

**Route:** `/trade-center` (registered in `apps/web/src/app/app.tsx`)

Key sub-components:

| Component                     | File                                                           | Purpose                                                            |
| ----------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| `TradeCenterPage`             | `pages/trade-center/TradeCenterPage.tsx`                       | Page shell — fetches league summaries, renders per-league sections |
| `LeagueTradingSection`        | same file                                                      | Fetches `userTeamId` for one league; renders `TradingCenter`       |
| `TradingCenter` (web wrapper) | `features/baseball/TradingCenter.tsx`                          | Wires WS refresh; delegates to shared `TradingCenter`              |
| `TradingCenter` (shared)      | `lib/shared-components/src/features/leagues/TradingCenter.tsx` | Full trade management UI                                           |

## Test Coverage

Tests: `apps/web/src/pages/trade-center/TradeCenterPage.spec.tsx`

- `describe('TradeCenterPage — Cross-League Trade Center Overview (LS-5680)')`:
  - Renders the page heading
  - Shows a loading spinner while leagues are being fetched
  - Shows an error message when the leagues query fails
  - Shows the empty state when the user has no leagues
  - Renders a league section for each active league
  - Displays the league name in each section
  - Renders TradingCenter with correct leagueId and userTeamId
  - Hides the section when userTeamId is null
  - Shows a per-league spinner while team ID is loading
  - Filters out summaries with null leagueId
