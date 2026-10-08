/**
 * Migration: Add duration_seconds to player_highlight_videos (LS-10973)
 *
 * The pick splash only shows ~7s of video, so the resolver now caches only
 * short (≤ 30s) single-play clips, and the splash skips a fixed lead-in so the
 * window lands on the play rather than the batter stepping in. The splash
 * clamps that skip by the clip's length so it never runs off the end, which
 * needs the duration from videos.list contentDetails stored alongside the
 * video id.
 *
 * Nullable: unresolved rows have no video, and existing resolved rows predate
 * the column — the next weekly verify pass backfills or purges them.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration context's sql param type varies between the local runner and the hosted db-admin Lambda sandbox
export const up = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    ALTER TABLE public.player_highlight_videos
    ADD COLUMN IF NOT EXISTS duration_seconds integer
  `;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration context's sql param type varies between the local runner and the hosted db-admin Lambda sandbox
export const down = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    ALTER TABLE public.player_highlight_videos
    DROP COLUMN IF EXISTS duration_seconds
  `;
};
