# WebSocket Real-Time Notifications

Complete real-time notification system for draft completion and player stats loading using AWS API Gateway WebSocket API with an efficient **single-connection-per-user** pattern.

## Overview

Users maintain one WebSocket connection and update the context (leagueId, matchupId, viewContext) as they navigate, eliminating the overhead of multiple connections.

## Architecture

```
Events → Lambda → WebSocket API → Connected Clients
          ↓
   DynamoDB (Connections with context + GSI queries)
```

### Event Types

1. **Draft Completion** - Notifies league viewers when draft completes
2. **Player Stats Loading** - Notifies matchup viewers when stats loading starts (shows progress)
3. **Player Stats Updated** - Notifies matchup viewers as each player's stats load (incremental updates)
4. **Matchup Stats Complete** - Notifies matchup viewers when all players complete

### Components

1. **WebSocket Lambda** (`lambdas/websocket/src/index.ts`)
   - Handles connection/disconnection
   - Stores connection IDs with context (leagueId, matchupId, viewContext) in DynamoDB
   - Routes messages to connected clients
   - Supports `updateContext` action for efficient single-connection-per-user pattern
   - Actions: `$connect`, `$disconnect`, `ping`, `updateContext`

2. **Notification Service** (`lib/aws-utils/src/notification/WebSocketNotificationService.ts`)
   - Provides notification broadcasting capabilities
   - Filters connections by leagueId or matchupId using GSI queries
   - Handles stale connections automatically (410 Gone errors)
   - Methods:
     - `notifyDraftCompleted(leagueId, draftType)`
     - `notifyPlayerStatsLoading(matchupId, leagueId, completedCount, totalPlayers)`
     - `notifyPlayerStatsUpdated(playerId, matchupId, leagueId, playerStats)`
     - `notifyMatchupStatsComplete(matchupId, leagueId, totalPlayers)`

3. **Client Hook** (`lib/shared-components/src/hooks/useWebSocket.ts`)
   - React hook for managing WebSocket connections
   - Auto-reconnection on disconnect
   - TypeScript types for all notification events
   - `updateContext()` method for navigation changes
   - Single connection per user (context updates instead of multiple connections)

4. **Infrastructure** (`terraform/websocket.tf`)
   - API Gateway WebSocket API with production stage
   - DynamoDB table (`websocket_connections`) with:
     - Primary key: `connectionId`
     - Attributes: `userId`, `leagueId`, `matchupId`, `viewContext`, `connectedAt`
     - GSI: `LeagueIdIndex` (queries by leagueId)
     - GSI: `MatchupIdIndex` (queries by matchupId)
   - IAM permissions for game-selection and stats lambdas to send notifications

## DynamoDB Schema

```typescript
{
  connectionId: string,        // Primary Key
  userId: number,              // User identifier
  leagueId: number,            // For league-scoped notifications (GSI: LeagueIdIndex)
  matchupId?: number,          // For matchup-scoped notifications (GSI: MatchupIdIndex)
  viewContext?: string,        // 'league' | 'matchup' | etc.
  connectedAt: number          // Timestamp
}
```

## Critical Rules

### ALWAYS `await` Notification Calls

> **🚨 NEVER use fire-and-forget (unawaited) calls to `notificationService.notify*()`.**

Every call to a notification method **must** be `await`ed and wrapped in a try/catch:

```typescript
// ✅ CORRECT — await + try/catch
try {
  await notificationService.notifyLeagueChatMessage(leagueId, payload);
} catch (err) {
  LOGGER.warn('WebSocket notification failed (non-fatal)', { err });
}

// ❌ WRONG — fire-and-forget
notificationService.notifyLeagueChatMessage(leagueId, payload).catch((err) =>
  LOGGER.warn('notification failed', { err }),
);
```

#### Why This Matters

AWS Lambda freezes the execution context as soon as the handler returns its response.
Any **unawaited** async work (like `postToConnection` calls inside the notification
service) will be killed mid-flight when the Lambda freezes, causing **silent,
intermittent message loss**.

This was the root cause of chat notifications never arriving: the GraphQL resolver
returned the mutation response before the WebSocket `postToConnection` calls
completed. Lambda froze the execution context and the notifications were lost.

