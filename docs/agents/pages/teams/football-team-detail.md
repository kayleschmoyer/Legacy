# Football Team Detail Page — Reference

**Route**: `/football/team/:teamId` (mobile native only — no web or mobile-web
equivalent exists yet; tracked as [LS-6438](https://bkrupa.atlassian.net/browse/LS-6438))
**File**: `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/football/team/[teamId].tsx`

---

## Navigation entry point (LS-5446)

Prior to LS-5446, this page existed in the codebase but had **no reachable
navigation path** anywhere in the live app — the only two code paths that
constructed a link to it (`LeagueStandings.tsx` and a `LeagueTeamsTab` inside
an orphaned generic `league/[leagueId].tsx` route) were both dead code, never
imported by anything a real user could reach. Both were deleted as part of
LS-5446.

The real entry point, added by LS-5446: from a football league's **Overview**
tab (`apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/football/league/[leagueId].tsx`), tapping a row
in the **Quick Standings** list (`apps/app/src/features/leagues/LeagueOverviewTab.tsx`,
`testID="overview-standings-row-<teamId>"`) navigates to
`/football/team/[teamId]` for that row's team.

---

## Layout (in order)

1. Tab bar — `Roster` / `Matchup` / `Lineup` / `Settings` (`Settings` hidden
   for non-owners)
2. Selected tab's content

---

## Tabs

| Tab        | Component                                                                                                  | Notes                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `Roster`   | `FootballLeagueRosterScreen` (`apps/app/src/screens/leagues/football/FootballLeagueRosterScreen.tsx`)      | Read-only, position-slot grouped roster view — see below                                       |
| `Matchup`  | Inline in `[teamId].tsx`                                                                                   | This team's current matchup                                                                    |
| `Lineup`   | `RosterBoard<AppTeamMemberFragment, LeaguePositionFragment>` (`lib/shared-components`, `sport="football"`) | Owner-only editing (`readOnly={!isOwner}`); the same cross-platform lineup board baseball uses |
| `Settings` | `BrandingSettings` (inline in `[teamId].tsx`)                                                              | Owner-only; avatar/banner URL fields + `useUpdateTeamBrandingMutation`                         |

---

## Roster Tab — Position-Slot Grouping

Groups the team's roster (`useGetTeamMembersQuery`) into ordered position
slots, per `getSlotOrder(defensiveFormat)`
(`FootballLeagueRosterScreen.tsx:22-44,89-93`):

| League format                          | Slot order                              |
| -------------------------------------- | --------------------------------------- |
| Standard (`defensiveFormat !== 'idp'`) | QB, RB, WR, TE, FLEX, K, DST, BN        |
| IDP (`defensiveFormat === 'idp'`)      | QB, RB, WR, TE, FLEX, K, DL, LB, DB, BN |

Each member is grouped by their **assigned `positionId`**, resolved to a slot
via a `positionId -> positionType` lookup built from the league's roster
slots (`rosterSlots` prop, the same `leaguePositions` the `Lineup` tab uses)
-- not by scanning `player.eligiblePositions` (fixed by
[LS-6433](https://bkrupa.atlassian.net/browse/LS-6433), since that disagreed
with the `Lineup` tab and could show a benched player as a starter). A member
falls to Bench (`BN`) when `positionId` is `null` or doesn't resolve to a
known slot.

For each slot:

| Element             | Behavior                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Slot header         | Slot abbreviation + full label (`SLOT_LABELS`) + member count. `testID="<slot>-card"` (lowercase, e.g. `qb-card`, `bn-card`)                                                   |
| Populated slot rows | One row per member assigned to that slot's `positionId` -- position badge (`getPositionBadge`, first eligible position, unchanged by LS-6433) + player name (`getPlayerLabel`) |
| Empty slot          | Italic "Empty slot" text                                                                                                                                                       |
| Bench (`BN`)        | Members with `positionId: null` or a `positionId` that doesn't resolve to a known slot                                                                                         |

This view is **read-only** — no assign/remove/swap affordances (those live on
the `Lineup` tab's `RosterBoard`).

---

## GraphQL Queries

| Hook                            | Data                                                                        |
| ------------------------------- | --------------------------------------------------------------------------- |
| `useGetTeamByIdQuery`           | Team metadata (name, avatarUrl, bannerUrl, leagueId)                        |
| `useGetUserTeamIdQuery`         | Current user's team ID for this league (owner check)                        |
| `useGetLeagueByIdQuery`         | League info, incl. `defensiveFormat`                                        |
| `useGetPositionsForLeagueQuery` | League position slots (`rosterSlots`, shared by `Roster` and `Lineup` tabs) |
| `useGetTeamMembersQuery`        | Roster (`TeamMember[]`)                                                     |

## GraphQL Mutations

| Hook                                  | Action                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `useUpdateTeamMemberPositionMutation` | Assign/move a lineup slot (`Lineup` tab only) — variables: `{ teamMemberId, positionId }`               |
| `useUpdateTeamBrandingMutation`       | Update avatarUrl/bannerUrl (`Settings` tab) — variables: `{ teamId, leagueId, avatarUrl?, bannerUrl? }` |

---

## Conditional Rendering

| Section               | Condition                             |
| --------------------- | ------------------------------------- |
| `Settings` tab        | `isOwner` (`userTeamId === teamId`)   |
| `Lineup` edit actions | `isOwner`; read-only no-ops otherwise |
| DST vs IDP slots      | `league.defensiveFormat === 'idp'`    |

---

## States

| State                                   | Display                               |
| --------------------------------------- | ------------------------------------- |
| Loading (team/positions/league/members) | `UnifiedLoadingPanel`                 |
| Team not found                          | "Could not load team"                 |
| Positions not found                     | "Could not load positions for league" |
| Roster query error                      | "Failed to load roster." card         |
| Roster query loading                    | Spinner + "Loading roster…"           |

---

## Real-Time

None. No WebSocket connection on this page.
