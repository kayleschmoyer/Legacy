# LS-17: Matchup System Implementation Plan

**Epic:** Set up matchup system for fantasy leagues
**Branch:** `LS-17/set-up-matchup-system-for-fantasy-leagues`
**Created:** October 22, 2025

## Overview

This epic implements a comprehensive head-to-head matchup system for fantasy baseball leagues. The system handles matchup scheduling, team pairings, live score tracking, results calculation, historical data management, and playoff functionality.

### Key Design Principles

**Season-Based Game Selection:**
- Each matchup selects a **single historical season** for all players
- Seasons are filtered by league configuration (minimum games threshold)
- The selected season determines player projections and available games
- Commissioners trigger game selection manually for each game in the matchup
- Players accumulate stats from selected games throughout the matchup

**Dual Projection System:**
- **Career Projection:** Based on career-average stats across all seasons
- **Matchup Projection:** Based on average stats from the matchup's selected season
- Both projections displayed side-by-side on roster views
- Updates in real-time as games are selected

---

## Epic Structure

### **LS-17** - Set up matchup system for fantasy leagues (Epic)

Implement a comprehensive matchup system that handles head-to-head competition between teams in fantasy leagues. This includes matchup scheduling, score tracking, result calculation, and historical data management.

---

## Stories & Dependencies

### Phase 1: Foundation (Database & API)

#### **LS-18** - Extend matchup database schema to support team pairings and scoring
**Type:** Story  
**Priority:** Highest  
**Dependencies:** None

**Description:** Add team1_id, team2_id, team1_score, team2_score, status, and selected_season fields to matchups table. Add league configuration for season eligibility and games per matchup. Include database migration and Drizzle schema updates.

**Key Deliverables:**
- Team pairing columns (team1_id, team2_id)
- Scoring columns (team1_score, team2_score)
- Status enum field (scheduled, in_progress, completed, cancelled)
- **selected_season field (INTEGER)** - stores the single season used for this matchup
- **games_per_matchup field** - number of games to select per player
- Start/end timestamp fields
- Foreign keys to teams table
- **League config fields:**
  - min_games_per_season: Minimum games required for season eligibility
  - games_per_matchup: Default number of games per matchup
- Drizzle schema updates
- Database migration script
- Relations updates

**Files:**
- `lib/db-client/src/drizzle/public/models/Matchups.ts`
- `lib/db-client/src/drizzle/public/models/Leagues.ts` (add config fields)
- `lib/db-client/src/drizzle/public/relations.ts`
- `lambdas/db/migrations/` (new migration)
- `docs/architecture/database-schema.md`

---

#### **LS-19** - Build GraphQL schema and resolvers for matchup operations
**Type:** Story  
**Priority:** Highest  
**Dependencies:** LS-18

**Description:** Create comprehensive GraphQL types, queries, and mutations for matchup management including team pairing, season selection, game tracking, and scoring.

**Key Deliverables:**
- Extended Matchup GraphQL type with selectedSeason and gamesRemaining fields
- Queries:
  - `getMatchupById(id: Int!)` - includes selected season and games remaining
  - `getMatchupsForLeague(leagueId: Int!, weekNumber: Int)`
  - `getCurrentMatchupForLeague(leagueId: Int!)`
  - `getMatchupsByWeek(leagueId: Int!, weekNumber: Int!)`
  - `getMatchupPlayerStats(matchupId: Int!, playerId: Int!)` - accumulated stats for selected games
  - `getMatchupProjections(matchupId: Int!, playerId: Int!)` - both matchup and career projections
- Mutations:
  - `createMatchup(input: CreateMatchupInput!)` - auto-selects eligible season
  - `updateMatchupScore(matchupId: Int!, team1Score: Float, team2Score: Float)`
  - `updateMatchupStatus(matchupId: Int!, status: MatchupStatus!)`
  - **`triggerGameSelection(matchupId: Int!, gameNumber: Int!)` - commissioner action to select games**
- Data loaders for performance
- Error handling and validation
- Season eligibility validation