#### Rules

1. **Always `await`** — every `notificationService.notify*()` call
2. **Always wrap in try/catch** — notification failure should never break the
   primary operation (insert, update, etc.). Log the error and continue.
3. **Never use `.catch()` without `await`** — `.catch()` alone makes the promise
   fire-and-forget; Lambda will freeze before it settles.
4. **Place the notification call after the database write** — ensure data is
   committed before notifying clients.

## Usage

### Backend: Sending Notifications

#### Draft Completion

```typescript
// In draft-processor lambda
import { createNotificationService } from '@legacy-sports/aws-utils';

const notificationService = createNotificationService();

// After draft completion — ALWAYS await + try/catch
try {
  await notificationService.notifyDraftCompleted(leagueId, draftType);
} catch (err) {
  LOGGER.warn('Draft notification failed (non-fatal)', { err });
}
```

#### Player Stats Loading (Game Selection)

```typescript
// In game-selection lambda
import { createNotificationService } from '@legacy-sports/aws-utils';

const notificationService = createNotificationService();

// When stats loading starts
await notificationService.notifyPlayerStatsLoading(
  matchupId,
  leagueId,
  completedCount, // current progress
  totalPlayers, // total to load
);
```

#### Player Stats Update (Stats Lambda)

```typescript
// In stats-lambda
import { createNotificationService } from '@legacy-sports/aws-utils';

const notificationService = createNotificationService();

// After each player's stats are loaded
await notificationService.notifyPlayerStatsUpdated(
  playerId,
  matchupId,
  leagueId,
  { playerId, status: 'completed' },
);

// After all players complete
await notificationService.notifyMatchupStatsComplete(
  matchupId,
  leagueId,
  totalPlayers,
);
```

### Frontend: Receiving Notifications

Use the `useWebSocket` hook in your React components:

#### League Page (Draft Notifications)

```tsx
import { useWebSocket } from '@legacy-sports/shared-components';

function LeagueDetailPage() {
  const { leagueId } = useParams();
  const { refetch } = useGetLeagueByIdQuery({ variables: { leagueId } });

  const { connected, error } = useWebSocket({
    leagueId: parseInt(leagueId),
    onDraftCompleted: (notification) => {
      // Show toast notification
      toast.success(`Draft completed!`);

      // Refetch league data to update UI
      refetch();
    },
  });

  return (
    <div>
      {connected && <Badge>Live</Badge>}
      {/* Rest of your component */}
    </div>
  );
}
```

#### Matchup Page (Player Stats Notifications)

```tsx
import { useWebSocket } from '@legacy-sports/shared-components';

function MatchupPage() {
  const { leagueId, matchupId } = useParams();
  const [loadingProgress, setLoadingProgress] = useState({
    current: 0,
    total: 0,
  });
  const { refetch } = useGetMatchupQuery({ variables: { matchupId } });

  const { connected, error, updateContext } = useWebSocket({
    leagueId: parseInt(leagueId),
    matchupId: parseInt(matchupId),
    viewContext: 'matchup',
    onPlayerStatsLoading: (notification) => {
      setLoadingProgress({
        current: notification.completedCount,
        total: notification.totalPlayers,
      });
    },
    onPlayerStatsUpdated: (notification) => {
      // Incrementally update UI with new player data
      refetch();
    },
    onMatchupStatsComplete: (notification) => {
      toast.success(`All ${notification.totalPlayers} players loaded!`);
      refetch();
    },
  });

  return (
    <div>
      {connected && <Badge>Live</Badge>}
      {loadingProgress.total > 0 && (
        <Progress value={loadingProgress.current} max={loadingProgress.total} />
      )}
      {/* Rest of your component */}
    </div>
  );
}
```

#### Efficient Single Connection Pattern

The hook maintains a single WebSocket connection per user and updates context when navigating:

```tsx
// When user navigates from league page to matchup page,
// the same connection is reused with updated context
useEffect(() => {
  if (matchupId) {
    updateContext({ matchupId: parseInt(matchupId), viewContext: 'matchup' });
  }
}, [matchupId, updateContext]);
```

### Configuration

Set the WebSocket URL in your environment:

```bash
# For development
NX_WEBSOCKET_URL=wss://your-api-id.execute-api.us-east-1.amazonaws.com/dev

# For production
NX_WEBSOCKET_URL=wss://your-api-id.execute-api.us-east-1.amazonaws.com/prod
```

## Deployment

### 1. Build and Deploy WebSocket Lambda

```powershell
# Build the lambda
pnpm exec nx build websocket

# Deploy
.\scripts\deploy-lambda.ps1 -FunctionName websocket
```

### 2. Apply Terraform Configuration

```powershell
cd terraform
terraform plan
terraform apply
```

This creates:

- API Gateway WebSocket API
- DynamoDB connections table
- IAM roles and permissions
- CloudWatch log groups

### 3. Update Draft Processor

The draft processor has been updated automatically. Just deploy it:

```powershell
.\scripts\deploy-lambda.ps1 -FunctionName draft-processor
```

### 4. Get WebSocket URL

After applying Terraform, get the WebSocket URL:

```powershell
cd terraform
terraform output websocket_url
```

Add this to your environment variables.

## Testing

### Test WebSocket Connection

Use wscat or a WebSocket testing tool:

```bash
# Install wscat
npm install -g wscat

# Connect
wscat -c "wss://your-api-id.execute-api.us-east-1.amazonaws.com/dev?leagueId=1&userId=123"

# Send ping
{"type": "ping"}

# You should receive
{"type": "pong"}
```

### Test Draft Notification

1. Connect to WebSocket with a specific leagueId
2. Trigger a draft for that league
3. Watch for the notification message:

```json
{
  "type": "notification",
  "data": {
    "type": "DRAFT_COMPLETED",
    "leagueId": 1,
    "draftType": "random-draft",
    "completedAt": "2026-02-06T10:30:00.000Z"
  }
}
```

## Cost Estimates

**WebSocket API:**

- $1.00 per million messages
- $0.25 per million connection minutes
- Typical usage: ~3,000 notifications/day
- Monthly cost: ~$3-5

**DynamoDB:**

- On-demand pricing
- ~100 queries/day (matchup views)
- ~500 writes/day (connections + disconnections)
- Monthly cost: ~$1-2

**Total:** ~$4-7/month for ~100 users with moderate matchup activity

Based on your usage:

- **1,000 concurrent users**: ~$15-20/month
- **100 concurrent users**: ~$2-5/month
- **10 concurrent users**: ~$1/month

See the main conversation for detailed cost breakdown.

## Monitoring

### CloudWatch Logs

```powershell
# WebSocket Lambda logs
aws logs tail /aws/lambda/legacy-sports-dev-websocket --since 5m --follow

# Draft Processor logs
aws logs tail /aws/lambda/legacy-sports-dev-draft-processor --since 5m --follow

# Game Selection logs
aws logs tail /aws/lambda/legacy-sports-dev-game-selection --since 5m

# Stats Lambda logs
aws logs tail /aws/lambda/legacy-sports-dev-stats --since 5m
```

### DynamoDB Metrics

Monitor the connections table in AWS Console:

- Item count = current connections
- Read/Write capacity

Check connection records:

```powershell
# View all connections
aws dynamodb scan --table-name legacy-sports-dev-websocket-connections

# Query connections by matchup
aws dynamodb query `
  --table-name legacy-sports-dev-websocket-connections `
  --index-name MatchupIdIndex `
  --key-condition-expression "matchupId = :mid" `
  --expression-attribute-values '{":mid":{"N":"45"}}'
```

### API Gateway Metrics

- Connection count
- Message count
- Error rate

### Key Performance Metrics

1. **WebSocket Connections**
   - Active connections count (item count in DynamoDB)
   - Average connection duration
   - Reconnection rate

2. **Notifications**
   - Notification send rate
   - Failed notifications (410 errors indicate stale connections)
   - Notification latency (typically <100ms from Lambda to client)

3. **DynamoDB**
   - Query latency (GSI queries should be <10ms)
   - GSI query count
   - Table scan count (should be minimal)

### Recommended CloudWatch Alarms

- WebSocket 4xx errors > 10/min
- WebSocket 5xx errors > 1/min
- DynamoDB throttling events
- Lambda error rate > 1%

