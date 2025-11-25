# LS-17: Season-Based Matchup System Design

**Last Updated:** October 22, 2025  
**Branch:** `LS-17/set-up-matchup-system-for-fantasy-leagues`

---

## 🎯 Core Concept

The matchup system uses **season-based game selection** where each matchup operates on a single historical MLB season. This approach provides:

1. **Fair competition** - All players draw from the same season's performance
2. **Historical accuracy** - Games represent actual historical performances
3. **Strategic depth** - Commissioners control when games are revealed
4. **Dual projections** - Compare career averages vs season-specific potential

---

## 🔑 Key Components

### 1. Season Selection (LS-18, LS-20)

**When a matchup is created:**

```typescript
// Matchup creation flow
1. Commissioner creates matchup for Week N
2. System randomly selects an eligible season:
   - Query all seasons where players have >= min_games_per_season
   - Randomly select one season
   - Store in matchup.selected_season
3. Matchup is now ready for game selection
```

**League Configuration:**

```typescript
interface LeagueConfig {
  min_games_per_season: number; // e.g., 50 games minimum
  games_per_matchup: number; // e.g., 5 games per player
}
```

**Database Changes:**

```sql
-- Matchups table
ALTER TABLE matchups ADD COLUMN selected_season INTEGER NOT NULL;
ALTER TABLE matchups ADD COLUMN games_per_matchup INTEGER NOT NULL DEFAULT 5;

-- Leagues table
ALTER TABLE leagues ADD COLUMN min_games_per_season INTEGER NOT NULL DEFAULT 50;
ALTER TABLE leagues ADD COLUMN games_per_matchup INTEGER NOT NULL DEFAULT 5;
```

---

### 2. Commissioner-Triggered Game Selection (LS-24, LS-26)

**Commissioner UI Flow:**

```
1. Commissioner navigates to league management page
2. Sees current matchup with status:
   - Selected Season: 1998
   - Games Selected: 2/5
   - Games Remaining: 3
3. Clicks "Select Game #3" button
4. Confirmation dialog appears
5. Commissioner confirms
6. Lambda is triggered
7. Games are selected for all players from season 1998
8. Scores are calculated and updated
9. UI refreshes showing new accumulated stats
```

**GraphQL Mutation:**

```graphql
mutation TriggerGameSelection {
  triggerGameSelection(matchupId: 123, gameNumber: 3) {
    success
    gamesSelected
    gamesRemaining
    updatedScores {
      team1Score
      team2Score
    }
  }
}
```

**Lambda Logic:**

```typescript
async function selectGamesForMatchup(
  matchupId: number,
  gameNumber: number,
): Promise<void> {
  // 1. Get matchup with selected_season
  const matchup = await getMatchup(matchupId);
  const { selected_season } = matchup;

  // 2. Get all rostered players for both teams
  const players = await getRosteredPlayers(matchup.team1_id, matchup.team2_id);

  // 3. For each player, select a random game from selected_season
  for (const player of players) {
    const seasonStats = await getSeasonStats(player.id, selected_season);

    if (seasonStats.games < gameNumber) {
      // Handle player with insufficient games
      continue;
    }

    const randomGameNum = selectRandomGame(seasonStats);

    // 4. Store selected game
    await createMatchupPlayerGame({
      matchupPlayerId: player.matchupPlayerId,
      gameNum: gameNumber,
      battingGameNum: randomGameNum,
      // ... other game selections
    });
  }

  // 5. Calculate accumulated stats
  await calculateMatchupScores(matchupId);

  // 6. Send notifications
  await notifyGameSelection(matchupId, gameNumber);
}
```

---

### 3. Dual Projection System (LS-21, LS-36)

**Career Projection (Existing from LS-7):**

```typescript
function calculateCareerProjection(
  player: Player,
  scoringSettings: ScoringSettings
): number {
  // Average across all career seasons
  const careerStats = player.careerBatting;
  const avgGames = careerStats.games / careerStats.seasons;

  return (
    (careerStats.hits / avgGames) * scoringSettings.hits +
    (careerStats.homeRuns / avgGames) * scoringSettings.homeRuns +
    // ... other stats
  );
}
```

**Matchup Projection (NEW):**

```typescript
function calculateMatchupProjection(
  player: Player,
  selectedSeason: number,
  scoringSettings: ScoringSettings
): number {
  // Average for ONLY the selected season
  const seasonStats = player.seasonBatting.find(
    s => s.season === selectedSeason
  );

  if (!seasonStats) {
    return 0; // Player didn't play this season
  }

  return (
    (seasonStats.hits / seasonStats.games) * scoringSettings.hits +
    (seasonStats.homeRuns / seasonStats.games) * scoringSettings.homeRuns +
    // ... other stats
  );
}
```

