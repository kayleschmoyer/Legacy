# Automatic Timestamp Management

## Overview

The Legacy Sports database uses **automatic timestamp triggers** to manage `created_at` and `updated_at` fields across all tables. This ensures data integrity and provides accurate audit trails without manual intervention.

## How It Works

### 1. Trigger Function

A PostgreSQL trigger function automatically updates the `updated_at` column whenever a row is modified:

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';
```

### 2. Column Definitions

All major tables include these timestamp columns:

```typescript
{
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
}
```

### 3. Automatic Updates

- **`created_at`**: Set automatically on INSERT via `DEFAULT NOW()`
- **`updated_at`**: Set on INSERT via default, automatically updated on UPDATE via trigger

## Tables with Automatic Timestamps

### Core Tables

- `leagues` - League configuration
- `teams` - Fantasy teams
- `league_members` - User memberships
- `team_members` - Player rosters
- `drafts` - Draft configurations
- `draft_teams` - Draft order and teams
- `matchups` - Head-to-head matchups
- `matchup_players` - Players in matchups
- `matchup_player_games` - Individual game tracking
- `roster_lock_rules` - Roster lock settings

### Notification System

- `notification_preferences` - User notification settings
- `device_tokens` - Mobile device registration
- `notification_history` - Notification audit log

### Scoring System

- `scoring_stat_definitions` - Available statistics
- `league_scoring_profiles` - Scoring configurations
- `league_scoring_profile_entries` - Per-stat multipliers
- `league_scoring_change_log` - Audit log for scoring changes

### User Management

- `app_internal.users` - User accounts

### Chat & Messaging

- `matchup_messages` - Messages in matchup chat
- `matchup_chat_blocks` - User blocking relationships
- `matchup_message_reactions` - Reactions to messages
- `matchup_message_reports` - Message moderation reports
- `league_messages` - League-wide announcements

### Playoff & Tiebreaker System

- `tiebreaker_rules` - League tiebreaker configurations
- `tiebreaker_history` - Tiebreaker resolution log
- `playoff_brackets` - Playoff bracket definitions
- `champion_trophies` - Championship records

### Player Data

- `players` - Master player registry
- `league_week_player_seasons` - Weekly player season tracking

## Tables WITHOUT Automatic Timestamps

### Historical Stats (Intentionally Excluded)

The following tables contain **read-only historical data** loaded from external sources. They are not modified after initial creation, so automatic timestamp tracking would not provide meaningful audit value:

#### Game-Level Stats

- `game_batting` - Baseball game batting statistics
- `game_fielding` - Baseball game fielding statistics
- `game_pitching` - Baseball game pitching statistics

#### Season-Level Stats

- `season_batting` - Baseball season batting statistics
- `season_fielding` - Baseball season fielding statistics
- `season_pitching` - Baseball season pitching statistics

#### Playoff Reference Data

- `playoff_matchups` - Playoff matchup records
- `playoff_seeds` - Playoff seeding records

#### Configuration Data

- `league_positions` - Position configuration (rarely changes)

## Usage Examples

### Creating Records

Timestamps are automatically set:

```typescript
// Insert with Drizzle ORM
await db.insert(leagues).values({
  name: 'My League',
  owner: userId,
  inviteCode: 'ABC12345',
  // created_at and updated_at are automatically set
});
```

### Updating Records

The `updated_at` field is automatically refreshed:

```typescript
// Update with Drizzle ORM
await db
  .update(leagues)
  .set({ name: 'Renamed League' })
  .where(eq(leagues.id, leagueId));
// updated_at is automatically updated by trigger
```

### Querying by Timestamp

```typescript
// Find recently modified records
const recentLeagues = await db
  .select()
  .from(leagues)
  .where(gte(leagues.updatedAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));

// Order by creation date
const oldestFirst = await db
  .select()
  .from(leagues)
  .orderBy(asc(leagues.createdAt));
```

## Benefits

### 1. Data Integrity

- Consistent timestamp management across all tables
- No manual timestamp updates required
- Impossible to forget updating timestamps

### 2. Audit Trail

- Track when records were created
- Track when records were last modified
- Useful for debugging and analytics

### 3. Developer Experience

- No need to remember to set timestamps
- Automatic in all contexts (ORM, raw SQL, admin tools)
- Type-safe with Drizzle ORM

### 4. Performance Optimization

- Enables efficient cache invalidation strategies
- Supports time-based queries and filtering
- Useful for incremental sync operations

## Implementation Details

### Migration

The automatic timestamp system was implemented in two migrations:

1. **`20260208_000000_add_automatic_timestamps.ts`** - Initial implementation
   - Creates the `update_updated_at_column()` trigger function
   - Adds `created_at` and `updated_at` columns to core tables
   - Creates triggers for all initial tables

2. **`20260211_000000_fix_missing_timestamp_triggers.ts`** - Comprehensive fixes
   - Adds missing triggers to tables with existing timestamp columns
   - Adds complete timestamps to audit and user-generated content tables
   - Completes partial implementations (adds `updated_at` where only `created_at` existed)
   - Documents policy on historical stats tables (intentionally excluded)

Both migrations are idempotent - safe to run multiple times.

### Running the Migration

```powershell
# Run all pending migrations
pnpm run db:migrate

# Or run migrations in a specific environment
pnpm run db:migrate:dev
pnpm run db:migrate:prod
```

### Verification

After running the migration, verify the triggers are in place:

```sql
-- List all triggers
SELECT
  trigger_name,
  event_object_schema,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name LIKE '%updated_at_trigger%';

-- Test update behavior
UPDATE leagues SET name = name WHERE id = 1;
SELECT id, name, created_at, updated_at FROM leagues WHERE id = 1;
-- updated_at should be newer than created_at
```

## Adding Timestamps to New Tables

When creating new tables, include the timestamp columns:

```typescript
export const myNewTable = pgTable('my_new_table', {
  id: serial('id').primaryKey(),
  // ... other columns ...
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

Then create a trigger in your migration:

```typescript
// In your migration file
await db.execute(`
  CREATE TRIGGER my_new_table_updated_at_trigger
  BEFORE UPDATE ON public.my_new_table
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
`);
```

## Best Practices

### ✅ Do

- **Always include timestamps** on new tables
- **Use timezone-aware timestamps** (`withTimezone: true`)
- **Query by timestamps** for cache invalidation
- **Use timestamps in logs** for debugging

### ❌ Don't

- **Don't manually set `updated_at`** - the trigger handles it
- **Don't use `Date.now()`** in application code - use DB timestamps
- **Don't skip timestamps** on transactional tables
- **Don't modify trigger function** without updating all triggers

## Troubleshooting

### Timestamps Not Updating

Check if the trigger exists:

```sql
SELECT * FROM information_schema.triggers
WHERE event_object_table = 'your_table_name'
AND trigger_name LIKE '%updated_at%';
```

If missing, re-run the migration or manually create the trigger.

### Timezone Issues

All timestamps use `TIMESTAMP WITH TIME ZONE` (timestamptz) which:

- Stores values in UTC
- Converts to client timezone on retrieval
- Recommended for all applications

### Performance Concerns

Triggers add minimal overhead:

- Execute in microseconds
- Only on UPDATE operations
- No impact on SELECT queries
- Index on timestamp columns for efficient querying

## Related Documentation

- [Database Schema](../architecture/database-schema.md) - Complete schema documentation
- [Database Migrations](./migrations.md) - Migration system guide
- [Drizzle ORM](../build-and-tooling/drizzle-orm.md) - ORM usage patterns