**Files:**
- `lambdas/db/src/schema/matchups.ts`
- `lib/db-client/src/lib/client/PublicDbClient.ts`
- All `graphql.generated.ts` files (via codegen)

---

### Phase 2: Business Logic

#### **LS-20** - Implement matchup scheduling algorithm for fantasy leagues
**Type:** Story  
**Priority:** High  
**Dependencies:** LS-18, LS-19

**Description:** Create algorithm to generate head-to-head matchups between teams with automatic season selection based on league configuration.

**Key Deliverables:**
- Round-robin scheduling for even number of teams
- Bye week handling for odd number of teams
- Multiple scheduling strategies:
  - Round-robin (each team plays every other team once)
  - Divisional (play division opponents more)
  - Random (random matchups each week)
- **Season Selection Logic:**
  - When matchup is created, automatically select a random eligible season
  - Filter seasons by league's min_games_per_season config
  - Ensure rostered players have data for selected season
  - Store selected_season in matchup record
- Home/away fairness
- Prevent duplicate matchups in same week
- Season-long or week-by-week generation
- Unit tests for all edge cases including season eligibility
- Integration with league creation flow

**Files:**
- `lib/scheduling/` (new library)
- `lib/scheduling/src/matchup-scheduler.ts`
- `lib/scheduling/src/season-selector.ts` (NEW - season selection logic)
- `lib/scheduling/src/strategies/`
- `lib/scheduling/tsconfig.lib.json`
- `lib/scheduling/project.json`
- `lambdas/db/src/services/matchup-service.ts`

---

#### **LS-21** - Build matchup score calculation engine
**Type:** Story  
**Priority:** High  
**Dependencies:** LS-7, LS-18

**Description:** Implement score calculation logic that aggregates individual player performances based on selected games from the matchup's chosen season. Calculate both matchup-specific and career projections.

**Key Deliverables:**
- Calculate team scores from rostered players' performances in selected games
- Integration with league scoring settings (LS-7)
- Support multiple scoring categories (batting, pitching, fielding)
- **Projection System:**
  - Calculate career projection using career averages
  - Calculate matchup projection using season averages from selected_season
  - Display both projections on roster view
  - Update projections as games are selected
- Real-time score updates as games are selected
- Calculate accumulated stats for all selected games in matchup
- Track games remaining to be selected (games_per_matchup - selected_count)
- Handle lineup changes and substitutions
- Store calculated scores in matchup table
- Performance optimized for large rosters
- Comprehensive unit tests
- Integration with matchup_player_games table

**Files:**
- `lib/scoring/src/matchup-scoring.ts`
- `lib/scoring/src/matchup-projections.ts` (NEW - matchup vs career projections)
- `lambdas/stats-lambda/src/handlers/calculate-matchup-scores.ts`
- `lib/db-client/src/lib/client/PublicDbClient.ts`

---

#### **LS-22** - Create matchup history and results tracking system
**Type:** Story  
**Priority:** High  
**Dependencies:** LS-18, LS-19, LS-21

**Description:** Build system to track historical matchup results, head-to-head records between teams, and season standings.

**Key Deliverables:**
- Query historical matchups by league and season
- Head-to-head records between specific teams
- Win/loss/tie record tracking
- Playoff qualification data storage
- Season standings generation
- Sorting by wins, points for, points against
- GraphQL queries for history and standings
- Efficient database indexes
- Unit and integration tests

**Files:**
- `lib/db-client/src/lib/client/matchup-history.ts`
- `lambdas/db/src/schema/matchup-queries.ts`
- `lambdas/db/src/services/standings-service.ts`

---

#### **LS-36** - Implement dual projection system (matchup vs career)
**Type:** Story  
**Priority:** High  
**Dependencies:** LS-7, LS-18, LS-19

**Description:** Build projection system that displays both season-specific matchup projections and career projections for players on roster views.

**Key Deliverables:**
- Calculate career projections using career average stats
- Calculate matchup projections using season average stats from matchup's selected_season
- Display both projections side-by-side on roster views:
  - 'Matchup Proj: X.X pts' (from selected season)
  - 'Career Proj: Y.Y pts' (from career averages)
