# Live Draft Board — Frontend Integration Guide

This document explains how the frontend can hook into the live draft system to build a real-time draft board with WebSocket notifications.

## Architecture Overview

```
┌──────────────┐     GraphQL Mutations     ┌──────────────┐     WebSocket      ┌──────────────┐
│  Draft Board │  ───────────────────────►  │   DB Lambda  │  ──────────────►   │  All Clients │
│   (Client)   │  ◄───────────────────────  │  (Resolver)  │                    │  (Listeners) │
└──────────────┘     Mutation Response      └──────────────┘                    └──────────────┘
       │                                           │
       │          WebSocket Notifications          │
       ◄───────────────────────────────────────────┘
```

1. **Owner makes a pick** → calls `makeDraftPick` GraphQL mutation
2. **Server validates** → turn ownership, player availability, roster limits (all in a DB transaction)
3. **Server inserts** → `draft_picks` row, `team_members` row, advances `currentPick`
4. **Server broadcasts** → `DRAFT_PICK_MADE` WebSocket notification to all league members
5. **All clients update** → draft board, available players list, and "on the clock" indicator

---

## 1. GraphQL Queries

### Get Draft State

Fetch the current draft for a league at page load:

```graphql
query GetLeagueDraft($leagueId: Int!) {
  getLeagueDraft(leagueId: $leagueId) {
    id
    leagueId
    draftMode
    selectionMethod
    draftOrder        # 'snake' | 'linear'
    currentPick       # number of picks made so far
    draftStartedAt
    draftCompletedAt
    createdAt
  }
}
```

### Get Current Pick (Whose Turn)

```graphql
query GetCurrentDraftPick($draftId: Int!) {
  getCurrentDraftPick(draftId: $draftId) {
    draftId
    teamId          # which team is on the clock
    round
    pickNumber      # pick within the round (1-indexed)
    overallPick     # overall pick number (1-indexed)
    isComplete      # true when draft is finished
    team {
      id
      name
    }
  }
}
```

### Get All Picks (Draft History)

```graphql
query GetDraftPicks($draftId: Int!) {
  getDraftPicks(draftId: $draftId) {
    id
    draftId
    teamId
    playerId
    round
    pickNumber
    overallPick
    pickedAt
    team {
      id
      name
    }
  }
}
```

### Get Available Players

Search/browse players that haven't been drafted yet. Respects the league's player pool setting (ALL/AL/NL):

```graphql
query GetAvailableDraftPlayers($draftId: Int!, $search: String, $limit: Int) {
  getAvailableDraftPlayers(draftId: $draftId, search: $search, limit: $limit) {
    id
    firstName
    lastName
    brefId
  }
}
```

---

## 2. GraphQL Mutations

### Make a Draft Pick

Called when the owner whose turn it is selects a player:

```graphql
mutation MakeDraftPick($draftId: Int!, $playerId: Int!) {
  makeDraftPick(draftId: $draftId, playerId: $playerId) {
    id
    draftId
    teamId
    playerId
    round
    pickNumber
    overallPick
    pickedAt
    team {
      id
      name
    }
  }
}
```

**Error cases the UI should handle:**

| Error Message | Meaning | UI Action |
|---|---|---|
| `"Not authorized: It is not your turn..."` | Not this user's turn | Show "Not your turn" toast, disable pick button |
| `"Player has already been drafted"` | Race condition / stale list | Remove player from available list, show toast |
| `"Draft is currently paused..."` | Commissioner paused the draft | Show paused overlay |
| `"Draft is not in progress"` | Draft hasn't started or is done | Redirect to appropriate state |
| `"Team roster is full"` | Hit maxRosterSize | Show roster full message |
| `"Player is not in the AL/NL player pool"` | Player pool restriction | Remove from list, show toast |

**Idempotency:** If the user double-clicks or retries, the server detects duplicate picks and returns the existing pick without error.

### Initialize a Draft (Commissioner Only)

```graphql
mutation InitializeDraft($leagueId: Int!, $draftOrder: String, $draftMode: String, $selectionMethod: String) {
  initializeDraft(leagueId: $leagueId, draftOrder: $draftOrder, draftMode: $draftMode, selectionMethod: $selectionMethod) {
    id
    leagueId
    draftMode
    draftOrder
    currentPick
    draftStartedAt
  }
}
```

### Pause / Resume Draft (Commissioner Only)

```graphql
mutation PauseDraft($leagueId: Int!) {
  pauseDraft(leagueId: $leagueId) {
    id
    currentPick
  }
}

mutation ResumeDraft($leagueId: Int!) {
  resumeDraft(leagueId: $leagueId) {
    id
    currentPick
  }
}
```

### Commissioner Pick (Override)

Allows the commissioner to make a pick on behalf of an absent owner:

```graphql
mutation CommissionerPick($draftId: Int!, $playerId: Int!) {
  commissionerPick(draftId: $draftId, playerId: $playerId) {
    id
    teamId
    playerId
    round
    pickNumber
    overallPick
    pickedAt
  }
}
```

---

## 3. WebSocket Notifications

### Setup

Use the `@legacy-sports/websocket-client` library to listen for real-time events:

```typescript
import { WebSocketClient, ClientNotificationType } from '@legacy-sports/websocket-client';
import type {
  DraftStartedNotification,
  DraftPickNotification,
  DraftPausedNotification,
  DraftResumedNotification,
  DraftCompletedNotification,
} from '@legacy-sports/websocket-client';
```

### Notification Types & Payloads

#### `draft-started`

Fired when the commissioner initializes the live draft.

```typescript
client.on('draft-started', (data: DraftStartedNotification) => {
  // data.leagueId   — league ID
  // data.draftId    — new draft ID
  // data.draftOrder — 'snake' | 'linear'
  // data.teamCount  — number of teams
  // data.startedAt  — ISO-8601 timestamp

  // → Navigate users to the draft board
  // → Initialize draft state
});
```

#### `draft-pick-made`

Fired after every successful pick. Includes who picked and **who's next**.

```typescript
client.on('draft-pick-made', (data: DraftPickNotification) => {
  // data.leagueId    — league ID
  // data.draftId     — draft ID
  // data.pickId      — the new draft_picks.id
  // data.teamId      — team that made the pick
  // data.playerId    — player that was drafted
  // data.round       — round number
  // data.pickNumber  — pick within the round
  // data.overallPick — overall pick number (1-indexed)
  // data.pickedAt    — ISO-8601 timestamp
  //
  // data.nextPick    — (optional) info about the next pick:
  //   data.nextPick.teamId      — next team on the clock
  //   data.nextPick.round       — next round
  //   data.nextPick.pickNumber  — next pick in round
  //   data.nextPick.overallPick — next overall pick number

  // → Add pick to draft board grid
  // → Remove player from available players list
  // → Update "on the clock" indicator using nextPick
  // → If nextPick is undefined, draft is complete
  // → If nextPick.teamId === myTeamId, highlight / enable pick button
});
```

#### `draft-paused`

Fired when the commissioner pauses the draft.

```typescript
client.on('draft-paused', (data: DraftPausedNotification) => {
  // data.leagueId — league ID
  // data.pausedAt — ISO-8601 timestamp

  // → Show "Draft Paused" overlay
  // → Disable pick button
  // → Pause the pick timer
});
```

#### `draft-resumed`

Fired when the commissioner resumes the draft.

```typescript
client.on('draft-resumed', (data: DraftResumedNotification) => {
  // data.leagueId  — league ID
  // data.resumedAt — ISO-8601 timestamp

  // → Hide "Draft Paused" overlay
  // → Re-enable pick button if it's your turn
  // → Restart the pick timer
});
```

#### `draft-completed`

Fired when the final pick is made.

```typescript
client.on('draft-completed', (data: DraftCompletedNotification) => {
  // data.leagueId       — league ID
  // data.selectionMethod — 'standard' | 'random' | 'auction'
  // data.completedAt    — ISO-8601 timestamp

  // → Show "Draft Complete" screen
  // → Navigate to roster view or recap
});
```

---

## 4. Recommended Client State Model

```typescript
interface DraftBoardState {
  // Core draft info
  draftId: number;
  leagueId: number;
  draftOrder: 'snake' | 'linear';
  status: 'not-started' | 'in-progress' | 'paused' | 'completed';

  // Current turn
  currentPick: {
    teamId: number;
    round: number;
    pickNumber: number;
    overallPick: number;
    isMyTurn: boolean;   // derived: currentPick.teamId === myTeamId
  } | null;

  // Draft history — array of all picks made so far
  picks: DraftPick[];

  // Available players (paginated / searchable)
  availablePlayers: DraftPlayer[];
  searchQuery: string;

  // Draft teams in order
  teams: DraftTeam[];

  // Timer
  timer: {
    secondsRemaining: number;
    isActive: boolean;
  };

  // My info
  myTeamId: number;
  isCommissioner: boolean;
}
```

---

## 5. Component Architecture

```
DraftBoardPage
├── DraftHeader
│   ├── DraftStatusBanner (in-progress / paused / completed)
│   ├── RoundIndicator (Round X, Pick Y)
│   └── CommissionerControls (Pause / Resume / Commissioner Pick)
│
├── DraftGrid (main board)
│   ├── TeamColumns (one per team, shows their picks by round)
│   └── OnTheClockHighlight (highlights the team picking)
│
├── PlayerPanel (sidebar)
│   ├── PlayerSearch (search input + position filters)
│   ├── AvailablePlayersList (virtualized, shows only undrafted)
│   └── PickButton (disabled unless isMyTurn && !isPaused)
│
├── PickHistory (chat-style feed of recent picks)
│
└── DraftTimer (countdown timer with visual urgency)
```

