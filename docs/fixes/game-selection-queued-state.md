# Game Selection Queued State Implementation

## Overview

Added 'queued' state to the `statsLoadingStatus` enum to provide immediate UI feedback when game selection is triggered, before the Lambda function picks up the message from SQS.

## Status Workflow

### Before (3 states)

```
not_started → loading → completed/failed
```

### After (4 states)

```
not_started → queued → loading → completed/failed
```

## Changes Made

### 1. Database Schema

**File:** `lib/db-client/src/drizzle/public/models/Matchups.ts`

Added 'queued' to the enum:

```typescript
export const statsLoadingStatus = pgEnum('stats_loading_status', [
  'not_started',
  'queued', // NEW
  'loading',
  'completed',
  'failed',
]);
```

### 2. GraphQL Schema

**File:** `lambdas/db/src/schema/matchups.ts`

Updated enum definition and TypeScript type:

```typescript
const StatsLoadingStatus = builder.enumType('StatsLoadingStatus', {
  values: ['not_started', 'queued', 'loading', 'completed', 'failed'] as const,
});

interface Matchup {
  // ...
  statsLoadingStatus:
    | 'not_started'
    | 'queued'
    | 'loading'
    | 'completed'
    | 'failed';
}
```

### 3. Mutation Handler

**File:** `lambdas/db/src/schema/matchups.ts` (mutation)

Changed from setting 'loading' to 'queued':

```typescript
// Update status to 'queued' before triggering game selection
await context.db
  .update(PublicSchema.matchups)
  .set({ statsLoadingStatus: 'queued' }) // Was 'loading'
  .where(eq(PublicSchema.matchups.id, args.matchupId));
```

### 4. Lambda Handler

**File:** `lambdas/game-selection/src/services/season-game-selector.ts`

Added status transition from 'queued' to 'loading':

```typescript
// Update matchup stats loading status to 'loading' (transitioning from 'queued')
await db
  .update(PublicSchema.matchups)
  .set({ statsLoadingStatus: 'loading' })
  .where(eq(PublicSchema.matchups.id, matchupId));
```

### 5. UI Component

**File:** `apps/web/src/components/commissioner/NextStepControl.tsx`

- Added 'queued' state handling with blue color scheme:

  ```typescript
  backgroundColor={
    currentMatchup.statsLoadingStatus === 'queued'
      ? '$blue3'
      : currentMatchup.statsLoadingStatus === 'loading'
      ? '$yellow3'
      : // ... other states
  }
  ```

- Updated button disabling logic:
  ```typescript
  const isGameSelectionInProgress =
    currentMatchup?.statsLoadingStatus === 'queued' ||
    currentMatchup?.statsLoadingStatus === 'loading';
  ```

### 6. Documentation

**File:** `docs/agents/async-state-management.csv`

Updated documentation to reflect new workflow:

- `not_started → queued → loading → completed/failed`

### 7. Database Migration

**File:** `scripts/add-queued-status.sql`

Created SQL script to add enum value:

```sql
ALTER TYPE stats_loading_status ADD VALUE IF NOT EXISTS 'queued' BEFORE 'loading';
```

## Benefits

1. **Immediate UI Feedback**: Button becomes disabled and shows "queued" status as soon as user clicks
2. **Better UX**: User knows immediately that their action was received
3. **Prevents Duplicates**: Button is disabled during both 'queued' and 'loading' states
4. **Clear State Transitions**: Easy to debug by seeing exactly where the process is:
   - `queued` = Message sent to SQS, waiting for Lambda
   - `loading` = Lambda picked up message and is processing
   - `completed`/`failed` = Lambda finished

## Deployment Steps

### Local Development

1. Run SQL migration on local database:

   ```powershell
   # Connect to local database
   psql -h localhost -U postgres -d legacy_sports_dev

   # Run migration
   \i scripts/add-queued-status.sql
   ```

2. Restart local DB Lambda to pick up schema changes:

   ```powershell
   # Kill existing process
   # Restart with: pnpm exec nx run db:serve
   ```

3. Regenerate GraphQL types:
   ```powershell
   pnpm exec nx run shared-components:codegen
   ```

### Production Deployment

1. Run SQL migration on production database
2. Deploy game-selection Lambda with new code
3. Deploy DB Lambda with schema changes
4. Deploy web app with UI updates

## Testing Checklist

- [ ] Clicking "Select Game X" immediately shows "queued" status
- [ ] Button is disabled while "queued"
- [ ] Status transitions to "loading" when Lambda starts
- [ ] Status transitions to "completed" when Lambda finishes
- [ ] Status transitions to "failed" on error
- [ ] Can't click button multiple times (no duplicate processing)
- [ ] UI updates automatically via refetchQueries

## Color Scheme

| State     | Background | Border     | Text        |
| --------- | ---------- | ---------- | ----------- |
| queued    | `$blue3`   | `$blue8`   | `$blue11`   |
| loading   | `$yellow3` | `$yellow8` | `$yellow11` |
| completed | `$green3`  | `$green8`  | `$green11`  |
| failed    | `$red3`    | `$red8`    | `$red11`    |

## Related Documentation

- [Async State Management](../docs/agents/async-state-management.csv)
- [Game Selection Lambda](../lambdas/game-selection/README.md)
- [SQS FIFO Queue Configuration](../terraform/sqs.tf)
