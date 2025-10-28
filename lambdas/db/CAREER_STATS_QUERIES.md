# Career Statistics GraphQL Queries

This file contains ready-to-use GraphQL queries for testing the career statistics functionality in the DB Lambda.

## 1. Top Home Run Hitters (All Time)

```graphql
query TopHomeRunHitters {
  careerBattingStats(
    limit: 10
    orderBy: "homeRuns"
    orderDirection: "desc"
    minHomeRuns: 100
  ) {
    playerId
    games
    plateAppearances
    atBats
    hits
    homeRuns
    rbi
    stolenBases
    baseOnBalls
    strikeouts
    battingAverage
    onBasePercentage
    sluggingPercentage
  }
}
```

## 2. Top Pitchers by Wins

```graphql
query TopPitchersByWins {
  careerPitchingStats(
    limit: 10
    orderBy: "wins"
    orderDirection: "desc"
    minWins: 100
  ) {
    playerId
    wins
    losses
    games
    gamesStarted
    completeGames
    shutouts
    saves
    strikeouts
    baseOnBalls
    hits
    earnedRuns
    era
    winPercentage
  }
}
```

## 3. Top Strikeout Pitchers

```graphql
query TopStrikeoutPitchers {
  careerPitchingStats(
    limit: 10
    orderBy: "strikeouts"
    orderDirection: "desc"
    minStrikeouts: 1000
  ) {
    playerId
    wins
    losses
    games
    strikeouts
    baseOnBalls
    era
    winPercentage
  }
}
```

## 4. Best Fielders by Games Played

```graphql
query BestFielders {
  careerFieldingStats(
    limit: 15
    orderBy: "games"
    orderDirection: "desc"
    minGames: 1000
  ) {
    playerId
    games
    gamesStarted
    inningsDefended
    putouts
    assists
    errors
    doublePlays
    positions
    fieldingPercentage
  }
}
```

## 5. Individual Player Career Stats

```graphql
query PlayerCareerStats($playerId: Int!) {
  # Get all career stats for a specific player
  playerCareerBatting(playerId: $playerId) {
    playerId
    games
    plateAppearances
    atBats
    runs
    hits
    doubles
    triples
    homeRuns
    rbi
    stolenBases
    caughtStealing
    baseOnBalls
    strikeouts
    totalBases
    groundedIntoDoublePlays
    hitByPitch
    sacrificeHits
    intentionalBaseOnBalls
    battingAverage
    onBasePercentage
    sluggingPercentage
  }

  playerCareerPitching(playerId: $playerId) {
    playerId
    wins
    losses
    games
    gamesStarted
    gamesFinished
    completeGames
    shutouts
    saves
    hits
    runs
    earnedRuns
    homeRuns
    baseOnBalls
    intentionalBaseOnBalls
    strikeouts
    hitByPitch
    balks
    wildPitches
    battersFaced
    outsRecorded
    era
    winPercentage
  }

  playerCareerFielding(playerId: $playerId) {
    playerId
    games
    gamesStarted
    completeGames
    inningsDefended
    chances
    putouts
    assists
    errors
    doublePlays
    stolenBases
    caughtStealing
    pickoffs
    wildPitches
    positions
    fieldingPercentage
  }
}
```

**Variables for Individual Player Query:**

```json
{
  "playerId": 123
}
```

## 6. Get Player List (to find player IDs)

```graphql
query GetPlayers {
  players(limit: 50, orderBy: "firstName") {
    id
    firstName
    lastName
    brefId
  }
}
```

## 7. High-Performance Batters

```graphql
query HighPerformanceBatters {
  careerBattingStats(limit: 20, minGames: 1000, minHomeRuns: 200) {
    playerId
    games
    homeRuns
    rbi
    runs
    hits
    battingAverage
    onBasePercentage
    sluggingPercentage
  }
}
```

## 8. Elite Pitchers

```graphql
query ElitePitchers {
  careerPitchingStats(limit: 20, minWins: 150, minStrikeouts: 1500) {
    playerId
    wins
    losses
    strikeouts
    era
    winPercentage
    games
    completeGames
    shutouts
  }
}
```

## 9. Career Leaders with Filtering

```graphql
query CareerLeaders {
  # Top RBI leaders
  topRBI: careerBattingStats(
    limit: 5
    orderBy: "rbi"
    orderDirection: "desc"
    minRBI: 1000
  ) {
    playerId
    rbi
    homeRuns
    runs
  }

  # Top games played
  topGames: careerBattingStats(
    limit: 5
    orderBy: "games"
    orderDirection: "desc"
    minGames: 2000
  ) {
    playerId
    games
    atBats
    hits
    battingAverage
  }
}
```

## Usage Instructions:

1. **Start the GraphQL server:**

   ```bash
   cd lambdas/db
   pnpm run dev
   ```

2. **Access GraphQL Playground:**
   - Open: http://localhost:5000
   - Copy and paste any of the above queries
   - Click the "Play" button to execute

3. **Test the career statistics programmatically:**
   - GET request to: `http://localhost:5000?test=career-stats`
   - Check the console logs for detailed output

4. **Deploy and test on AWS:**
   ```bash
   nx deploy db
   # Then use your deployed GraphQL endpoint
   ```

## Expected Results:

- **Batting Stats**: Home runs, RBI, batting averages, etc.
- **Pitching Stats**: Wins, losses, ERA, strikeouts, etc.
- **Fielding Stats**: Games, fielding percentage, positions played
- **Computed Fields**: Automatically calculated averages and percentages
- **Filtering**: Only players meeting minimum thresholds
- **Sorting**: Results ordered by your specified criteria

These queries will help you explore and validate the career statistics data in your database!
