# Service Layer Database Parameter Update

## Overview

Updated all service layer methods to accept a `db` parameter (database connection) so they can be called from multiple contexts without creating new connections.

## Problem Statement

Previously, service methods created their own database connections using `runWithPublicClient(getDbOptions(), async (db) => {...})`. This caused issues:

1. **Lambda context**: GraphQL resolvers should share a single connection via `context.db`
2. **Standalone lambdas**: Each lambda should manage its own connection lifecycle
3. **CLI tools**: Command-line tools should control when connections are created/destroyed
4. **Testing**: Tests should be able to inject mock connections

## Solution

All service methods now accept `db: GenericDatabase<typeof PublicSchema>` as their first parameter, making them:

- **Reusable** across different execution contexts
- **Testable** with dependency injection
- **Efficient** by reusing existing connections

## Changes Made

### 1. MatchupService

**File**: `lambdas/db/src/services/matchup-service.ts`

**Updated Methods**:

- `generateSchedule(db, params)` - Generate matchup schedule
- `saveSchedule(db, leagueId, scheduleResult)` - Save schedule to database
- `generateAndSaveSchedule(db, params)` - Combined operation
- `createMatchup(db, params)` - Create single matchup
- `getLeagueMatchups(db, leagueId)` - Get all matchups for league
- `getWeekMatchups(db, leagueId, weekNumber)` - Get matchups for specific week

**Removed Imports**:

- `runWithPublicClient` - No longer creates connections
- `getDbOptions` - Connection config handled by caller

### 2. StandingsService

**File**: `lambdas/db/src/services/standings-service.ts`

**Updated Methods**:

- `getStandings(db, params)` - Get league standings
- `getHeadToHead(db, params)` - Head-to-head record between teams
- `getSeasonSummary(db, leagueId, season)` - Complete season results
- `getPlayoffRace(db, params)` - Playoff qualification status
- `getTeamRecentMatchups(db, teamId, limit)` - Recent matchups for team
- `getMatchupHistory(db, params)` - Historical matchups with filtering
- `getMatchupStats(db, leagueId, season)` - Matchup status counts
- `getLeagueOverview(db, leagueId, season)` - Comprehensive league data
- `getTeamWinStreak(db, teamId)` - Consecutive wins count
- `getPowerRankings(db, leagueId, season)` - Rankings by point differential
- `getClosestMatchups(db, leagueId, season, limit)` - Closest margin games
- `getBlowoutMatchups(db, leagueId, season, limit)` - Largest margin games

### 3. PlayoffService

**File**: `lambdas/db/src/services/playoff-service.ts`

**Updated Methods**:

- `createBracket(db, params)` - Create playoff bracket with seeding
- `advanceBracket(db, bracketId)` - Move winners to next round
- `awardChampionship(db, bracketId)` - Award championship trophy

**Special Note**: `createBracket` calls `StandingsService.getStandings()` which now also requires the `db` parameter.

## Updated Call Sites

### GraphQL Resolvers

**Files**: `lambdas/db/src/schema/matchups.ts`, `lambdas/db/src/schema/playoff-schema.ts`

**Pattern**:

```typescript
// Before
resolve: async (_parent, args) => {
  const result = await SomeService.someMethod(args.param);
  return result;
};

// After
resolve: async (_parent, args, context) => {
  const result = await SomeService.someMethod(context.db, args.param);
  return result;
};
```

**Updated Resolvers**:

- All `StandingsService` calls in `matchups.ts` (8 resolvers)
- All `PlayoffService` calls in `playoff-schema.ts` (3 mutations)

## Usage Patterns

### From GraphQL Resolvers

```typescript
resolve: async (_parent, args, context) => {
  // Use shared connection from context
  const standings = await StandingsService.getStandings(context.db, {
    leagueId: args.leagueId,
    season: args.season,
  });
  return standings;
};
```

### From Standalone Lambdas

```typescript
import { runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { StandingsService } from './services/standings-service';

export const handler = async (event) => {
  return await runWithPublicClient(getDbOptions(), async (db) => {
    // Service uses provided connection
    const standings = await StandingsService.getStandings(db, {
      leagueId: event.leagueId,
    });
    return standings;
  });
};
```

### From CLI Tools

```typescript
import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { StandingsService } from './services/standings-service';

const dbService = createDatabaseService(getDbOptions());
const db = await dbService.getDb();

try {
  // Service uses long-lived connection
  const standings = await StandingsService.getStandings(db, {
    leagueId: 123,
  });
  console.log(standings);
} finally {
  await dbService.close();
}
```

### From Tests

```typescript
import { StandingsService } from './standings-service';

// Mock database connection
const mockDb = {
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([
        /* test data */
      ]),
    }),
  }),
};

// Test with injected dependency
const result = await StandingsService.getStandings(mockDb as any, {
  leagueId: 1,
});

expect(result).toEqual(/* expected data */);
```

## Benefits

### 1. Connection Reuse

- GraphQL requests share a single connection across all nested resolvers
- Eliminates connection pool exhaustion on complex queries
- Reduces latency by avoiding connection setup overhead

### 2. Flexible Execution Context

- Same service code works in Lambda, CLI, and test environments
- Caller controls connection lifecycle and configuration
- Easier to implement connection pooling strategies

### 3. Improved Testability

- Mock connections can be injected for unit testing
- No need to mock `runWithPublicClient` wrapper
- Tests run faster without real database connections

### 4. Better Error Handling

- Connection errors handled at the caller level
- Failed connections don't leave orphaned pools
- Easier to implement retry logic and circuit breakers

## Migration Checklist

When creating new services or updating existing ones:

- [ ] First parameter is `db: GenericDatabase<typeof PublicSchema>`
- [ ] Remove `runWithPublicClient` wrapper
- [ ] Remove `getDbOptions` import
- [ ] Update all call sites to pass `context.db` or connection parameter
- [ ] Add unit tests with mocked database
- [ ] Update documentation with usage examples

## Related Documentation

- [Database Connection Lifecycle](./database-connection-lifecycle.md)
- [GraphQL Context Pattern](./graphql-context-pattern.md)
- [Connection Pool Exhaustion Fix](./connection-pool-exhaustion-fix.md)