- Update matchup projections when season is selected
- Handle cases where player has no data for selected season
- GraphQL queries to fetch both projection types efficiently
- Apply league scoring settings to both calculations
- Visual indicators to distinguish projection types
- Tooltip/help text explaining the difference
- Unit tests for projection calculations
- Integration tests for GraphQL queries

**Projection Calculation:**
- Career Projection: Average stats across all career seasons × scoring multipliers
- Matchup Projection: Average stats from selected_season only × scoring multipliers
- Both use same scoring multipliers from league config

**Files:**
- `lib/scoring/src/projections/dual-projections.ts`
- `lib/scoring/src/projections/season-projections.ts`
- `lambdas/db/src/schema/projection-queries.ts`
- `apps/web/src/components/roster/DualProjectionDisplay.tsx`
- `apps/app/src/components/roster/DualProjectionDisplay.tsx`

---

### Phase 3: User Interface

#### **LS-23** - Build mobile matchup UI components (React Native)
**Type:** Story  
**Priority:** High  
**Dependencies:** LS-19

**Description:** Create React Native components for displaying and managing matchups with season-specific projections and game tracking.

**Key Deliverables:**
- MatchupCard component showing team matchup details with selected season
- MatchupScoreboard component with live scores and games remaining counter
- MatchupList component for viewing all matchups in a week
- MatchupDetail screen showing full matchup breakdown
- **Roster View Enhancements:**
  - Display both matchup projection (from selected season) and career projection
  - Show accumulated stats for selected games
  - Indicate games remaining to be selected
  - Update in real-time as games are selected
- StandingsTable component
- Real-time score updates via GraphQL
- Tamagui styling
- Loading and error states
- Unit tests with React Native Testing Library
- Proper TypeScript types from generated GraphQL

**Files:**
- `apps/app/src/components/matchup/MatchupCard.tsx`
- `apps/app/src/components/matchup/MatchupScoreboard.tsx`
- `apps/app/src/components/matchup/MatchupList.tsx`
- `apps/app/src/screens/MatchupDetailScreen.tsx`
- `apps/app/src/components/standings/StandingsTable.tsx`
- `apps/app/src/components/roster/PlayerProjections.tsx` (NEW - dual projections)
- `apps/app/src/components/matchup/GamesRemaining.tsx` (NEW)
- `apps/app/src/hooks/useMatchup.ts`
- `apps/app/src/hooks/useStandings.ts`
- `apps/app/src/hooks/useMatchupProjections.ts` (NEW)

---

#### **LS-24** - Build web matchup UI components (Next.js)
**Type:** Story  
**Priority:** High  
**Dependencies:** LS-19

**Description:** Create Next.js/React components for displaying and managing matchups with commissioner controls for game selection.

**Key Deliverables:**
- MatchupCard component for matchup previews with selected season info
- MatchupScoreboard component with live scores and games remaining
- MatchupGrid component for weekly matchup overview
- MatchupDetailPage showing full matchup breakdown
- **Roster View Enhancements:**
  - Display both matchup projection and career projection side-by-side
  - Show accumulated stats for all selected games
  - Display games remaining counter
  - Real-time updates as games are selected
- **Commissioner Controls:**
  - Button on commissioner page to trigger game selection
  - Input for selecting game number (1 through games_per_matchup)
  - Confirmation dialog before triggering selection
  - Progress indicator during game selection
  - Error handling and feedback
- StandingsPage with sortable standings
- Responsive design (mobile/tablet/desktop)
- SSR support for SEO
- Real-time updates via GraphQL
- Tamagui styling
- Unit tests with React Testing Library
- Proper TypeScript types from generated GraphQL

