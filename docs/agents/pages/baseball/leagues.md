# League Discovery Page — Reference

**Route**: `/baseball/leagues`  
**File**: `apps/web/src/pages/baseball/LeagueDiscoveryPage.tsx`

---

## Layout (in order)

1. Page header — "Browse Public Leagues" (H1) + subtitle
2. Search bar — "Search leagues by name…"
3. Filter buttons — Draft Status + Player Pool
4. Results header — count + Refresh button
5. Error card (conditional)
6. Loading spinner (conditional)
7. Empty state card (conditional)
8. League cards list
9. Footer CTA card (conditional, if results > 0)

---

## Filters

| Filter       | Options                                       |
| ------------ | --------------------------------------------- |
| Draft Status | All · Open/Not Started · Queued · In Progress |
| Player Pool  | All Leagues · NL Only · AL Only               |

Search input debounced; whitespace trimmed. All filters refetch `useGetPublicLeaguesQuery`.

---

## League Card Fields

| Field             | Type                                                          |
| ----------------- | ------------------------------------------------------------- |
| `name`            | League name                                                   |
| `draftStatus`     | enum: not-started / queued / in-progress / paused / completed |
| `playerPool`      | enum: all / nl / al                                           |
| `availableSpots`  | number                                                        |
| `totalSpots`      | number                                                        |
| `maxRosterSize`   | number                                                        |
| `isFull`          | boolean                                                       |
| `isAlreadyMember` | boolean                                                       |

**Per card display**: league name, draft status badge (colored), player pool badge, "X / Y spots available", "X players/roster"

---

## Per-Card States

| State               | Condition                           | Display                                                 |
| ------------------- | ----------------------------------- | ------------------------------------------------------- |
| Already member      | `league.isAlreadyMember`            | Navy/gold banner + "View League" button                 |
| League full         | `league.isFull && !isAlreadyMember` | "This league is full" message, no join button           |
| Join available      | Not member, not full                | "Join League" secondary button                          |
| Joining (form open) | `isJoiningThis === true`            | Team name input + Cancel + Join submit                  |
| Join success        | After mutation success              | Green card "Joined! Redirecting…" → navigate after 1.2s |
| Join error          | Mutation error                      | Red card with error message                             |

---

## Join Flow (inline, per card)

1. Click "Join League" → shows team name input inline
2. Enter team name (required, 1–40 chars)
3. Click "Join" → calls `useJoinPublicLeagueMutation`
4. On success: green success card, then navigate to `/baseball/league/{leagueId}` after 1.2 seconds
5. Cancel → collapses join form

---

## GraphQL

| Hook                          | Purpose                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `useGetPublicLeaguesQuery`    | Fetch public leagues — variables: `{ search, draftStatus, playerPool, limit: 50, offset: 0 }` — fetchPolicy: 'cache-and-network' |
| `useJoinPublicLeagueMutation` | Join league — input: `{ leagueId, teamName }` — refetches `GetPublicLeagues` on success                                          |

---

## Actions

| Action                                  | Behavior                                  |
| --------------------------------------- | ----------------------------------------- |
| Search input                            | Update search, refetch                    |
| Draft Status filter                     | Set filter, refetch                       |
| Player Pool filter                      | Set filter, refetch                       |
| Refresh button                          | Manual refetch                            |
| "Join League" (card)                    | Open inline join form                     |
| Cancel (join form)                      | Close form                                |
| "Join" (submit)                         | Call mutation, navigate on success        |
| "View League" (member)                  | Navigate to `/baseball/league/{leagueId}` |
| "Create a Public League" (empty/footer) | Navigate to `/baseball/league/create`     |
| Retry (error state)                     | Refetch leagues                           |

---

## States

| State              | Condition                                           | Display                                                       |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------------- |
| Loading            | `loading && leagues.length === 0`                   | Spinner + "Searching for public leagues…"                     |
| Error              | `error !== null`                                    | Red error card + Retry button                                 |
| Empty (filtered)   | `!loading && leagues.length === 0 && search active` | "No leagues matched '{search}'"                               |
| Empty (no leagues) | `!loading && leagues.length === 0`                  | "No public leagues are currently open" + Create League button |
| Footer CTA         | `leagues.length > 0`                                | "Can't find the right league?" + Create League button         |
