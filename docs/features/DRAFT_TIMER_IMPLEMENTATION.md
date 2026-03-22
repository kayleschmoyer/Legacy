# Draft Pick Timer & Auto-Pick System

## Overview

The draft system includes a **deadline-based pick timer** that automatically picks a player when a team's time runs out. This ensures drafts complete even if owners go AFK.

## How It Works

1. **Pick Timer**: Each draft has a configurable `pickTimeLimitSeconds` (default: 120s, range: 30–172800s)
2. **Deadline Tracking**: When a pick starts, `currentPickDeadline` is set to `NOW() + pickTimeLimitSeconds`
3. **EventBridge Polling**: A 1-minute EventBridge cron checks all in-progress drafts for expired deadlines
4. **Auto-Pick**: When deadline expires, the system auto-picks the best available player (position-aware, with eligibility filtering)
5. **Deadline Chaining**: The next deadline is computed from the _expired_ deadline (`expiredDeadline + pickTimeLimitSeconds`), not from wall-clock time, so the intended cadence is preserved when EventBridge fires late
6. **Inner Retry Loop**: If the chained deadline is already expired (e.g. consecutive AFK teams with a 30s timer), the mutation keeps picking in the same invocation (up to 100 picks per draft) without waiting for the next poll
7. **Notifications**: All picks (manual and auto) include `wasAutoPick` and `currentPickDeadline` in WebSocket notifications

## Database Schema

### New Columns on `drafts` Table

| Column                    | Type               | Default | Description                                             |
| ------------------------- | ------------------ | ------- | ------------------------------------------------------- |
| `pick_time_limit_seconds` | `INTEGER NOT NULL` | `120`   | Seconds per pick (configurable pre-draft)               |
| `current_pick_deadline`   | `TIMESTAMPTZ`      | `NULL`  | When the current pick expires. NULL = clock not running |

### Deadline Lifecycle

| Event                   | `currentPickDeadline` Value                        |
| ----------------------- | -------------------------------------------------- |
| Draft initialized       | `NOW() + pickTimeLimitSeconds`                     |
| Pick made (manual)      | `NOW() + pickTimeLimitSeconds` (next pick)         |
| Pick made (auto/missed) | `expiredDeadline + pickTimeLimitSeconds` (chained) |
| Draft paused            | `NULL`                                             |
| Draft resumed           | `NOW() + pickTimeLimitSeconds`                     |
| Draft completed         | `NULL`                                             |

## GraphQL API

### Updated Types

```graphql
type Draft {
  id: Int!
  leagueId: Int!
  draftMode: String!
  selectionMethod: String!
  draftOrder: String!
  currentPick: Int!
  pickTimeLimitSeconds: Int! # NEW
  currentPickDeadline: String # NEW (ISO 8601, nullable)
  draftStartedAt: String
  draftCompletedAt: String
  date: String
  createdAt: String!
  updatedAt: String!
}
```

### Updated Input

```graphql
input UpdateDraftSettingsInput {
  leagueId: Int!
  draftMode: String
  selectionMethod: String
  draftOrder: String
  playerPool: String
  pickTimeLimitSeconds: Int # NEW (10–3600)
}
```

### New Mutation

```graphql
mutation AutoProcessDraftPicks($leagueId: Int) {
  autoProcessDraftPicks(leagueId: $leagueId) {
    draftsProcessed
    picksAutoMade
    draftsCompleted
    errors
  }
}
```

This mutation is called every minute by EventBridge but can also be invoked manually by admins or commissioners (for a specific league).

### Existing Mutations (Updated Behavior)

| Mutation              | Timer Behavior                           |
| --------------------- | ---------------------------------------- |
| `initializeDraft`     | Sets initial deadline (live mode)        |
| `makeDraftPick`       | Advances deadline to next pick           |
| `commissionerPick`    | Advances deadline to next pick           |
| `pauseDraft`          | Clears deadline                          |
| `resumeDraft`         | Sets fresh deadline                      |
| `updateDraftSettings` | Can set `pickTimeLimitSeconds` pre-draft |

## WebSocket Notifications

### Updated `DRAFT_STARTED` Notification

```typescript
interface DraftStartedNotification {
  type: 'DRAFT_STARTED';
  leagueId: number;
  draftId: number;
  draftOrder: string;
  teamCount: number;
  pickTimeLimitSeconds: number; // NEW
  currentPickDeadline: string; // NEW (ISO 8601)
  startedAt: string;
}
```

### Updated `DRAFT_PICK_MADE` Notification

