---
name: debug-distributed
description: 'Debug distributed process failures by finding the root cause in code before patching database state. Use when debugging draft failures, stuck matchups, stats loading errors, dead-letter messages, or any cross-Lambda issue.'
---

# Skill: Debug Distributed Processes

## Overview

Legacy Sports uses **5 Lambda functions** communicating via **4 SQS FIFO queues** and **EventBridge cron rules**. When a distributed flow fails, the visible symptom is almost always bad database state — but **fixing the data without fixing the code guarantees the failure will repeat**.

This skill enforces a **root-cause-first** debugging methodology.

## When to Use

- Draft stuck at `in-progress` or `queued`
- Matchup `stats_loading_status = 'failed'`
- Game selection didn't run or partially completed
- SQS dead-letter queue has messages
- WebSocket notifications not reaching clients
- Nightly cron (game select, matchup advance, waiver claims) didn't fire
- Any symptom where the "fix" would be a manual DB UPDATE

## CRITICAL RULE

> **NEVER patch database state as the fix.** Always find and fix the code path that produced the bad state. Database corrections are a _temporary recovery step_, not a resolution.

If you're about to write `UPDATE leagues SET draft_status = ...` or `UPDATE matchups SET stats_loading_status = ...` as your solution — **STOP**. That's recovery, not a fix. The same failure will happen to the next user.

---

## System Architecture (Quick Reference)

```

EventBridge (cron)
│ rate(1 min): autoProcessDraftPicks, autoStartScheduledDrafts
│ midnight EST: autoSelectGames
│ Sunday 3am EST: autoAdvanceMatchups
│ 2am EST: processWaiverClaims
▼
DB Lambda (GraphQL) ─── lambdas/db/
│
├─ SQS: automatic-drafts.fifo ──► Draft Processor ─── lambdas/draft-processor/
│
├─ SQS: select-game.fifo ──────► Game Selection ──── lambdas/game-selection/
│ │
│ └─ SQS: load-game-stats.fifo ──► Stats Lambda ─── lambdas/stats-lambda/
│
└─ SQS: load-season-stats.fifo ──► Stats Lambda (career handler)
│
All lambdas ──► WebSocket Notifications ──► lambdas/websocket/ ──► DynamoDB ──► Clients

```

### SQS Queues

| Queue                    | Producer              | Consumer        | Max Retries | DLQ                          |
| ------------------------ | --------------------- | --------------- | ----------- | ---------------------------- |
| `automatic-drafts.fifo`  | DB Lambda             | Draft Processor | 3           | `automatic-drafts-dlq.fifo`  |
| `select-game.fifo`       | DB Lambda + UI        | Game Selection  | 3           | `select-game-dlq.fifo`       |
| `load-game-stats.fifo`   | Game Selection Lambda | Stats Lambda    | 3           | `load-game-stats-dlq.fifo`   |
| `load-season-stats.fifo` | DB Lambda             | Stats Lambda    | 3           | `load-season-stats-dlq.fifo` |

### EventBridge Rules

| Rule                          | Schedule              | Target Mutation            |
| ----------------------------- | --------------------- | -------------------------- |
| `auto-process-draft-picks`    | `rate(1 minute)`      | `autoProcessDraftPicks`    |
| `auto-start-scheduled-drafts` | `rate(1 minute)`      | `autoStartScheduledDrafts` |
| `auto-select-games`           | `cron(0 5 * * ? *)`   | `autoSelectGames`          |
| `auto-advance-matchups`       | `cron(0 8 ? * SUN *)` | `autoAdvanceMatchups`      |
| `process-waiver-claims`       | `cron(0 7 * * ? *)`   | `processWaiverClaims`      |

EventBridge rules invoke the GraphQL Lambda **directly** (not via API Gateway), authenticated with `x-system-api-key`.

---

## Debugging Methodology

### Step 1: Identify the Failing Boundary

Every distributed failure has a **boundary** — the point where one system hands off to another. Identify which boundary failed:

