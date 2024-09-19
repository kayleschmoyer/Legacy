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
} from 'drizzle-orm/pg-core';
import { playerPosition } from './Enums';
import { sql } from 'drizzle-orm';

export const players = pgTable(
  'players',
  {
    id: serial('id').primaryKey().notNull(),
    name: text('name').notNull(),
    brefId: varchar('bref_id', { length: 10 }).notNull(),
  },
  (table) => {
    return {
      playersUkBrefId: unique('players_uk_bref_id').on(table.brefId),
    };
  }
);

export const playerEligiblePositions = pgView('player_eligible_positions', {
  playerId: integer('player_id').notNull(),
  position: playerPosition('position').notNull(),
}).as(sql`
SELECT player_id,
       pos AS position
FROM career_fielding_by_position
WHERE g > 50
  AND POS != 'P'
UNION
SELECT player_id,
       'SP' AS position
FROM career_pitching
WHERE gs > 50
UNION
SELECT player_id,
       'RP' AS position
FROM career_pitching
WHERE g - gs > 50;
`);
