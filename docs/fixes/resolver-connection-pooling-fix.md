# Resolver Connection Pooling Fix

**Date**: 2024
**Issue**: Connection pool exhaustion errors: "remaining connection slots reserved for non-replication superuser connections"
**Root Cause**: Nested GraphQL field resolvers creating independent database connections, causing connection multiplication

## Problem Analysis

### Error Location

```
Error: remaining connection slots reserved for non-replication superuser connections
    at matchups.ts:1048  // battingGame resolver
```

### Connection Multiplication Pattern

For a query with nested fields:

```graphql
{
  getMatchupPlayers(matchupId: 123) {
    games {
      battingGame { ... }   # Creates 2 connections
      pitchingGame { ... }  # Creates 2 connections
      fieldingGame { ... }  # Creates 2 connections
    }
  }
}
```

With 10 players and 3 game types:

- **Before fix**: 10 players × 3 game types × 2 connections = **60 concurrent connections**
- **After fix**: 1 shared connection per request

### Database Constraints

- AWS RDS db.t3.micro: ~77 available connections
- Reserved for superuser: 3 connections
- Available for app: ~74 connections
- **60 connections per query = immediate exhaustion**

## Solution Implementation

### Phase 1: Service Layer (Previous Session)

✅ Updated all service methods to accept `db` parameter

- MatchupService: 6 methods
- StandingsService: 12 methods
- PlayoffService: 3 methods

### Phase 2: Resolver Layer (This Session)

✅ Updated **21 resolver instances** in matchups.ts to use `context.db`

#### Resolvers Updated

**Matchup Object Fields** (2):

- `team1` - Team lookup resolver
- `team2` - Team lookup resolver

**Query Resolvers** (4):

- `getMatchupById` - Single matchup query
- `getMatchupsByLeague` - League matchups query
- `getCurrentMatchupForLeague` - Current week query
- `getMatchupsByWeek` - Week-based query

**Mutation Resolvers** (4):

- `createMatchup` - Matchup creation
- `updateMatchupScore` - Score updates
- `updateMatchupStatus` - Status transitions
- `triggerGameSelection` - Game selection workflow

**MatchupPlayer Nested Fields** (5):

- `player` - Player info resolver
- `seasonBatting` - Season batting stats
- `seasonPitching` - Season pitching stats
- `seasonFielding` - Season fielding stats
- `games` - Player games list

**MatchupPlayerGame Nested Fields** (3) - **CRITICAL**:

- `battingGame` - **Line 1048 error source** - 2 DB calls → sequential context.db queries
- `pitchingGame` - 2 DB calls → sequential context.db queries
- `fieldingGame` - 2 DB calls → sequential context.db queries

**Complex Query Resolvers** (1):

- `getMatchupPlayers` - 4 sequential DB calls using context.db

**Additional Updates** (2):

- Removed `runWithPublicClient` import
- Removed `getDbOptions` import

## Code Pattern Changes

### Before (Creating New Connection)

```typescript
fieldingGame: t.field({
  type: GameFieldingRef,
  nullable: true,
  resolve: async (game) => {  // ❌ No context parameter
    if (!game.fieldingGameNum) return null;

    return runWithPublicClient(getDbOptions(), async (db) => {  // ❌ Creates connection
      const mpResult = await db.select()...;

      return runWithPublicClient(getDbOptions(), async (db) => {  // ❌ Creates another connection!
        const result = await db.select()...;
        return result[0] || null;
      });
    });
  },
}),
```

### After (Using Shared Connection)

```typescript
fieldingGame: t.field({
  type: GameFieldingRef,
  nullable: true,
  resolve: async (game, _args, context) => {  // ✅ Accepts context
    if (!game.fieldingGameNum) return null;

    // ✅ First query using shared connection
    const mpResult = await context.db
      .select()
      .from(PublicSchema.matchupPlayers)
      .where(eq(PublicSchema.matchupPlayers.id, game.matchupPlayerId))
      .limit(1);

    if (!mpResult[0]) return null;

    // ✅ Second query using same shared connection
    const matchupResult = await context.db
      .select()
      .from(PublicSchema.matchups)
      .where(eq(PublicSchema.matchups.id, mpResult[0].matchupId))
      .limit(1);

    // ... more sequential queries using context.db

    return result[0] || null;
  },
}),
```

