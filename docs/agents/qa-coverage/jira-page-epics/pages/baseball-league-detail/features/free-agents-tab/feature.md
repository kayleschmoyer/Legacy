# Feature: Free Agents Tab

**Jira:** LS-5341
**Page:** `baseball-league-detail` (Epic LS-5259)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Available players not on any roster in the league, displayed with Hitters/Pitchers
sub-tabs, position filters, name search, 50/page pagination, and category-specific
stat columns. Claim/waiver actions are available to members who are on a team.

The tab lives at `/baseball/league/{leagueId}/free-agents` and is visible to all
users (spectators can browse; members with a team can claim).

Key behaviours:

- **Sub-tabs** — Hitters (C · 1B · 2B · 3B · SS · OF · DH) and Pitchers (SP · RP)
- **Hitter columns** — PTS · PROJ · AVG · HR · RBI · SB · oWAR
- **Pitcher columns** — PTS · PROJ · ERA · W · K · SV · WHIP
- **Position filter** — scrollable pill row that scopes the query to a specific
  position within the active sub-tab; resets to ALL when the sub-tab changes
- **Name search** — debounced (300 ms) input passed as the `search` variable to
  `GetPlayersWithStats`; resets pagination on change
- **Pagination** — 50 players per page; previous/next chevron buttons; "Showing
  N–M" range label
- **Rostered-player exclusion** — `useLeagueTakenPlayers` fetches all team rosters
  and hides already-rostered players from the free-agent pool
- **Spectator banner** — shown when `isMember === false`; browse-only message
- **Join-team banner** — shown when `isMember && myTeamId == null`; prompts the
  member to join a team before claiming
- **Claim action** — rendered per-row only for `isMember && myTeamId != null`;
  provided via the `renderClaimAction` callback so each platform supplies its own
  claim flow (web: `WaiverClaimModal`; native: inline FAAB cluster)
- **Waiver type** — FAAB leagues show a bid input in the claim UI; standard waiver
  leagues show a simple confirm

## Source

Extracted from: `docs/agents/pages/baseball/league/detail/tabs/free-agents.md`

## Implementation

**Shared component:** `lib/shared-components/src/features/baseball/LeagueDetailFreeAgentsTab.tsx`

**Web wrapper:** `apps/web/src/pages/baseball/league-detail-v2/tabs/FreeAgents.tsx`

Wired into `LeagueDetailPageV2` at the `free-agents` tab slot; the tab key is
defined in `apps/web/src/pages/baseball/league-detail-v2/tabConfig.ts`.

**Native:** `apps/app/src/app/(app)/FreeAgents.tsx` wraps the shared component with
an inline FAAB claim cluster instead of a modal.

**GraphQL query:** `useGetPlayersWithStatsQuery` (`lib/graphql/src/getPlayersWithStats.query.graphql`)

| Component / hook            | File                                                                        | Purpose                                                         |
| --------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `LeagueDetailFreeAgentsTab` | `lib/shared-components/src/features/baseball/LeagueDetailFreeAgentsTab.tsx` | Cross-platform canonical implementation                         |
| `useLeagueTakenPlayers`     | same file                                                                   | Fetches all team rosters; excludes rostered players             |
| `FreeAgentsTab` (web)       | `apps/web/src/pages/baseball/league-detail-v2/tabs/FreeAgents.tsx`          | Web wrapper supplying `WaiverClaimModal` as `renderClaimAction` |
| `WaiverClaimModal`          | `apps/web/src/features/baseball/WaiverClaimModal.tsx`                       | Web claim modal (standard + FAAB waiver types)                  |
| `FreeAgents` (native)       | `apps/app/src/app/(app)/FreeAgents.tsx`                                     | Native wrapper with inline FAAB cluster                         |

## Test Coverage

### Unit tests

File: `lib/shared-components/src/features/baseball/LeagueDetailFreeAgentsTab.spec.tsx`

`describe('LeagueDetailFreeAgentsTab')`:

- Defaults to the Hitters group and shows the hitter stat columns
- Switches to pitcher columns when the Pitchers toggle is pressed
- Renders a partial name (not the literal "null") when a name part is missing
- Renders "Unknown Player" when both name parts are missing
- Shows the Spectator Mode banner when the viewer is not a member
- Renders the claim action only when the viewer is on a team
- Does not render a row for a player whose id is null (LS-4045)
- Renders the football player pool placeholder for football leagues
- Does not render hitter/pitcher toggles for football leagues

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/free-agents-pickup.spec.ts`

`describe('Free Agents — page renders with player list @critical')`:

- Displays player names in the free agents table
- Shows Hitters and Pitchers toggle buttons
- Shows position filter chips
- Shows pagination info when players are listed

`describe('Free Agents — search and filter @critical')`:

- Search input narrows player results
- Position filter chip triggers new query

`describe('Free Agents — claim button initiates waiver claim flow @critical')`:

- Clicking add button opens the waiver claim modal
- Submitting claim triggers ClaimFreeAgent mutation and shows success
- Done button closes the success modal

`describe('Free Agents — empty state @regression')`:

- Shows "No players found" when query returns empty array
- Shows error state when query fails

## Related

- **Epic:** LS-5259 — QA — Page: Baseball League Detail
- **Source doc:** `docs/agents/pages/baseball/league/detail/tabs/free-agents.md`
