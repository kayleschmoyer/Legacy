# GraphQL Code Generation

This package uses GraphQL Code Generation to automatically generate TypeScript types and Apollo hooks from GraphQL documents.

## Structure

- `src/api/db/*.graphql` - GraphQL fragments and queries
- `src/api/db/graphql.generated.ts` - Auto-generated TypeScript types and hooks
- `src/api/db/graphql.schema.json` - GraphQL schema introspection
- `codegen.ts` - Configuration for GraphQL Code Generator

## Files

### `player.fragment.graphql`

Defines the core Player fragment with basic player fields (id, name, brefId).

### `getAllPlayers.query.graphql`

Query to fetch all players with pagination and sorting support. Uses the Player fragment.

## Usage

### Running Code Generation

```bash
npm run codegen
```

### Using Generated Types

```typescript
import {
  useGetAllPlayersQuery,
  PlayerFragment,
} from '../../api/db/graphql.generated';

// The hook is automatically typed
const { data, loading, error } = useGetAllPlayersQuery({
  variables: {
    first: 50,
    orderBy: ['NAME_ASC'],
  },
});
```

## Benefits

1. **Type Safety**: All GraphQL operations are fully typed
2. **Auto-completion**: IDE support for GraphQL queries and responses
3. **Single Source of Truth**: GraphQL schema defines the types
4. **Maintainability**: Changes to schema automatically update TypeScript types
5. **Performance**: Generated documents are optimized

## Adding New Queries

1. Create a new `.graphql` file in `src/api/db/`
2. Run `npm run codegen` to generate types
3. Import and use the generated hooks

Example:

```graphql
# getPlayer.query.graphql
query GetPlayer($id: Int!) {
  player(id: $id) {
    ...Player
  }
}
```

After running codegen, you can use:

```typescript
import { useGetPlayerQuery } from '../../api/db/graphql.generated';
```
