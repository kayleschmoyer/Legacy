# GraphQL Schema Reference

## Overview

The Legacy Sports GraphQL API provides a unified interface for all data operations across web and mobile platforms. The schema is built with modern GraphQL best practices and includes comprehensive type safety.

## API Endpoints

### Development

- **GraphQL Endpoint**: `http://localhost:5001/graphql`
- **GraphQL Playground**: `http://localhost:5001/playground`

### Production

- **GraphQL Endpoint**: `https://u65oy98s9d.execute-api.us-east-1.amazonaws.com/dev/graphql`

## Core Types

### User Management

```graphql
type User {
  id: ID!
  email: String!
  name: String
  profilePicture: String
  createdAt: DateTime!
  updatedAt: DateTime!

  # Relationships
  leagues: [League!]!
  teams: [Team!]!
  draftPicks: [DraftPick!]!
}

input CreateUserInput {
  email: String!
  name: String
  profilePicture: String
}

input UpdateUserInput {
  name: String
  profilePicture: String
}
```

### League Management

```graphql
type League {
  id: ID!
  name: String!
  description: String
  season: String!
  maxTeams: Int!
  draftDate: DateTime
  status: LeagueStatus!
  settings: LeagueSettings!

  # Relationships
  teams: [Team!]!
  draftPicks: [DraftPick!]!
  owner: User!
}

enum LeagueStatus {
  DRAFT
  ACTIVE
  COMPLETED
  CANCELLED
}

type LeagueSettings {
  rosterSize: Int!
  startingLineup: StartingLineupConfig!
  scoring: ScoringConfig!
  waivers: WaiverConfig!
}
```

### Player & Team Data

````graphql
type Player {
  id: ID!
  name: String!
  position: Position!
  team: String!
  jerseyNumber: Int
  stats: PlayerStats

  # Career data
  birthDate: Date
  height: String
  weight: Int
  college: String
}

enum Position {
  QB # Quarterback
  RB # Running Back
  WR # Wide Receiver
  TE # Tight End
  K # Kicker
  DEF # Defense/Special Teams
}

type Team {
  id: ID!
  name: String!
  owner: User!
  league: League!

  # Roster
  players: [RosterPlayer!]!

  # Performance
  wins: Int!
  losses: Int!
  ties: Int!
  pointsFor: Float!
  pointsAgainst: Float!
}

### Scoring Types

```graphql
type LeagueScoringProfile {
  profileId: Int
  leagueId: Int
  profileName: String
  definitions: [ScoringStatDefinition!]!
  entries: [LeagueScoringProfileEntry!]!
  stats: [LeagueScoringStatValue!]!
  multiplierGroups: [LeagueScoringMultiplierGroup!]!
}

type ScoringStatDefinition {
  id: Int!
  statKey: String!
  statGroup: ScoringStatGroup!
  sourceTable: String!
  sourceColumn: String!
  displayName: String!
  description: String
  defaultMultiplier: Float!
  minMultiplier: Float!
  maxMultiplier: Float!
  stepSize: Float!
  isRequired: Boolean!
  enforcePositive: Boolean!
  enforceNegative: Boolean!
}

type LeagueScoringStatValue {
  definition: ScoringStatDefinition!
  multiplier: Float!
  defaultMultiplier: Float!
  isOverride: Boolean!
  isEnabled: Boolean!
}

type LeagueScoringMultiplierGroup {
  group: ScoringStatGroup!
  values: [ScoringMultiplierEntry!]!
}

type ScoringMultiplierEntry {
  statKey: String!
  sourceColumn: String!
  multiplier: Float!
}

input UpdateLeagueScoringMultiplierInput {
  statDefinitionId: Int!
  multiplier: Float
  isEnabled: Boolean
}
````

````

### Scoring Types

```graphql
type LeagueScoringProfile {
  profileId: Int
  leagueId: Int
  profileName: String
  definitions: [ScoringStatDefinition!]!
  entries: [LeagueScoringProfileEntry!]!
  stats: [LeagueScoringStatValue!]!
  multiplierGroups: [LeagueScoringMultiplierGroup!]!
}

