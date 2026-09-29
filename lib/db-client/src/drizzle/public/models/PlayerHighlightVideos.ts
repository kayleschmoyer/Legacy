import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { players } from './Players';

/**
 * Per-player validated YouTube highlight-video cache (LS-9113).
 *
 * One row per players.id holding the validated MLB-official-channel highlight
 * video for the draft spectator pick-splash video tier, or an
 * attempted-but-unresolved marker (youtube_video_id NULL) when no validated
 * match exists — the splash then falls back to the LS-9095 stat graphic.
 *
 * Refreshed by the resolveHighlightVideos / verifyHighlightVideos system
 * mutations. Rows unverified for 30+ days are purged (YouTube DP III.E.4.d/e
 * cache-refresh obligation), which also re-opens unresolved players for a
 * later search retry.
 */
export const playerHighlightVideos = pgTable('player_highlight_videos', {
  playerId: integer('player_id')
    .primaryKey()
    .references(() => players.id, { onDelete: 'cascade' }),
  youtubeVideoId: varchar('youtube_video_id', { length: 20 }),
  videoTitle: text('video_title'),
  madeForKids: boolean('made_for_kids'),
  embeddable: boolean('embeddable'),
  /** How the match was validated: 'full_name' | 'judge'. NULL when unresolved. */
  matchMethod: varchar('match_method', { length: 10 }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
