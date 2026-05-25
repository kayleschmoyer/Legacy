# Multi-Sport Architecture

Legacy Sports supports multiple fantasy sports under a single data model and application stack. This document describes how sport identity flows through the system, how the stats pipeline handles multiple sports, and how to add a new sport.

## Current Status

| Sport      | Status             | Draft surface | Stats tables                                                                                                                                                                                               |
| ---------- | ------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseball   | Production         | ✅            | `game_batting`, `game_pitching`, `game_fielding`, `season_batting/pitching/fielding`, career views                                                                                                         |
| Football   | Production         | ✅            | `game_football_passing`, `game_football_rushing`, `game_football_receiving`, `game_football_kicking`, `game_football_defense`, `game_football_defense_idp`, `football_season_defense_idp`, career IDP view |
| Basketball | Config scaffolding | ❌            | None yet                                                                                                                                                                                                   |
| Hockey     | Config scaffolding | ❌            | None yet                                                                                                                                                                                                   |

---

## Sport Propagation

### League discriminator

Every league carries a `sport` column (`sportKind` enum: `'baseball' | 'football'`):

```typescript
// lib/db-client/src/drizzle/public/models/Leagues.ts
sport: sportKind('sport').notNull().default('baseball'),
```

This is the **canonical source of truth** for which sport a league plays. All sport-specific behavior (roster positions, scoring rules, player pool filters, era filters) is gated on `leagues.sport`.

Football leagues also carry `defensive_format` (`'dst' | 'idp'`):

```typescript
defensiveFormat: varchar('defensive_format', { length: 10 }).notNull().default('dst'),
```

### Player discriminator

Every player row carries a `sport` column, mirroring the league enum:

```typescript
// lib/db-client/src/drizzle/public/models/Players.ts
sport: sportKind('sport').notNull().default('baseball'),
pfrId: varchar('pfr_id', { length: 20 }),   // Pro Football Reference ID (football only)
isDst: boolean('is_dst').notNull().default(false),
nflTeam: varchar('nfl_team', { length: 10 }),
```

Baseball players use `brefId` (Baseball Reference). Football players use `pfrId` (Pro Football Reference). The `brefId` column is still populated for backwards compatibility even on football players, but `pfrId` is the identity key for PFR-sourced data.

### Sport-tagged lookup tables

Two tables allow per-sport configuration without code changes:

| Table                | Purpose                                                                            |
| -------------------- | ---------------------------------------------------------------------------------- |
| `sport_player_pools` | Player pool keys per sport (e.g. AL/NL/all for baseball, AFC/NFC/NFL for football) |
| `sport_eras`         | Historical era windows per sport                                                   |

Both use `(sport, key)` composite primary keys so baseball and football can define independent era/pool vocabularies.

---

## Frontend Sport Config (`SPORT_CONFIGS`)

`lib/shared-components/src/config/sports.ts` exports `SPORT_CONFIGS`, a record keyed by sport slug:

```typescript
export const SPORT_CONFIGS: Record<string, SportConfig> = {
  baseball: { positions, statLabels, sortOptions, stats, colors },
  football: { positions, statLabels, sortOptions, stats, colors },
  basketball: { ... },  // future
  hockey: { ... },       // future
};
```

