# Complete League Flow Guide

A comprehensive guide to the Legacy Sports league lifecycle, from creation to championship.

## Table of Contents

- [Overview](#overview)
- [Phase 1: League Creation](#phase-1-league-creation)
- [Phase 2: Draft Process](#phase-2-draft-process)
- [Phase 3: Weekly Matchups](#phase-3-weekly-matchups)
- [Phase 4: Game Selection](#phase-4-game-selection)
- [Phase 5: Scoring & Results](#phase-5-scoring--results)
- [Phase 6: Weekly Progression](#phase-6-weekly-progression)
- [Technical Architecture](#technical-architecture)

---

## Overview

Legacy Sports uses a unique season-based fantasy system where players select historical seasons and games from those seasons to compete head-to-head.

### High-Level Flow

```
┌─────────────────┐
│ League Creation │ Commissioner creates league with settings + teams
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ User Assignment │ Users are assigned to teams
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Draft Process  │ Team managers draft players and select seasons
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Matchup Created │ Pairings set for each week
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Game Selection  │ Commissioner triggers game-by-game selection
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Stats Loading   │ Baseball Reference stats loaded automatically
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Score Calculate │ Points calculated based on league settings
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Winner Declared │ Higher score wins the week
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Week Complete  │ Record winner, update standings
└────────┬────────┘
         │
         ├─── Week < 20? ───┐
         │                  │
         │ YES              │ NO
         │                  │
         ▼                  ▼
  ┌─────────────┐    ┌──────────────┐
  │ Next Week   │    │Championship  │
  │ Generated   │    │  Complete    │
  └──────┬──────┘    └──────────────┘
         │
         └─── Loop back to Matchup Created
              (Repeat for weeks 2-20)
```

---

## Phase 1: League Creation

### Commissioner Actions

The commissioner creates a league and configures all settings.

```
┌──────────────────────────────────────────────────────┐
│              LEAGUE CREATION FORM                    │
├──────────────────────────────────────────────────────┤
│                                                      │
│  League Name: ___________________                    │
│                                                      │
│  Number of Teams: [12] ▼                            │
│                                                      │
│  Games Per Matchup: [5] ▼                           │
│    (How many games each player selects per week)     │
│                                                      │
│  Min Games Per Season: [100] ▼                      │
│    (Minimum games to qualify as a valid season)      │
│                                                      │
│  Weeks in Season: [20] ▼                            │
│                                                      │
│  Roster Positions:                                   │
│    Batters: [10]  Pitchers: [5]  Bench: [10]       │
│                                                      │
│  Scoring Settings:                                   │
│    HR: [3]  RBI: [1]  R: [1]  H: [1]  ...          │
│    W: [2]   SO: [1]   SV: [2]  ...                 │
│                                                      │
│              [Create League]                         │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Database State After Creation

```
leagues
┌────┬──────────────┬────────────┬──────────────────┬──────┐
│ id │     name     │ num_teams  │ games_per_matchup│ ... │
├────┼──────────────┼────────────┼──────────────────┼──────┤
│ 2  │ My League    │    12      │        5         │ ... │
└────┴──────────────┴────────────┴──────────────────┴──────┘

teams (Auto-created with league)
┌────┬───────────────────┬────────────┬────────────┐
│ id │       name        │ manager_id │ league_id  │
├────┼───────────────────┼────────────┼────────────┤
│ 11 │ Team 1            │    NULL    │     2      │
│ 12 │ Team 2            │    NULL    │     2      │
│ 13 │ Team 3            │    NULL    │     2      │
│ ...│ ...               │    NULL    │     2      │
│ 22 │ Team 12           │    NULL    │     2      │
└────┴───────────────────┴────────────┴────────────┘

scoring_settings
┌────────────┬──────────┬───────┐
│ league_id  │  stat    │ value │
├────────────┼──────────┼───────┤
│     2      │   hr     │   3   │
│     2      │   rbi    │   1   │
│     2      │   w      │   2   │
└────────────┴──────────┴───────┘
```

---

## Phase 2: User Assignment & Draft

### Step 1: User Assignment to Teams

Users are assigned to teams by the commissioner or can claim available teams.

```
┌─────────────────────────────────────────────────────────┐
│              TEAM ASSIGNMENT                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Available Teams:                                       │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Team 1  [Unassigned]  [Assign User] [Rename]   │  │
│  │ Team 2  [Unassigned]  [Assign User] [Rename]   │  │
│  │ Team 3  [John Smith]  [Remove] [Rename]        │  │
│  │ Team 4  [Unassigned]  [Assign User] [Rename]   │  │
│  │ ...                                              │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  User can:                                              │
│  • Rename their team (e.g., "The Bronx Bombers")      │
│  • Upload team logo                                     │
│  • View league settings                                 │
│                                                         │
└─────────────────────────────────────────────────────────┘

Database After Assignment:
teams
┌────┬───────────────────┬────────────┬────────────┐
│ id │       name        │ manager_id │ league_id  │
├────┼───────────────────┼────────────┼────────────┤
│ 11 │ The Bronx Bombers │     5      │     2      │ ← John assigned & renamed
│ 12 │ Cubs Forever      │     6      │     2      │ ← Jane assigned & renamed
│ 13 │ Team 3            │    NULL    │     2      │ ← Still unassigned
│ ...│                   │            │            │
└────┴───────────────────┴────────────┴────────────┘
```

### Step 2: Draft Execution

#### Snake Draft Order

```
Round 1:  Team 1 → Team 2 → Team 3 → ... → Team 12
          (Pick 1) (Pick 2) (Pick 3)        (Pick 12)

Round 2:  Team 12 → Team 11 → ... → Team 2 → Team 1
          (Pick 13) (Pick 14)        (Pick 23) (Pick 24)

Round 3:  Team 1 → Team 2 → ... → Team 12
          (Pick 25)                  (Pick 36)
```

#### Draft Pick Flow

```
┌──────────────────────────────────────────────────────────┐
│              DRAFT PICK INTERFACE                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Round 5, Pick 53                                        │
│  Your Turn: The Bronx Bombers                           │
│                                                          │
│  Select Player:                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Search: [Babe Ruth______________________] [Search]│ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Available Players:                                      │
│  ┌────────────────────────────────────────────────────┐ │
│  │ • Babe Ruth (1927)         Career BA: .342        │ │
│  │ • Ted Williams (1941)      Career BA: .344        │ │
│  │ • Barry Bonds (2001)       Career BA: .298        │ │
│  │ ...                                                │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ⭐ SEASON SELECTION (Critical Choice!)                 │
│  Select Season for Babe Ruth:                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │ • 1927: 60 HR, .356 BA, 165 RBI (151 games) ✓    │ │
│  │ • 1921: 59 HR, .378 BA, 171 RBI (152 games)      │ │
│  │ • 1928: 54 HR, .323 BA, 142 RBI (154 games)      │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  This season will be used for ALL 20 weeks!             │
│  Random games will be selected from this season.        │
│                                                          │
│           [Confirm Pick: Babe Ruth 1927]                │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

#### Database State During Draft

```
team_members
┌────┬─────────┬───────────┬────────┬────────────────┬────────┐
│ id │ team_id │ player_id │position│ draft_position │ season │
├────┼─────────┼───────────┼────────┼────────────────┼────────┤
│ 1  │   11    │   2239    │   OF   │       1        │  1927  │ ← Babe Ruth
│ 2  │   12    │   3075    │   SS   │       2        │  1941  │ ← Honus Wagner
│ 3  │   13    │   2593    │   2B   │       3        │  1991  │ ← Rogers Hornsby
└────┴─────────┴───────────┴────────┴────────────────┴────────┘

league_week_player_seasons (Created during draft)
┌────┬───────────┬─────────────┬───────────┬────────┐
│ id │ league_id │ week_number │ player_id │ season │
├────┼───────────┼─────────────┼───────────┼────────┤
│ 1  │     2     │      1      │   2239    │  1927  │ ← Week 1, Babe Ruth
│ 2  │     2     │      1      │   3075    │  1941  │ ← Week 1, Honus Wagner
│ 3  │     2     │      1      │   2593    │  1991  │ ← Week 1, Rogers Hornsby
│ ... (repeated for all 20 weeks)                    │
└────┴───────────┴─────────────┴───────────┴────────┘
```

### League Status Tracking

The league progresses through various statuses:

```
leagues
┌────┬──────────┬────────────┐
│ id │   name   │   status   │
├────┼──────────┼────────────┤
│ 2  │My League │ 'drafting' │ ← During draft
└────┴──────────┴────────────┘

Status Flow:
  'setup'     → League created, teams assigned
  'drafting'  → Draft in progress
  'active'    → Season started, matchups ongoing
  'completed' → All weeks finished
```

---

## Phase 3: Weekly Matchups

### Matchup Creation

The system automatically creates head-to-head pairings for each week.

```
Week 1 Matchups:
┌─────────────────────────────────────────────┐
│  Team 1 (The Bronx Bombers)                │
│           VS                                │
│  Team 2 (Cubs Forever)                     │
├─────────────────────────────────────────────┤
│  Team 3 (Red Sox Nation)                   │
│           VS                                │
│  Team 4 (Dodgers Dynasty)                  │
├─────────────────────────────────────────────┤
│  Team 5 (Yankees Empire)                   │
│           VS                                │
│  Team 6 (Giants Glory)                     │
└─────────────────────────────────────────────┘
```

### Database State

```
matchups
┌────┬───────────┬─────────────┬──────────┬──────────┬────────┬────────────┬────────────┐
│ id │ league_id │ week_number │ team1_id │ team2_id │ status │ team1_score│ team2_score│
├────┼───────────┼─────────────┼──────────┼──────────┼────────┼────────────┼────────────┤
│ 1  │     2     │      1      │    11    │    12    │pending │    NULL    │    NULL    │
│ 2  │     2     │      1      │    13    │    14    │pending │    NULL    │    NULL    │
│ 3  │     2     │      1      │    15    │    16    │pending │    NULL    │    NULL    │
└────┴───────────┴─────────────┴──────────┴──────────┴────────┴────────────┴────────────┘

matchup_players (Links players to matchups)
┌────┬────────────┬───────────┬─────────┐
│ id │ matchup_id │ player_id │ team_id │
├────┼────────────┼───────────┼─────────┤
│ 1  │     1      │   2239    │   11    │ ← Babe Ruth on Team 11
│ 2  │     1      │   3075    │   11    │ ← Another player on Team 11
│ 3  │     1      │   2593    │   12    │ ← Player on Team 12
└────┴────────────┴───────────┴─────────┘
```

---

## Phase 4: Game Selection

This is where the magic happens! The commissioner triggers game selection, and the system randomly picks historical games from each player's selected season.

### Commissioner View with Status Tracking

```
┌──────────────────────────────────────────────────────────┐
│              MATCHUP MANAGEMENT                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Week 1: The Bronx Bombers vs Cubs Forever              │
│                                                          │
│  Games Selected: 0 / 5                                   │
│  ████░░░░░░░░░░░░░░░░░░░ 0%                            │
│                                                          │
│  Status: pending                                         │
│    ↳ No games selected yet                              │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │                                                    │ │
│  │        [Select Game #1]                           │ │
│  │                                                    │ │
│  │  This will randomly select 1 game from each       │ │
│  │  player's chosen season (e.g., random game        │ │
│  │  from Babe Ruth's 1927 season)                   │ │
│  │                                                    │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
└──────────────────────────────────────────────────────────┘

Matchup Status Values:
  'pending'          → No games selected yet
  'selecting_games'  → Game selection in progress (game_num < games_per_matchup)
  'loading_stats'    → Games selected, stats being loaded from Baseball Reference
  'calculating'      → Stats loaded, scores being calculated
  'completed'        → All done, final scores available
```

### Game Selection Process (Behind the Scenes)

#### Step 1: Commissioner Triggers Game #1

```
Commissioner clicks "Select Game #1"
         │
         ▼
┌─────────────────────────────────────────────────┐
│  game-selection Lambda triggered                │
├─────────────────────────────────────────────────┤
│  Status Update: 'pending' → 'selecting_games'   │
│                                                 │
│  For each player in matchup:                    │
│    1. Get player's season (from draft)          │
│       Query: league_week_player_seasons         │
│       WHERE league_id=2 AND week_number=1       │
│                                                 │
│    2. Generate random game number (1-162)       │
│                                                 │
│    3. Store in matchup_player_games             │
│                                                 │
│    4. Queue stats loading job                   │
│                                                 │
│  Status Update: 'selecting_games' →             │
│                 'loading_stats'                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

#### Step 2: Random Game Number Selection

```
Example for Babe Ruth (1927 season):

1927 Season: 151 games played

Random Selection:
┌──────────────────────────────────────────┐
│  Game #1 through Game #151               │
│  ████████████████████████████████████    │
│                                          │
│  Random Pick: Game #87 ✓                │
│                                          │
│  (This was June 30, 1927 vs Tigers)     │
│  Result: 3-for-4, 1 HR, 3 RBI          │
└──────────────────────────────────────────┘

Database Record Created:
matchup_player_games
┌────┬───────────────────┬──────────┬──────────────────┬───────────────────┬───────────────────┐
│ id │ matchup_player_id │ game_num │ batting_game_num │ pitching_game_num │ fielding_game_num │
├────┼───────────────────┼──────────┼──────────────────┼───────────────────┼───────────────────┤
│ 1  │        1          │    1     │       87         │       NULL        │        87         │
└────┴───────────────────┴──────────┴──────────────────┴───────────────────┴───────────────────┘
```

#### Step 3: Stats Loading (Automatic)

```
┌─────────────────────────────────────────────────────────────┐
│  SQS Message Queued to load-game-stats queue                │
├─────────────────────────────────────────────────────────────┤
│  Status: 'loading_stats'                                    │
│                                                             │
│  {                                                          │
│    "matchupId": 1,                                         │
│    "gameNum": 1,                                           │
│    "players": [                                            │
│      {                                                     │
│        "playerId": 2239,                                   │
│        "brefId": "ruthba01",                              │
│        "season": 1927,                                    │
│        "battingGameNum": 87,                              │
│        "fieldingGameNum": 87                              │
│      },                                                     │
│      ...                                                   │
│    ]                                                        │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  stats-lambda Triggered by SQS                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  For each player:                                          │
│    1. Check if stats already exist (cache check)           │
│                                                             │
│    2. If not cached, fetch from Baseball Reference         │
│       https://baseball-reference.com/players/              │
│       gl.fcgi?id=ruthba01&t=b&year=1927                   │
│                                                             │
│    3. Parse ALL 151 games from HTML                        │
│       (Full season cached for future use)                  │
│                                                             │
│    4. Store in database:                                   │
│       - game_batting (all 151 games)                       │
│       - game_pitching (all 151 games)                      │
│       - game_fielding (all 151 games)                      │
│                                                             │
│  Status Update: 'loading_stats' → 'calculating'            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Step 4: Stats Stored

```
game_batting
┌───────────┬────────┬─────────────┬────┬────┬───┬────┬─────┬────┐
│ player_id │ season │ game_number │ pa │ ab │ h │ hr │ rbi │ r  │
├───────────┼────────┼─────────────┼────┼────┼───┼────┼─────┼────┤
│   2239    │  1927  │     87      │ 4  │ 4  │ 3 │ 1  │  3  │ 2  │ ← Babe's game #87
└───────────┴────────┴─────────────┴────┴────┴───┴────┴─────┴────┘

game_fielding
┌───────────┬────────┬─────────┬─────────┬───────┬────┬────┬──────┐
│ player_id │ season │game_num │ inn_def │chances│ po │ a  │e_def │
├───────────┼────────┼─────────┼─────────┼───────┼────┼────┼──────┤
│   2239    │  1927  │   87    │   9.0   │   2   │ 2  │ 0  │  0   │
└───────────┴────────┴─────────┴─────────┴───────┴────┴────┴──────┘
```

### Repeated for Each Game

```
Game #1: [pending] → Commissioner clicks → [selecting_games] →
         [loading_stats] → [calculating] → [selecting_games]
              (Back to selecting_games for next game)
   ↓
Game #2: [selecting_games] → Commissioner clicks → [loading_stats] →
         [calculating] → [selecting_games]
   ↓
Game #3: [selecting_games] → Commissioner clicks → [loading_stats] →
         [calculating] → [selecting_games]
   ↓
Game #4: [selecting_games] → Commissioner clicks → [loading_stats] →
         [calculating] → [selecting_games]
   ↓
Game #5: [selecting_games] → Commissioner clicks → [loading_stats] →
         [calculating] → [completed]
              (All games done, final status)
   ↓
Matchup Complete! Status: 'completed'

Database tracking:
matchups
┌────┬─────────────┬────────┬────────────────┬──────────────────┐
│ id │ week_number │game_num│     status     │ updated_at       │
├────┼─────────────┼────────┼────────────────┼──────────────────┤
│ 1  │      1      │   5    │  'completed'   │ 2026-02-05 14:32 │
└────┴─────────────┴────────┴────────────────┴──────────────────┘

game_num tracks how many games have been selected (0-5)
status tracks the current processing state
```

### Progress View for Users

```
┌──────────────────────────────────────────────────────────────┐
│         THE BRONX BOMBERS  vs  CUBS FOREVER                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Games: 3 / 5 Complete                                       │
│  ████████████████████░░░░░░░░░ 60%                         │
│                                                              │
│  Current Scores:                                             │
│  ┌──────────────────┬──────────────────┐                   │
│  │  Bronx Bombers   │  Cubs Forever    │                   │
│  │                  │                  │                   │
│  │      127         │       98         │                   │
│  │   (Leading)      │                  │                   │
│  └──────────────────┴──────────────────┘                   │
│                                                              │
│  Top Performers:                                             │
│  • Babe Ruth: 42 pts (3 games)                             │
│  • Ted Williams: 38 pts (3 games)                          │
│  • Barry Bonds: 35 pts (3 games)                           │
│                                                              │
│  Games Remaining: 2                                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Phase 5: Scoring & Results

### Score Calculation

Once all stats are loaded, scores are calculated automatically.

```
┌─────────────────────────────────────────────────────────────┐
│           SCORE CALCULATION FLOW                            │
└─────────────────────────────────────────────────────────────┘

For Babe Ruth (1927), Game #87:
┌──────────────────────────────────────┐
│  Raw Stats:                          │
│  • 3 Hits (H)                       │
│  • 1 Home Run (HR)                  │
│  • 3 RBI                            │
│  • 2 Runs (R)                       │
└──────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  Apply League Scoring Settings:      │
│  • H:   3 × 1  =  3 points          │
│  • HR:  1 × 3  =  3 points          │
│  • RBI: 3 × 1  =  3 points          │
│  • R:   2 × 1  =  2 points          │
│                                      │
│  Game #87 Total: 11 points          │
└──────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  Repeat for all 5 games              │
│  Game #87:  11 points                │
│  Game #12:   8 points                │
│  Game #145: 14 points                │
│  Game #3:    6 points                │
│  Game #99:  12 points                │
│                                      │
│  TOTAL: 51 points (5 games)         │
└──────────────────────────────────────┘
```

### Team Aggregation

```
┌─────────────────────────────────────────────────────────────┐
│              TEAM SCORING BREAKDOWN                         │
├─────────────────────────────────────────────────────────────┤
│  The Bronx Bombers (Team 11)                               │
│                                                             │
│  Batters:                                                   │
│  • Babe Ruth (OF):        51 pts                           │
│  • Lou Gehrig (1B):       48 pts                           │
│  • Ted Williams (OF):     45 pts                           │
│  • Barry Bonds (OF):      44 pts                           │
│  • Hank Aaron (OF):       42 pts                           │
│  • Willie Mays (OF):      40 pts                           │
│  • Mickey Mantle (OF):    38 pts                           │
│  • Stan Musial (OF):      36 pts                           │
│  • Ty Cobb (OF):          35 pts                           │
│  • Rogers Hornsby (2B):   34 pts                           │
│                       Subtotal: 413 pts                     │
│                                                             │
│  Pitchers:                                                  │
│  • Sandy Koufax:          28 pts                           │
│  • Pedro Martinez:        26 pts                           │
│  • Randy Johnson:         24 pts                           │
│  • Bob Gibson:            22 pts                           │
│  • Greg Maddux:           20 pts                           │
│                       Subtotal: 120 pts                     │
│                                                             │
│  ═══════════════════════════════════════                   │
│  TEAM TOTAL:              533 pts                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Final Matchup Result

```
┌─────────────────────────────────────────────────────────────┐
│                   WEEK 1 RESULTS                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│         THE BRONX BOMBERS  vs  CUBS FOREVER                 │
│                                                             │
│  ┌─────────────────────┬─────────────────────┐            │
│  │   Bronx Bombers     │   Cubs Forever      │            │
│  │                     │                     │            │
│  │       533           │       487           │            │
│  │    👑 WINNER        │                     │            │
│  └─────────────────────┴─────────────────────┘            │
│                                                             │
│  Margin of Victory: 46 points                              │
│                                                             │
│  Game Ball 🏆                                              │
│  Babe Ruth - 51 points (3 HR, 15 RBI, 15 H)              │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Database Updated:
matchups
┌────┬───────────┬─────────────┬──────────┬──────────┬───────────┬────────────┬────────────┐
│ id │ league_id │ week_number │ team1_id │ team2_id │  status   │ team1_score│ team2_score│
├────┼───────────┼─────────────┼──────────┼──────────┼───────────┼────────────┼────────────┤
│ 1  │     2     │      1      │    11    │    12    │ completed │    533     │    487     │
└────┴───────────┴─────────────┴──────────┴──────────┴───────────┴────────────┴────────────┘
```

---

## Phase 6: Weekly Progression

### Completing a Week

Once all matchups for a week are completed, the system advances to the next week.

```
┌──────────────────────────────────────────────────────────┐
│              WEEK 1 COMPLETION CHECK                     │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  League: My League (12 teams, 20 weeks)                 │
│                                                          │
│  Week 1 Status:                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Matchup 1: COMPLETED ✓                            │ │
│  │ Matchup 2: COMPLETED ✓                            │ │
│  │ Matchup 3: COMPLETED ✓                            │ │
│  │ Matchup 4: COMPLETED ✓                            │ │
│  │ Matchup 5: COMPLETED ✓                            │ │
│  │ Matchup 6: COMPLETED ✓                            │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  All matchups completed!                                 │
│                                                          │
│  [Advance to Week 2]                                     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Generating the Next Week

When the commissioner or system advances to the next week:

```
┌─────────────────────────────────────────────────────────────┐
│           WEEK 2 GENERATION PROCESS                         │
└─────────────────────────────────────────────────────────────┘

Step 1: Update League State
  leagues.current_week: 1 → 2

Step 2: Generate New Matchups
  Algorithm: Rotate teams to create new pairings
  (Ensures each team plays different opponents)

  Week 1 Pairings:        Week 2 Pairings:
  Team 1 vs Team 2   →    Team 1 vs Team 3
  Team 3 vs Team 4   →    Team 2 vs Team 4
  Team 5 vs Team 6   →    Team 5 vs Team 7
  ...                     ...

Step 3: Create Matchup Records
  INSERT INTO matchups (league_id, week_number, team1_id, team2_id, status)
  VALUES (2, 2, 11, 13, 'pending'),
         (2, 2, 12, 14, 'pending'),
         ...

Step 4: Link Players to Matchups
  For each matchup:
    - Get all players from team1 roster
    - Get all players from team2 roster
    - Create matchup_players records

Step 5: Ready for Game Selection
  Commissioner can now select games for Week 2
  (Uses SAME seasons from draft, different random games)
```

### Database State After Week Advancement

```
leagues
┌────┬───────────┬──────────────┬────────┐
│ id │   name    │ current_week │ status │
├────┼───────────┼──────────────┼────────┤
│ 2  │ My League │      2       │'active'│ ← Advanced to Week 2
└────┴───────────┴──────────────┴────────┘

matchups (Week 1 - Completed)
┌────┬───────────┬─────────────┬──────────┬──────────┬────────────┬────────────┬────────────┐
│ id │ league_id │ week_number │ team1_id │ team2_id │   status   │ team1_score│ team2_score│
├────┼───────────┼─────────────┼──────────┼──────────┼────────────┼────────────┼────────────┤
│ 1  │     2     │      1      │    11    │    12    │'completed' │    533     │    487     │
│ 2  │     2     │      1      │    13    │    14    │'completed' │    456     │    512     │
│ 3  │     2     │      1      │    15    │    16    │'completed' │    478     │    491     │
└────┴───────────┴─────────────┴──────────┴──────────┴────────────┴────────────┴────────────┘

matchups (Week 2 - Just Created)
┌────┬───────────┬─────────────┬──────────┬──────────┬──────────┬────────────┬────────────┐
│ id │ league_id │ week_number │ team1_id │ team2_id │  status  │ team1_score│ team2_score│
├────┼───────────┼─────────────┼──────────┼──────────┼──────────┼────────────┼────────────┤
│ 7  │     2     │      2      │    11    │    13    │'pending' │    NULL    │    NULL    │
│ 8  │     2     │      2      │    12    │    14    │'pending' │    NULL    │    NULL    │
│ 9  │     2     │      2      │    15    │    17    │'pending' │    NULL    │    NULL    │
└────┴───────────┴─────────────┴──────────┴──────────┴──────────┴────────────┴────────────┘
```

### Key Points About Weekly Progression

```
┌─────────────────────────────────────────────────────────────┐
│  🔄 SAME SEASONS, DIFFERENT GAMES                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✓ Player seasons are locked from the draft                │
│    Babe Ruth is ALWAYS using his 1927 season               │
│                                                             │
│  ✓ league_week_player_seasons table has records for        │
│    ALL 20 weeks with the same season values                │
│                                                             │
│  ✓ Each week, NEW random games are selected from the       │
│    same season                                              │
│                                                             │
│  Example:                                                   │
│    Week 1: Babe Ruth games #87, #12, #145, #3, #99        │
│    Week 2: Babe Ruth games #45, #128, #71, #112, #8       │
│    Week 3: Babe Ruth games #156, #34, #91, #67, #140      │
│                                                             │
│    All from 1927 season, but different random games!       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Season-Long View

```
 Week 1  │████████████│ Complete  │ 6 matchups finished
 Week 2  │████████████│ Complete  │ 6 matchups finished
 Week 3  │████████████│ Complete  │ 6 matchups finished
 Week 4  │████████████│ Complete  │ 6 matchups finished
 Week 5  │████████░░░░│ In Progress │ 4/6 matchups done
 Week 6  │░░░░░░░░░░░░│ Pending   │ Not started
 Week 7  │░░░░░░░░░░░░│ Pending   │ Not started
 Week 8  │░░░░░░░░░░░░│ Pending   │ Not started
   ...
 Week 20 │░░░░░░░░░░░░│ Pending   │ Not started

Standings:
┌──────┬───────────────────┬──────┬────────┬────────┐
│ Rank │       Team        │ Wins │ Losses │ Points │
├──────┼───────────────────┼──────┼────────┼────────┤
│  1   │ The Bronx Bombers │  4   │   0    │  2134  │
│  2   │ Cubs Forever      │  3   │   1    │  1987  │
│  3   │ Red Sox Nation    │  3   │   1    │  1956  │
│  4   │ Dodgers Dynasty   │  2   │   2    │  1845  │
│  5   │ Yankees Empire    │  2   │   2    │  1823  │
│  6   │ Giants Glory      │  1   │   3    │  1756  │
│ ...  │                   │      │        │        │
└──────┴───────────────────┴──────┴────────┴────────┘
```

### Complete 20-Week Cycle

```
       START: Draft Complete
             │
             ▼
       ┌─────────────┐
    ┌─→│  Week N     │
    │  │  (1 to 20)  │
    │  └──────┬──────┘
    │         │
    │         ▼
    │  ┌──────────────────┐
    │  │ Create Matchups  │ Generate pairings
    │  └────────┬─────────┘
    │           │
    │           ▼
    │  ┌──────────────────┐
    │  │ Commissioner     │ Select games 1-5
    │  │ Selects Games    │ (one at a time)
    │  └────────┬─────────┘
    │           │
    │           ▼
    │  ┌──────────────────┐
    │  │ Stats Loaded     │ Baseball Reference
    │  └────────┬─────────┘
    │           │
    │           ▼
    │  ┌──────────────────┐
    │  │ Scores Calculated│ Apply league settings
    │  └────────┬─────────┘
    │           │
    │           ▼
    │  ┌──────────────────┐
    │  │ Winners Declared │ Update standings
    │  └────────┬─────────┘
    │           │
    │           ▼
    │      Week < 20?
    │           │
    │      YES  │  NO
    │           │  │
    └───────────┘  ▼
             ┌─────────────┐
             │ SEASON END  │
             │ Champion    │
             └─────────────┘
```

---

## Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                           │
│                      (Next.js Web App)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY                                │
│                   (GraphQL Endpoint)                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      GraphQL Lambda                             │
│              (Handles queries & mutations)                      │
└────────────┬────────────────────────────────┬───────────────────┘
             │                                │
             ▼                                ▼
┌────────────────────────┐      ┌────────────────────────────┐
│  Database (RDS)        │      │  Game Selection Lambda     │
│  • leagues             │      │  Triggered by GraphQL      │
│  • teams               │      └─────────────┬──────────────┘
│  • team_members        │                    │
│  • matchups            │                    ▼
│  • matchup_players     │      ┌────────────────────────────┐
│  • matchup_player_games│      │  SQS Queue                 │
│  • game_batting        │      │  (load-game-stats.fifo)    │
│  • game_pitching       │      └─────────────┬──────────────┘
│  • game_fielding       │                    │
└────────────────────────┘                    ▼
                               ┌────────────────────────────┐
                               │  Stats Lambda              │
                               │  • Scrapes Baseball Ref    │
                               │  • Loads game stats        │
                               │  • Stores in database      │
                               └─────────────┬──────────────┘
                                             │
                                             ▼
                               ┌────────────────────────────┐
                               │  Calculate Scores Lambda   │
                               │  • Aggregates stats        │
                               │  • Applies scoring rules   │
                               │  • Updates matchup scores  │
                               └────────────────────────────┘
```

### Data Flow for Game Selection

```
Step 1: Commissioner Action
┌──────────────┐
│   Browser    │
│ [Select Game]│
└──────┬───────┘
       │ GraphQL Mutation: triggerGameSelection(matchupId, gameNum)
       ▼
┌──────────────────┐
│  GraphQL Lambda  │
│  Validates input │
└──────┬───────────┘
       │ Invokes game-selection Lambda
       ▼
┌─────────────────────────────────────────────────────┐
│  Game Selection Lambda                              │
├─────────────────────────────────────────────────────┤
│  1. Query matchup_players (50 players)              │
│  2. For each player:                                │
│     - Get season from league_week_player_seasons    │
│     - Generate random game numbers (1-162)          │
│     - Create matchup_player_games record            │
│  3. Batch insert all 50 records                     │
│  4. Queue SQS message for stats loading             │
└──────┬──────────────────────────────────────────────┘
       │ SQS Message
       ▼
┌─────────────────────────────────────────────────────┐
│  SQS Queue: legacy-sports-dev-load-game-stats.fifo  │
│  Message Group ID: matchup-{matchupId}              │
│  FIFO ensures sequential processing                 │
└──────┬──────────────────────────────────────────────┘
       │ Lambda triggered by SQS
       ▼
┌─────────────────────────────────────────────────────┐
│  Stats Lambda                                       │
├─────────────────────────────────────────────────────┤
│  For each player (processed in batches of 10):     │
│                                                     │
│  1. Check if stats already cached:                 │
│     SELECT * FROM game_batting                     │
│     WHERE player_id = X AND season = Y             │
│                                                     │
│  2. If not cached, scrape Baseball Reference:      │
│     GET https://baseball-reference.com/players/    │
│         gl.fcgi?id={brefId}&t=b&year={season}      │
│                                                     │
│  3. Parse HTML and extract all 162 games           │
│                                                     │
│  4. Insert into database:                          │
│     INSERT INTO game_batting VALUES (...)          │
│     INSERT INTO game_pitching VALUES (...)         │
│     INSERT INTO game_fielding VALUES (...)         │
│                                                     │
│  5. Update matchup status:                         │
│     UPDATE matchups SET stats_loading_status =     │
│       'completed' WHERE id = matchupId             │
│                                                     │
└──────┬──────────────────────────────────────────────┘
       │ All stats loaded
       ▼
┌─────────────────────────────────────────────────────┐
│  Calculate Scores Lambda (auto-triggered)           │
├─────────────────────────────────────────────────────┤
│  1. Query all game stats for matchup:              │
│     SELECT * FROM game_batting                     │
│     JOIN matchup_player_games ...                  │
│                                                     │
│  2. Aggregate stats per player:                    │
│     SUM(h), SUM(hr), SUM(rbi), etc.                │
│                                                     │
│  3. Apply scoring settings:                        │
│     score = (h * 1) + (hr * 3) + (rbi * 1) ...    │
│                                                     │
│  4. Sum team totals:                               │
│     team1_score = SUM(all player scores)           │
│                                                     │
│  5. Update matchup table:                          │
│     UPDATE matchups SET                            │
│       team1_score = X, team2_score = Y             │
│     WHERE id = matchupId                           │
│                                                     │
└──────┬──────────────────────────────────────────────┘
       │ Scores calculated
       ▼
┌──────────────┐
│   Browser    │
│ Displays new │
│   scores     │
└──────────────┘
```

### Status Tracking Throughout the System

#### League-Level Status

```
leagues.status:
  'setup'     → League created, waiting for user assignments
  'drafting'  → Draft in progress
  'active'    → Season underway, matchups being played
  'completed' → All 20 weeks finished
  'paused'    → Commissioner paused the league
```

#### Matchup-Level Status

```
matchups.status:
  'pending'          → Matchup created, no games selected
  'selecting_games'  → Game selection in progress (game_num < games_per_matchup)
  'loading_stats'    → All games selected, waiting for stats from Baseball Reference
  'calculating'      → Stats loaded, calculating final scores
  'completed'        → Final scores calculated, winner determined

matchups.game_num:
  Tracks how many games have been selected (0 to games_per_matchup)
  Example: If games_per_matchup = 5:
    game_num = 0 → No games selected yet
    game_num = 1 → Game #1 selected
    game_num = 3 → Games #1, #2, #3 selected
    game_num = 5 → All games selected
```

#### Status Flow Example

```
┌─────────────────────────────────────────────────────────────┐
│  WEEK 1 MATCHUP: The Bronx Bombers vs Cubs Forever         │
└─────────────────────────────────────────────────────────────┘

Initial State:
  matchups: { id: 1, status: 'pending', game_num: 0 }

Commissioner selects Game #1:
  1. Status: 'pending' → 'selecting_games'
  2. Random games generated for all 50 players
  3. Records inserted into matchup_player_games
  4. game_num: 0 → 1
  5. Status: 'selecting_games' → 'loading_stats'
  6. SQS message queued

Stats Lambda processes:
  7. Status remains: 'loading_stats'
  8. Scrapes Baseball Reference (if not cached)
  9. Inserts into game_batting, game_pitching, game_fielding
  10. Status: 'loading_stats' → 'calculating'

Scoring calculation:
  11. Aggregates all game stats
  12. Applies league scoring settings
  13. Updates matchups.team1_score and team2_score
  14. Status: 'calculating' → 'selecting_games'
      (Ready for next game)

After Game #5:
  15. game_num: 4 → 5
  16. Status: 'calculating' → 'completed'
      (No more games to select)
  17. Winner determined

Final State:
  matchups: {
    id: 1,
    status: 'completed',
    game_num: 5,
    team1_score: 533,
    team2_score: 487
  }
```

#### Checking Current State

```sql
-- What's the current state of all Week 1 matchups?
SELECT
  m.id,
  m.week_number,
  m.status,
  m.game_num,
  l.games_per_matchup,
  CONCAT(m.game_num, ' / ', l.games_per_matchup) as progress
FROM matchups m
JOIN leagues l ON m.league_id = l.id
WHERE m.league_id = 2 AND m.week_number = 1;

-- Result:
┌────┬─────────────┬────────────────┬──────────┬──────────────────┬──────────┐
│ id │ week_number │     status     │ game_num │games_per_matchup │ progress │
├────┼─────────────┼────────────────┼──────────┼──────────────────┼──────────┤
│ 1  │      1      │'selecting_games'│    2     │        5         │  2 / 5   │
│ 2  │      1      │'completed'      │    5     │        5         │  5 / 5   │
│ 3  │      1      │'loading_stats'  │    3     │        5         │  3 / 5   │
└────┴─────────────┴────────────────┴──────────┴──────────────────┴──────────┘
```

---

### Database Schema (Simplified)

```
┌─────────────┐
│   leagues   │
│─────────────│
│ id          │──┐
│ name        │  │
│ num_teams   │  │
│ games_per...│  │
└─────────────┘  │
                 │
                 │  ┌──────────────────┐
                 └─→│ scoring_settings │
                    │──────────────────│
                    │ league_id (FK)   │
                    │ stat_name        │
                    │ multiplier       │
                    └──────────────────┘

┌─────────────┐
│    teams    │
│─────────────│
│ id          │──┐
│ name        │  │
│ league_id   │←─┘
│ manager_id  │
└─────────────┘
       │
       │  ┌──────────────┐
       └─→│ team_members │
          │──────────────│
          │ team_id (FK) │
          │ player_id(FK)│──┐
          │ position     │  │
          │ season       │  │
          └──────────────┘  │
                            │
          ┌─────────────┐   │
          │   players   │←──┘
          │─────────────│
          │ id          │
          │ first_name  │
          │ last_name   │
          │ bref_id     │
          └─────────────┘

┌──────────────────────────┐
│ league_week_player_seasons│
│──────────────────────────│
│ league_id (FK)           │
│ week_number              │
│ player_id (FK)           │
│ season                   │──┐
└──────────────────────────┘  │
                              │
┌─────────────┐               │
│  matchups   │               │
│─────────────│               │
│ id          │──┐            │
│ league_id   │  │            │
│ week_number │  │            │
│ team1_id    │  │            │
│ team2_id    │  │            │
│ team1_score │  │            │
│ team2_score │  │            │
└─────────────┘  │            │
                 │            │
                 │  ┌──────────────────┐
                 └─→│ matchup_players  │
                    │──────────────────│
                    │ matchup_id (FK)  │
                    │ player_id (FK)   │──┐
                    │ team_id (FK)     │  │
                    └──────────────────┘  │
                           │              │
                           │  ┌────────────────────────┐
                           └─→│ matchup_player_games   │
                              │────────────────────────│
                              │ matchup_player_id (FK) │
                              │ game_num               │
                              │ batting_game_num       │──┐
                              │ pitching_game_num      │  │
                              │ fielding_game_num      │  │
                              └────────────────────────┘  │
                                                          │
       ┌──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  game_batting   │  │  game_pitching   │  │  game_fielding   │
│─────────────────│  │──────────────────│  │──────────────────│
│ player_id (FK)  │  │ player_id (FK)   │  │ player_id (FK)   │
│ season          │  │ season           │  │ season           │
│ game_number     │  │ game_num         │  │ game_num         │
│ pa, ab, h, hr...│  │ w, l, so, ip...  │  │ po, a, e_def...  │
└─────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## Summary

The Legacy Sports flow creates a unique fantasy experience by:

1. **Historical Seasons**: Players draft real players and choose specific seasons from their careers (chosen once during draft)
2. **Weekly Matchups**: New matchups are generated each week with rotating opponents
3. **Random Game Selection**: Each week, 5 new random games from the same chosen season are selected
4. **Real Stats**: Actual game-by-game statistics are loaded from Baseball Reference
5. **Head-to-Head Competition**: Teams compete directly against each other weekly
6. **Progressive Season**: After each week completes, the league advances to the next week (up to 20 weeks)
7. **Season-Long Standings**: Wins and losses accumulate throughout the 20-week season

This creates unpredictability while maintaining historical accuracy - you drafted 1927 Babe Ruth once, but:

- **Week 1** might use games #87, #12, #145, #3, #99 from his 1927 season
- **Week 2** might use games #45, #128, #71, #112, #8 from the same 1927 season
- And so on for all 20 weeks, always from 1927 but with different random games each week!
