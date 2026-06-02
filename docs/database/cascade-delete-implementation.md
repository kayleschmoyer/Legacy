# CASCADE Delete Implementation

## Overview

All foreign key constraints in the database have been updated to use CASCADE deletes where appropriate. This ensures referential integrity is maintained at the database level and eliminates the need for complex manual deletion scripts.

## Migration History

1. **20260205_210000_add_cascade_deletes_to_leagues_and_teams.ts** - Initial cascade implementation
   - Added CASCADE to league-level foreign keys (teams, matchups, drafts, league_members, playoff_brackets, champion_trophies)
   - Added CASCADE to team-level foreign keys (team_members, playoff data, matchup references)
   - Added CASCADE to draft and playoff bracket relationships

2. **20260205_220000_fix_draft_teams_cascade_delete.ts** - Fix missed constraint
   - Fixed `draft_teams.team_id, league_id -> teams.id, league_id` to CASCADE

3. **20260206_000000_add_missing_cascade_deletes.ts** - Complete remaining constraints
   - Added CASCADE to remaining league-level tables:
     - `league_messages`
     - `league_positions`
     - `league_scoring_profiles`
     - `roster_lock_rules`
   - Added CASCADE to team-level tables:
     - `matchup_players.team_id`
   - Added CASCADE to scoring profile relationships:
     - `league_scoring_profile_entries`
     - `league_scoring_change_log`
   - Added CASCADE to position relationships:
     - `team_members.position_id`
   - Cleaned up duplicate foreign key constraints

## CASCADE Hierarchy

### League Deletion (DELETE FROM leagues)

When a league is deleted, the following cascade automatically:

```
leagues
├── teams (ON DELETE CASCADE)
│   ├── team_members (ON DELETE CASCADE)
│   ├── matchup_players (ON DELETE CASCADE)
│   │   └── matchup_player_games (ON DELETE CASCADE)
│   ├── playoff_seeds (ON DELETE CASCADE)
│   ├── playoff_matchups (high/low/winner) (ON DELETE CASCADE)
│   ├── playoff_brackets.champion_team_id (ON DELETE CASCADE)
│   ├── champion_trophies (team_id, runner_up) (ON DELETE CASCADE)
│   └── draft_teams (ON DELETE CASCADE)
├── matchups (ON DELETE CASCADE)
│   ├── matchup_players (ON DELETE CASCADE)
│   │   └── matchup_player_games (ON DELETE CASCADE)
│   ├── matchup_messages (ON DELETE CASCADE)
│   │   ├── matchup_message_reactions (ON DELETE CASCADE)
│   │   └── matchup_message_reports (ON DELETE CASCADE)
│   ├── matchup_message_connections (ON DELETE CASCADE)
│   ├── matchup_chat_blocks (ON DELETE CASCADE)
│   └── tiebreaker_history (ON DELETE CASCADE)
├── drafts (ON DELETE CASCADE)
│   ├── draft_picks (via draft_id, already in initial schema)
│   └── draft_teams (ON DELETE CASCADE)
├── league_members (ON DELETE CASCADE)
├── playoff_brackets (ON DELETE CASCADE)
│   ├── playoff_matchups (ON DELETE CASCADE)
│   └── playoff_seeds (ON DELETE CASCADE)
├── champion_trophies (league_id) (ON DELETE CASCADE)
├── league_week_player_seasons (ON DELETE CASCADE)
├── league_messages (ON DELETE CASCADE)
├── league_positions (ON DELETE CASCADE)
│   └── team_members.position_id (ON DELETE CASCADE)
├── league_scoring_profiles (ON DELETE CASCADE)
│   ├── league_scoring_profile_entries (ON DELETE CASCADE)
│   └── league_scoring_change_log (ON DELETE CASCADE)
├── roster_lock_rules (ON DELETE CASCADE)
├── tiebreaker_rules (ON DELETE CASCADE)
└── matchup_chat_blocks (league_id) (ON DELETE CASCADE)
```

## Non-Cascading References

The following foreign keys intentionally do NOT cascade:

### Player References

Player data is reference/master data and should never be deleted when leagues/teams are deleted:

- `team_members.player_id` → NO CASCADE
- `matchup_players.player_id` → NO CASCADE
- `season_batting/pitching/fielding.player_id` → NO CASCADE

**Exception**: `league_week_player_seasons.player_id` DOES cascade because this is a cache table that is specific to league weeks.

### Self-References

- `league_scoring_profiles.copied_from_profile_id` → NO CASCADE (keeps audit trail)
- `matchup_messages.reply_to_message_id` → SET NULL (preserves messages)

### User References

Most user references use CASCADE or SET NULL appropriately:

- User deletions cascade to their messages/reactions
- Reviewer/flagger fields use SET NULL to preserve audit trail

## Testing

### Simplified Delete Command

The [`delete-league` CLI command](../../apps/cli/src/commands/deleteLeague.ts) has been dramatically simplified from 15 manual deletion steps to a single DELETE statement:

```typescript
// Before: 15 manual deletion steps with complex SQL
// After: Single delete, database handles cascade
await db.db
  .delete(PublicSchema.leagues)
  .where(eq(PublicSchema.leagues.id, leagueId));
```

### Verification Query

To verify CASCADE configuration for any parent table:

```sql
SELECT
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  confrelid::regclass AS referenced_table,
  CASE
    WHEN pg_get_constraintdef(oid) LIKE '%ON DELETE CASCADE%' THEN 'CASCADE'
    WHEN pg_get_constraintdef(oid) LIKE '%ON DELETE SET NULL%' THEN 'SET NULL'
    ELSE 'NO ACTION'
  END AS on_delete_action
FROM pg_constraint
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace
  AND confrelid::regclass::text = 'leagues'
ORDER BY conrelid::regclass::text;
```

## Benefits

1. **Data Integrity**: Database enforces referential integrity automatically
2. **Simplified Code**: No need for complex manual deletion scripts
3. **Atomic Operations**: Deletion is transactional - all or nothing
4. **Performance**: Database can optimize cascade operations
5. **Maintainability**: New tables automatically handled if FK defined correctly

## Best Practices

When adding new tables:

1. **Identify parent-child relationships**: What should be deleted when parent is deleted?
2. **Add CASCADE appropriately**:
   - Owned data (matchups owned by league) → CASCADE
   - Reference data (players) → NO CASCADE
   - Audit data (who flagged) → SET NULL
3. **Test deletion**: Verify cascade works as expected
4. **Update documentation**: Document new cascade relationships

## Related Documentation

- [Database Schema](./database-schema.md)
- [Migration Policy](./migration-policy.md)
- [Delete League CLI command](../../apps/cli/src/commands/deleteLeague.ts)
