/**
 * Migration: Mock drafts move off leagues (LS-10076)
 * Created: 2026-09-17
 * Ticket: LS-10076 (slice 4 of 8, epic LS-9252 "Draft-First Mock Drafts")
 *
 * Slice 4 creates mock drafts as league-less `drafts` rows (kind = 'mock') and
 * deletes the league-backed mock path outright — no deprecation window
 * (product owner decision, 2026-09-13).
 *
 *   1. `drafts.draft_mode` / `drafts.selection_method` are NOT NULL with no
 *      physical default: the Drizzle `.default()`s on the model are
 *      typing-only (LS-10085). Every league-less insert would have to repeat
 *      both values, so give the columns the defaults the model already claims.
 *
 *   2. `draft_queue.team_id` becomes nullable: a mock draft's queue belongs to
 *      a seat (`participant_id`), not a team. `draft_picks.team_id` already
 *      went nullable in LS-10073. The team-keyed unique constraints do not
 *      cover NULL team ids, so partial seat-keyed equivalents are added for
 *      the league-less rows.
 *
 *   3. Delete every legacy mock-draft league. Confirmed 2026-09-11: legacy
 *      rows are deleted, not migrated. ON DELETE CASCADE removes their teams,
 *      league_members, drafts, draft_participants, picks and chat.
 *      Cross-league scoring-profile copy pointers into these leagues are
 *      cleared first, mirroring `deleteLeaguesAtomically` (LS-8125).
 *
 * Re-runnable: SET DEFAULT is idempotent and the deletes are predicate-scoped.
 * The `leagues.is_mock_draft` / `is_offline_draft` / `control_all_teams`
 * columns stay until LS-10080, one deploy after no lambda selects them.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration context's sql param type varies between the local runner and the hosted db-admin Lambda sandbox
export const up = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    ALTER TABLE public.drafts
      ALTER COLUMN draft_mode SET DEFAULT 'live',
      ALTER COLUMN selection_method SET DEFAULT 'standard'
  `;

  await sql`
    ALTER TABLE public.draft_queue ALTER COLUMN team_id DROP NOT NULL
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS draft_queue_uk_draft_participant_player
      ON public.draft_queue (draft_id, participant_id, player_id)
      WHERE team_id IS NULL
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS draft_queue_uk_draft_participant_priority
      ON public.draft_queue (draft_id, participant_id, priority)
      WHERE team_id IS NULL
  `;

  await sql`
    UPDATE public.league_scoring_profiles
    SET copied_from_profile_id = NULL
    WHERE copied_from_profile_id IN (
      SELECT p.id
      FROM public.league_scoring_profiles p
      JOIN public.leagues l ON l.id = p.league_id
      WHERE l.is_mock_draft = true
    )
  `;

  await sql`
    DELETE FROM public.leagues
    WHERE is_mock_draft = true
  `;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration context's sql param type varies between the local runner and the hosted db-admin Lambda sandbox
export const down = async ({ sql }: { sql: any }): Promise<void> => {
  // The deleted mock-draft leagues are not recoverable. Seat-keyed queue rows
  // have no team to restore, so they go before team_id is re-required.
  await sql`DROP INDEX IF EXISTS public.draft_queue_uk_draft_participant_priority`;
  await sql`DROP INDEX IF EXISTS public.draft_queue_uk_draft_participant_player`;
  await sql`DELETE FROM public.draft_queue WHERE team_id IS NULL`;
  await sql`
    ALTER TABLE public.draft_queue ALTER COLUMN team_id SET NOT NULL
  `;
  await sql`
    ALTER TABLE public.drafts
      ALTER COLUMN draft_mode DROP DEFAULT,
      ALTER COLUMN selection_method DROP DEFAULT
  `;
};
