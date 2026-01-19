# LS-17 Quick Reference Guide for AI Agents

**Epic:** LS-17 - Set up matchup system for fantasy leagues  
**Branch:** `LS-17/set-up-matchup-system-for-fantasy-leagues`

---

## 🎯 Key Design Principles

### Season-Based Game Selection
- Each matchup uses a **single historical season** for all players
- Seasons must meet league's **min_games_per_season** threshold
- Selected season is stored in the matchup record
- Commissioners trigger game selection manually via UI button
- Games are selected one at a time from the chosen season

### Dual Projection System
- **Career Projection:** Average stats across all career seasons
- **Matchup Projection:** Average stats from matchup's selected season
- Both displayed side-by-side on roster views
- Both use same league scoring multipliers
- Updates in real-time as games are selected

### Game Tracking
- Track games selected vs games_per_matchup (configured per league)
- Display accumulated stats for all selected games
- Show games remaining counter
- Real-time score updates as each game is selected

---

## 📋 All Tickets Created

| Ticket | Title | Type | Priority | Dependencies |
|--------|-------|------|----------|--------------|
| LS-17 | Set up matchup system for fantasy leagues | Epic | - | - |
| LS-18 | Extend matchup database schema + season selection | Story | Highest | None |
| LS-19 | Build GraphQL schema and resolvers | Story | Highest | LS-18 |
| LS-20 | Implement matchup scheduling + season selector | Story | High | LS-18, LS-19 |
| LS-21 | Build matchup score calculation engine | Story | High | LS-7, LS-18 |
| LS-22 | Create matchup history and results tracking | Story | High | LS-18, LS-19, LS-21 |
| LS-23 | Build mobile matchup UI components | Story | High | LS-19 |
| LS-24 | Build web matchup UI + commissioner controls | Story | High | LS-19 |
| LS-25 | Implement matchup notification system | Story | Medium | LS-18, LS-19, LS-21 |
| LS-26 | Update game selection Lambda (commissioner-triggered) | Story | Medium | LS-18, LS-19, LS-20, LS-21 |
| LS-27 | Add matchup analytics and statistics | Story | Medium | LS-22 |
| LS-28 | Implement playoffs and championship system | Story | Medium | LS-22 |
| LS-29 | Add trade deadline and roster lock features | Story | Medium | LS-18, LS-26 |
| LS-30 | Build matchup preview and predictions | Story | Medium | LS-19, LS-21, LS-7 |
| LS-31 | Add matchup chat and trash talk feature | Story | Low | LS-18, LS-19 |
| LS-32 | Implement tiebreaker rules system | Story | Low | LS-18, LS-21 |
| LS-33 | Add E2E tests for matchup system | Story | High | All stories |
| LS-34 | Performance optimization | Story | Medium | LS-18-22 |
| LS-35 | Create comprehensive documentation | Story | Medium | Ongoing |
| **LS-36** | **Implement dual projection system (NEW)** | Story | **High** | LS-7, LS-18, LS-19 |

---

## 🎯 Recommended Implementation Order

### Phase 1: Foundation (Start Here)
1. **LS-18** - Database schema ⭐ START HERE
2. **LS-19** - GraphQL API
3. **LS-20** - Scheduling algorithm

### Phase 2: Core Features
4. **LS-21** - Score calculation
5. **LS-22** - History tracking
6. **LS-23** - Mobile UI
7. **LS-24** - Web UI

### Phase 3: Automation
8. **LS-25** - Notifications
9. **LS-26** - Automated progression

### Phase 4: Advanced Features (Can be done in parallel)
10. **LS-27** - Analytics
11. **LS-28** - Playoffs
12. **LS-29** - Roster lock
13. **LS-30** - Predictions
14. **LS-31** - Chat (optional)
15. **LS-32** - Tiebreakers (optional)

### Phase 5: Quality & Performance
16. **LS-33** - E2E tests
17. **LS-34** - Performance optimization
18. **LS-35** - Documentation (ongoing)

---

## ⚡ Quick Start Commands

### Before Starting Any Ticket

```powershell
# Ensure you're on the correct branch
git checkout LS-17/set-up-matchup-system-for-fantasy-leagues
git pull origin LS-17/set-up-matchup-system-for-fantasy-leagues

# Update Jira ticket status to "In Progress"
acli jira workitem transition --key LS-XX --status "In Progress"
```

### During Development

