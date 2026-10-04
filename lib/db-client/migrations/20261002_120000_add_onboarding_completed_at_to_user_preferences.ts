/**
 * Migration: Add onboarding_completed_at to user_preferences (LS-10378)
 *
 * Onboarding completion was tracked only in the browser's localStorage
 * (LS-6890), so a user who finished the tutorial on one device re-saw it on
 * every other, and native had no way to know it was already done (LS-6891).
 *
 * The column is a nullable timestamp: NULL means "not completed", a value is
 * the moment of first completion. It is set-once — the service never clears or
 * overwrites an existing value. Existing rows are intentionally left NULL (no
 * backfill from localStorage).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration context's sql param type varies between the local runner and the hosted db-admin Lambda sandbox
export const up = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    ALTER TABLE public.user_preferences
    ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamp
  `;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration context's sql param type varies between the local runner and the hosted db-admin Lambda sandbox
export const down = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    ALTER TABLE public.user_preferences
    DROP COLUMN IF EXISTS onboarding_completed_at
  `;
};