**GraphQL Query:**

```graphql
query GetPlayerProjections($matchupId: Int!, $playerId: Int!) {
  getMatchupProjections(matchupId: $matchupId, playerId: $playerId) {
    playerId
    careerProjection # e.g., 8.5 points/game
    matchupProjection # e.g., 12.3 points/game (from 1998 season)
    seasonUsed # 1998
  }
}
```

**UI Display:**

```tsx
<PlayerCard player={player}>
  <ProjectionDisplay>
    <CareerProjection>
      Career: {careerProj.toFixed(1)} pts/game
    </CareerProjection>
    <MatchupProjection highlight>
      1998 Season: {matchupProj.toFixed(1)} pts/game
    </MatchupProjection>
  </ProjectionDisplay>
</PlayerCard>
```

---

### 4. Accumulated Stats Display (LS-23, LS-24)

**Real-Time Score Tracking:**

```tsx
<MatchupScoreboard matchup={matchup}>
  <TeamScore team="1">
    <Score>{team1Score}</Score>
    <GamesSelected>2 of 5 games selected</GamesSelected>
  </TeamScore>

  <Divider>
    <GamesRemaining>3 games remaining</GamesRemaining>
  </Divider>

  <TeamScore team="2">
    <Score>{team2Score}</Score>
    <GamesSelected>2 of 5 games selected</GamesSelected>
  </TeamScore>
</MatchupScoreboard>

<RosterView>
  {players.map(player => (
    <PlayerRow key={player.id}>
      <PlayerName>{player.name}</PlayerName>

      {/* Accumulated stats from selected games */}
      <AccumulatedStats>
        <Stat>H: {player.accumulatedHits}</Stat>
        <Stat>HR: {player.accumulatedHRs}</Stat>
        <Stat>RBI: {player.accumulatedRBIs}</Stat>
      </AccumulatedStats>

      {/* Current score from selected games */}
      <CurrentScore>{player.currentScore} pts</CurrentScore>

      {/* Projections */}
      <Projections>
        <Career>Career: {player.careerProj}</Career>
        <Matchup>1998: {player.matchupProj}</Matchup>
      </Projections>
    </PlayerRow>
  ))}
</RosterView>
```

**GraphQL Query:**

```graphql
query GetMatchupPlayerStats($matchupId: Int!, $playerId: Int!) {
  getMatchupPlayerStats(matchupId: $matchupId, playerId: $playerId) {
    playerId
    gamesSelected
    accumulatedStats {
      hits
      homeRuns
      rbis
      battingAverage
      # ... other stats
    }
    currentScore
  }
}
```

---

## 🔄 Complete User Flow

### Setup Phase

1. **League Creation**
   - Commissioner sets `min_games_per_season = 50`
   - Commissioner sets `games_per_matchup = 5`

2. **Matchup Creation (Automated or Manual)**
   - System creates matchup for Week 1
   - System selects random eligible season (e.g., 1998)
   - All players must have played >= 50 games in 1998
   - Matchup status: `SCHEDULED`

### Game Selection Phase

3. **Commissioner Triggers Game 1**
   - Commissioner clicks "Select Game #1"
   - Lambda selects random game #1 for each player from 1998 season
   - Stats are accumulated
   - Scores calculated: Team 1: 45 pts, Team 2: 38 pts
   - Status: `IN_PROGRESS`

4. **Repeat for Games 2-5**
   - Each time commissioner clicks, next game is selected
   - Accumulated stats increase
   - Scores update in real-time

5. **Matchup Complete**
   - After game 5 is selected: `gamesSelected = gamesPerMatchup`
   - Final scores: Team 1: 225 pts, Team 2: 198 pts
   - Status: `COMPLETED`
   - Winner determined

### Player Experience

- **Before Game Selection:**
  - See matchup projections based on 1998 season averages
  - See career projections for comparison
  - No accumulated stats yet

- **During Game Selection:**
  - Watch accumulated stats grow after each game
  - See current score
  - Compare to projections
  - See games remaining counter

- **After Matchup:**
  - View final accumulated stats
  - See complete performance from all 5 selected games
  - Compare to original projections

---

## 🎯 Why This Design?

### Advantages

1. **Fair Competition**
   - All players draw from same season
   - No advantage from cherry-picking seasons

2. **Strategic Depth**
   - Commissioners control pacing
   - Can space out game selections over time
   - Adds suspense and engagement

3. **Historical Accuracy**
   - Based on real performances
   - Not synthetic/simulated data

4. **Dual Projections**
   - Compare career average to season-specific performance
   - Identify breakout/down seasons
   - Strategic drafting insights