```powershell
# Run validation checks (in this order)
npx nx affected -t typecheck        # 1. Type checking
npx nx affected -t lint --fix       # 2. Linting
npx nx affected -t test             # 3. Testing
npx nx affected -t build            # 4. Building

# After GraphQL schema changes
npx nx run-many -t codegen

# After database schema changes
npm run migrate
```

### After Completing Work

```powershell
# Commit changes
git add .
git commit -m "feat(matchup): description of changes (LS-XX)"
git push origin LS-17/set-up-matchup-system-for-fantasy-leagues

# Update Jira status
acli jira workitem transition --key LS-XX --status "In Review"
```

---

## 📁 Key Files by Ticket

### LS-18 (Database Schema)
- `lib/db-client/src/drizzle/public/models/Matchups.ts`
- `lib/db-client/src/drizzle/public/relations.ts`
- `lambdas/db/migrations/` (create new migration)

### LS-19 (GraphQL API)
- `lambdas/db/src/schema/matchups.ts`
- `lib/db-client/src/lib/client/PublicDbClient.ts`
- All `graphql.generated.ts` files (regenerate via codegen)

### LS-20 (Scheduling)
- `lib/scheduling/` (new library - create from scratch)
- `lib/scheduling/src/matchup-scheduler.ts`
- `lib/scheduling/src/strategies/`

### LS-21 (Score Calculation)
- `lib/scoring/src/matchup-scoring.ts`
- `lambdas/stats-lambda/src/handlers/calculate-matchup-scores.ts`

### LS-22 (History)
- `lib/db-client/src/lib/client/matchup-history.ts`
- `lambdas/db/src/services/standings-service.ts`

### LS-23 (Mobile UI)
- `apps/app/src/components/matchup/`
- `apps/app/src/screens/MatchupDetailScreen.tsx`
- `apps/app/src/hooks/useMatchup.ts`

### LS-24 (Web UI)
- `apps/web/src/components/matchup/`
- `apps/web/src/pages/leagues/[leagueId]/matchups/`
- `apps/web/src/hooks/useMatchup.ts`

---

## 🔗 Database Schema (LS-18)

### Existing Matchups Table
```typescript
matchups {
  id: serial (PK)
  leagueId: integer (FK → leagues.id)
  weekNumber: integer
}
```

### What Needs to Be Added
```typescript
matchups {
  // Existing fields...
  
  // NEW: Team pairings
  team1_id: integer (FK → teams.id) NOT NULL
  team2_id: integer (FK → teams.id) NOT NULL
  
  // NEW: Scoring
  team1_score: decimal(10, 3) NULL
  team2_score: decimal(10, 3) NULL
  
  // NEW: Season selection (KEY FEATURE)
  selected_season: integer NOT NULL
  games_per_matchup: integer NOT NULL
  
  // NEW: Status tracking
  status: enum('scheduled', 'in_progress', 'completed', 'cancelled')
  
  // NEW: Timestamps
  start_time: timestamp NULL
  end_time: timestamp NULL
}

leagues {
  // Existing fields...
  
  // NEW: Season eligibility config
  min_games_per_season: integer DEFAULT 50
  games_per_matchup: integer DEFAULT 5
}
```

---

## 🔌 GraphQL API (LS-19)

### New Queries to Add
```graphql
type Query {
  getMatchupById(id: Int!): Matchup
  getMatchupsForLeague(leagueId: Int!, weekNumber: Int): [Matchup!]!
  getCurrentMatchupForLeague(leagueId: Int!): Matchup
  getMatchupsByWeek(leagueId: Int!, weekNumber: Int!): [Matchup!]!
  
  # NEW: Season and projection queries
  getMatchupPlayerStats(matchupId: Int!, playerId: Int!): MatchupPlayerStats!
  getMatchupProjections(matchupId: Int!, playerId: Int!): PlayerProjections!
}
```

### New Mutations to Add
```graphql
type Mutation {
  createMatchup(input: CreateMatchupInput!): Matchup!
  updateMatchupScore(matchupId: Int!, team1Score: Float, team2Score: Float): Matchup!
  updateMatchupStatus(matchupId: Int!, status: MatchupStatus!): Matchup!
  
  # NEW: Commissioner game selection
  triggerGameSelection(matchupId: Int!, gameNumber: Int!): GameSelectionResult!
}
```