| Symptom                                    | Likely Boundary                             |
| ------------------------------------------ | ------------------------------------------- |
| Draft stuck at `queued`                    | DB Lambda → SQS `automatic-drafts.fifo`     |
| Draft stuck at `in-progress`               | Draft Processor execution or crash recovery |
| No games selected overnight                | EventBridge → DB Lambda (`autoSelectGames`) |
| Matchup `stats_loading_status = 'pending'` | Game Selection → SQS `load-game-stats.fifo` |
| Matchup `stats_loading_status = 'failed'`  | Stats Lambda scraping or DB write           |
| Stats loaded but matchup still `pending`   | Stats Lambda last-batch completion check    |
| WebSocket notifications missing            | Lambda → DynamoDB query or API Gateway post |
| Live draft picks not auto-processing       | EventBridge → `autoProcessDraftPicks`       |

### Step 2: Read the Logs (Not the Database)

**Start with CloudWatch logs, not DB state.** The database shows _what_ is wrong; logs show _why_.

```powershell
# Draft processor failures
.\scripts\aws-logs.ps1 -Function draft-processor -Since 2h -Filter "ERROR"

# Game selection failures
.\scripts\aws-logs.ps1 -Function game-selection -Since 2h -Filter "ERROR"

# Stats loading failures
.\scripts\aws-logs.ps1 -Function stats -Since 4h -Filter "ERROR"

# GraphQL Lambda (scheduled mutations, draft mutations)
.\scripts\aws-logs.ps1 -Function graphql -Since 2h -Filter "ERROR"

# WebSocket failures
.\scripts\aws-logs.ps1 -Function websocket -Since 1h -Filter "ERROR"
```

Also check for **broader patterns** (not just errors):

```powershell
# Did the scheduled mutation even fire?
.\scripts\aws-logs.ps1 -Function graphql -Since 2h -Filter "autoSelectGames"

# Did SQS send succeed?
.\scripts\aws-logs.ps1 -Function graphql -Since 2h -Filter "SQS"

# Was the draft processor invoked at all?
.\scripts\aws-logs.ps1 -Function draft-processor -Since 2h
```

### Step 3: Check the Dead-Letter Queues

Messages that failed all retries land in DLQs. These contain the **original payload** which reveals the exact input that caused the failure:

```powershell
$env:AWS_PAGER = ""
$env:PYTHONIOENCODING = "utf-8"

# Check DLQ message count
aws sqs get-queue-attributes `
  --queue-url "https://sqs.us-east-1.amazonaws.com/<account>/legacy-sports-dev-automatic-drafts-dlq.fifo" `
  --attribute-names ApproximateNumberOfMessages

# Peek at DLQ messages (does NOT delete them)
aws sqs receive-message `
  --queue-url "https://sqs.us-east-1.amazonaws.com/<account>/legacy-sports-dev-load-game-stats-dlq.fifo" `
  --max-number-of-messages 5 `
  --visibility-timeout 0
