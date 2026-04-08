# Matchup GraphQL API

**Last Updated**: April 7, 2026

This is the reference for the GraphQL surface of the matchup system. All
schema lives under `lambdas/db/src/schema/matchups/` and is registered with
the shared Pothos builder via the
[`index.ts` barrel](../../lambdas/db/src/schema/matchups/index.ts).

For background on the underlying tables and the end-to-end data flow see
[Matchup System Architecture](../architecture/matchup-system.md). For
authoring conventions on how this API is wired up see
[GraphQL Integration](../architecture/graphql-integration.md).

---

## Authentication

Every matchup query and most mutations require an authenticated user
(`context.user`). Mutations that change state are further gated:

| Mutation                        | Allowed callers                                                       |
| ------------------------------- | --------------------------------------------------------------------- |
| `createMatchup`                 | League commissioner, general manager, assistant manager, or admin     |
| `createAllMatchups`             | League commissioner, general manager, assistant manager, or admin     |
| `adminRegenerateLeagueSchedule` | Admin only                                                            |
| `updateMatchupScore`            | Admin or system request (`isSystemRequest \|\| isAdmin`)              |
| `updateMatchupStatus`           | Admin or system request                                               |
| `updateMatchupPlayerPosition`   | Owner of the team or commissioner                                     |
| `swapMatchupPlayerPositions`    | Owner of the team or commissioner                                     |
| `autoSelectGames`               | System request, admin, or league-scoped commissioner / GM / assistant |
| `autoAdvanceMatchups`           | System request, admin, or league-scoped commissioner / GM / assistant |

For `autoSelectGames` and `autoAdvanceMatchups`, the non-admin path is
single-league scoped — commissioners, GMs, and assistant managers are
authorized only when a `leagueId` is supplied so access can be checked
against that league's membership. EventBridge / system requests remain
the primary trigger, but these mutations are not strictly system-only.
See [`assertAuthorized`](../../lambdas/db/src/schema/matchups/system-auth.ts).

Read queries currently require an authenticated user (`context.user`). The matchup query resolvers do not currently verify league membership, so read access is broader than league-member-only access.

---

## Object types

### `Matchup`