5. **Scalability**
   - Works with any number of historical seasons
   - No dependency on current/live MLB games
   - Can run year-round

### Trade-offs

1. **Manual Trigger Required**
   - Commissioner must actively select games
   - Not fully automated

2. **Season Eligibility**
   - Some players may not have data for selected season
   - Requires handling missing data

3. **No Real-Time Games**
   - Not based on live MLB performance
   - Different from traditional fantasy baseball

---

## 🛠️ Implementation Checklist

### Phase 1: Database & Core Logic

- [ ] LS-18: Add `selected_season`, `games_per_matchup` to matchups table
- [ ] LS-18: Add `min_games_per_season`, `games_per_matchup` to leagues table
- [ ] LS-20: Implement season eligibility checker
- [ ] LS-20: Build season selector (random from eligible)
- [ ] LS-20: Store selected_season during matchup creation

### Phase 2: Game Selection

- [ ] LS-26: Update game-selection Lambda
- [ ] LS-26: Accept matchupId and gameNumber parameters
- [ ] LS-26: Query stats from selected_season only
- [ ] LS-26: Handle missing season data
- [ ] LS-26: Calculate accumulated stats
- [ ] LS-26: Update matchup scores

### Phase 3: Dual Projections

- [ ] LS-36: Build season-specific projection calculator
- [ ] LS-36: Reuse career projection calculator from LS-7
- [ ] LS-36: Create GraphQL query for both projections
- [ ] LS-36: Build UI components for dual display

### Phase 4: UI Components

- [ ] LS-24: Add "Select Game" button to commissioner page
- [ ] LS-24: Build game selection confirmation dialog
- [ ] LS-24: Show selected season in matchup header
- [ ] LS-24: Display games remaining counter
- [ ] LS-23/LS-24: Show accumulated stats on roster
- [ ] LS-23/LS-24: Display dual projections side-by-side

### Phase 5: GraphQL API

- [ ] LS-19: Add `triggerGameSelection` mutation
- [ ] LS-19: Add `getMatchupPlayerStats` query
- [ ] LS-19: Add `getMatchupProjections` query
- [ ] LS-19: Add `gamesRemaining` field to Matchup type

---

## 📊 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     MATCHUP CREATION                            │
├─────────────────────────────────────────────────────────────────┤
│ 1. Create matchup record                                        │
│ 2. Query eligible seasons (games >= min_games_per_season)      │
│ 3. Randomly select one season                                   │
│ 4. Store as matchup.selected_season                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  PROJECTION CALCULATION                         │
├─────────────────────────────────────────────────────────────────┤
│ For each rostered player:                                       │
│   - Calculate career projection (all seasons)                   │
│   - Calculate matchup projection (selected_season only)         │
│   - Display both on roster view                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│            COMMISSIONER TRIGGERS GAME SELECTION                 │
├─────────────────────────────────────────────────────────────────┤
│ 1. Commissioner clicks "Select Game #N"                         │
│ 2. GraphQL mutation: triggerGameSelection(matchupId, N)        │
│ 3. Lambda invoked                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   GAME SELECTION LAMBDA                         │
├─────────────────────────────────────────────────────────────────┤
│ For each rostered player:                                       │
│   1. Query player's stats from selected_season                  │
│   2. Select random game number (1 to season.games)             │
│   3. Create matchup_player_games record                        │
│   4. Accumulate stats across all selected games                │
│   5. Calculate score using league scoring settings             │
│   6. Update team scores in matchup table                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      UI UPDATES                                 │
├─────────────────────────────────────────────────────────────────┤
│ - Accumulated stats refresh                                     │
│ - Current scores update                                         │
│ - Games remaining counter decrements                            │
│ - Progress bar updates                                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    [ Repeat for each game ]
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  MATCHUP COMPLETION                             │
├─────────────────────────────────────────────────────────────────┤
│ When games_selected == games_per_matchup:                      │
│   - Set status = COMPLETED                                      │
│   - Determine winner                                            │
│   - Update standings                                            │
│   - Send notifications                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Next Steps

1. **Review and approve this design** with stakeholders
2. **Begin with LS-18** (database schema changes)
3. **Follow critical path:** LS-18 → LS-19 → LS-20 → LS-21 → LS-36
4. **Build UI components:** LS-23, LS-24
5. **Update game selection:** LS-26
6. **Test end-to-end** with real historical data

---

**Questions or concerns? Refer to:**

- [Full Implementation Plan](./LS-17-matchup-system-implementation-plan.md)
- [Quick Reference Guide](./LS-17-QUICK-REFERENCE.md)
- [AI Agent Contribution Workflow](../guides/ai-agent-contribution-workflow.md)