## Key Changes

1. **Resolver Signature**: Added `context` parameter to all nested field resolvers
   - `resolve: async (parent)` → `resolve: async (parent, _args, context)`

2. **Connection Access**: Use shared connection from GraphQL context
   - `runWithPublicClient(getDbOptions(), async (db) => {...})` → `context.db`

3. **Sequential Queries**: Multiple DB operations use same connection
   - Nested `runWithPublicClient` calls → Sequential `context.db` queries

4. **Import Cleanup**: Removed unnecessary imports
   - No longer need `runWithPublicClient` or `getDbOptions` in resolvers

## Testing & Verification

### Compilation

✅ `pnpm exec nx run db:typecheck` - All types valid
✅ `pnpm exec nx run db:lint --fix` - Code quality checks pass

### Runtime Testing Needed

- [ ] Test `getMatchupPlayers` query with nested `games.battingGame` fields
- [ ] Monitor connection count with `make db-check-connections` during query
- [ ] Verify connection pool usage stays at 1-2 per GraphQL request
- [ ] Load test with multiple concurrent requests

### Expected Results

- Connection count per request: 60 → 1
- Available connections: Restored to ~73 (instead of ~14)
- No more "remaining connection slots" errors

## Benefits

1. **Connection Pool Health**: Single connection per GraphQL request regardless of query complexity
2. **Scalability**: Can handle more concurrent users (60x improvement)
3. **Performance**: Reduced connection overhead and handshake time
4. **Maintainability**: Consistent pattern across all resolvers
5. **Type Safety**: All resolver changes maintain full TypeScript type checking

## Related Documentation

- Service Layer Refactoring: [service-layer-db-parameter.md](./service-layer-db-parameter.md)
- Connection Pool Monitoring: `make db-check-connections`
- GraphQL Context Setup: [lambdas/db/src/index.ts](../../lambdas/db/src/index.ts)

## Deployment Checklist

- [x] Update service layer methods
- [x] Update all resolver call sites
- [x] Update nested field resolvers
- [x] Remove unused imports
- [x] Verify compilation (typecheck)
- [x] Verify code quality (lint)
- [ ] Integration testing
- [ ] Deploy to dev environment
- [ ] Monitor connection pool usage
- [ ] Deploy to production

## Files Modified

1. `lambdas/db/src/schema/matchups.ts` (1,304 lines)
   - 21 resolver functions updated
   - 2 imports removed
2. Related Service Files (Previous Session):
   - `lambdas/db/src/services/matchup-service.ts`
   - `lambdas/db/src/services/standings-service.ts`
   - `lambdas/db/src/services/playoff-service.ts`
   - `lambdas/db/src/schema/playoff-schema.ts`

## Lessons Learned

1. **Nested resolvers are critical**: Connection issues can occur at ANY nesting level, not just top-level queries
2. **Connection multiplication**: Each resolver creating connections multiplies by data volume (players × games × stat types)
3. **GraphQL context pattern**: Always use `context` parameter in nested field resolvers to access shared resources
4. **Sequential is fine**: Sequential queries using shared connection are better than parallel queries with separate connections
5. **Grep is essential**: Used `grep_search` to find all 21 instances that needed updating

## Prevention

To prevent similar issues in the future:

1. **Code Review Checklist**:
   - All GraphQL resolvers must use `context.db`
   - No `runWithPublicClient` in resolver layer
   - Nested field resolvers must accept `context` parameter

2. **Linting Rule** (Future Enhancement):
   - Create ESLint rule to flag `runWithPublicClient` usage in schema files

3. **Documentation**:
   - This document serves as reference for future resolver development
   - Update onboarding docs to emphasize shared connection pattern

## Success Criteria

✅ All resolvers compile without errors
✅ All linting checks pass
⏳ Connection pool usage reduced to 1-2 per request
⏳ No connection exhaustion errors under load
⏳ Integration tests pass

**Status**: Code changes complete and verified. Ready for integration testing.
