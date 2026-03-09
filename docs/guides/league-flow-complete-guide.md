# Complete League Flow Guide

> **Last verified:** March 2026 ΓÇö validated against actual codebase schema and mutations.

A comprehensive guide to the Legacy Sports league lifecycle, from creation through season rollover. Written for AI agents and developers.

## Table of Contents

- [Overview](#overview)
- [Phase 1: League Creation](#phase-1-league-creation)
- [Phase 2: User Assignment](#phase-2-user-assignment)
- [Phase 3: Draft](#phase-3-draft)
- [Phase 4: Matchup & Season Generation](#phase-4-matchup--season-generation)
- [Phase 5: Game Selection](#phase-5-game-selection)
- [Phase 6: Stats Loading & Scoring](#phase-6-stats-loading--scoring)
- [Phase 7: Weekly Progression](#phase-7-weekly-progression)
- [Phase 8: Free Agency & Waivers](#phase-8-free-agency--waivers)
- [Phase 9: Season End & Playoffs](#phase-9-season-end--playoffs)
- [Phase 10: Season Renewal](#phase-10-season-renewal)
- [Technical Architecture](#technical-architecture)
- [Status Enums Reference](#status-enums-reference)
- [Key Tables Reference](#key-tables-reference)

---

## Overview

Legacy Sports is a fantasy baseball platform where teams draft historical baseball players and compete head-to-head using real game-by-game stats from those players' careers. Each drafted player is randomly assigned a historical season, and each week random games from that season are selected and scored.

### High-Level Flow

```
League Creation ΓåÆ User Assignment ΓåÆ Draft ΓåÆ Matchup Generation
       ΓåÆ Game Selection ΓåÆ Stats Loading ΓåÆ Scoring
       ΓåÆ Weekly Progression (repeat) ΓåÆ Playoffs ΓåÆ Season Renewal
```

### Key Concepts

- **Per-player seasons**: Each player gets a randomly assigned historical season (not one season per matchup). Stored in `league_week_player_seasons`.
- **Commissioner-driven progression**: The commissioner triggers game selection and matchup advancement via the Next Step control.
- **SQS pipeline**: Game selection ΓåÆ stats loading ΓåÆ scoring flows through FIFO SQS queues across multiple Lambdas.
- **Seasons are assigned after draft, not during**: The draft only assigns players to teams. Season assignment happens automatically when matchups are generated post-draft.

---

## Phase 1: League Creation

### Mutation: `createLeagueAndTeams`

The commissioner creates a league with all settings configured upfront.

**Key settings:**

| Setting | Column | Default | Description |
|---------|--------|---------|-------------|
| Team count | `teams` created | ΓÇö | Number of teams (creates N team rows) |
| Games per matchup | `gamesPerMatchup` | 5 | How many games each player plays per week |
| Min games per season | `minGamesPerSeason` | 10 | Minimum games for a season to be eligible |
| Total matchups | `totalMatchups` | 10 | Number of weeks in the regular season |
| Roster size | `maxRosterSize` | 25 | Max players per team |
| SP starts per matchup | `spStartsPerMatchup` | 1 | Starting pitcher starts per week |
| Waiver type | `waiverType` | `'standard'` | `'standard'` or `'faab'` |
| FAAB budget | `faabBudgetDefault` | 100 | Starting budget for FAAB leagues |
| Player pool | `playerPool` | `'all'` | `'all'`, `'nl'`, or `'al'` |
| Era filter | `eraFilter` | `'all'` | Historical era restriction |
| Scheduling | `schedulingStrategy` | `'round-robin'` | `'round-robin'`, `'divisional'`, `'random'` |
| Salary cap | `salaryCapEnabled` | false | Enable salary cap mode |

### What gets created

1. **League** row with unique `inviteCode` (8 chars)
2. **N teams** with auto-generated names, `manager_id = NULL`
3. **League members** entry for the owner (commissioner permission)
4. **Draft** record with default settings (`draftStatus = 'not-started'`)
5. **Roster positions** (league_positions) based on configuration
6. **Scoring settings** (league-specific stat multipliers)

### Database state

```
leagues: { id, name, draftStatus='not-started', currentWeek=NULL, inviteCode='ABC12345' }
teams:   { id, name='Team 1', leagueId, managerId=NULL } ├ù N
drafts:  { id, leagueId, draftMode='live', draftStatus via league }
```

---

## Phase 2: User Assignment

### How users join

- **Invite code**: User calls `joinLeague(inviteCode, teamName)` ΓÇö claims first unassigned team
- **Public league**: User calls `joinPublicLeague(leagueId, teamName)` ΓÇö no code needed
- **Commissioner assignment**: Commissioner can assign users to specific teams

### What happens on join

1. User claims an unassigned team (`teams.managerId` set to user ID via `league_members`)
2. `league_members` row created: `{ leagueId, userId, teamId, permissionLevel='general_manager' }`
3. User can rename team, upload logo, set colors

---

## Phase 3: Draft

### Draft configuration

| Setting | Values | Default |
|---------|--------|---------|
| Draft mode | `'live'`, `'automated'` | `'live'` |
| Selection method | `'standard'`, `'auction'`, `'random'` | `'standard'` |
| Draft order | `'snake'`, `'linear'` | `'snake'` |
| Pick time limit | 30ΓÇô3600 seconds | 120s |
| Player pool | `'all'`, `'nl'`, `'al'` | `'all'` |

### Commissioner starts the draft

**Mutation: `startDraft(leagueId)`**

1. Validates all teams have managers
2. Creates `draft_teams` records with draft order positions
3. Sets `leagues.draftStatus ΓåÆ 'queued'`
4. Sends SQS message to `{prefix}-automatic-drafts.fifo` queue
5. Draft processor Lambda picks up the message
6. Sets `draftStatus ΓåÆ 'in-progress'`, `draftStartedAt = now()`
7. Sets initial `currentPickDeadline = now() + pickTimeLimitSeconds`

### Draft modes

**Live draft** (`draftMode = 'live'`):
- Real-time picking via UI; each team owner picks in turn
- `makeDraftPick(draftId, playerId)` ΓÇö only accepts player ID; **no season parameter**
- Snake order: Round 1 goes 1ΓåÆN, Round 2 goes NΓåÆ1, etc.
- Pick timer: `currentPickDeadline` enforced by EventBridge cron (1-minute poll)
- Auto-pick on timeout: Best available player (position-aware) is selected automatically

**Automated draft** (`draftMode = 'automated'`):
- System auto-picks all players using the draft queue or best-available logic
- Runs to completion without user interaction

### What a draft pick does

**Mutation: `makeDraftPick(draftId, playerId)`**

1. Validates it's the user's turn (authorization check)
2. Validates player not already drafted
3. Creates `draft_picks` row: `{ draftId, teamId, playerId, round, pickNumber, overallPick }`
4. Creates `team_members` row: `{ teamId, playerId, acquisitionType='draft', draftRound, draftPick }`
5. Advances `drafts.currentPick`
6. Sets new `currentPickDeadline` for next pick
7. Sends `DRAFT_PICK_MADE` WebSocket notification

**Important**: Seasons are NOT selected during the draft. The draft only assigns players to teams.

### Draft completion

When the last pick is made:

1. `drafts.draftCompletedAt = now()`
2. `leagues.draftStatus ΓåÆ 'completed'`
3. Sends `DRAFT_COMPLETED` WebSocket notification
4. Matchup generation is now available (Phase 4)

---

## Phase 4: Matchup & Season Generation

### Trigger

After draft completion, the commissioner clicks "Select Games" in the Next Step control, which triggers `autoSelectGames`. Before games can be selected, matchups must be created.

**Mutation: `createAllMatchups(leagueId)`**

This is called as part of the post-draft flow and generates the entire season structure.

### What happens

1. **Generate matchup pairings** for all weeks (1 through `totalMatchups`)
   - Uses `schedulingStrategy` (round-robin, divisional, or random)
   - Each team plays a different opponent each week
2. **Create `matchups` rows** for every week
3. **Populate `matchup_players`** ΓÇö link each team's roster to their matchups
4. **Assign random seasons per player** via `selectSeasonsForPlayers()`:
   - For each player, queries `season_batting`, `season_pitching`, `season_fielding`
   - Filters to seasons with ΓëÑ `minGamesPerSeason` games
   - Randomly picks one eligible season per player
   - Inserts into `league_week_player_seasons` for every week

### Season assignment details

- **Per-player**: Each player gets their own random season (e.g., Babe RuthΓåÆ1927, Ted WilliamsΓåÆ1941)
- **Same season all weeks**: A player uses the same season for the entire regular season
- **Stored in**: `league_week_player_seasons(leagueId, weekNumber, playerId, season)`
- **Not stored on**: `team_members` or `matchups` (no `selected_season` column on matchups)

### Database state after generation

```
matchups:
  { leagueId, weekNumber=1, team1Id, team2Id, status='scheduled', statsLoadingStatus='not_started' }
  ... (repeated for all weeks ├ù all matchup pairings)

matchup_players:
  { matchupId, playerId, teamId } for each player in each matchup

league_week_player_seasons:
  { leagueId, weekNumber=1, playerId=2239, season=1927 }  ΓåÉ Babe Ruth
  { leagueId, weekNumber=1, playerId=3075, season=1941 }  ΓåÉ Ted Williams
  ... (same season value repeated for weeks 1 through totalMatchups)
```

---

## Phase 5: Game Selection

### Commissioner triggers game selection

The commissioner uses the **Next Step control** (`NextStepControl.tsx`) which shows a "Select Next Game" button.

**Mutation: `autoSelectGames`**

1. Finds all active leagues with matchups ready for the next game
2. For each matchup, invokes the **Game Selection Lambda** via SQS (`{prefix}-select-game.fifo`)

### Game Selection Lambda

**Entry:** `lambdas/game-selection/src/index.ts`
**Core logic:** `lambdas/game-selection/src/services/season-game-selector.ts` ΓåÆ `selectGamesForMatchup()`

For each matchup:

1. Look up each player's assigned season from `league_week_player_seasons`
2. For each player, randomly select a unique `game_identifier` from their season (actual Baseball Reference game IDs)
3. Create `matchup_player_games` record: `{ matchupPlayerId, gameNum, gameIdentifier }`
4. Queue stats loading: sends batch SQS messages (8 players per message) to `{prefix}-load-game-stats.fifo`
5. Update `matchups.statsLoadingStatus ΓåÆ 'queued'`
6. Send `PLAYER_STATS_LOADING` WebSocket notification

### Game selection happens one game at a time

Games are selected incrementally (game 1, then game 2, etc. up to `gamesPerMatchup`). Each time the commissioner clicks "Select Next Game", one game is selected for all players in all active matchups. This creates a progressive reveal experience.

```
Game 1: Commissioner clicks ΓåÆ games selected ΓåÆ stats loaded ΓåÆ scores updated
Game 2: Commissioner clicks ΓåÆ games selected ΓåÆ stats loaded ΓåÆ scores updated
...
Game N: Commissioner clicks ΓåÆ games selected ΓåÆ stats loaded ΓåÆ scores completed
```

---

## Phase 6: Stats Loading & Scoring

### Stats Lambda

**Entry:** `lambdas/stats-lambda/src/index.ts`
**Handler:** `lambdas/stats-lambda/src/load-game.ts`

Triggered by SQS messages from `{prefix}-load-game-stats.fifo`.

For each player in the batch:

1. **Check cache**: Have we already scraped this player+season from Baseball Reference?
2. **If not cached**: Scrape Baseball Reference:
   - `getAllGameBattingStats(player, season)` via `@legacy-sports/bref-client`
   - `getAllGamePitchingStats(player, season)`
   - `getAllGameFieldingStats(player, season)`
   - Stores ALL games from the season in `game_batting`, `game_pitching`, `game_fielding`
3. **Select game**: Match `game_identifier` to actual game stats
4. **Send WebSocket**: `PLAYER_STATS_UPDATED` per player

### Score calculation

**Handler:** `lambdas/stats-lambda/src/handlers/calculate-matchup-scores.ts`
**Library:** `lib/scoring/src/matchup-scoring.ts` ΓåÆ `calculateMatchupScore()`

After all player stats are loaded for a matchup:

1. Aggregate batting + pitching + fielding stats per player
2. Apply league scoring settings (stat ├ù multiplier)
3. Sum player scores into team totals
4. Update `matchups.team1Score` and `matchups.team2Score`
5. Update `matchups.statsLoadingStatus ΓåÆ 'completed'`
6. Send `MATCHUP_STATS_COMPLETE` WebSocket notification

### Status transitions during pipeline

```
matchups.status:       'scheduled' ΓåÆ 'in_progress' (first game selected) ΓåÆ 'completed' (all games done)
matchups.statsLoadingStatus: 'not_started' ΓåÆ 'queued' ΓåÆ 'loading' ΓåÆ 'completed'
                             (or ΓåÆ 'failed' ΓåÆ 'retry')
```

---

## Phase 7: Weekly Progression

### When all games are selected and scored

After all `gamesPerMatchup` games are selected and all matchup stats are loaded, the commissioner can advance to the next week.

### Commissioner triggers advancement

**Mutation: `autoAdvanceMatchups`** (via Next Step control "Advance Matchups" button)

1. Verify all matchups for current week are `status = 'completed'`
2. Increment `leagues.currentWeek`
3. Next week's matchups are already generated (from Phase 4)
4. Reset `matchups.statsLoadingStatus ΓåÆ 'not_started'` for the new week's matchups
5. Send `WEEK_ADVANCED` WebSocket notification
6. Next Step control now shows "Select Next Game" for the new week

### Week advancement state machine

```
leagues.weekAdvanceStatus: 'idle' ΓåÆ 'queued' ΓåÆ 'processing' ΓåÆ 'success' ΓåÆ 'idle'
                                                            ΓåÆ 'failed'
```

### Progressive reveal per week

Each week follows the same cycle:

```
Week N: Select Game 1 ΓåÆ Stats ΓåÆ Score
        Select Game 2 ΓåÆ Stats ΓåÆ Score
        ...
        Select Game gamesPerMatchup ΓåÆ Stats ΓåÆ Score ΓåÆ Completed
        ΓåÆ Advance to Week N+1
```

Same player seasons, different random games each week.

---

## Phase 8: Free Agency & Waivers

### Waiver system

Waivers allow teams to pick up undrafted players (free agents) mid-season.

**Waiver types:**

| Type | Column value | How it works |
|------|-------------|--------------|
| Standard | `'standard'` | Claims processed by `teams.waiverOrder` (lower = higher priority) |
| FAAB | `'faab'` | Blind-bid auction; highest `faabBid` wins. Budget tracked in `teams.faabBudget` |

### Claiming a free agent

**Mutation: `claimFreeAgent`**

1. Creates `waiver_claims` row: `{ leagueId, teamId, playerId, dropPlayerId?, faabBid?, status='pending' }`
2. Optional `dropPlayerId` ΓÇö if roster is full, specify who to drop
3. For FAAB: `faabBid` validated against `teams.faabBudget`

### Waiver processing

**Service:** `lambdas/db/src/services/waiver-processor.ts` ΓåÆ `WaiverClaimProcessor`

Processing runs periodically (or on commissioner trigger via `processWaiverClaims`):

1. Fetch all `waiver_claims` with `status = 'pending'`, grouped by league
2. Sort claims:
   - **Standard**: by `teams.waiverOrder` ASC
   - **FAAB**: by `faabBid` DESC (highest bid wins)
3. For each claim in priority order:
   - Validate player is still available and drop target is valid
   - Execute: create `team_members` row (`acquisitionType = 'waiver'`), deduct FAAB budget
   - Create `league_week_player_seasons` entry for the claimed player (random eligible season)
   - Add player to current matchup via `addClaimedPlayerToCurrentMatchup()`
   - Update `waiver_claims.status ΓåÆ 'completed'`
   - Send `ROSTER_UPDATE` WebSocket notification
4. Failed claims: `status ΓåÆ 'failed'` with `errorMessage`

### Waiver claim statuses

`'pending'` ΓåÆ `'processing'` ΓåÆ `'completed'` | `'failed'` | `'cancelled'`

---

## Phase 9: Season End & Playoffs

### Regular season completion

After all `totalMatchups` weeks are played, the regular season ends.

### Playoffs

If `leagues.playoffEnabled = true`:

1. `autoAdvanceMatchups` detects season is complete
2. Generates playoff bracket based on `playoffFormat` (e.g., `'4-team'`)
3. Seeds teams by regular-season record
4. Sends `PLAYOFF_BRACKET_CREATED` WebSocket notification
5. Playoff matchups follow the same game selection ΓåÆ stats ΓåÆ scoring pipeline

---

## Phase 10: Season Renewal

### Starting a new season

**Mutation: `renewLeague(leagueId)`**

Creates a **new league** that is a continuation of the old one. The old league is frozen (read-only).

### What happens

1. **Freeze** old league: `frozenAt = now()` (becomes read-only archive)
2. **Create new league** with copied settings:
   - `previousLeagueId` ΓåÆ old league ID (creates a lineage chain)
   - `seasonNumber` ΓåÆ old `seasonNumber + 1`
   - All configuration copied (scoring, roster positions, waiver settings, etc.)
   - `draftStatus ΓåÆ 'not-started'`
3. **Create new teams** for the new league (same count)
4. **Copy league_members**: Users mapped to new teams
5. **For salary cap leagues**: Apply salary escalation/decay:
   - Rostered players: `newSalary = ceil(salary ├ù (100 + salaryEscalationPct) / 100)`
   - Free agents: `newSalary = ceil(salary ├ù (100 - salaryDecayPct) / 100)` (minimum: `minSalary`)
6. **New draft required**: Teams must draft again for the new season

The lifecycle then restarts from Phase 3 (Draft).

---

## Technical Architecture

### System Components

```
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé                     Next.js Web App                          Γöé
Γöé                  (apps/web)                                   Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                           Γöé GraphQL
                           Γû╝
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé                   DB Lambda (lambdas/db)                      Γöé
Γöé          GraphQL resolvers, mutations, services               Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
       Γöé              Γöé              Γöé
       Γû╝              Γû╝              Γû╝
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé  RDS       Γöé Γöé SQS Queues  Γöé Γöé WebSocket LambdaΓöé
Γöé PostgreSQL Γöé Γöé (FIFO)      Γöé Γöé (notifications) Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                      Γöé
          ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
          Γû╝           Γû╝           Γû╝
   ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
   ΓöéGame Select Γöé Γöé Stats  Γöé Γöé  Draft   Γöé
   Γöé  Lambda    Γöé Γöé Lambda Γöé ΓöéProcessor Γöé
   ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
```

### SQS Queues (all FIFO)

| Queue | Connects | Purpose |
|-------|----------|---------|
| `{prefix}-automatic-drafts.fifo` | DB Lambda ΓåÆ Draft Processor | Queued draft execution |
| `{prefix}-select-game.fifo` | DB Lambda ΓåÆ Game Selection Lambda | Game selection jobs |
| `{prefix}-load-game-stats.fifo` | Game Selection ΓåÆ Stats Lambda | Stats scraping + scoring |
| `{prefix}-load-season-stats.fifo` | DB Lambda ΓåÆ Stats Lambda | Career stats loading |

Each queue has a corresponding DLQ (`-dlq.fifo`) for failed messages.

### WebSocket Notifications

| Event | When sent | Payload includes |
|-------|-----------|-----------------|
| `DRAFT_STARTED` | Draft begins | leagueId, draftId |
| `DRAFT_PICK_MADE` | Each pick | leagueId, playerId, teamId, round, wasAutoPick |
| `DRAFT_COMPLETED` | Last pick made | leagueId, draftId |
| `PLAYER_STATS_LOADING` | Game selection starts | matchupId, leagueId |
| `PLAYER_STATS_UPDATED` | Individual player done | playerId, matchupId |
| `MATCHUP_STATS_COMPLETE` | All stats loaded | matchupId, leagueId |
| `WEEK_ADVANCED` | Week incremented | leagueId, currentWeek |
| `ROSTER_UPDATE` | Waiver/trade completed | leagueId, teamId |
| `PLAYOFF_BRACKET_CREATED` | Season ends | leagueId |

### Commissioner Next Step Control

**File:** `apps/web/src/features/commissioner/NextStepControl.tsx`

The commissioner sees exactly one action button at a time:

| State | Button | Mutation called |
|-------|--------|----------------|
| `draftStatus = 'not-started'` | "Start Draft" | `initializeDraft` ΓåÆ `startDraft` |
| Draft completed, no games selected | "Select Next Game" | `autoSelectGames` |
| Games in progress (not all selected) | "Select Next Game" | `autoSelectGames` |
| All games selected + stats loaded | "Advance Matchups" | `autoAdvanceMatchups` |
| After advancement | "Select Next Game" (next week) | `autoSelectGames` |

### Data Flow: Game Selection Pipeline

```
Commissioner clicks "Select Next Game"
  Γöé
  Γû╝
autoSelectGames mutation (DB Lambda)
  Γöé  Sends SQS message per matchup
  Γû╝
{prefix}-select-game.fifo
  Γöé
  Γû╝
Game Selection Lambda
  Γöé  1. Look up player seasons from league_week_player_seasons
  Γöé  2. Randomly select game_identifiers
  Γöé  3. Insert matchup_player_games records
  Γöé  4. Send batch SQS messages (8 players each)
  Γû╝
{prefix}-load-game-stats.fifo
  Γöé
  Γû╝
Stats Lambda
  Γöé  1. Scrape Baseball Reference (cached per player+season)
  Γöé  2. Store in game_batting/pitching/fielding
  Γöé  3. Calculate matchup scores
  Γöé  4. Update matchups.team1Score, team2Score
  Γöé  5. Send MATCHUP_STATS_COMPLETE WebSocket
  Γû╝
Frontend receives notification ΓåÆ refetches matchup data ΓåÆ displays scores
```

---

## Status Enums Reference

### `leagues.draftStatus`

| Value | Meaning |
|-------|---------|
| `'not-started'` | League created, draft not yet begun |
| `'queued'` | Draft queued for processing via SQS |
| `'in-progress'` | Draft actively running (picks being made) |
| `'paused'` | Draft paused by commissioner |
| `'completed'` | All picks made, rosters filled |

### `matchups.status`

| Value | Meaning |
|-------|---------|
| `'scheduled'` | Matchup created, no games selected yet |
| `'in_progress'` | At least one game selected, not all complete |
| `'completed'` | All games selected and scored |
| `'cancelled'` | Matchup cancelled |

### `matchups.statsLoadingStatus`

| Value | Meaning |
|-------|---------|
| `'not_started'` | No stats loading requested yet |
| `'queued'` | SQS message sent for stats loading |
| `'loading'` | Stats Lambda actively scraping/processing |
| `'completed'` | All player stats loaded and scores calculated |
| `'failed'` | Stats loading failed (will be retried) |
| `'retry'` | Queued for retry after failure |

### `leagues.weekAdvanceStatus`

| Value | Meaning |
|-------|---------|
| `'idle'` | No advancement in progress |
| `'queued'` | Advancement requested |
| `'processing'` | Backend processing week transition |
| `'success'` | Advancement complete |
| `'failed'` | Advancement failed |

### `waiver_claims.status`

| Value | Meaning |
|-------|---------|
| `'pending'` | Claim submitted, awaiting processing |
| `'processing'` | Currently being evaluated |
| `'completed'` | Player successfully claimed |
| `'failed'` | Claim failed (player unavailable, budget exceeded, etc.) |
| `'cancelled'` | Claim cancelled by user |

---

## Key Tables Reference

### Core tables

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `leagues` | League configuration | `id`, `name`, `draftStatus`, `currentWeek`, `totalMatchups`, `gamesPerMatchup`, `waiverType`, `seasonNumber`, `previousLeagueId`, `frozenAt` |
| `teams` | Teams within a league | `id`, `name`, `leagueId`, `waiverOrder`, `faabBudget`, `isLocked` |
| `league_members` | User Γåö team Γåö league mapping | `leagueId`, `userId`, `teamId`, `permissionLevel` |
| `team_members` | Player roster assignments | `id`, `teamId`, `playerId`, `positionId`, `acquisitionType`, `salary` |

### Draft tables

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `drafts` | Draft configuration and state | `id`, `leagueId`, `draftMode`, `selectionMethod`, `draftOrder`, `currentPick`, `pickTimeLimitSeconds`, `currentPickDeadline` |
| `draft_picks` | Individual picks made | `id`, `draftId`, `teamId`, `playerId`, `round`, `overallPick`, `bidAmount` |
| `draft_teams` | Team participation + order | `draftId`, `teamId`, `draftOrder`, `autoPick` |
| `draft_queue` | Auto-pick priority queue | `draftId`, `teamId`, `playerId`, `priority` |

### Matchup tables

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `matchups` | Weekly matchup pairings + scores | `id`, `leagueId`, `weekNumber`, `team1Id`, `team2Id`, `team1Score`, `team2Score`, `status`, `statsLoadingStatus`, `gamesPerMatchup` |
| `matchup_players` | Players linked to matchups | `id`, `matchupId`, `playerId`, `teamId`, `positionId` |
| `matchup_player_games` | Selected games per player | `id`, `matchupPlayerId`, `gameNum`, `gameIdentifier`, `statsLoadingStatus` |
| `league_week_player_seasons` | Player season assignments | `leagueId`, `weekNumber`, `playerId`, `season` (UNIQUE per league+week+player) |

### Waiver tables

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `waiver_claims` | Pending and processed claims | `id`, `leagueId`, `teamId`, `playerId`, `dropPlayerId`, `faabBid`, `status`, `errorMessage` |

### Stats tables

| Table | Purpose |
|-------|---------|
| `game_batting` | Per-game batting stats (scraped from Baseball Reference) |
| `game_pitching` | Per-game pitching stats |
| `game_fielding` | Per-game fielding stats |
| `player_scoring_cache` | Materialized career scoring data (LS-696 optimization) |
