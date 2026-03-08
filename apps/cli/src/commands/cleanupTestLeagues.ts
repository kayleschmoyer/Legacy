import { LOGGER } from '@legacy-sports/logging';
import { CommandArgs } from '../utils/loadEnvFile';
import { AuthMiddleware } from '../services/AuthMiddleware';

export interface CleanupTestLeaguesArgs extends CommandArgs {
  dryRun?: boolean;
  all?: boolean;
  pattern?: string;
  yes?: boolean;
}

/**
 * Well-known name prefixes produced by e2e / integration / CLI test-workflow
 * runs. Any league whose name starts with one of these is considered a test
 * league and eligible for cleanup.
 */
const DEFAULT_TEST_PATTERNS = [
  'Test League',
  'Live Draft E2E',
  'UI E2E Season',
  'Integration Season Test League',
];

interface LeagueSummary {
  id: number;
  name: string;
  draftStatus: string;
}

/**
 * Fetch all leagues the authenticated user belongs to.
 */
async function fetchUserLeagues(
  auth: AuthMiddleware,
  userEmail: string,
): Promise<LeagueSummary[]> {
  const query = `
    query UserLeagues {
      userLeagues {
        id
        name
        draftStatus
      }
    }
  `;

  const response = await auth.makeAuthenticatedRequest(auth.getGraphQLUrl(), {
    method: 'POST',
    body: JSON.stringify({ query }),
    userEmail,
  });

  const body = (await response.json()) as {
    data?: { userLeagues?: LeagueSummary[] };
    errors?: Array<{ message: string }>;
  };

  if (body.errors?.length) {
    throw new Error(
      `GraphQL error: ${body.errors.map((e) => e.message).join(', ')}`,
    );
  }

  return body.data?.userLeagues ?? [];
}

/**
 * Delete a single league by ID via the `deleteLeague` mutation.
 */
async function deleteLeague(
  auth: AuthMiddleware,
  userEmail: string,
  leagueId: number,
): Promise<string> {
  const mutation = `
    mutation DeleteLeague($leagueId: Int!) {
      deleteLeague(leagueId: $leagueId)
    }
  `;

  const response = await auth.makeAuthenticatedRequest(auth.getGraphQLUrl(), {
    method: 'POST',
    body: JSON.stringify({ query: mutation, variables: { leagueId } }),
    userEmail,
  });

  const body = (await response.json()) as {
    data?: { deleteLeague?: string };
    errors?: Array<{ message: string }>;
  };

  if (body.errors?.length) {
    throw new Error(
      `Failed to delete league ${leagueId}: ${body.errors.map((e) => e.message).join(', ')}`,
    );
  }

  return body.data?.deleteLeague ?? 'deleted';
}

/**
 * Returns true if the league name matches any of the well-known test patterns
 * or a user-supplied regex pattern.
 */
function isTestLeague(
  name: string,
  customPattern: string | undefined,
): boolean {
  if (customPattern) {
    return new RegExp(customPattern, 'i').test(name);
  }
  return DEFAULT_TEST_PATTERNS.some((prefix) => name.startsWith(prefix));
}

/**
 * CLI handler: list and bulk-delete test leagues created by e2e / integration
 * tests and the CLI test-workflow command.
 */
export async function handleCleanupTestLeagues(
  args: CleanupTestLeaguesArgs,
): Promise<void> {
  const { dryRun, all, pattern, yes } = args;

  const auth = new AuthMiddleware();
  const currentUser = await auth.getCurrentUser();
  if (!currentUser) {
    LOGGER.error(
      '❌ Authentication required. Run "cli auth login" to authenticate.',
    );
    return;
  }

  LOGGER.info(`🔐 Authenticated as: ${currentUser.email}`);

  // ── Fetch leagues ─────────────────────────────────────────────────────
  LOGGER.info('\n🔍 Fetching your leagues...');
  const leagues = await fetchUserLeagues(auth, currentUser.email);

  if (leagues.length === 0) {
    LOGGER.info('✅ No leagues found — nothing to clean up.');
    return;
  }

  LOGGER.info(`📋 Found ${leagues.length} total league(s)\n`);

  // ── Filter ────────────────────────────────────────────────────────────
  const targets = all
    ? leagues
    : leagues.filter((l) => isTestLeague(l.name, pattern));

  if (targets.length === 0) {
    LOGGER.info('✅ No test leagues matched — nothing to clean up.');
    LOGGER.info(
      '💡 Use --all to target every league, or --pattern <regex> for a custom filter.',
    );
    return;
  }

  // ── Preview ───────────────────────────────────────────────────────────
  LOGGER.info(
    `🗑️  ${targets.length} league(s) targeted for deletion${dryRun ? ' (dry run)' : ''}:\n`,
  );
  for (const league of targets) {
    LOGGER.info(
      `   • [${league.id}] ${league.name}  (draft: ${league.draftStatus})`,
    );
  }
  LOGGER.info('');

  if (dryRun) {
    LOGGER.info(
      '🏁 Dry run complete — no leagues were deleted. Remove --dry-run to execute.',
    );
    return;
  }

  // ── Safety prompt (skip with --yes) ───────────────────────────────────
  if (!yes) {
    LOGGER.info(
      '⚠️  Pass --yes to confirm deletion. Re-run with --yes to proceed.',
    );
    return;
  }

  // ── Delete ────────────────────────────────────────────────────────────
  let deleted = 0;
  let failed = 0;

  for (const league of targets) {
    try {
      const msg = await deleteLeague(auth, currentUser.email, league.id);
      LOGGER.info(`   ✅ Deleted [${league.id}] ${league.name} — ${msg}`);
      deleted++;
    } catch (error) {
      LOGGER.error(
        `   ❌ Failed [${league.id}] ${league.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
      failed++;
    }
  }

  LOGGER.info(
    `\n🏁 Cleanup complete: ${deleted} deleted, ${failed} failed, ${leagues.length - targets.length} skipped.`,
  );
}
