/**
 * Migration: Add audio_enabled to user_preferences (LS-10111)
 *
 * LS-6392 (FMD-012) shipped the matchup scoreboard's score count-up and "+N
 * points" flourish; its follow-up finding asked for a touchdown audio cue.
 * There was no audio preference anywhere in the product, and shipping a sound
 * without one would mean shipping unconditional audio.
 *
 * Audio is strictly opt-in, so the column defaults to false — including for
 * every pre-existing row, which is what NOT NULL DEFAULT false backfills.
 * The cue itself lands in LS-10195; this column is its gate.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration context's sql param type varies between the local runner and the hosted db-admin Lambda sandbox
export const up = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    ALTER TABLE public.user_preferences
    ADD COLUMN IF NOT EXISTS audio_enabled boolean NOT NULL DEFAULT false
  `;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration context's sql param type varies between the local runner and the hosted db-admin Lambda sandbox
export const down = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    ALTER TABLE public.user_preferences
    DROP COLUMN IF EXISTS audio_enabled
  `;
};
