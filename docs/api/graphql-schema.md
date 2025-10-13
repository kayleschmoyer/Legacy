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

```graphql
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
  QB   # Quarterback
  RB   # Running Back
  WR   # Wide Receiver
  TE   # Tight End
  K    # Kicker
  DEF  # Defense/Special Teams
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
```

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
npx graphql-codegen

# Download schema
npm run graphql:schema
```

## Related Documentation

- [Authentication Guide](../guides/authentication-guide.md) - OAuth setup and token management
- [Database Schema](../architecture/database-schema.md) - Database design and relationships  
- [GraphQL Integration](../architecture/graphql-integration.md) - Implementation details

---

*This documentation is auto-generated from the GraphQL schema. For implementation details, see the source code in `lambdas/graphql/`.*