**Files:**
- `apps/web/src/components/matchup/MatchupCard.tsx`
- `apps/web/src/components/matchup/MatchupScoreboard.tsx`
- `apps/web/src/components/matchup/MatchupGrid.tsx`
- `apps/web/src/pages/leagues/[leagueId]/matchups/[matchupId].tsx`
- `apps/web/src/pages/leagues/[leagueId]/standings.tsx`
- `apps/web/src/pages/leagues/[leagueId]/commissioner.tsx` (update)
- `apps/web/src/components/commissioner/GameSelectionControl.tsx` (NEW)
- `apps/web/src/components/roster/PlayerProjections.tsx` (NEW)
- `apps/web/src/components/matchup/GamesRemaining.tsx` (NEW)
- `apps/web/src/hooks/useMatchup.ts`
- `apps/web/src/hooks/useStandings.ts`
- `apps/web/src/hooks/useMatchupProjections.ts` (NEW)

---

### Phase 4: Automation & Notifications

#### **LS-25** - Implement matchup notification system
**Type:** Story  
**Priority:** Medium  
**Dependencies:** LS-18, LS-19, LS-21

**Description:** Build notification system to alert users about matchup events (start, end, close games, wins/losses).

**Key Deliverables:**
- Notifications for matchup start/end
- Close matchup alerts
- In-app notifications
- Push notifications (mobile)
- Email notifications (optional)
- User preference controls
- Notification history/log
- AWS SNS/SES integration
- Unit and integration tests

**Files:**
- `lambdas/notifications/` (new Lambda)
- `lambdas/notifications/src/handlers/matchup-notifications.ts`
- `lib/db-client/src/lib/notification-preferences.ts`

---

#### **LS-26** - Build automated matchup progression system
**Type:** Story  
**Priority:** Medium  
**Dependencies:** LS-18, LS-19, LS-20, LS-21

**Description:** Update game selection Lambda to work with season-specific matchups triggered by commissioner action.

**Key Deliverables:**
- Lambda function triggered by commissioner via GraphQL mutation
- Accept matchupId and gameNumber as parameters
- Use matchup's selected_season to query player stats
- Select games from the specified season for all rostered players
- Respect league's min_games_per_season configuration
- Update matchup_player_games table with selected games
- Calculate and update accumulated stats after each game selection
- Update team scores in matchup table
- Track progress: games_selected vs games_per_matchup
- Send notifications when game selection completes
- Handle edge cases:
  - Players with insufficient games in selected season
  - Missing player data for selected season
  - Already selected games (prevent duplicates)
- CloudWatch monitoring and alerts
- Error handling and retry logic
- Unit and integration tests
- Refactor existing game-selection Lambda handlers

**Files:**
- `lambdas/game-selection/src/handlers/select-game.ts` (update logic)
- `lambdas/game-selection/src/handlers/create-matchup.ts` (update to use selected_season)
- `lambdas/game-selection/src/services/season-game-selector.ts` (NEW)
- `lambdas/game-selection/src/utils/season-validator.ts` (NEW - validate season eligibility)
- `lib/db-client/src/lib/client/PublicDbClient.ts` (add season-specific queries)

---

### Phase 5: Advanced Features

#### **LS-27** - Add matchup analytics and statistics dashboard
**Type:** Story  
**Priority:** Medium  
**Dependencies:** LS-22

**Description:** Create analytics system to provide insights into matchup performance, trends, and team comparisons.

**Key Deliverables:**
- Average points per matchup by team
- Win/losing streak tracking
- Head-to-head records
- Category performance breakdown
- Historical trend graphs
- Playoff projection calculations
- Power rankings
- Export data to CSV/JSON
- GraphQL queries for all analytics
- Visualization components

**Files:**
- `lib/analytics/` (new library)
- `lib/analytics/src/matchup-analytics.ts`
- `lib/analytics/src/playoff-projections.ts`
- `lambdas/db/src/schema/analytics-queries.ts`
- `apps/web/src/pages/leagues/[leagueId]/analytics.tsx`
- `apps/app/src/screens/AnalyticsScreen.tsx`

---

#### **LS-28** - Implement playoffs and championship system
**Type:** Story  
**Priority:** Medium  
**Dependencies:** LS-22

**Description:** Build playoff bracket system with automatic seeding, tournament progression, and championship determination.

