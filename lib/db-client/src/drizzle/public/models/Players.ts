import {
  pgTable,
  unique,
  serial,
  text,
  varchar,
  integer,
  primaryKey,
  foreignKey,
  pgView,
  timestamp,
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
  },
  (table) => {
    return {
      playersUkBrefId: unique('players_uk_bref_id').on(table.brefId),
    };
  },
);

export const playerEligiblePositions = pgView('player_eligible_positions', {
  playerId: integer('player_id').notNull(),
  position: playerPosition('position').notNull(),
}).as(sql`
SELECT cfbp.player_id,
       cfbp.pos AS position
FROM career_fielding_by_position cfbp
JOIN career_batting cb ON cb.player_id = cfbp.player_id
WHERE cfbp.pos != 'P'
  AND (cfbp.g >= 100 OR (cb.g > 0 AND cfbp.g * 10 >= cb.g))
UNION
SELECT player_id,
       'SP' AS position
FROM career_pitching
WHERE gs >= 100 OR (g > 0 AND gs * 10 >= g)
UNION
SELECT player_id,
       'RP' AS position
FROM career_pitching
WHERE (g - gs) >= 100 OR (g > 0 AND (g - gs) * 10 >= g);
`);
