# Common Failure Scenarios

## Draft Processor: League Stuck at `in-progress`

**Likely causes:**

1. Draft processor threw an unhandled exception after setting status to `in-progress`
2. Status recovery (`catch` block) also failed (logged as `severity=critical` in Sentry)
3. SQS retries exhausted → message went to DLQ

**Debug steps:**

1. `.\scripts\aws-logs.ps1 -Function draft-processor -Since 4h -Filter "ERROR"`
2. Check `automatic-drafts-dlq.fifo` for the original message
3. Read the error — common causes:
   - Player eligibility query returned 0 candidates (filter too restrictive)
   - DB transaction deadlock during `randomlyAssignPlayers()`
   - Missing required position slot in `roster_positions`
4. Fix the code path that threw, then reset `draft_status = 'not-started'`

**Key files:**

- `lambdas/draft-processor/src/index.ts` — `processDraftMessage()`, error recovery at end of handler
- `lib/db-client/src/lib/services/` — DraftService

## Stats Loading: Matchup Stuck at `loading` or `failed`

**Likely causes:**

1. Baseball Reference rate-limited (429/529) and all SQS retries exhausted
2. A player's brefId doesn't match Baseball Reference's URL format
3. Stats Lambda timed out (15min Lambda limit) on large batch
4. Last-batch completion check race condition

**Debug steps:**

1. `.\scripts\aws-logs.ps1 -Function stats -Since 4h -Filter "matchupId"`
2. Look for `isRateLimitError` or HTTP status codes
3. Check `load-game-stats-dlq.fifo` for failed batches
4. Verify the `batchIndex` / `totalBatches` tracking — did all batches complete?
5. Fix the scraping/retry logic, then re-trigger the matchup

**Key files:**

- `lambdas/stats-lambda/src/load-game.ts` — batch processing, completion check
- `lambdas/game-selection/src/services/season-game-selector.ts` — batch creation

## Game Selection: No Games Selected Overnight

**Likely causes:**

1. EventBridge rule disabled or misconfigured
2. `autoSelectGames` mutation threw before sending SQS messages
3. `SQS_SELECT_GAME_URL` env var not set → messages silently dropped
4. No matchups in `in-progress` status (nothing to select for)

**Debug steps:**

1. `.\scripts\aws-logs.ps1 -Function graphql -Since 24h -Filter "autoSelectGames"`
2. If no logs → EventBridge rule didn't fire. Check AWS console or Terraform.
3. If logs exist but no SQS sends → read the mutation logic for early returns
4. Check: `SELECT id, status FROM matchups WHERE status = 'in-progress'`

**Key files:**

- `lambdas/db/src/schema/matchups/scheduled-mutations.ts` — `autoSelectGames`
- `terraform/` — EventBridge rule definitions

## WebSocket Notifications Not Arriving

**Likely causes:**

1. `CONNECTIONS_TABLE_NAME` or `WEBSOCKET_ENDPOINT` env var missing → `createNotificationService()` returns `null`
2. Notification call not `await`-ed → Lambda freezes execution context, async work killed
3. DynamoDB query returns no connections (user not subscribed to right `leagueId`/`matchupId`)
4. API Gateway Management API 410 (stale connection, already auto-cleaned)

**Debug steps:**

1. Check Lambda env vars in Terraform or AWS console
2. `grep -r "notif" lambdas/<lambda>/src/ | grep -v "await"` — find unawaited calls
3. `.\scripts\aws-logs.ps1 -Function <lambda> -Since 1h -Filter "notification\|WebSocket"`
4. Check DynamoDB connections table for active connections

**Key files:**

- `lib/aws-utils/src/notification/WebSocketNotificationService.ts`
- Architecture rule: **Always `await` notification service calls** (see architecture skill)

## Live Draft: Auto-Picks Not Processing

**Likely causes:**

1. `autoProcessDraftPicks` EventBridge rule disabled
2. `current_pick_deadline` not being set when picks are made
3. Time budget (20s inner loop) exhausted with many expired picks
4. Draft `mode` not set to `'live'`

**Debug steps:**

1. `.\scripts\aws-logs.ps1 -Function graphql -Since 30m -Filter "autoProcessDraftPicks"`
2. Verify the draft record: `SELECT mode, current_pick_deadline, pick_time_limit FROM drafts WHERE league_id = X`
3. Read `lambdas/db/src/schema/drafts/scheduled-mutations.ts` for the query that finds expired deadlines