### Extended Matchup Type
```graphql
type Matchup {
  id: ID!
  leagueId: Int!
  weekNumber: Int!
  numberOfGames: Int!
  
  # Team pairings
  team1: Team!
  team2: Team!
  team1Score: Float
  team2Score: Float
  
  # NEW: Season selection fields
  selectedSeason: Int!
  gamesPerMatchup: Int!
  gamesSelected: Int!
  gamesRemaining: Int!
  
  # Status tracking
  status: MatchupStatus!
  startTime: String
  endTime: String
}

type PlayerProjections {
  playerId: Int!
  careerProjection: Float!
  matchupProjection: Float!
  seasonUsed: Int
}

type MatchupPlayerStats {
  playerId: Int!
  gamesSelected: Int!
  accumulatedStats: StatsSummary!
}

enum MatchupStatus {
  SCHEDULED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}
```

---

## 📊 Dependencies Graph

```
LS-18 (DB Schema)
  ↓
LS-19 (GraphQL API)
  ↓
├─→ LS-20 (Scheduling) → LS-22 (History) → LS-27 (Analytics)
├─→ LS-21 (Scoring) ────→ LS-22 (History) → LS-28 (Playoffs)
├─→ LS-23 (Mobile UI)
├─→ LS-24 (Web UI)
├─→ LS-25 (Notifications)
└─→ LS-26 (Automation) → LS-29 (Roster Lock)
```

---

## ⚠️ Common Pitfalls

1. **Don't forget to regenerate GraphQL types** after schema changes
   ```powershell
   npx nx run-many -t codegen
   ```

2. **Always add foreign keys** when creating relationships
   ```typescript
   foreignKey({
     columns: [table.team1Id],
     foreignColumns: [teams.id],
     name: 'matchups_team1_fk'
   })
   ```

3. **Update relations.ts** when adding new relationships
   ```typescript
   export const matchupsRelations = relations(matchups, ({ one }) => ({
     team1: one(teams, {
       fields: [matchups.team1Id],
       references: [teams.id],
     }),
     team2: one(teams, {
       fields: [matchups.team2Id],
       references: [teams.id],
     }),
   }));
   ```

4. **Create proper database migration** for schema changes
   - Place in `lambdas/db/migrations/`
   - Follow naming: `YYYY-MM-DD-description.sql`

5. **Test cross-platform** - Changes should work on both web and mobile

---

## 💡 Tips for Success

### Reference Existing Code
- Look at **LS-7** scoring work for patterns
- Check `lib/db-client/src/drizzle/public/models/Leagues.ts` for schema examples
- Review `lambdas/db/src/schema/leagues.ts` for GraphQL patterns

### Testing
- Write unit tests as you go
- Test with real league data if possible
- Consider edge cases (odd number of teams, byes, etc.)

### Performance
- Use DataLoaders for N+1 query prevention
- Add database indexes for frequently queried columns
- Consider caching for standings/rankings

### Documentation
- Update `docs/architecture/database-schema.md` with schema changes
- Add inline code comments for complex logic
- Create examples in documentation

---

## 🎓 Required Reading Before Starting

1. **[AI Agent Contribution Workflow](../guides/ai-agent-contribution-workflow.md)** - Complete workflow
2. **[Database Schema Docs](../architecture/database-schema.md)** - Current schema
3. **[GraphQL Integration](../architecture/graphql-integration.md)** - GraphQL patterns
4. **[Full Implementation Plan](./LS-17-matchup-system-implementation-plan.md)** - Detailed specs

---

## 🆘 Getting Help

If you encounter issues:

1. Check **[Troubleshooting Guide](../guides/troubleshooting.md)**
2. Review **[Common Pitfalls CSV](../agents/common-pitfalls.csv)**
3. Search for similar patterns in existing code
4. Check error messages in terminal output

---

## ✅ Checklist for Each Ticket

- [ ] Read ticket description and acceptance criteria
- [ ] Check dependencies are completed
- [ ] Create/switch to correct branch
- [ ] Update Jira status to "In Progress"
- [ ] Write code following patterns from existing codebase
- [ ] Add unit tests
- [ ] Run validation: typecheck → lint → test → build
- [ ] Regenerate GraphQL types if needed
- [ ] Update documentation
- [ ] Commit with conventional commit message
- [ ] Push to branch
- [ ] Update Jira status to "In Review"

---

**Last Updated:** October 22, 2025  
**Total Stories Created:** 18 (LS-18 through LS-35)  
**Branch:** LS-17/set-up-matchup-system-for-fantasy-leagues
