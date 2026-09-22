/**
 * Migration: Add score_version to matchups (LS-6391)
 *
 * `updateMatchupScore` (the admin/system GraphQL mutation, the commissioner's
 * `editMatchupScore` tool, and the scoring-engine PublicDbClient helper) all
 * write team1_score/team2_score with a bare `UPDATE ... WHERE id = :id`, with
 * no row-level lock or version check. Two concurrent scoring writers for the
 * same matchup can land in an order that doesn't match which one has the
 * freshest stats, silently losing the fresher update.
 *
 * `score_version` is an optimistic-concurrency counter, bumped by every
 * writer of the score columns in the same write as the score itself. A
 * caller can pass the version it read before computing its score as
 * `expectedScoreVersion`; the write is rejected if the row has moved since,
 * rather than silently overwritten.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration context's sql param type varies between the local runner and the hosted db-admin Lambda sandbox
export const up = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    ALTER TABLE public.matchups
    ADD COLUMN IF NOT EXISTS score_version bigint NOT NULL DEFAULT 0
  `;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration context's sql param type varies between the local runner and the hosted db-admin Lambda sandbox
export const down = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    ALTER TABLE public.matchups
    DROP COLUMN IF EXISTS score_version
  `;
};