type ScoringStatDefinition {
  id: Int!
  statKey: String!
  statGroup: ScoringStatGroup!
  sourceTable: String!
  sourceColumn: String!
  displayName: String!
  description: String
  defaultMultiplier: Float!
  minMultiplier: Float!
  maxMultiplier: Float!
  stepSize: Float!
  isRequired: Boolean!
  enforcePositive: Boolean!
  enforceNegative: Boolean!
}

type LeagueScoringStatValue {
  definition: ScoringStatDefinition!
  multiplier: Float!
  defaultMultiplier: Float!
  isOverride: Boolean!
  isEnabled: Boolean!
}

type LeagueScoringMultiplierGroup {
  group: ScoringStatGroup!
  values: [ScoringMultiplierEntry!]!
}

type ScoringMultiplierEntry {
  statKey: String!
  sourceColumn: String!
  multiplier: Float!
}

input UpdateLeagueScoringMultiplierInput {
  statDefinitionId: Int!
  multiplier: Float
  isEnabled: Boolean
}
```

## Query Operations

### Authentication Queries

```graphql
# Get current user profile
query GetCurrentUser {
  me {
    id
    email
    name
    profilePicture
    leagues {
      id
      name
      status
    }
  }
}

# Verify authentication status
query VerifyAuth {
  me {
    id
    email
  }
}
````

### League Queries

```graphql
# Get user's leagues
query GetUserLeagues {
  me {
    leagues {
      id
      name
      description
      season
      status
      maxTeams
      teams {
        id
        name
        owner {
          name
        }
      }
    }
  }
}

# Get league details with teams
query GetLeague($leagueId: ID!) {
  league(id: $leagueId) {
    id
    name
    description
    season
    status
    maxTeams
    settings {
      rosterSize
      startingLineup {
        qb
        rb
        wr
        te
        k
        def
        bench
      }
      scoring {
        profileId
        profileName
      }
    }
    teams {
      id
      name
      owner {
        id
        name
      }
      players {
        id
        player {
          name
          position
          team
        }
        position
      }
    }
  }
}
```

### Scoring Queries

- `leagueScoringProfile` requires an authenticated league member and returns the merged default + override multipliers, grouped for UI editors.
- `defaultScoringProfile` is available without authentication so clients can seed forms before a league is selected.
- `scoringDefinitions` exposes the canonical catalog of stats and bounds used to validate multiplier edits.

```graphql
# Fetch full scoring profile for a league
query GetLeagueScoringProfile($leagueId: Int!) {
  leagueScoringProfile(leagueId: $leagueId) {
    profileId
    profileName
    stats {
      definition {
        statKey
        statGroup
        displayName
      }
      multiplier
      defaultMultiplier
      isOverride
    }
  }
}

# Read global default scoring configuration
query GetDefaultScoringProfile {
  defaultScoringProfile {
    profileName
    multiplierGroups {
      group
      values {
        statKey
        multiplier
      }
    }
  }
}

# Load catalog of scoring stat definitions for UI/editor tooling
query GetScoringDefinitions {
  scoringDefinitions {
    id
    statKey
    statGroup
    displayName
    defaultMultiplier
  }
}
```

### Player & Draft Queries

```graphql
# Search players by position
query SearchPlayers($position: Position, $search: String, $limit: Int) {
  players(position: $position, search: $search, limit: $limit) {
    id
    name
    position
    team
    stats {
      season
      passingYards
      rushingYards
      receivingYards
      touchdowns
    }
  }
}

# Get draft status
query GetDraftStatus($leagueId: ID!) {
  league(id: $leagueId) {
    id
    name
    draftDate
    status
    draftPicks {
      id
      round
      pick
      player {
        name
        position
        team
      }
      team {
        name
        owner {
          name
        }
      }
    }
  }
}
```

## Mutation Operations

### User Management

```graphql
# Update user profile
mutation UpdateProfile($input: UpdateUserInput!) {
  updateUser(input: $input) {
    id
    name
    profilePicture
  }
}
```

### Scoring

