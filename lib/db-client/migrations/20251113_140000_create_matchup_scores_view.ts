import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create matchup_scores_view
 *
 * Creates a database view that aggregates player game scores for matchups.
 * This view joins matchup_player_games with player_game_scores to calculate
 * total scores for each player and team in a matchup.
 *
 * The view provides instant score lookups without needing to invoke Lambda functions.
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('📊 Creating matchup_scores_view...');

  await db.execute(`
    CREATE OR REPLACE VIEW matchup_scores_view AS
    WITH player_matchup_scores AS (
      -- Aggregate scores for each player in a matchup
      SELECT 
        mp.id as matchup_player_id,
        mp.matchup_id,
        mp.player_id,
        mp.team_id,
        lwps.season as selected_season,
        COUNT(DISTINCT mpg.id) as games_played,
        SUM(COALESCE(pgs.batting_score, 0)) as total_batting_score,
        SUM(COALESCE(pgs.pitching_score, 0)) as total_pitching_score,
        SUM(COALESCE(pgs.fielding_score, 0)) as total_fielding_score,
        SUM(COALESCE(pgs.total_score, 0)) as total_score
      FROM matchup_players mp
      INNER JOIN matchups m ON m.id = mp.matchup_id
      LEFT JOIN league_week_player_seasons lwps ON (
        lwps.league_id = m.league_id
        AND lwps.week_number = m.week_number
        AND lwps.player_id = mp.player_id
      )
      LEFT JOIN matchup_player_games mpg ON mpg.matchup_player_id = mp.id
      LEFT JOIN player_game_scores pgs ON (
        pgs.player_id = mp.player_id 
        AND pgs.season = lwps.season 
        AND (
          pgs.game_num = mpg.batting_game_num 
          OR pgs.game_num = mpg.pitching_game_num 
          OR pgs.game_num = mpg.fielding_game_num
        )
      )
      GROUP BY mp.id, mp.matchup_id, mp.player_id, mp.team_id, lwps.season
    ),
    team_matchup_scores AS (
      -- Aggregate scores by team
      SELECT 
        matchup_id,
        team_id,
        COUNT(*) as players_count,
        SUM(games_played) as total_games_played,
        SUM(total_batting_score) as team_batting_score,
        SUM(total_pitching_score) as team_pitching_score,
        SUM(total_fielding_score) as team_fielding_score,
        SUM(total_score) as team_total_score
      FROM player_matchup_scores
      WHERE team_id IS NOT NULL
      GROUP BY matchup_id, team_id
    )
    -- Final matchup scores with both teams
    SELECT 
      m.id as matchup_id,
      m.week_number,
      m.league_id,
      m.status,
      m.games_per_matchup,
      m.team1_id,
      m.team2_id,
      t1.players_count as team1_players,
      t1.total_games_played as team1_games_played,
      t1.team_batting_score as team1_batting_score,
      t1.team_pitching_score as team1_pitching_score,
      t1.team_fielding_score as team1_fielding_score,
      t1.team_total_score as team1_score,
      t2.players_count as team2_players,
      t2.total_games_played as team2_games_played,
      t2.team_batting_score as team2_batting_score,
      t2.team_pitching_score as team2_pitching_score,
      t2.team_fielding_score as team2_fielding_score,
      t2.team_total_score as team2_score,
      -- Determine winner
      CASE 
        WHEN t1.team_total_score > t2.team_total_score THEN m.team1_id
        WHEN t2.team_total_score > t1.team_total_score THEN m.team2_id
        ELSE NULL
      END as winning_team_id,
      -- Calculate games remaining
      COALESCE(m.games_per_matchup, 0) - GREATEST(
        COALESCE(t1.total_games_played, 0) / NULLIF(t1.players_count, 0),
        COALESCE(t2.total_games_played, 0) / NULLIF(t2.players_count, 0)
      ) as games_remaining
    FROM matchups m
    LEFT JOIN team_matchup_scores t1 ON t1.matchup_id = m.id AND t1.team_id = m.team1_id
    LEFT JOIN team_matchup_scores t2 ON t2.matchup_id = m.id AND t2.team_id = m.team2_id;
  `);

  // Create index on view for fast matchup lookups
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_matchup_scores_view_matchup_id 
      ON matchups(id);
  `);

  console.log('✅ matchup_scores_view created');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔄 Dropping matchup_scores_view...');

  await db.execute(`
    DROP VIEW IF EXISTS matchup_scores_view CASCADE;
  `);

  console.log('✅ matchup_scores_view dropped');
};