## Troubleshooting

### WebSocket Not Connecting

1. Check WebSocket URL is correct in environment variables
2. Verify CORS settings (if applicable)
3. Check browser console for errors
4. Verify Lambda has correct permissions
5. Check CloudWatch logs for connection attempts

### Notifications Not Received

1. **Check that the notification call is `await`ed** — this is the #1 cause of
   missing notifications. Search the resolver for the `notify*()` call and verify
   it has `await` and a try/catch wrapper. See [Critical Rules](#critical-rules).
2. Verify connection is established (`connected === true`)
3. Check DynamoDB table for connection entry with correct leagueId/matchupId
4. Verify leagueId/matchupId matches between client and server
5. Check Lambda logs for notification send attempts
6. Verify draft processor / game-selection / stats lambda has WebSocket permissions

### Stale Connections

Connections are automatically cleaned up when:

- Client disconnects normally
- Connection receives 410 Gone error (automatically removed by service)
- DynamoDB TTL expires (if configured)

Check logs for "removed stale connection" messages.

### Context Not Updating

- Verify `updateContext` message format matches schema
- Check WebSocket Lambda logs for update attempts
- Confirm DynamoDB record updated correctly

### Notification Latency Issues

- Typical latency: <100ms from Lambda to client
- Check Lambda cold starts
- Verify API Gateway routing
- Review CloudWatch metrics for delays

## Security

- Connections are filtered by leagueId to prevent cross-league notifications
- Matchup viewers are filtered by matchupId using GSI queries
- Consider adding authentication tokens in query parameters (future enhancement)
- Use WSS (secure WebSocket) in production
- Monitor for connection abuse
- Validate all context updates server-side

## Performance Considerations

- **Single connection per user** reduces WebSocket overhead significantly
- Context updates are lightweight (< 1 KB messages)
- GSI queries are fast (<10ms typical)
- MatchupIdIndex filters to only relevant viewers (~2 viewers per matchup)
- Typical load: 10 concurrent matchups × 2 viewers = 20 WebSocket connections
- Each matchup: ~50 players × 3 notifications = 150 notifications
- Typical processing time: 5-10 minutes per matchup
- Notification payload sizes:
  - PlayerStatsLoading: ~100 bytes
  - PlayerStatsUpdated: ~200-500 bytes (depends on stats)
  - MatchupStatsComplete: ~100 bytes

## Future Enhancements

1. **Authentication**: Add JWT token validation in query parameters
2. **Subscriptions**: Allow clients to subscribe to specific events
3. **Presence**: Track online users per league and show who else is viewing
4. **Progress Details**: Show which specific players are loading with times and cache hits vs. fetches
5. **Error Notifications**: Notify when player stats fail to load with retry options
6. **Batching**: Batch multiple player updates into single notification for large matchups
7. **Compression**: Compress large notification payloads (especially useful for full stat objects)
8. **Typing Indicators**: Show when commissioners are making changes
9. **Chat**: Real-time league chat
10. **Game Updates**: Live score updates during matchups

## Known Bugs Fixed

### Fire-and-Forget Notification Loss (Feb 2026)

**Symptom:** Chat messages or roster-update notifications silently failed to arrive
at other connected clients, intermittently.

**Root cause:** The GraphQL resolver called
`notificationService.notifyLeagueChatMessage(...)` using a `.catch()` pattern
without `await`. AWS Lambda froze the execution context after returning the
GraphQL response, killing the pending `postToConnection` API calls before they
completed.

**Fix:** Changed all notification calls from fire-and-forget to
`await` + try/catch. See [Critical Rules](#critical-rules).

**Files fixed:**
- `lambdas/db/src/schema/chat-and-tiebreakers.ts` — `sendLeagueMessage` resolver
- `lambdas/db/src/schema/leagues.ts` — `renameTeam` resolver (2 calls)

**Lesson:** In AWS Lambda, **any async work not `await`ed before the handler
returns is at risk of being killed**. This applies to all fire-and-forget
patterns, not just notifications.

## Related Documentation

- [Game Selection Process](../architecture/season-selection-architecture.md) - How player seasons and games are selected
- [AWS API Gateway WebSocket API](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html)
- [DynamoDB GSI Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html)
