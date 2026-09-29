import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create player_highlight_videos cache table (LS-9113)
 *
 * Caches each player's validated MLB-official-YouTube-channel highlight video
 * for the draft spectator pick-splash video tier. Populated by the scheduled
 * resolveHighlightVideos mutation (EventBridge, nightly, quota-budgeted) and
 * re-verified weekly by verifyHighlightVideos.
 *
 * Keyed on players.id — NOT players.mlb_player_id, which is NULL for all
 * baseball rows (spike LS-9111 finding).
 *
 * youtube_video_id NULL marks an attempted-but-unresolved player (no
 * validated match on the MLB channel); the splash then uses the LS-9095
 * stat-graphic tier. Rows unverified for 30+ days are purged per the YouTube
 * API Services Developer Policies cache-refresh obligation (DP III.E.4.d/e);
 * purging an unresolved row is also what re-opens the player for a later
 * search retry.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."player_highlight_videos" (
      "player_id"        integer PRIMARY KEY REFERENCES "public"."players"("id") ON DELETE CASCADE,
      "youtube_video_id" varchar(20),
      "video_title"      text,
      "made_for_kids"    boolean,
      "embeddable"       boolean,
      "match_method"     varchar(10),
      "resolved_at"      timestamptz NOT NULL DEFAULT now(),
      "last_verified_at" timestamptz,
      "created_at"       timestamptz NOT NULL DEFAULT now(),
      "updated_at"       timestamptz NOT NULL DEFAULT now()
    );
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`DROP TABLE IF EXISTS "public"."player_highlight_videos";`);
};
