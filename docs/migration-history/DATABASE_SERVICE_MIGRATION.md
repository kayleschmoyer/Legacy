# Database Client Service Layer Migration

## Overview

Successfully migrated repetitive database interaction code from individual GraphQL resolvers to a shared service layer in the `@legacy-sports/db-client` package. This provides:

- **Reusable database operations** for both Lambda functions and CLI scripts
- **Type-safe query builders** with filtering, pagination, and sorting
- **Simplified API** that eliminates boilerplate connection management
- **Consistent patterns** across the entire codebase

## New Service Architecture

### Service Classes

#### UserService (`lib/db-client/src/lib/services/UserService.ts`)

- `getUsers(options)` - Get users with filtering, pagination, sorting
- `getUserById(id)` - Get single user by ID
- `getUserByEmail(email)` - Get single user by email
- `getUsersByIds(ids)` - Get multiple users by IDs
- `countUsers(filters)` - Count users with optional filtering
- `searchUsers(term, limit)` - Search users by email/username

#### PlayerService (`lib/db-client/src/lib/services/PlayerService.ts`)

- `getPlayers(options)` - Get players with filtering, pagination, sorting
- `getPlayerById(id)` - Get single player by ID
- `getPlayerByBrefId(brefId)` - Get player by Baseball Reference ID
- `getPlayersByIds(ids)` - Get multiple players by IDs
- `countPlayers(filters)` - Count players with optional filtering
- `searchPlayers(term, limit)` - Search players by name

#### DatabaseService (`lib/db-client/src/lib/services/index.ts`)

Combined service providing access to all entity services:

```typescript
const dbService = createDatabaseService(getDbOptions());
// Access: dbService.users.*, dbService.players.*
```

### Type Definitions

#### UserFilters

```typescript
interface UserFilters {
  ids?: number[];
  email?: string;
  emailLike?: string;
  username?: string;
  usernameLike?: string;
  accessLevel?: 'none' | 'admin';
  hasEmail?: boolean;
}
```

#### PlayerFilters

```typescript
interface PlayerFilters {
  ids?: number[];
  name?: string;
  nameLike?: string;
  brefId?: string;
}
```

#### QueryOptions

```typescript
interface UserQueryOptions {
  filters?: UserFilters;
  limit?: number;
  offset?: number;
  orderBy?: 'id' | 'email' | 'username';
  orderDirection?: 'asc' | 'desc';
}
```

## Migration Changes

### Before (GraphQL Resolvers)

```typescript
// Old repetitive pattern in each resolver
builder.queryField('users', (t) =>
  t.field({
    type: [UserRef],
    resolve: async () => {
      const options = getDbOptions();
      const connection = getPublicDbConnection(options);

      try {
        await connection.initialize();
        const result = await connection.db.select().from(PublicSchema.users);
        return result;
      } finally {
        await connection.close();
      }
    },
  }),
);
```

### After (Service Layer)

```typescript
// New simplified pattern using services
builder.queryField('users', (t) =>
  t.field({
    type: [UserRef],
    args: {
      limit: t.arg.int({ required: false }),
      offset: t.arg.int({ required: false }),
      orderBy: t.arg.string({ required: false }),
      orderDirection: t.arg.string({ required: false }),
    },
    resolve: async (root, args) => {
      const dbService = createDatabaseService(getDbOptions());

      return dbService.users.getUsers({
        limit: args.limit || undefined,
        offset: args.offset || undefined,
        orderBy: (args.orderBy as 'id' | 'email' | 'username') || 'id',
        orderDirection: (args.orderDirection as 'asc' | 'desc') || 'asc',
      });
    },
  }),
);
```

## Usage Examples

### Lambda Function Usage

```typescript
import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';

// In GraphQL resolver
const dbService = createDatabaseService(getDbOptions());

// Get paginated users
const users = await dbService.users.getUsers({
  limit: 10,
  offset: 0,
  orderBy: 'email',
  orderDirection: 'asc',
});

// Search players
const players = await dbService.players.searchPlayers('Aaron', 5);
```

### CLI Script Usage

```typescript
import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';

async function main() {
  const dbService = createDatabaseService(getDbOptions());

  // Get user count
  const userCount = await dbService.users.countUsers();

  // Find user by email
  const user = await dbService.users.getUserByEmail('user@example.com');

  // Get players with filtering
  const players = await dbService.players.getPlayers({
    filters: { nameLike: 'Smith' },
    limit: 20,
    orderBy: 'name',
  });
}
```

## Files Modified

### New Service Files

- `lib/db-client/src/lib/services/UserService.ts` - User database operations
- `lib/db-client/src/lib/services/PlayerService.ts` - Player database operations
- `lib/db-client/src/lib/services/index.ts` - Combined service exports
- `lib/db-client/src/index.ts` - Updated to export services

### Updated GraphQL Resolvers

- `lambdas/db/src/schema/users.ts` - Now uses UserService
- `lambdas/db/src/schema/players.ts` - Now uses PlayerService

### New CLI Command

- `apps/cli/src/commands/test-database.ts` - Demonstration of service usage
- `apps/cli/src/main.ts` - Added `test-database` command

## Benefits Achieved

1. **Eliminated Code Duplication**: Removed repetitive connection management from 6+ resolver functions
2. **Type Safety**: All database operations now have proper TypeScript types and compile-time validation
3. **Enhanced Functionality**: Added filtering, searching, pagination, and sorting capabilities
4. **Shared Usage**: Same service functions work in both Lambda and CLI contexts
5. **Maintainability**: Database logic centralized in service layer for easier maintenance
6. **Consistency**: Uniform API patterns across all database operations

## Testing

Run the new CLI command to test the service layer:

```bash
npm run start test-database
```

This will demonstrate:

- User operations (list, count, get by ID)
- Player operations (list, count, search)
- Proper connection management
- Error handling

## Next Steps

1. **Add More Entity Services**: Create services for other database entities (teams, stats, etc.)
2. **Add Mutation Operations**: Extend services with create, update, delete operations
3. **Add Caching**: Implement result caching for frequently accessed data
4. **Add Batch Operations**: Add bulk insert/update capabilities
5. **Add Transactions**: Support for multi-operation transactions
