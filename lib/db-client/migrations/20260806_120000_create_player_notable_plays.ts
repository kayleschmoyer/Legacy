import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create player_notable_plays cache table (LS-9095)
 *
 * Caches each player's most notable Statcast play (best exit-velo hit,
 * strikeout, etc.) keyed on the external MLB Stats API player id. Populated
 * by the scheduled refreshNotablePlays mutation (EventBridge, daily) and read
 * by the draft spectator pick-splash stat graphic — the splash's ~8s window
 * is too tight for a live game-feed lookup, so it only ever does a cache read.
 *
 * play_id stores the Statcast play UUID used to build a user-initiated
 * "Watch on MLB Film Room" link-out. No video asset or URL to a video file is
 * stored — MLB ToS prohibits redistribution/embedding (see spike LS-8945).
 *
 * No FK to players.mlb_player_id: that column is nullable and not
 * unique-constrained (partial index only), and this cache is keyed on the
 * external id by design.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."player_notable_plays" (
      "mlb_player_id"    integer PRIMARY KEY,
      "player_role"      varchar(7) NOT NULL,
      "game_pk"          integer NOT NULL,
      "game_date"        date NOT NULL,
      "play_id"          varchar(64),
      "event_type"       varchar(40) NOT NULL,
      "description"      text NOT NULL,
      "exit_velocity"    real,
      "launch_angle"     real,
      "hit_distance"     real,
      "pitch_speed"      real,
      "pitch_type"       varchar(40),
      "notability_score" real NOT NULL,
      "created_at"       timestamptz NOT NULL DEFAULT now(),
      "updated_at"       timestamptz NOT NULL DEFAULT now()
    );
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`DROP TABLE IF EXISTS "public"."player_notable_plays";`);
};
