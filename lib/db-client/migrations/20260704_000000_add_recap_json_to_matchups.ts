/**
 * Migration: Add recap_json to matchups (LS-5878)
 *
 * The AI matchup recap resolver (Matchup.recap) regenerated the full
 * narrative on every fetch — ~75 DataLoader calls per request plus any
 * non-determinism in generateMatchupRecap. This column persists the
 * generated recap the first time it's computed so subsequent fetches read
 * the cached JSON instead of re-running the whole graph.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration context's sql param type varies between the local runner and the hosted db-admin Lambda sandbox
export const up = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    ALTER TABLE public.matchups
    ADD COLUMN IF NOT EXISTS recap_json jsonb
  `;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration context's sql param type varies between the local runner and the hosted db-admin Lambda sandbox
export const down = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    ALTER TABLE public.matchups
    DROP COLUMN IF EXISTS recap_json
  `;
};