Defined in [`types.ts:77`](../../lambdas/db/src/schema/matchups/types.ts#L77).

All fields on `Matchup` are nullable in the schema. The table below uses
the literal `schema.graphql` types.

| Field                       | Type                 | Notes                                                                   |
| --------------------------- | -------------------- | ----------------------------------------------------------------------- |
| `id`                        | `ID`                 |                                                                         |
| `weekNumber`                | `Int`                |                                                                         |
| `leagueId`                  | `Int`                |                                                                         |
| `team1Id` / `team2Id`       | `Int`                | Nullable while a bye / placeholder                                      |
| `team1Score` / `team2Score` | `Float`              | Decimal stored as string in DB, parsed on resolve                       |
| `status`                    | `MatchupStatus`      | `scheduled` / `in_progress` / `completed` / `cancelled`                 |
| `statsLoadingStatus`        | `StatsLoadingStatus` | `not_started` / `queued` / `loading` / `completed` / `failed` / `retry` |
| `gamesPerMatchup`           | `Int`                | Per-team game count for the week                                        |
| `spStartsPerMatchup`        | `Int`                | Per-team SP starts allowed                                              |
| `startTime` / `endTime`     | `String`             | ISO timestamps                                                          |
| `team1` / `team2`           | `Team`               | DataLoader-batched relational fetch                                     |
| `selectedGamesCount`        | `Int`                | Distinct games selected across both rosters                             |
| `recap`                     | `MatchupRecap`       | Auto-generated narrative; `null` until status `completed`               |

### `MatchupRecap`

Auto-generated narrative for completed matchups
([`types.ts:285`](../../lambdas/db/src/schema/matchups/types.ts#L285)).

| Field         | Type        | Notes                                              |
| ------------- | ----------- | -------------------------------------------------- |
| `headline`    | `String`    | ≤80 char summary                                   |
| `narrative`   | `String`    | 2–3 sentence paragraph                             |
| `highlights`  | `[String!]` | Up to five standout-player bullets                 |
| `matchupType` | `String`    | `blowout` (margin ≥ 20) / `close` (≤ 5) / `normal` |
| `winnerId`    | `Int`       | `null` on a tie                                    |

Generation is **deterministic** — seeded on `matchup_id`, so the same
inputs always produce the same recap. Implementation lives in
`lib/narrative/`.

### `MatchupPlayer`

A player's roster slot for a single matchup. Composes per-matchup season
assignment, computed batting/pitching/fielding totals, and per-day game
selections.

### `TeamStanding`

Per-team aggregated record (wins, losses, ties, points for/against, win
percentage, optional rank and division). Returned by `getLeagueStandings`
and `getPowerRankings`.

### `HeadToHeadRecord`, `SeasonResults`, `PlayoffQualification`, `MatchupStatusCounts`

Specialized aggregate types for the standings, season summary, playoff
race, and matchup-status histogram queries.

### `CreateMatchupInput`

```graphql
input CreateMatchupInput {
  leagueId: Int!
  weekNumber: Int!
  team1Id: Int
  team2Id: Int
  gamesPerMatchup: Int
  startTime: String
  endTime: String
}
```

`gamesPerMatchup` defaults to the league configuration when omitted.

---

## Queries

All queries are defined in
[`queries.ts`](../../lambdas/db/src/schema/matchups/queries.ts).

### Reading matchups

```graphql
type Query {
  getMatchupById(id: Int!): Matchup
  getMatchupsForLeague(leagueId: Int!, weekNumber: Int): [Matchup!]
  getMatchupsByWeek(leagueId: Int!, weekNumber: Int!): [Matchup!]
  getCurrentWeekForLeague(leagueId: Int!): Int
  getMatchupRoster(matchupId: Int!, teamId: Int!): [MatchupPlayer!]
  getMatchupPlayers(matchupId: Int!): [MatchupPlayer!]
}
```

`getCurrentWeekForLeague` prefers the authoritative
`leagues.current_week` column and falls back to resolving the week through
the legacy `current_matchup` FK so older leagues still work.

### Standings, history, analytics

```graphql
type Query {
  getLeagueStandings(leagueId: Int!, season: Int): [TeamStanding!]
  getPowerRankings(leagueId: Int!, season: Int): [TeamStanding!]
  getHeadToHeadRecord(
    leagueId: Int!
    team1Id: Int!
    team2Id: Int!
  ): HeadToHeadRecord
  getSeasonResults(leagueId: Int!, season: Int): SeasonResults
  getPlayoffRace(
    leagueId: Int!
    playoffSpots: Int!
    season: Int
  ): [PlayoffQualification!]
  getMatchupStatusCounts(leagueId: Int!, season: Int): MatchupStatusCounts
  getMatchupHistory(
    leagueId: Int!
    limit: Int
    season: Int
    status: MatchupStatus
    teamId: Int
  ): [Matchup!]
  getTeamRecentMatchups(teamId: Int!, limit: Int): [Matchup!]
  getTeamMatchupHistory(leagueId: Int!, limit: Int, teamId: Int!): [Matchup!]
}
```

> **Lists are nullable.** All matchup list queries return `[Matchup!]`
> (the list itself can be null), not `[Matchup!]!`. Treat a null result
> as "no matchups" rather than an error.

The standings / history queries delegate to
[`StandingsService`](../../lambdas/db/src/services/standings-service.ts) and
[`matchup-history.ts`](../../lib/db-client/src/lib/client/matchup-history.ts),
which lean on the partial-index optimizations described in
[the architecture doc](../architecture/matchup-system.md#performance-considerations).

---

## Mutations

All mutations are defined in
[`mutations.ts`](../../lambdas/db/src/schema/matchups/mutations.ts).

### Schedule and matchup lifecycle

```graphql
type Mutation {
  createMatchup(input: CreateMatchupInput!): Matchup
  createAllMatchups(leagueId: Int!): AdvanceLeagueWeekResponse
  adminRegenerateLeagueSchedule(leagueId: Int!): AdvanceLeagueWeekResponse
  updateMatchupScore(
    matchupId: Int!
    team1Score: Float
    team2Score: Float
  ): Matchup
  updateMatchupStatus(matchupId: Int!, status: MatchupStatus!): Matchup
}
```

`AdvanceLeagueWeekResponse` exposes the generated matchups plus the new
`currentMatchupId`:

```graphql
type AdvanceLeagueWeekResponse {
  matchups: [Matchup!]
  currentMatchupId: Int
}
```

- `createAllMatchups` is the bulk happy path used when a league finishes
  its draft. It calls `createAllMatchupsForLeague` from
  `@legacy-sports/db-client` (which uses `MatchupService` internally) to
  populate `matchups`, `matchup_players`, and `league_week_player_seasons`.
- `adminRegenerateLeagueSchedule` is **admin-only** and regenerates the
  schedule for matchups that are still `scheduled`; matchups already
  `in_progress` or `completed` are not touched.
- `updateMatchupScore` and `updateMatchupStatus` are admin / system-only
  (`context.isSystemRequest || context.user.isAdmin`); commissioner-only
  callers will be rejected.

### Lineup edits

```graphql
type Mutation {
  updateMatchupPlayerPosition(
    matchupPlayerId: Int!
    positionId: Int
  ): MatchupPlayer
  swapMatchupPlayerPositions(
    matchupPlayerIdA: Int!
    matchupPlayerIdB: Int!
    positionIdA: Int
    positionIdB: Int
  ): [MatchupPlayer!]
}
```

Both verify the caller owns the team via `verifyMatchupTeamOwnership` (or
the caller is the league commissioner). Setting `position_id` flips
`manually_edited = true` so the row is preserved across roster propagation.

### Scheduled / system mutations

These are invoked by EventBridge using the system principal —
`context.isSystemRequest === true`. They live in
[`scheduled-mutations.ts`](../../lambdas/db/src/schema/matchups/scheduled-mutations.ts).

These mutations are normally invoked by EventBridge using the system
principal, but the shared
[`assertAuthorized`](../../lambdas/db/src/schema/matchups/system-auth.ts)
guard also accepts admin users and league-scoped commissioner / GM /
assistant manager calls when a `leagueId` is supplied — see the auth
table above.

| Mutation              | Trigger      | Effect                                                                                                                                    |
| --------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `autoSelectGames`     | Nightly cron | Picks per-day games for each matchup player and writes `matchup_player_games`. Probabilistically marks SP non-starts via `sp_skipped`.    |
| `autoAdvanceMatchups` | Weekly cron  | Marks completed matchups, advances `current_week`, posts the Discord weekly recap, runs playoff entry checks, and resolves tied matchups. |

---

## Discord webhook integrations

These do not appear in the GraphQL schema for end users — they are
EventBridge-driven side-effects, but listed here so consumers know what
will fire automatically:

| File                                                                                        | Trigger       | Posts                                             |
| ------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------- |
| [`discord-score-alerts.ts`](../../lambdas/db/src/schema/matchups/discord-score-alerts.ts)   | Every 4 hours | Live scores + close-matchup highlights            |
| [`discord-weekly-recaps.ts`](../../lambdas/db/src/schema/matchups/discord-weekly-recaps.ts) | Weekly        | Week-end recap with all matchup results           |
| [`discord-reminders.ts`](../../lambdas/db/src/schema/matchups/discord-reminders.ts)         | Hourly        | Lineup-lock reminders before each game-day cutoff |

---

## Common queries

### Fetch the current week's matchups for a league

```graphql
query LeagueThisWeek($leagueId: Int!) {
  currentWeek: getCurrentWeekForLeague(leagueId: $leagueId)
  matchups: getMatchupsForLeague(leagueId: $leagueId) {
    id
    weekNumber
    status
    team1 {
      id
      name
      avatarUrl
    }
    team2 {
      id
      name
      avatarUrl
    }
    team1Score
    team2Score
    selectedGamesCount
  }
}
```

### Fetch a single matchup with its recap

```graphql
query MatchupDetail($id: Int!) {
  matchup: getMatchupById(id: $id) {
    id
    status
    statsLoadingStatus
    team1Score
    team2Score
    team1 {
      id
      name
    }
    team2 {
      id
      name
    }
    recap {
      headline
      narrative
      highlights
      matchupType
      winnerId
    }
  }
}
```

### Pull league standings

```graphql
query Standings($leagueId: Int!, $season: Int) {
  standings: getLeagueStandings(leagueId: $leagueId, season: $season) {
    teamId
    teamName
    wins
    losses
    ties
    pointsFor
    pointsAgainst
    winPercentage
    rank
  }
}
```

### Generate the full season schedule for a freshly drafted league

```graphql
mutation BuildSchedule($leagueId: Int!) {
  result: createAllMatchups(leagueId: $leagueId) {
    currentMatchupId
    matchups {
      id
      weekNumber
      team1Id
      team2Id
      status
    }
  }
}
```

### Edit a player's position in this week's lineup

```graphql
mutation MovePlayer($matchupPlayerId: Int!, $positionId: Int!) {
  updateMatchupPlayerPosition(
    matchupPlayerId: $matchupPlayerId
    positionId: $positionId
  ) {
    id
    positionId
  }
}
```

> The underlying `matchup_players.manually_edited` flag is set to `true`
> by this mutation but is not exposed through GraphQL — it's used by
> server-side roster propagation only. See
> [Schema and roster](../architecture/matchup-system.md#1-schema-and-roster-lib-db-clientsrcdrizzlepublicmodelsmatchupsts).

---

## Error model

Query behavior and mutation behavior differ:

- Queries typically return `null` for a missing singular resource (for
  example, `getMatchupById`) or an empty list when no rows match. They
  should not be assumed to throw not-found errors for unknown IDs.
- Mutations may throw standard Apollo/application errors, depending on
  the operation:
  - `AuthenticationError` — no user on the request context.
  - `ForbiddenError` — caller is not permitted to perform that mutation
    (for example, not the team owner or commissioner where required).
  - `Error('League not found')` / `Error('Matchup not found')` — invalid
    IDs for mutations that validate those records before updating them.

The autosystem mutations check `context.isSystemRequest` rather than
`context.user.isAdmin` so they can be invoked without an end-user
identity.

---

## Related references

- [Matchup System Architecture](../architecture/matchup-system.md)
- [Matchup System Guide (members)](../guides/matchup-system-guide.md)
- [Commissioner Matchup Management](../guides/commissioner-matchup-management.md)
- [GraphQL Integration](../architecture/graphql-integration.md)
- [Database Schema — matchup tables](../architecture/database-schema.md#matchup-system)