**Key Deliverables:**
- Automatic playoff seeding
- Configurable playoff formats (4/6/8 team)
- Bracket visualization
- Single or multi-week playoff matchups
- Automatic bracket progression
- Championship winner determination
- Playoff scoring rules (can differ from regular season)
- Historical playoff results tracking
- Trophy/badge system
- GraphQL mutations for playoff management

**Files:**
- `lib/scheduling/src/playoff-scheduler.ts`
- `lambdas/db/src/schema/playoff-schema.ts`
- Create `playoff_brackets` table schema
- `apps/web/src/components/playoff/PlayoffBracket.tsx`
- `apps/app/src/components/playoff/PlayoffBracket.tsx`
- `apps/web/src/pages/leagues/[leagueId]/playoffs.tsx`

---

#### **LS-29** - Add trade deadline and roster lock features for matchups
**Type:** Story  
**Priority:** Medium  
**Dependencies:** LS-18, LS-26

**Description:** Implement roster lock functionality that prevents lineup changes once a matchup begins, with configurable trade deadlines.

**Key Deliverables:**
- Rosters lock when matchup starts (configurable)
- Trade deadline configuration per league
- Block roster moves during active matchups
- Emergency substitution rules
- Commissioner override capabilities
- Clear UI indicators for locked rosters
- Validation in GraphQL mutations
- Unit tests for lock logic
- Integration with matchup status transitions

**Files:**
- `lambdas/db/src/schema/leagues.ts` (add deadline config)
- `lambdas/db/src/services/roster-management.ts`
- `lib/db-client/src/lib/client/PublicDbClient.ts`
- Add `roster_lock_rules` table
- `apps/web/src/components/roster/RosterLockIndicator.tsx`
- `apps/app/src/components/roster/RosterLockIndicator.tsx`

---

#### **LS-30** - Build matchup preview and predictions feature
**Type:** Story  
**Priority:** Medium  
**Dependencies:** LS-19, LS-21, LS-7

**Description:** Create matchup preview system showing projected scores, player matchups, and win probability before matchup starts.

**Key Deliverables:**
- Projected scores based on player averages
- Win probability calculation
- Key player comparisons
- Head-to-head history display
- Weather impact considerations
- Injury reports integration
- Preview available before matchup starts
- GraphQL queries for preview data
- UI components for web and mobile

**Files:**
- `lib/analytics/src/matchup-predictions.ts`
- `lib/analytics/src/win-probability.ts`
- `lambdas/db/src/schema/prediction-queries.ts`
- `apps/web/src/components/matchup/MatchupPreview.tsx`
- `apps/app/src/components/matchup/MatchupPreview.tsx`
- `apps/web/src/components/matchup/WinProbability.tsx`

---

#### **LS-31** - Add matchup-specific chat and trash talk feature
**Type:** Story  
**Priority:** Low  
**Dependencies:** LS-18, LS-19

**Description:** Implement chat system for matchup participants to communicate, with moderation and reporting features.

**Key Deliverables:**
- Matchup-specific chat rooms
- Real-time messaging (WebSocket or polling)
- Message history storage
- Emoji and reaction support
- GIF support (optional)
- Profanity filter
- Report/block functionality
- Commissioner moderation tools
- Message notifications
- GraphQL subscriptions/queries for messages
- Mobile and web UI components

**Files:**
- Create `matchup_messages` table schema
- `lib/db-client/src/drizzle/public/models/MatchupMessages.ts`
- `lambdas/db/src/schema/message-schema.ts`
- `apps/web/src/components/matchup/MatchupChat.tsx`
- `apps/app/src/components/matchup/MatchupChat.tsx`
- `lambdas/messaging/` (new Lambda for WebSocket)

---

#### **LS-32** - Implement tiebreaker rules system for matchups
**Type:** Story  
**Priority:** Low  
**Dependencies:** LS-18, LS-21

**Description:** Build configurable tiebreaker system to resolve matchups that end in a tie, with multiple tiebreaker methods.

**Key Deliverables:**
- Configurable tiebreaker rules per league
- Tiebreaker methods:
  - Highest scoring category
  - Total season points
  - Head-to-head record
  - Random selection
  - Co-champion (both win)