- `updateLeagueScoringProfile` enforces commissioner-or-higher permissions (unless the caller is an admin) and requires each update to include at least one of `multiplier` or `isEnabled`.
- Input values are validated against the bounds defined on `scoringDefinitions`; violations surface as GraphQL errors.
- Successful mutations return the refreshed profile so clients can update caches without a follow-up query.

```graphql
# Update league scoring multipliers
mutation UpdateLeagueScoringProfile(
  $leagueId: Int!
  $updates: [UpdateLeagueScoringMultiplierInput!]!
) {
  updateLeagueScoringProfile(leagueId: $leagueId, updates: $updates) {
    profileId
    profileName
    stats {
      definition {
        id
        displayName
        statKey
        statGroup
        sourceColumn
      }
      multiplier
      defaultMultiplier
      isOverride
      isEnabled
    }
  }
}
```

### League Management

```graphql
# Create new league
mutation CreateLeague($input: CreateLeagueInput!) {
  createLeague(input: $input) {
    id
    name
    description
    season
    maxTeams
    settings {
      rosterSize
    }
  }
}

# Join existing league
mutation JoinLeague($leagueId: ID!, $teamName: String!) {
  joinLeague(leagueId: $leagueId, teamName: $teamName) {
    id
    name
    owner {
      name
    }
    league {
      name
    }
  }
}
```

### Draft Operations

```graphql
# Start league draft
mutation StartDraft($leagueId: ID!) {
  startDraft(leagueId: $leagueId) {
    id
    status
    draftDate
    currentPick {
      round
      pick
      team {
        name
      }
    }
  }
}

# Make draft pick
mutation MakeDraftPick($leagueId: ID!, $playerId: ID!) {
  makeDraftPick(leagueId: $leagueId, playerId: $playerId) {
    id
    round
    pick
    player {
      name
      position
    }
    team {
      name
    }
  }
}
```

## Subscription Operations

```graphql
# Subscribe to draft updates
subscription DraftUpdates($leagueId: ID!) {
  draftPick(leagueId: $leagueId) {
    id
    round
    pick
    player {
      name
      position
      team
    }
    team {
      name
      owner {
        name
      }
    }
  }
}

# Subscribe to league updates
subscription LeagueUpdates($leagueId: ID!) {
  leagueUpdate(leagueId: $leagueId) {
    id
    status
    teams {
      id
      name
    }
  }
}
```

## Error Handling

### Standard Error Format

```graphql
type Error {
  message: String!
  code: ErrorCode!
  field: String
  details: JSON
}

enum ErrorCode {
  UNAUTHORIZED
  FORBIDDEN
  NOT_FOUND
  VALIDATION_ERROR
  INTERNAL_ERROR
  RATE_LIMITED
}
```

### Common Error Responses

```graphql
# Authentication required
{
  "errors": [{
    "message": "Authentication required",
    "code": "UNAUTHORIZED"
  }]
}

# Validation error
{
  "errors": [{
    "message": "League name is required",
    "code": "VALIDATION_ERROR",
    "field": "name"
  }]
}
```

## Rate Limiting

- **Queries**: 100 requests per minute per user
- **Mutations**: 50 requests per minute per user
- **Subscriptions**: 10 concurrent connections per user

## Authentication

All requests require a valid JWT token in the Authorization header:

```
Authorization: Bearer <jwt-token>
```

Tokens are obtained through the OAuth flow documented in the [Authentication Guide](../guides/authentication-guide.md).

## Development Tools

### GraphQL Playground

Access the interactive GraphQL playground at:

- Development: `http://localhost:5001/playground`
- Production: Available via direct API endpoint

### Schema Introspection

```bash
# Generate schema documentation
pnpm exec graphql-codegen

# Download schema
pnpm run graphql:schema
```

## Related Documentation

- [Authentication Guide](../guides/authentication-guide.md) - OAuth setup and token management
- [Database Schema](../architecture/database-schema.md) - Database design and relationships
- [GraphQL Integration](../architecture/graphql-integration.md) - Implementation details

---

_This documentation is auto-generated from the GraphQL schema. For implementation details, see the source code in `lambdas/graphql/`._
