import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add matchup_player_history
 * Ticket: LS-6376
 *
 * Records every position change made to a matchup_players row (via
 * updateMatchupPlayerPosition or swapMatchupPlayerPositions), so a swap can
 * be reverted if the client loses connectivity between the swap and its
 * confirmation. `swap_id` groups the one or two rows written by a single
 * mutation call — a swap writes two rows sharing the same swap_id, a single
 * move writes one — and is what undoMatchupPlayerSwap looks rows up by.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    CREATE TABLE matchup_player_history (
      id serial PRIMARY KEY NOT NULL,
      swap_id char(36) NOT NULL,
      matchup_player_id integer NOT NULL,
      matchup_id integer NOT NULL,
      team_id integer NOT NULL,
      player_id integer NOT NULL,
      previous_position_id integer,
      new_position_id integer,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      undone_at timestamp with time zone
    );
  `);

  await db.execute(`
    ALTER TABLE matchup_player_history
      ADD CONSTRAINT matchup_player_history_matchup_player_fk
        FOREIGN KEY (matchup_player_id)
        REFERENCES matchup_players(id)
        ON DELETE CASCADE
        ON UPDATE NO ACTION;
  `);

  await db.execute(`
    ALTER TABLE matchup_player_history
      ADD CONSTRAINT matchup_player_history_matchup_fk
        FOREIGN KEY (matchup_id)
        REFERENCES matchups(id)
        ON DELETE CASCADE
        ON UPDATE NO ACTION;
  `);

  await db.execute(`
    CREATE INDEX matchup_player_history_swap_id_idx
      ON matchup_player_history (swap_id);
  `);

  await db.execute(`
    CREATE INDEX matchup_player_history_matchup_player_id_idx
      ON matchup_player_history (matchup_player_id, created_at DESC);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`DROP TABLE IF EXISTS matchup_player_history;`);
};