- Tiebreaker cascade (primary, secondary, tertiary)
- Automatic tiebreaker application
- Manual commissioner override
- Tiebreaker history tracking
- Clear UI display of tiebreaker rules
- GraphQL mutations for rule configuration

**Files:**
- `lib/db-client/src/drizzle/public/models/TiebreakerRules.ts`
- `lambdas/db/src/services/tiebreaker-service.ts`
- `apps/web/src/components/league/TiebreakerConfig.tsx`
- `apps/app/src/components/league/TiebreakerConfig.tsx`

---

### Phase 6: Quality Assurance

#### **LS-33** - Add end-to-end tests for complete matchup system
**Type:** Story  
**Priority:** High  
**Dependencies:** All other LS-17 stories

**Description:** Create comprehensive E2E tests using Playwright covering the entire matchup lifecycle from scheduling to completion.

**Key Deliverables:**
- E2E test: Create league and schedule matchups
- E2E test: View matchup schedule
- E2E test: Watch matchup progress through states
- E2E test: View live scores during matchup
- E2E test: View completed matchup results
- E2E test: Navigate standings page
- E2E test: View matchup history
- E2E test: Mobile app matchup flows
- E2E test: Web app matchup flows
- Tests run in CI pipeline
- Test data fixtures and cleanup

**Files:**
- `apps/web-e2e/src/matchup-system.spec.ts`
- `apps/app-e2e/src/matchup-system.spec.ts`
- `tests/fixtures/matchup-data.ts`

---

#### **LS-34** - Performance optimization for matchup queries and operations
**Type:** Story  
**Priority:** Medium  
**Dependencies:** LS-18, LS-19, LS-21, LS-22

**Description:** Optimize database queries, add caching, and implement performance improvements for matchup system at scale.

**Key Deliverables:**
- Database indexes on matchup queries
- Redis caching for standings/rankings
- DataLoader implementation for N+1 prevention
- Query result pagination
- Lazy loading for large datasets
- Optimize score calculation algorithms
- Batch operations for bulk updates
- Connection pooling optimization
- Performance benchmarks
- Load testing with Artillery or k6
- CloudWatch metrics and dashboards
- Sub-second response times for critical queries

**Files:**
- `lib/db-client/src/lib/client/matchup-queries-optimized.ts`
- `lambdas/db/src/dataloaders/matchup-loader.ts`
- Database migration for indexes
- `terraform/redis.tf` (if not exists)
- `scripts/performance/matchup-load-test.js`

---

#### **LS-35** - Create comprehensive documentation for matchup system
**Type:** Story  
**Priority:** Medium  
**Dependencies:** Should be done throughout development

**Description:** Write complete technical and user documentation for the matchup system including architecture, APIs, and user guides.

**Key Deliverables:**
- Architecture documentation with diagrams
- Database schema documentation updates
- GraphQL API documentation
- Integration guide for future development
- User guide for commissioners
- User guide for league members
- Troubleshooting guide
- Performance tuning guide
- API examples and code snippets
- Update all relevant docs

**Files:**
- `docs/architecture/matchup-system.md`
- `docs/guides/matchup-system-guide.md`
- `docs/guides/commissioner-matchup-management.md`
- `docs/api/matchup-api.md`
- `docs/architecture/database-schema.md` (update)
- `docs/README.md` (add links)

---

## Implementation Order

### Critical Path (Must be done first):
1. **LS-18** - Database schema
2. **LS-19** - GraphQL API
3. **LS-20** - Scheduling algorithm
4. **LS-21** - Score calculation engine
5. **LS-22** - History tracking
6. **LS-23** - Mobile UI
7. **LS-24** - Web UI

### Parallel Development (Can be done in parallel after critical path):
- **LS-25** - Notifications (after LS-18, LS-19, LS-21)
- **LS-26** - Automated progression (after LS-18, LS-19, LS-21)
- **LS-27** - Analytics (after LS-22)
- **LS-28** - Playoffs (after LS-22)

### Enhancement Features (Can be done later):
- **LS-29** - Roster lock features
- **LS-30** - Matchup previews
- **LS-31** - Chat feature
- **LS-32** - Tiebreaker rules

