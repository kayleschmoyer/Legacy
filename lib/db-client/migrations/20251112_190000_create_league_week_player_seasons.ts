import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create league_week_player_seasons table
 *
 * Purpose:
 * - Moves season selection from matchup_players to a league-week-player level
 * - Allows free agents to have season selections without being in matchups
 * - Ensures consistent season selection across all matchups in a week
 *
 * Changes:
 * 1. Creates new league_week_player_seasons table
 * 2. Migrates existing season data from matchup_players
 * 3. Drops season column from matchup_players
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('[Migration] Creating league_week_player_seasons table...');

  // 1. Create the new table
  await db.execute(sql`
      CREATE TABLE IF NOT EXISTS league_week_player_seasons (
        id SERIAL PRIMARY KEY,
        league_id INTEGER NOT NULL,
        week_number INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        season INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        
        -- Foreign keys
        CONSTRAINT league_week_player_seasons_league_fk 
          FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
        CONSTRAINT league_week_player_seasons_player_fk 
          FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
        
        -- Unique constraint: one season per player per league per week
        CONSTRAINT league_week_player_seasons_unique 
          UNIQUE (league_id, week_number, player_id)
      )
    `);

  console.log('[Migration] Creating indexes...');

  // Indexes for efficient lookups
  await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_league_week_player_seasons_lookup 
        ON league_week_player_seasons(league_id, week_number, player_id)
    `);

  await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_league_week_player_seasons_player 
        ON league_week_player_seasons(player_id)
    `);

  console.log(
    '[Migration] Migrating existing season data from matchup_players...',
  );

  // 2. Migrate existing data
  // For each unique (league_id, week_number, player_id) in matchup_players,
  // take the first season value (they should all be the same per player per week)
  await db.execute(sql`
      INSERT INTO league_week_player_seasons (league_id, week_number, player_id, season)
      SELECT DISTINCT
        m.league_id,
        m.week_number,
        mp.player_id,
        mp.season
      FROM matchup_players mp
      JOIN matchups m ON m.id = mp.matchup_id
      WHERE mp.season IS NOT NULL
      ON CONFLICT (league_id, week_number, player_id) DO NOTHING
    `);

  const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM league_week_player_seasons
    `);
  const count = result?.[0]?.count ?? 0;
  console.log(`[Migration] Migrated ${count} season assignments`);

  console.log('[Migration] Dropping season column from matchup_players...');

  // 3. Drop the season column from matchup_players
  await db.execute(sql`
      ALTER TABLE matchup_players 
      DROP COLUMN IF EXISTS season
    `);

  console.log('[Migration] ✅ Migration complete');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('[Migration] Rolling back league_week_player_seasons table...');

  // 1. Re-add season column to matchup_players
  await db.execute(sql`
      ALTER TABLE matchup_players 
      ADD COLUMN season INTEGER
    `);

  console.log('[Migration] Restoring season data to matchup_players...');

  // 2. Restore season data from league_week_player_seasons
  await db.execute(sql`
      UPDATE matchup_players mp
      SET season = lwps.season
      FROM matchups m
      JOIN league_week_player_seasons lwps 
        ON lwps.league_id = m.league_id 
        AND lwps.week_number = m.week_number 
        AND lwps.player_id = mp.player_id
      WHERE mp.matchup_id = m.id
    `);

  // 3. Make season NOT NULL again
  await db.execute(sql`
      ALTER TABLE matchup_players 
      ALTER COLUMN season SET NOT NULL
    `);

  console.log('[Migration] Dropping league_week_player_seasons table...');

  // 4. Drop the new table and its indexes
  await db.execute(sql`
      DROP TABLE IF EXISTS league_week_player_seasons CASCADE
    `);

  console.log('[Migration] ✅ Rollback complete');
};