The `SportKind` type (`'baseball' | 'football'`) restricts which sports components accept as `sport` props. The `basketball` and `hockey` entries exist as scaffolding for future reach — adding them to `SportKind` and wiring draft surface support completes their activation (see [How to Add a Third Sport](#how-to-add-a-third-sport)).

---

## Database — Sport-Specific Tables

Stats tables are sport-specific; no single table mixes baseball and football rows.

**Baseball stats (Baseball Reference sourced)**:

| Table                         | Granularity               |
| ----------------------------- | ------------------------- |
| `game_batting`                | Per player per game       |
| `game_pitching`               | Per player per game       |
| `game_fielding`               | Per player per game       |
| `season_batting`              | Per player per season     |
| `season_pitching`             | Per player per season     |
| `season_fielding`             | Per player per season     |
| `career_batting`              | Career totals (view)      |
| `career_pitching`             | Career totals (view)      |
| `career_fielding`             | Career totals (view)      |
| `career_fielding_by_position` | Career totals by position |

**Football stats (Pro Football Reference sourced)**:

| Table                         | Granularity                 |
| ----------------------------- | --------------------------- |
| `game_football_passing`       | Per player per game         |
| `game_football_rushing`       | Per player per game         |
| `game_football_receiving`     | Per player per game         |
| `game_football_kicking`       | Per player per game         |
| `game_football_defense`       | Per player per game (DST)   |
| `game_football_defense_idp`   | Per player per game (IDP)   |
| `football_season_defense_idp` | Per player per season (IDP) |
| `career_football_defense_idp` | Career totals (view, IDP)   |

Scoring, roster, and matchup tables are shared across sports — the `leagues.sport` discriminator determines which stat tables are joined at query time.

---

## Stats Lambda — Message-Shape Routing

`lambdas/stats-lambda/src/index.ts` receives SQS messages and routes them by **message shape**, not by sport. This keeps the router sport-agnostic; each handler knows which sport it serves.

```
SQS message
├─ type: 'mlb-player-stats'    → mlbStatsHandler  (MLB external provider feed)
├─ matchupId + players[]        → gameHandler       (matchup-scoped game stats load)
├─ statType + gameNum           → gameHandler       (legacy single-game format)
└─ plain string (brefId)        → careerHandler     (baseball career stats refresh)
```

The `gameHandler` (`load-game.ts`) processes the `matchupId + players[]` format for both baseball and football. Each player in the message carries a `sport` field; the handler dispatches to the sport-appropriate stat tables.

---

## Draft — Sport-Specific Strategies

Draft auto-pick and scoring rules are extended per sport via strategy modules:

```
lambdas/db/src/schema/drafts/strategies/
├── football.ts   — Football draft position eligibility + auto-pick scoring
└── ...
```

The shared draft processor selects the correct strategy based on `leagues.sport`.

---

## How to Add a Third Sport

The `SPORT_CONFIGS` map already has stub entries for `basketball` and `hockey`. To fully activate a new sport:

1. **Add `SportKind` union member** (`lib/shared-components/src/config/sports.ts`):

   ```typescript
   export type SportKind = 'baseball' | 'football' | 'basketball';
   ```

2. **Extend the `sportKind` DB enum** via a Drizzle migration:

   ```sql
   ALTER TYPE sport_kind ADD VALUE 'basketball';
   ```

3. **Create sport-specific stat tables** (migration in `lib/db-client/migrations/`). Follow the football tables as a reference: one table per stat category, player-season-game PK, `player_id` FK to `players`.

4. **Seed sport-scoped lookup tables**: insert rows into `sport_player_pools` and `sport_eras` for the new sport key.

5. **Add a draft strategy module** (`lambdas/db/src/schema/drafts/strategies/<sport>.ts`) with position eligibility and scoring weights.

6. **Wire stats loading** in the stats-lambda: add a handler branch in `player-stats-loader.ts` that writes to the new sport's game tables. Add the corresponding external data provider client if needed.

7. **Update `SPORT_CONFIGS`** in `lib/shared-components/src/config/sports.ts`: fill in `positions`, `statLabels`, `sortOptions`, `stats`, and `colors` for the new sport.

8. **UI gating**: search for `SportKind` references in `lib/shared-components/src/` — any component that branches on sport (e.g. stat display, roster slots) will need a new case.

---

## Architecture Diagrams

> Diagrams showing the baseball and football data flows end-to-end are pending. When created, they should be placed at:
>
> - `docs/architecture/assets/multi-sport/baseball-architecture.svg`
> - `docs/architecture/assets/multi-sport/football-architecture.svg`
>
> Suggested content: a swim-lane diagram with lanes for the external data source (Baseball Reference / Pro Football Reference), the stats-lambda, the PostgreSQL schema, and the GraphQL API layer. Show how `players.sport` routes from the SQS message to the correct stat table.

---

## Related

- [Database Schema](database-schema.md) — complete entity reference
- [Season Selection Architecture](season-selection-architecture.md) — per-player game selection
- [`lib/shared-components/src/config/sports.ts`](../../lib/shared-components/src/config/sports.ts) — `SPORT_CONFIGS` and `SportKind`
- [`lambdas/stats-lambda/src/index.ts`](../../lambdas/stats-lambda/src/index.ts) — message-shape router
- [ADR-0011](../decisions/0011-draft-board-sport-toggle.md) — sport kind enum rationale