```typescript
interface DraftPickNotification {
  type: 'DRAFT_PICK_MADE';
  leagueId: number;
  draftId: number;
  pickId: number;
  teamId: number;
  playerId: number;
  round: number;
  pickNumber: number;
  overallPick: number;
  pickedAt: string;
  wasAutoPick: boolean; // NEW — true if system auto-picked
  currentPickDeadline: string | null; // NEW — deadline for next pick
  nextPick?: {
    teamId: number;
    round: number;
    pickNumber: number;
    overallPick: number;
  };
}
```

### Updated `DRAFT_RESUMED` Notification

```typescript
interface DraftResumedNotification {
  type: 'DRAFT_RESUMED';
  leagueId: number;
  currentPickDeadline: string; // NEW (ISO 8601)
  resumedAt: string;
}
```

## UI Implementation Guide

### Timer Display

The UI should:

1. Read `currentPickDeadline` from the `DRAFT_STARTED` or `DRAFT_PICK_MADE` notification
2. Calculate `remainingSeconds = (deadline - now) / 1000`
3. Run a local countdown timer (no need to poll the server)
4. Update the timer on each `DRAFT_PICK_MADE` notification with the new `currentPickDeadline`

```typescript
// Example: React hook for draft timer
function useDraftTimer(deadline: string | null) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!deadline) {
      setSecondsLeft(null);
      return;
    }

    const deadlineMs = new Date(deadline).getTime();

    const interval = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((deadlineMs - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
    }, 1000);

    return () => clearInterval(interval);
  }, [deadline]);

  return secondsLeft;
}
```

### Auto-Pick Indication

When `wasAutoPick` is `true` in a `DRAFT_PICK_MADE` notification, the UI should visually distinguish the pick (e.g., show a clock icon, different background color, or "Auto-Pick" badge).

### Pause State

When the draft is paused (`DRAFT_PAUSED` notification), `currentPickDeadline` becomes `null`. The UI should:

- Stop/hide the countdown timer
- Show a "Draft Paused" state
- Resume the timer when `DRAFT_RESUMED` arrives with a new `currentPickDeadline`

### Settings Configuration

Before the draft starts, the commissioner can configure the pick timer:

```graphql
mutation UpdatePickTimer {
  updateDraftSettings(
    input: {
      leagueId: 1
      pickTimeLimitSeconds: 180 # 3 minutes per pick
    }
  ) {
    pickTimeLimitSeconds
  }
}
```

Valid range: 30–172800 seconds. Default: 120 seconds (2 minutes).

## Infrastructure

### EventBridge Rule

- **Schedule**: `rate(1 minute)` (minimum supported by EventBridge)
- **Target**: GraphQL Lambda (same as all other scheduled mutations)
- **Auth**: System API key (same pattern as waivers, game selection, matchup advancement)
- **Cost**: ~$0.04/month (short-circuits when no expired drafts exist)
- **Inner Retry Loop**: The mutation chains through all consecutively-expired deadlines per draft in a single invocation, so short timers (30s–60s) are not bottlenecked by the 1-minute poll interval. Cap: 100 auto-picks per draft per invocation.

### Authorization

The `autoProcessDraftPicks` mutation uses the same 3-tier auth as other system mutations:

| Caller                       | Access                                      |
| ---------------------------- | ------------------------------------------- |
| EventBridge (system API key) | All leagues                                 |
| Admin user                   | All leagues                                 |
| Commissioner/owner           | Their league only (requires `leagueId` arg) |

## Files Modified

### Created

- `lib/db-client/migrations/20260225_120000_add_draft_pick_timer_columns.ts`
- `lambdas/db/src/schema/drafts/scheduled-mutations.ts`
- `docs/features/DRAFT_TIMER_IMPLEMENTATION.md` (this file)

### Modified

- `lib/db-client/src/drizzle/public/models/Leagues.ts` — Added `pickTimeLimitSeconds`, `currentPickDeadline` to `drafts` table
- `lambdas/db/src/schema/drafts/types.ts` — Added timer fields to `Draft`, `UpdateDraftSettingsInput`, `UpdateDraftSettingsPayload`
- `lambdas/db/src/schema/drafts/mutations.ts` — All lifecycle mutations set/clear deadline
- `lambdas/db/src/schema/drafts/index.ts` — Import scheduled-mutations
- `lib/aws-utils/src/notification/WebSocketNotificationService.ts` — Added timer fields to notification interfaces and methods
- `lib/websocket-client/src/types.ts` — Added timer fields to client notification types
- `terraform/eventbridge.tf` — Added 1-minute `auto_process_draft_picks` rule