### Final Phase:
- **LS-33** - E2E tests (after all features complete)
- **LS-34** - Performance optimization (ongoing, finalize late)
- **LS-35** - Documentation (ongoing throughout)

---

## Technical Dependencies

### External Dependencies:
- **LS-7**: League scoring data model (for LS-21)
- MLB schedule data API (for LS-26)
- AWS SNS/SES (for LS-25)

### Infrastructure:
- PostgreSQL database
- AWS Lambda
- AWS EventBridge (for scheduling)
- Redis (for caching - LS-34)
- WebSocket support (for LS-31)

---

## Database Schema Changes

### New Tables:
- `matchup_messages` (LS-31)
- `tiebreaker_rules` (LS-32)
- `playoff_brackets` (LS-28)
- `roster_lock_rules` (LS-29)

### Modified Tables:
- `matchups` - Add team1_id, team2_id, scores, status, timestamps (LS-18)
- `leagues` - Add trade deadline, roster lock config (LS-29)

---

## API Surface

### GraphQL Queries:
- `getMatchupById`
- `getMatchupsForLeague`
- `getCurrentMatchupForLeague`
- `getMatchupsByWeek`
- `getMatchupHistory`
- `getStandings`
- `getHeadToHeadRecord`
- `getMatchupAnalytics`
- `getPlayoffBracket`
- `getMatchupPreview`

### GraphQL Mutations:
- `createMatchup`
- `updateMatchupScore`
- `updateMatchupStatus`
- `configurePlayoffs`
- `configureTiebreakerRules`
- `lockRosters`
- `sendMatchupMessage`

---

## Testing Strategy

### Unit Tests:
- All business logic functions
- Score calculation algorithms
- Scheduling algorithms
- Tiebreaker logic

### Integration Tests:
- GraphQL resolvers
- Database operations
- Lambda functions

### E2E Tests (LS-33):
- Full user workflows
- Mobile and web flows
- Critical path scenarios

### Performance Tests (LS-34):
- Load testing
- Stress testing
- Query optimization validation

---

## Branch Strategy

**All work should be done on:** `LS-17/set-up-matchup-system-for-fantasy-leagues`

Each story can be committed incrementally to this branch. When all stories are complete, the branch will be merged to main via PR.

---

## Notes for AI Agents

When working on any LS-17 ticket:

1. **Always work on the branch:** `LS-17/set-up-matchup-system-for-fantasy-leagues`
2. **Check dependencies:** Ensure prerequisite stories are completed
3. **Follow conventions:** Use existing patterns from LS-7 scoring work
4. **Run validation:** Always run `npx nx affected -t typecheck lint test build`
5. **Update Jira:** Transition ticket status as you progress
6. **Regenerate GraphQL:** After schema changes, run codegen
7. **Update docs:** Update relevant documentation as you go
8. **Cross-platform:** Ensure consistency between web and mobile

### Key Files to Reference:
- `docs/guides/ai-agent-contribution-workflow.md` - Full workflow
- `docs/agents/` - CSV guidelines
- `lib/db-client/src/drizzle/public/models/Matchups.ts` - Current schema
- `lambdas/db/src/schema/matchups.ts` - Current GraphQL schema
- `lib/scoring/` - Scoring logic (reference for LS-21)

### Common Commands:
```powershell
# Validation (in order)
npx nx affected -t typecheck
npx nx affected -t lint --fix
npx nx affected -t test
npx nx affected -t build

# GraphQL codegen
npx nx run-many -t codegen

# Database migration
npm run migrate

# Run specific app
npx nx serve web
npx nx run app:start
```

---

## Success Criteria

The LS-17 epic is complete when:

✅ All 18 stories (LS-18 through LS-35) are completed  
✅ All E2E tests pass  
✅ Performance benchmarks met  
✅ Documentation complete  
✅ Code review approved  
✅ PR merged to main  
✅ Deployed to production

---

**Last Updated:** October 22, 2025  
**Total Stories:** 18  
**Estimated Complexity:** High  
**Target Completion:** TBD
