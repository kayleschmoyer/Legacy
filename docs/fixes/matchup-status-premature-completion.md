# Fix: Premature Matchup Status Completion

**Issue:** Player stats show as "loading" even when matchup appears complete  
**Jira:** N/A (user-reported bug)  
**Date:** 2026-02-13

## Problem

Users reported seeing "loading stats" status for players in matchup 54, even though stats data was present. Investigation revealed that the matchup-level `stats_loading_status` was being set to 'completed' prematurely, creating a mismatch between:

1. **Matchup level:** status = 'completed' (incorrect)
2. **Individual games:** stats_loading_status = 'pending' (correct)

### Root Cause

In `lambdas/game-selection/src/services/season-game-selector.ts`, the `selectGamesForMatchup` function was setting the matchup status to 'completed' immediately after game selection:

```typescript
// INCORRECT CODE (removed)
await db
  .update(PublicSchema.matchups)
  .set({ statsLoadingStatus: 'completed' })
  .where(eq(PublicSchema.matchups.id, matchupId));
```

This happened BEFORE stats were actually loaded from Baseball Reference.

### Correct Workflow

1. **User triggers game selection** → API sets matchup status to `queued`
2. **Game selection lambda** → Sets matchup status to `loading`, selects random games
3. **Stats loading queued** → Individual games set to `loading`
4. **Stats lambda processes** → Loads stats from Baseball Reference
5. **All batches complete** → Sets matchup status to `completed` ✅

## Solution

Removed the premature status update from `selectGamesForMatchup`. The function now:

- Maintains the `loading` status set earlier in the flow
- Allows the stats lambda to set `completed` status after all stats are actually loaded

### Files Changed

- `lambdas/game-selection/src/services/season-game-selector.ts` (lines 220-226)

### Code Changes

```typescript
// Before (WRONG):
// Update matchup stats loading status to 'completed'
await db
  .update(PublicSchema.matchups)
  .set({ statsLoadingStatus: 'completed' })
  .where(eq(PublicSchema.matchups.id, matchupId));

// After (CORRECT):
// Note: Matchup status is already set to 'loading' earlier in this function
// and will be updated to 'completed' by the stats lambda after all stats are loaded
// DO NOT set to 'completed' here - game selection is done but stats loading is not
```

## Impact

- **User-facing:** Users will no longer see confusing "loading stats" messages when matchup appears complete
- **System behavior:** Matchup status correctly reflects the actual loading state
- **Database consistency:** Matchup-level and game-level statuses now stay in sync

## Testing

1. **TypeCheck:** ✅ Passed
2. **Lint:** ✅ Passed
3. **Build:** ✅ Passed
4. **Manual test needed:** Create a new matchup, trigger game selection, verify status progression

## Related Code

- Stats loading completion: `lambdas/stats-lambda/src/load-game.ts` (lines 644-646)
- Individual game status update: `lambdas/stats-lambda/src/load-game.ts` (lines 328-337)
- UI status display: `apps/web/src/components/matchup/MatchupRosterComparison.tsx` (lines 853-867)
