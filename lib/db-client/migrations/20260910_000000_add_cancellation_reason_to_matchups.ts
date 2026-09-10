/**
 * Migration: Add cancellation_reason to matchups (LS-9683)
 *
 * LS-6369 added a generic "This matchup was cancelled." banner but never
 * recorded why a matchup was cancelled. This column persists an optional
 * reason so it can be surfaced back in the UI.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration context's sql param type varies between the local runner and the hosted db-admin Lambda sandbox
export const up = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    ALTER TABLE public.matchups
    ADD COLUMN IF NOT EXISTS cancellation_reason text
  `;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration context's sql param type varies between the local runner and the hosted db-admin Lambda sandbox
export const down = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    ALTER TABLE public.matchups
    DROP COLUMN IF EXISTS cancellation_reason
  `;
};
