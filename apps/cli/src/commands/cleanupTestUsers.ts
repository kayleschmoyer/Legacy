import { LOGGER } from '@legacy-sports/logging';
import { CommandArgs } from '../utils/loadEnvFile';
import { AuthMiddleware } from '../services/AuthMiddleware';

export interface CleanupTestUsersArgs extends CommandArgs {
  dryRun?: boolean;
  minAgeDays?: number;
  yes?: boolean;
}

interface CleanupResult {
  matched: number;
  deleted: number;
  dryRun: boolean;
  minAgeDays: number;
  sampleEmails: string[];
  errors: string[];
}

async function callCleanupMutation(
  auth: AuthMiddleware,
  userEmail: string,
  dryRun: boolean,
  minAgeDays: number | undefined,
): Promise<CleanupResult> {
  const mutation = `
    mutation CleanupLeakedTestUsers($dryRun: Boolean!, $minAgeDays: Int) {
      cleanupLeakedTestUsers(dryRun: $dryRun, minAgeDays: $minAgeDays) {
        matched
        deleted
        dryRun
        minAgeDays
        sampleEmails
        errors
      }
    }
  `;

  const response = await auth.makeAuthenticatedRequest(auth.getGraphQLUrl(), {
    method: 'POST',
    body: JSON.stringify({
      query: mutation,
      variables: { dryRun, minAgeDays: minAgeDays ?? null },
    }),
    userEmail,
  });

  const body = (await response.json()) as {
    data?: { cleanupLeakedTestUsers?: CleanupResult };
    errors?: Array<{ message: string }>;
  };

  if (body.errors?.length) {
    throw new Error(
      `GraphQL error: ${body.errors.map((e) => e.message).join(', ')}`,
    );
  }
  if (!body.data?.cleanupLeakedTestUsers) {
    throw new Error('Empty response from cleanupLeakedTestUsers mutation');
  }
  return body.data.cleanupLeakedTestUsers;
}

/**
 * CLI handler: bulk-delete leaked `int-*@test.legacysports.dev` test users
 * (LS-4917). Requires the authenticated CLI user to have admin access.
 */
export async function handleCleanupTestUsers(
  args: CleanupTestUsersArgs,
): Promise<void> {
  const { dryRun, minAgeDays, yes } = args;

  const auth = new AuthMiddleware();
  const currentUser = await auth.getCurrentUser();
  if (!currentUser) {
    LOGGER.error(
      '❌ Authentication required. Run "cli auth login" to authenticate.',
    );
    return;
  }

  LOGGER.info(`🔐 Authenticated as: ${currentUser.email}`);

  // Preview the match set first regardless of the caller's intent so we never
  // delete without showing what would go. If --dry-run was requested, that's
  // also the only call we make.
  const preview = await callCleanupMutation(
    auth,
    currentUser.email,
    true,
    minAgeDays,
  );

  if (preview.matched === 0) {
    LOGGER.info(
      `✅ No leaked test users older than ${preview.minAgeDays} day(s) — nothing to clean up.`,
    );
    return;
  }

  LOGGER.info(
    `🗑️  ${preview.matched} leaked test user(s) eligible for deletion (older than ${preview.minAgeDays} days):\n`,
  );
  for (const email of preview.sampleEmails) {
    LOGGER.info(`   • ${email}`);
  }
  if (preview.matched > preview.sampleEmails.length) {
    LOGGER.info(
      `   … and ${preview.matched - preview.sampleEmails.length} more.\n`,
    );
  }

  if (dryRun) {
    LOGGER.info(
      '🏁 Dry run complete — no users were deleted. Remove --dry-run to execute.',
    );
    return;
  }

  if (!yes) {
    LOGGER.info(
      '\n⚠️  Pass --yes to confirm deletion. Re-run with --yes to proceed.',
    );
    return;
  }

  const result = await callCleanupMutation(
    auth,
    currentUser.email,
    false,
    minAgeDays,
  );

  LOGGER.info(
    `\n🏁 Cleanup complete: ${result.deleted}/${result.matched} deleted, ${result.errors.length} failed.`,
  );
  if (result.errors.length > 0) {
    LOGGER.warn('Errors:');
    for (const e of result.errors) {
      LOGGER.warn(`   • ${e}`);
    }
  }
}
