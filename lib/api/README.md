# @legacy-sports/api

A modular GraphQL API client library for legacy sports data, organized by resource type for better maintainability and developer experience.

## 🏗️ Project Structure

```
src/
├── resources/           # GraphQL operations organized by resource type
│   ├── players/        # Player-related queries and fragments
│   │   ├── player.fragment.graphql
│   │   ├── getAllPlayers.query.graphql
│   │   ├── getPlayer.query.graphql
│   │   ├── getPlayerByBrefId.query.graphql
│   │   └── index.ts
│   ├── teams/          # Team-related queries and fragments
│   │   ├── team.fragment.graphql
│   │   ├── getAllTeams.query.graphql
│   │   ├── getTeam.query.graphql
│   │   └── index.ts
│   └── stats/          # Statistics organized by category
│       ├── batting/    # Batting statistics
│       ├── fielding/   # Fielding statistics
│       ├── pitching/   # Pitching statistics
│       └── index.ts
├── shared/             # Shared GraphQL schema and generated types
│   ├── graphql.generated.ts    # Generated TypeScript types
│   ├── graphql.schema.json     # GraphQL schema introspection
│   └── hello.query.graphql     # Test query
└── index.ts           # Main export file
```

## 📊 Resource Types

### Players (`/resources/players/`)

- **Fragments**: `Player` - Core player fields
- **Queries**: Get all players, get player by ID, get player by Baseball Reference ID

### Teams (`/resources/teams/`)

- **Fragments**: `Team` - Core team fields
- **Queries**: Get all teams, get team by ID

### Statistics (`/resources/stats/`)

#### Batting (`/stats/batting/`)

- **Fragments**: `SeasonBatting`, `CareerBatting`
- **Queries**: Season stats, all season stats for a player

#### Fielding (`/stats/fielding/`)

- **Fragments**: `SeasonFielding`
- **Queries**: Season fielding stats, all season fielding for a player

#### Pitching (`/stats/pitching/`)

- **Fragments**: `SeasonPitching`
- **Queries**: Season pitching stats, all season pitching for a player

## 🚀 Usage

### Import Everything

```typescript
import { Player, Team, SeasonBatting } from '@legacy-sports/api';
```

### Import by Resource Type

```typescript
import { players, teams, stats } from '@legacy-sports/api/resources';

// Use resource-specific exports
const playerQueries = players;
const battingStats = stats.batting;
```

### Use Generated Hooks (React)

```typescript
import { useGetAllPlayersQuery, useGetPlayerQuery } from '@legacy-sports/api';

function PlayersComponent() {
  const { data: players } = useGetAllPlayersQuery();
  const { data: player } = useGetPlayerQuery({ variables: { id: 1 } });

  return <div>{/* Render players */}</div>;
}
```

## 🔧 Development

### Code Generation

Generate TypeScript types and React hooks from GraphQL schema:

```bash
nx run api:codegen
```

This will:

- Fetch the latest schema from the GraphQL endpoint
- Generate TypeScript types in `src/shared/graphql.generated.ts`
- Create React Apollo hooks for all queries and mutations
- Update schema introspection file

### Adding New Resources

1. **Create resource directory**: `src/resources/new-resource/`
2. **Add fragments**: Define reusable field fragments
3. **Add queries**: Create specific queries for the resource
4. **Create index.ts**: Export all operations from the resource
5. **Update main index**: Add exports to main `src/resources/index.ts`
6. **Run codegen**: Generate types for new operations

### Example: Adding a new query

```graphql
# src/resources/players/getPlayerStats.query.graphql
query GetPlayerStats($playerId: Int!) {
  player(id: $playerId) {
    ...Player
    seasonBattings {
      nodes {
        ...SeasonBatting
      }
    }
  }
}

#import "./player.fragment.graphql"
#import "../stats/batting/seasonBatting.fragment.graphql"
```

## 🎯 Design Principles

1. **Resource-based Organization**: GraphQL operations are grouped by the primary resource they operate on
2. **Fragment Reuse**: Common field sets are defined as fragments and reused across queries
3. **Type Safety**: All operations generate TypeScript types and React hooks
4. **Clear Imports**: Developers can import exactly what they need
5. **Consistent Patterns**: Each resource follows the same structure and naming conventions

## 🔗 Related Packages

- `@legacy-sports/shared-components` - Uses this API for player data
- `@legacy-sports/db-client` - Database access layer
- `@legacy-sports/data-loaders` - Data fetching utilities

## 📝 Generated Files

- `src/shared/graphql.generated.ts` - TypeScript types, React hooks, and Apollo operations
- `src/shared/graphql.schema.json` - GraphQL schema introspection data

> **Note**: Generated files are automatically created by the codegen process and should not be edited manually.

## Building

Run `nx build api` to build the library.

## Running unit tests

Run `nx test api` to execute the unit tests via [Jest](https://jestjs.io).
