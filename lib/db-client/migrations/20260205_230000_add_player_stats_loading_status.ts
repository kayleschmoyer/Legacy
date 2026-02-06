import type { PgDatabase } from 'drizzle-orm/pg-core';

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log(
    '🔄 Adding stats_loading_status column to matchup_player_games...',
  );

  // Add the new column with default value 'pending'
  await db.execute(`
    ALTER TABLE matchup_player_games 
    ADD COLUMN stats_loading_status VARCHAR(20) DEFAULT 'pending';
  `);

  // Update existing records to have 'completed' status since they already have game_identifier
  await db.execute(`
    UPDATE matchup_player_games 
    SET stats_loading_status = CASE 
      WHEN game_identifier IS NOT NULL THEN 'completed'
      ELSE 'pending'
    END;
  `);

  console.log('✅ Successfully added stats_loading_status column');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log(
    '🔄 Removing stats_loading_status column from matchup_player_games...',
  );

  await db.execute(`
    ALTER TABLE matchup_player_games 
    DROP COLUMN IF EXISTS stats_loading_status;
  `);

  console.log('✅ Successfully removed stats_loading_status column');
};
