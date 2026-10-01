import type { FullConfig } from '@playwright/test';
import { LOGGER } from '@legacy-sports/logging';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  clearActiveRunLock,
  isTestLeague,
  resolveRunTag,
  resolveShardIdentity,
  selectCleanupTargets,
} from './test-league-cleanup';
import { COLLECT_COVERAGE, mergeShardFragments } from '../fixtures/coverage';
import { getTestUserJwt, TEST_USERS } from '../utils/test-user-auth';
import { fetchWithBackoff } from '../utils/retry-with-backoff';

/**
 * Playwright global teardown for integration tests.
 *
 * Deletes all leagues owned by the authenticated test user so that successive
 * runs never hit the free-tier league limit.  Uses the same auth-resolution
 * logic as the test fixtures (env var → CLI auth store → local register).
 *
 * Only runs when the `INTEGRATION_TEARDOWN` env var is set to `"true"`,
 * preventing accidental deletion outside of integration test runs.
 */

interface CliAuthData {
  tokens: Record<string, { jwt: string; expiresAt: number; email: string }>;
  defaultUser: string;
}

interface GqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

const GQL_BASE = (
  process.env.INTEGRATION_BASE_URL ?? 'https://api.legacy-fantasy.com/'
).replace(/\/?$/, '/');

async function getAuthJwt(): Promise<string | undefined> {
  if (process.env.INTEGRATION_JWT_COMMISSIONER) {
    return process.env.INTEGRATION_JWT_COMMISSIONER;
  }
  if (process.env.INTEGRATION_JWT) {
    return process.env.INTEGRATION_JWT;
  }

  const authPath = path.join(os.homedir(), '.legacy-sports', 'auth.json');
  if (fs.existsSync(authPath)) {
    try {
      const data = JSON.parse(
        fs.readFileSync(authPath, 'utf-8'),
      ) as CliAuthData;
      const user = data.defaultUser;
      const entry = user ? data.tokens[user] : undefined;
      if (entry?.jwt && (!entry.expiresAt || entry.expiresAt >= Date.now())) {
        return entry.jwt;
      }
    } catch {
      // Ignore parse errors — fall through to test user auth
    }
  }

  // No CLI auth or env var — register/login a test commissioner via local auth
  try {
    return await getTestUserJwt(TEST_USERS.COMMISSIONER);
  } catch {
    return undefined;
  }
}

async function gqlFetch<T>(
  jwt: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T | undefined> {
  try {
    // Best-effort cleanup: retry 429 + transient network errors with backoff
    // honouring Retry-After (LS-7866) so a throttle never strands leagues.
    const res = await fetchWithBackoff(
      GQL_BASE + 'graphql',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      },
      { label: 'integration-teardown gqlFetch' },
    );
    const json = (await res.json()) as GqlResponse<T>;
    if (json.errors?.length) {
      LOGGER.error(
        `[integration teardown] GraphQL error: ${json.errors[0].message}`,
      );
      return undefined;
    }
    return json.data;
  } catch (err) {
    LOGGER.error(
      `[integration teardown] Network error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }
}

export default async function globalTeardown(
  config: FullConfig,
): Promise<void> {
  // Merge this shard's per-test coverage fragments first, before any early
  // return below (the nightly integration run is sharded, so the league-cleanup
  // logic returns early on each shard). Gated on COLLECT_COVERAGE — a no-op in
  // PR CI / local runs. See apps/web-e2e/src/fixtures/coverage.ts (LS-7849).
  if (COLLECT_COVERAGE) {
    const { specs, files } = mergeShardFragments();
    LOGGER.info(
      `[integration teardown] Coverage fragment: ${specs} spec(s), ${files} file ref(s).`,
    );
  }

  // In sharded CI runs, multiple Playwright processes share the same
  // commissioner test user. The fastest shard finishing first would call
  // userLeagues, see leagues created by slower shards still mid-test, and
  // delete them — yanking the league row out from under an in-flight test
  // (LS-4318). Skip teardown in that case; the next run's globalSetup
  // deletes any leagues left behind, so accumulation is bounded. Shard
  // identity comes from INTEGRATION_SHARD_CURRENT/TOTAL under the
  // weighted-balance partition (LS-7845), falling back to config.shard.
  if (resolveShardIdentity(config)) {
    // Still clear the active-run lock so the next single-process run can
    // sweep — the shard-skip rule only applies to *this* sweep, not to
    // future ones.
    clearActiveRunLock();
    return;
  }
  // Always run cleanup after integration tests to prevent league accumulation
  // across runs. Previously gated by INTEGRATION_TEARDOWN=true, but skipping
  // cleanup was the root cause of free-tier league limit failures (LS-1502).
  const jwt = await getAuthJwt();
  if (!jwt) {
    LOGGER.info(
      '[integration teardown] No auth token available — skipping league cleanup.',
    );
    clearActiveRunLock();
    return;
  }

  const data = await gqlFetch<{
    userLeagues: Array<{ id: number; name: string }>;
  }>(jwt, 'query { userLeagues { id name } }');

  const leagues = data?.userLeagues;
  if (!leagues?.length) {
    LOGGER.info('[integration teardown] No leagues to clean up.');
    clearActiveRunLock();
    return;
  }

  if (!leagues.some((l) => isTestLeague(l.name))) {
    LOGGER.info(
      `[integration teardown] ${leagues.length} league(s) found but none matched test patterns — skipping.`,
    );
    clearActiveRunLock();
    return;
  }

  // Run-scoped selection (LS-10330): everything this run created is reclaimed
  // immediately (the run is over), while another run's young leagues are left
  // alone — the commissioner test user is shared, so they are that run's live
  // fixtures. See MIN_LEAGUE_AGE_FOR_CLEANUP_MS for the age guard (LS-4442).
  const runTag = resolveRunTag();
  const { targets, inFlight } = selectCleanupTargets(leagues, { runTag });

  if (inFlight.length > 0) {
    LOGGER.info(
      `[integration teardown] Skipping ${inFlight.length} young league(s) owned by other run(s) likely still in flight: ${inFlight
        .map((l) => l.name)
        .join(', ')}`,
    );
  }

  if (targets.length === 0) {
    LOGGER.info(
      `[integration teardown] No test leagues to delete (run ${runTag}) — done.`,
    );
    clearActiveRunLock();
    return;
  }

  // Delete newest-first: `deleteLeague` does not cascade the `previousLeagueId`
  // lineage FK, so a renewed season-2 league (higher id) must be removed before
  // its frozen season-1 parent or the parent delete fails (LS-7704).
  targets.sort((a, b) => b.id - a.id);

  LOGGER.info(
    `[integration teardown] Deleting ${targets.length} test league(s) (run ${runTag})...`,
  );

  let deleted = 0;
  for (const league of targets) {
    const result = await gqlFetch<{ deleteLeague: string }>(
      jwt,
      'mutation($leagueId: Int!) { deleteLeague(leagueId: $leagueId) }',
      { leagueId: league.id },
    );
    if (result?.deleteLeague) {
      deleted++;
    } else {
      LOGGER.error(
        `[integration teardown] Failed to delete league ${league.id} (${league.name})`,
      );
    }
  }

  LOGGER.info(
    `[integration teardown] Deleted ${deleted}/${targets.length} test league(s).`,
  );

  // Release the active-run sentinel last so a fresh integration process can
  // pick up sweeping immediately after this one exits cleanly.
  clearActiveRunLock();
}
