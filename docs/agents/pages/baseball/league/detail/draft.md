# Live Draft Board — Reference

**Route**: `/baseball/league/:id/draft`  
**Files**: `apps/web/src/components/EliteDraftBoard.tsx` · `lib/shared-components/src/features/elite-draft/EliteDraftBoardScreen.tsx`

---

## Full-Page State Screens (shown instead of main board)

| State                           | Screen Rendered                                         |
| ------------------------------- | ------------------------------------------------------- |
| No league ID                    | `NoLeagueScreen`                                        |
| Initial load                    | `LoadingScreen` — "Loading draft…"                      |
| League not found / unauthorized | `LeagueErrorScreen`                                     |
| Player data fetch failure       | `PlayersErrorScreen` + Retry button                     |
| Before draft starts             | `PreDraftLobby`                                         |
| Draft complete                  | `DraftCompleteView` — final rosters, awards, navigation |
| Auction draft                   | `AuctionDraftRoom` (alternate flow)                     |

---

## Main Board Layout

Two-region layout: **Sidebar** (left) + **Player Board** (main).

---

## Sidebar Panels (top to bottom)

### Draft Status Bar

- "LIVE DRAFT" or "DRAFT PAUSED" label + animated live dot
- Current pick number (e.g., "Pick #42")
- Current round number

### Circular Timer

- Time remaining (MM:SS)
- Color zones: green (safe) · yellow (< 30s) · red (< 10s)
- "Timer paused" when draft paused

### Commissioner Controls _(commissioner only)_

- "Pause Draft" / "Resume Draft" button
- "Commissioner Pick" mode toggle
- "Disable Auto-Pick" button
- All show loading state during mutations

### Current Pick Panel

- Team name (or "YOUR PICK" if it's the user's turn)
- "Pick #{overall} · Round {round} · Pick {roundPick}"
- Manager name + online status indicator (green/gray dot)
- If draft not yet started: "Start Draft" button
- Error state: red message + Retry button

### Draft Intelligence _(premium, only on user's pick)_

- Recommended player cards with reasoning badges
- "View more recommendations" expandable
- Wrapped in `PremiumGate`

### My Roster

- "MY ROSTER ({count})" heading
- 7-position grid: C, 1B, 2B, 3B, SS, OF, P — each shows "POSITION: filled/target" with color coding
- Expandable player list below grid

### Queue Panel

- "AUTO-PICK QUEUE" heading
- Queued players list with remove buttons
- Queue size counter

### Pick History

- "PICK HISTORY" heading
- Scrollable list: team name (color-coded), player name, position badge, pick number, round/pick notation

---

## Player Board

### Search Bar

- "Search available players…" placeholder
- Clear (X) button (conditional)
- Loading spinner while fetching

### Position Filter Pills

`ALL · C · 1B · 2B · 3B · SS · OF · P`  
Selected pill: BRAND_GOLD border + background. Keyboard navigable (Arrow keys, Home, End).

### View Mode Toggle

4 icon buttons: Grid · List · Compact · Board

### Player Grid / List

Each player card displays:

| Field                        | Notes                         |
| ---------------------------- | ----------------------------- |
| Player name                  | Large, bold                   |
| Position badge               | Color-coded by position       |
| MLB Team abbreviation        |                               |
| ADP (Average Draft Position) |                               |
| Bye week                     |                               |
| "QUEUED" badge               | If in `queuedPlayerIds`       |
| "AUTO" badge                 | If team has auto-pick enabled |
| Watchlist star               | If in watchlist               |
| "TAKEN" overlay              | If already drafted            |

**Per-card buttons**: Draft · Queue toggle · Watch toggle

---

## Overlays & Modals

| Overlay                    | Condition                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------- |
| Draft paused overlay       | `draftPaused && !isOwner` — blocks UI                                                   |
| Pick Announcement modal    | After pick made — player image, name, position, round/pick, commentary, auto-dismiss 5s |
| Toast (success/error/info) | Bottom of screen, auto-dismiss                                                          |
| Chat overlay               | When `chatOpen`                                                                         |

---

## Mobile

- Sticky banner at bottom: timer + pick info
- Same functional panels, reordered vertically

