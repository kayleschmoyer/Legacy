import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Remove player_game_scores and matchup_scores_view
 *
 * These were part of a pre-computed scoring architecture that we've decided against.
 *
 * New architecture:
 * - Game selection stores game references in matchup_player_games
 * - Stats are loaded on-demand into game_batting/pitching/fielding tables
 * - UI aggregates stats via GraphQL and computes scores client-side
 * - This is simpler and allows for league-specific scoring rules
 *
 * See: docs/architecture/matchup-scoring-system.md
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔄 Removing pre-computed scoring architecture...');

  // Drop view first (depends on table)
  console.log('Dropping matchup_scores_view...');
  await db.execute(`
    DROP VIEW IF EXISTS matchup_scores_view CASCADE;
  `);

  // Drop player_game_scores table
  console.log('Dropping player_game_scores table...');
  await db.execute(`
    DROP TABLE IF EXISTS player_game_scores CASCADE;
  `);

  console.log('✅ Pre-computed scoring architecture removed');
  console.log(
    'ℹ️  Score columns in matchup_player_games remain for future use',
  );
};

export const down = (): void => {
  console.log('⚠️  Cannot rollback - would need to recreate table and view');
  console.log('ℹ️  If needed, restore from migrations:');
  console.log('    - 20251113_130000_create_player_game_scores.ts');
  console.log('    - 20251113_140000_create_matchup_scores_view.ts');
};