---

## 6. Data Flow: Handling a Pick

### When it's YOUR turn:

```
1. User clicks a player → calls makeDraftPick mutation
2. Disable pick button immediately (optimistic)
3. On success:
   - Add pick to local picks array
   - Remove player from available list
   - Wait for WebSocket notification (nextPick info)
4. On error:
   - Re-enable pick button
   - Show error toast
   - If "player already drafted" → refetch available players
```

### When it's SOMEONE ELSE's turn:

```
1. Receive `draft-pick-made` WebSocket notification
2. Add pick to local picks array
3. Remove player from available list (by playerId)
4. Update currentPick using notification.nextPick
5. If nextPick.teamId === myTeamId:
   - Enable pick button
   - Start timer
   - Play "your turn" notification sound
```

---

## 7. Initial Page Load Sequence

```typescript
async function initializeDraftBoard(leagueId: number) {
  // 1. Fetch draft state
  const draft = await query(GetLeagueDraft, { leagueId });

  if (!draft || draft.draftCompletedAt) {
    // Show completed view or "draft not started" view
    return;
  }

  // 2. Fetch all existing picks (for reconnection / late join)
  const picks = await query(GetDraftPicks, { draftId: draft.id });

  // 3. Fetch current pick info
  const currentPick = await query(GetCurrentDraftPick, { draftId: draft.id });

  // 4. Fetch initial available players
  const players = await query(GetAvailableDraftPlayers, {
    draftId: draft.id,
    limit: 50,
  });

  // 5. Connect WebSocket and subscribe to events
  const unsubscribers = [
    wsClient.on('draft-pick-made', handlePickMade),
    wsClient.on('draft-paused', handlePaused),
    wsClient.on('draft-resumed', handleResumed),
    wsClient.on('draft-completed', handleCompleted),
  ];

  // 6. Populate state
  setState({
    draftId: draft.id,
    leagueId,
    draftOrder: draft.draftOrder,
    status: 'in-progress',
    currentPick,
    picks,
    availablePlayers: players,
  });

  // Return cleanup function
  return () => unsubscribers.forEach(unsub => unsub());
}
```

---

## 8. Error Recovery & Edge Cases

| Scenario | Strategy |
|---|---|
| **User refreshes mid-draft** | Re-fetch all picks + current pick on mount. The draft board is fully recoverable from DB state. |
| **WebSocket disconnects** | The `WebSocketClient` auto-reconnects. On reconnect, refetch `getCurrentDraftPick` and `getDraftPicks` to reconcile any missed picks. |
| **Double-click on pick** | The mutation is idempotent — server detects the same (draftId, playerId, teamId, overallPick) and returns the existing pick. |
| **Stale player list** | When a `draft-pick-made` notification arrives, optimistically remove `playerId` from the local available list. Periodically refetch for full accuracy. |
| **Commissioner override** | `commissionerPick` mutation works the same as `makeDraftPick` but bypasses turn-ownership checks. The same `draft-pick-made` notification is broadcast. |
| **Draft paused during your turn** | The pick button should be disabled on `draft-paused`. If a pick mutation is in-flight, the server will reject with "Draft is currently paused." |

---

## 9. DB Tables (Reference)

| Table | Purpose |
|---|---|
| `drafts` | Per-league draft record: mode, order, currentPick counter, timestamps |
| `draft_teams` | Links teams to draft with randomized `draft_order` (1-indexed) |
| `draft_picks` | Historical record: every pick with round, pickNumber, overallPick, teamId, playerId, pickedAt |
| `team_members` | Roster: players assigned to teams. `acquisitionType = 'draft'` for drafted players |
| `leagues` | `draftStatus` column: `not-started`, `in-progress`, `paused`, `completed` |

### Key Constraints

- `UNIQUE(draft_id, overall_pick)` — one pick per slot
- `UNIQUE(draft_id, player_id)` — each player drafted at most once per draft
- `UNIQUE(draft_id, draft_order)` on `draft_teams` — each order position is unique

---

## 10. Notification Type Constants

Import these from `@legacy-sports/utils/notification-types`:

| Wire (backend) | Client (frontend) | Event |
|---|---|---|
| `DRAFT_STARTED` | `draft-started` | Commissioner initialized the draft |
| `DRAFT_PICK_MADE` | `draft-pick-made` | A pick was made (includes nextPick) |
| `DRAFT_PAUSED` | `draft-paused` | Commissioner paused the draft |
| `DRAFT_RESUMED` | `draft-resumed` | Commissioner resumed the draft |
| `DRAFT_COMPLETED` | `draft-completed` | Final pick was made, draft is done |