---

## Pre-Draft Lobby (commissioner only)

- Team list in draft order
- Arrow buttons to reorder teams
- Randomize button
- "Start Snake Draft" / "Start Linear Draft" buttons
- Error box if initialization fails

---

## WebSocket Real-Time Events

**Provider**: `useDraftWebSocket` hook connecting to `env.websocketUrl`

| Event                           | Effect                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `pick_made`                     | Update pick history, remove from available, show announcement, play audio (optional) |
| `auto_pick_made`                | Same as pick_made with "AUTO" badge                                                  |
| `pick_order_update`             | Update board team order                                                              |
| `timer_started` / `timer_reset` | Start local countdown from `pickDeadline`                                            |
| `draft_paused`                  | Show paused overlay, hide timer                                                      |
| `draft_resumed`                 | Hide overlay, restart timer                                                          |
| `online_users_updated`          | Update green/gray online dots                                                        |
| `chat_message`                  | Append to chat, auto-scroll                                                          |
| `draft_complete`                | Show `DraftCompleteView`                                                             |

---

## GraphQL Queries

| Hook                                   | Data                                               |
| -------------------------------------- | -------------------------------------------------- |
| `useGetLeagueByIdQuery`                | League info, membership, permissions, draft status |
| `useGetCurrentDraftPickQuery`          | Current pick team, round, deadline                 |
| `useGetDraftPickHistoryQuery`          | All picks made                                     |
| `useGetAvailablePlayersQuery`          | Available players (paginated, filterable)          |
| `useGetLeagueTeamsQuery`               | All teams + manager info + online status           |
| `useGetDraftByIdQuery`                 | Draft metadata, selection method                   |
| `useGetPlayerStatsQuery`               | ADP, bye week, batting stats                       |
| `useGetPitchingStatsQuery`             | Pitcher-specific stats                             |
| `useGetDraftTeamAutoPickStatusesQuery` | Which teams have auto-pick enabled                 |
| `useGetDraftOrderQuery`                | Custom draft order                                 |

## GraphQL Mutations

| Hook                                 | Action                                     |
| ------------------------------------ | ------------------------------------------ |
| `useMakeDraftPickMutation`           | Make a pick (player_id, draft_id, team_id) |
| `usePauseDraftMutation`              | Pause draft (commissioner)                 |
| `useResumeDraftMutation`             | Resume draft (commissioner)                |
| `useSetCommissionerPickModeMutation` | Toggle commissioner pick mode              |
| `useSetAutoPickDisabledMutation`     | Disable auto-pick globally                 |
| `useToggleTeamAutoPickMutation`      | Enable/disable own team auto-pick          |
| `useToggleDraftQueueMutation`        | Add/remove player from queue               |
| `useInitializeDraftMutation`         | Start draft (owner only)                   |

---

## Commissioner vs Member Access

| Feature                    | Commissioner        | Member                 |
| -------------------------- | ------------------- | ---------------------- |
| Pause/Resume buttons       | ✓                   | ✗                      |
| Commissioner Pick mode     | ✓                   | ✗                      |
| Disable Auto-Pick          | ✓                   | ✗                      |
| Reorder teams (pre-draft)  | ✓                   | ✗                      |
| Start draft                | ✓                   | ✗                      |
| Pick on behalf of teams    | ✓ (commPickMode ON) | ✗                      |
| See "Draft paused" overlay | ✗                   | ✓                      |
| Toggle own auto-pick       | ✓                   | ✓                      |
| Draft Intelligence         | ✓ (premium)         | ✓ (premium + isMyPick) |

---

## Loading & Error States

| State                      | Display                                        |
| -------------------------- | ---------------------------------------------- |
| Initial load               | `LoadingScreen` spinner                        |
| Players loading            | Spinner in search field, cards greyed out      |
| Making pick                | "Drafting…" button text, disabled              |
| Pause/resume               | "Pausing…" / "Resuming…", disabled             |
| Pick error                 | Red toast notification                         |
| Init error                 | Red error box in pre-draft lobby               |
| No players matching filter | "No players match your filters" + clear button |
| No queue                   | "No auto-picks queued" in Queue panel          |
