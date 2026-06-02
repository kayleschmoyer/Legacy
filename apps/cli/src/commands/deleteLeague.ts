import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import { eq } from 'drizzle-orm';
import { CommandArgs } from '../utils/loadEnvFile';

export interface DeleteLeagueArgs extends CommandArgs {
  /** ID of the league to delete. */
  id?: number;
  /** Skip the confirmation guard and proceed with the destructive delete. */
  yes?: boolean;
}

/**
 * Validate that a league id is a positive integer.
 *
 * Returns the validated id, or `null` when the value is missing or not a
 * positive safe integer. The standalone-script ancestor silently defaulted a
 * missing id to `16` — that default is intentionally dropped here because a
 * destructive CASCADE delete must never run against a guessed league.
 * `Number.isSafeInteger` rejects values outside the JS safe-integer range so
 * very large ids cannot be silently rounded into a different league.
 */
export function parseLeagueId(raw: number | undefined): number | null {
  if (raw === undefined || !Number.isSafeInteger(raw) || raw <= 0) {
    return null;
  }
  return raw;
}

/**
 * Delete a league and all of its related data via the database CASCADE
 * constraints.
 *
 * With CASCADE deletes configured, deleting the single `leagues` row removes
 * every dependent record (teams, matchups, drafts, league_members,
 * playoff_brackets, champion_trophies, league_messages, scoring profiles,
 * roster/tiebreaker rules, etc.). Extracted from the handler so the delete
 * path is unit-testable.
 *
 * Uses `runWithPublicClient` so connection lifecycle matches the rest of the
 * codebase — in particular it does not close cached dev-mode connections
 * (`NODE_ENV=development`), which would otherwise leave a closed pool in the
 * cache and break subsequent DB usage in the same process.
 */
export async function deleteLeagueById(leagueId: number): Promise<void> {
  await runWithPublicClient(getDbOptions(), async (client) => {
    LOGGER.info(
      `Deleting league ${leagueId} and all related data (via CASCADE)...`,
    );

    await client
      .delete(PublicSchema.leagues)
      .where(eq(PublicSchema.leagues.id, leagueId));

    LOGGER.info(`League ${leagueId} and all related data deleted successfully`);
    LOGGER.info(
      'Database CASCADE constraints handled all child record deletions',
    );
  });
}

/**
 * CLI handler: permanently delete a league (and its CASCADE children) by id.
 *
 * This is a destructive data operation. It refuses to run without a valid
 * `--id` and without the explicit `--yes` confirmation flag.
 */
export async function handleDeleteLeague(
  args: DeleteLeagueArgs = {},
): Promise<void> {
  const leagueId = parseLeagueId(args.id);
  if (leagueId === null) {
    LOGGER.error('❌ A valid --id <leagueId> is required (positive integer).');
    process.exit(1);
  }

  if (!args.yes) {
    LOGGER.warn(
      `⚠️  This will permanently delete league ${leagueId} and ALL related data (CASCADE).`,
    );
    LOGGER.info(
      '💡 Pass --yes to confirm deletion. Re-run with --yes to proceed.',
    );
    return;
  }

  try {
    await deleteLeagueById(leagueId);
  } catch (error) {
    LOGGER.error(`❌ Failed to delete league ${leagueId}:`, error);
    process.exit(1);
  }
}
