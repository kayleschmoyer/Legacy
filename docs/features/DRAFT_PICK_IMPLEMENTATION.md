# Draft Functionality Implementation Summary

## Overview

Implemented complete backend functionality for supporting drafts in a league, including pick order management, GraphQL mutations/queries, authorization, player draft position persistence, and WebSocket notifications.

## Components Implemented

### 1. Database Schema (`lib/db-client/migrations/20260218_000000_add_draft_picks_table.ts`)

**New Tables:**

- `draft_picks`: Tracks each individual pick made during a draft
  - Fields: id, draft_id, team_id, player_id, round, pick_number, overall_pick, picked_at
  - Unique constraints prevent duplicate picks and players being drafted twice
  - Indexed for performance on draft_id, team_id, player_id

**Extended Tables:**

- `drafts`: Added current_pick, draft_started_at, draft_completed_at
- `team_members`: Added draft_round, draft_pick, acquisition_type to track how players were acquired

### 2. Drizzle ORM Models (`lib/db-client/src/drizzle/public/models/Leagues.ts`)

Updated schema models to include:

- `draftPicks` table definition
- Extended `drafts` with pick tracking fields
- Extended `teamMembers` with draft information

### 3. GraphQL Schema (`lambdas/db/src/schema/draft-schema.ts`)

**Types:**

- `DraftPick`: Represents a single draft pick with all metadata
- `Draft`: Extended draft type with current pick tracking
- `CurrentDraftPick`: Information about whose turn it is to pick

**Queries:**

- `getDraft(draftId)`: Get draft by ID
- `getLeagueDraft(leagueId)`: Get most recent draft for a league
- `getCurrentDraftPick(draftId)`: Get current pick information (whose turn it is)
- `getDraftPicks(draftId)`: Get all picks made in a draft

**Mutations:**

- `makeDraftPick(draftId, playerId)`: Make a draft pick with authorization

### 4. Authorization Logic

The `makeDraftPick` mutation implements strict authorization:

- Verifies user is authenticated
- Checks that it's the user's turn to pick (compares current pick to user's team)
- Prevents picking a player who has already been drafted
- Only allows the team owner to make picks for their team

### 5. Draft Order Calculation

Supports both **snake** and **normal** draft orders:

- **Normal**: Teams pick in the same order every round (1, 2, 3... 1, 2, 3...)
- **Snake**: Teams reverse order on even rounds (1, 2, 3... 3, 2, 1...)

The `getCurrentDraftPickInfo` function calculates:

- Current round (1-indexed)
- Pick number within round (1-indexed)
- Overall pick number
- Which team's turn it is based on draft order

### 6. WebSocket Notifications

**New Notification Type:**

- `DraftPickNotification`: Sent when a pick is made
  - Contains: leagueId, draftId, pickId, teamId, playerId, round, pickNumber, overallPick

**Implementation:**

- Added `notifyDraftPickMade` method to `WebSocketNotificationService`
- Broadcasts to all connections for the league
- Integrated into GraphQL mutation context

**Client Support:**

- Updated `@legacy-sports/websocket-client` types
- Extended `useWebSocket` React hook with `onDraftPickMade` callback
- Added `draft-pick-made` event handler

### 7. Integration Tests (`lambdas/db/src/schema/draft-picks.resolver.integration.spec.ts`)

Comprehensive test suite covering:

- ✅ User can make a pick when it's their turn
- ✅ User cannot pick when it's not their turn (authorization)
- ✅ Player cannot be drafted twice
- ✅ Snake draft order calculation
- ✅ Querying draft picks
- ✅ Getting current pick information

### 8. Database Integration

Updated test schemas and setup:

- `integration-test-schema.ts`: Added draft_picks and team_members tables
- `integration-test-setup.ts`: Added table creation SQL for tests

## Usage Examples

### Making a Draft Pick (GraphQL)

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
  }
}
```

### Getting Current Pick Info

```graphql
query GetCurrentDraftPick($draftId: Int!) {
  getCurrentDraftPick(draftId: $draftId) {
    draftId
    teamId
    round
    pickNumber
    overallPick
    isComplete
    team {
      id
      name
    }
  }
}
```

### Viewing All Draft Picks

```graphql
query GetDraftPicks($draftId: Int!) {
  getDraftPicks(draftId: $draftId) {
    id
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

### WebSocket Integration (React)

```typescript
import { useWebSocket } from '@legacy-sports/shared-components';

function DraftBoard({ leagueId, draftId }) {
  const { connected } = useWebSocket({
    leagueId,
    onDraftPickMade: (notification) => {
      console.log('Pick made!', notification);
      // Update UI to show new pick
      refetchDraftPicks();
    },
  });

  return <div>Draft Board (Connected: {connected})</div>;
}
```

## Security Features

1. **Authorization**: Only the team whose turn it is can make a pick
2. **Validation**: Players cannot be drafted twice
3. **Authentication**: All operations require valid JWT token
4. **Constraints**: Database-level unique constraints prevent race conditions

## Next Steps

To use this functionality:

1. **Run Migration**: Deploy the database migration to add the new tables

   ```bash
   # Apply migration to your database
   pnpm exec nx run db-client:migrate
   ```

2. **Deploy Lambda**: Deploy the updated GraphQL lambda with draft schema

   ```bash
   pnpm exec nx run db:deploy
   ```

3. **Client Integration**: Use the GraphQL mutations and queries in your frontend

4. **WebSocket Setup**: Ensure WebSocket lambda is configured with `CONNECTIONS_TABLE_NAME` and `WEBSOCKET_ENDPOINT` environment variables

5. **Pick Timer**: See [DRAFT_TIMER_IMPLEMENTATION.md](./DRAFT_TIMER_IMPLEMENTATION.md) for the deadline-based auto-pick system that runs on a 1-minute EventBridge cron

## Files Modified/Created

### Created:

- `lib/db-client/migrations/20260218_000000_add_draft_picks_table.ts`
- `lambdas/db/src/schema/draft-schema.ts`
- `lambdas/db/src/schema/draft-picks.resolver.integration.spec.ts`

### Modified:

- `lib/db-client/src/drizzle/public/models/Leagues.ts`
- `lib/aws-utils/src/notification/WebSocketNotificationService.ts`
- `lib/websocket-client/src/types.ts`
- `lib/websocket-client/src/index.ts`
- `lib/shared-components/src/hooks/useWebSocket.ts`
- `lambdas/db/src/schema/builder.ts`
- `lambdas/db/src/schema/index.ts`
- `lambdas/db/src/index.ts`
- `lambdas/db/integration-test-schema.ts`
- `lambdas/db/integration-test-setup.ts`

## Architecture Benefits

1. **Type Safety**: Full TypeScript types from database to frontend
2. **Real-time Updates**: WebSocket notifications keep all clients in sync
3. **Scalability**: Indexed queries and efficient data model
4. **Testing**: Comprehensive integration tests ensure correctness
5. **Authorization**: Fine-grained control over who can pick when
6. **Flexibility**: Supports both snake and normal draft orders
7. **Audit Trail**: Complete history of all picks with timestamps