```

### Step 4: Trace the Full Chain

For a given failure, trace the **entire chain** from trigger to completion. Don't stop at the first error — upstream issues often cause downstream symptoms.

**Example: "Matchup stats didn't load"**

1. **Was `autoSelectGames` invoked?** → Check GraphQL Lambda logs for the mutation
2. **Did it send SQS to `select-game.fifo`?** → Look for SQS send log in GraphQL Lambda
3. **Did Game Selection Lambda receive it?** → Check game-selection Lambda logs
4. **Did it send batches to `load-game-stats.fifo`?** → Look for SQS batch send in game-selection logs
5. **Did Stats Lambda process each batch?** → Check stats Lambda logs per `matchupId`
6. **Did the last batch trigger completion?** → Look for "all batches complete" log
7. **Did the WebSocket notification fire?** → Look for notification log

**The root cause is the first broken link in the chain.**

### Step 5: Reproduce Locally or Read the Code Path

Once you know which Lambda and which code path failed, **read the source code** to understand the bug:

| Lambda                | Entry Point                                                      | Key Logic                                           |
| --------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| Draft Processor       | `lambdas/draft-processor/src/index.ts`                           | `processDraftMessage()` ~line 1130                  |
| Game Selection        | `lambdas/game-selection/src/handlers/select-game.ts`             | `selectGamesForMatchup()`                           |
| Stats Lambda (game)   | `lambdas/stats-lambda/src/load-game.ts`                          | `loadPlayerGameStats()`                             |
| Stats Lambda (career) | `lambdas/stats-lambda/src/load-career.ts`                        | `loadCareerStats()`                                 |
| Scheduled mutations   | `lambdas/db/src/schema/drafts/scheduled-mutations.ts`            | `autoProcessDraftPicks`, `autoStartScheduledDrafts` |
| Game scheduling       | `lambdas/db/src/schema/matchups/scheduled-mutations.ts`          | `autoSelectGames`, `autoAdvanceMatchups`            |
| WebSocket             | `lambdas/websocket/src/index.ts`                                 | Route handlers                                      |
| Notification service  | `lib/aws-utils/src/notification/WebSocketNotificationService.ts` | `broadcastToLeague()`, `broadcastToMatchup()`       |

### Step 6: Fix the Code, Then Recover the Data

1. **Write the code fix** — address the root cause in the Lambda/service
2. **Write a test** if the failure mode wasn't covered
3. **Then** recover the data as a separate, clearly-labeled recovery step

```typescript
// GOOD: Fix the code that caused the bad state
// In draft-processor: handle the edge case where player pool is empty
if (eligiblePlayers.length === 0) {
  throw new DraftError('No eligible players found for position', {
    position,
    leagueId,
  });
}

// Then recover: reset the affected league's draft status so the user can retry
```

```typescript
// BAD: Just fix the data and call it done
// UPDATE leagues SET draft_status = 'not-started' WHERE id = 42;
// "Fixed! The draft was stuck so I reset it."
// (The same bug will hit the next league that drafts)
```

---

## Load-on-Demand References

- **[Common Failure Scenarios](common-failure-scenarios.md)** — 5 detailed debugging playbooks: draft stuck in-progress, stats loading failed, no games selected, WebSocket notifications missing, auto-picks not processing

## Debugging Checklist

Use this checklist for any distributed failure:

- [ ] **Identified the failing boundary** (which handoff between systems failed?)
- [ ] **Read CloudWatch logs** for error messages and stack traces
- [ ] **Checked DLQ** for failed messages and their payloads
- [ ] **Traced the full chain** from trigger to expected completion
- [ ] **Read the source code** for the failing code path
- [ ] **Identified the root cause** (not just the symptom)
- [ ] **Written a code fix** that prevents recurrence
- [ ] **Added/updated a test** for the failure mode
- [ ] **Recovered data** as a separate, clearly-labeled step (if needed)
- [ ] **Verified the fix** by re-running the flow or checking logs

---

## Anti-Patterns to Avoid

| Anti-Pattern                                                 | Why It's Wrong                                   | Do This Instead                          |
| ------------------------------------------------------------ | ------------------------------------------------ | ---------------------------------------- |
| `UPDATE leagues SET draft_status = 'not-started'` as the fix | Same bug hits next league                        | Fix the code, then reset as recovery     |
| Skipping CloudWatch logs, going straight to DB               | You're guessing at the cause                     | Logs first, always                       |
| Fixing only the Lambda that errored                          | Upstream Lambda may have sent bad data           | Trace the full chain                     |
| Ignoring DLQ messages                                        | They contain the exact failing input             | Always check DLQs                        |
| Adding `try/catch` that swallows errors                      | Hides the problem, makes future debugging harder | Log and re-throw, or handle specifically |
| `eslint-disable` / `@ts-ignore` to silence type errors       | Masks the real type mismatch that caused the bug | Fix the types                            |
| Fire-and-forget notification calls                           | Lambda kills unawaited async work                | Always `await` notification calls        |

## Related Skills

- `cloudwatch-logs` — Detailed CloudWatch querying
- `database` — SQL queries, schema reference, migrations
- `architecture` — System architecture overview
