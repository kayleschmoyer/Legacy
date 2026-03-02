import {
  pgTable,
  unique,
  serial,
  text,
  varchar,
  integer,
  primaryKey,
  foreignKey,
  pgMaterializedView,
  timestamp,
  bigint,
  boolean,
} from 'drizzle-orm/pg-core';
import { playerPosition } from './Enums';
import { sql } from 'drizzle-orm';

export const players = pgTable(
  'players',
  {
    id: serial('id').primaryKey().notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    brefId: varchar('bref_id', { length: 10 }).notNull(),
    statsLastFetchedAt: timestamp('stats_last_fetched_at'),
    // Career achievement counts — populated by the data loader from bref award_summary
    allStarSelections: integer('all_star_selections').notNull().default(0),
    goldGloves: integer('gold_gloves').notNull().default(0),
    silverSluggers: integer('silver_sluggers').notNull().default(0),
    mvpAwards: integer('mvp_awards').notNull().default(0),
    cyYoungAwards: integer('cy_young_awards').notNull().default(0),
    worldSeriesRings: integer('world_series_rings').notNull().default(0),
    hallOfFame: boolean('hall_of_fame').notNull().default(false),
    rookieOfTheYear: boolean('rookie_of_the_year').notNull().default(false),
  },
  (table) => {
    return {
      playersUkBrefId: unique('players_uk_bref_id').on(table.brefId),
    };
  },
);

// NOTE: This is a MATERIALIZED VIEW (not a plain view) as of migration
// 20260302_120000_materialize_player_eligible_positions. Drizzle schema
// reflects the materialized variant so introspection stays accurate.
export const playerEligiblePositions = pgMaterializedView(
  'player_eligible_positions',
  {
    playerId: integer('player_id').notNull(),
    position: playerPosition('position').notNull(),
    games: bigint('games', { mode: 'number' }).notNull(),
  },
).as(sql`
SELECT cfbp.player_id,
       cfbp.pos AS position,
       cfbp.g AS games
FROM career_fielding_by_position cfbp
JOIN career_batting cb ON cb.player_id = cfbp.player_id
WHERE cfbp.pos != 'P'
  AND (cfbp.g >= 100 OR (cb.g > 0 AND cfbp.g * 10 >= cb.g))
UNION
SELECT player_id,
       'SP' AS position,
       gs AS games
FROM career_pitching
WHERE gs >= 100 OR (g > 0 AND gs * 10 >= g)
UNION
SELECT player_id,
       'RP' AS position,
       (g - gs) AS games
FROM career_pitching
WHERE (g - gs) >= 100 OR (g > 0 AND (g - gs) * 10 >= g)
ORDER BY player_id, games DESC
`);
