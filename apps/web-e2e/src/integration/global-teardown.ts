import type { FullConfig } from '@playwright/test';
import { LOGGER } from '@legacy-sports/logging';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  isTestLeague,
  isYoungerThanCleanupThreshold,
} from './test-league-cleanup';
import { getTestUserJwt, TEST_USERS } from '../utils/test-user-auth';

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
    const res = await fetch(GQL_BASE + 'graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
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
  // In sharded CI runs, multiple Playwright processes share the same
  // commissioner test user. The fastest shard finishing first would call
  // userLeagues, see leagues created by slower shards still mid-test, and
  // delete them — yanking the league row out from under an in-flight test
  // (LS-4318). Skip teardown in that case; the next run's globalSetup
  // deletes any leagues left behind, so accumulation is bounded.
  if (config.shard) return;
  // Always run cleanup after integration tests to prevent league accumulation
  // across runs. Previously gated by INTEGRATION_TEARDOWN=true, but skipping
  // cleanup was the root cause of free-tier league limit failures (LS-1502).
  const jwt = await getAuthJwt();
  if (!jwt) {
    LOGGER.info(
      '[integration teardown] No auth token available — skipping league cleanup.',
    );
    return;
  }

  const data = await gqlFetch<{
    userLeagues: Array<{ id: number; name: string }>;
  }>(jwt, 'query { userLeagues { id name } }');

  const leagues = data?.userLeagues;
  if (!leagues?.length) {
    LOGGER.info('[integration teardown] No leagues to clean up.');
    return;
  }

  const matched = leagues.filter((l) => isTestLeague(l.name));
  if (matched.length === 0) {
    LOGGER.info(
      `[integration teardown] ${leagues.length} league(s) found but none matched test patterns — skipping.`,
    );
    return;
  }

  // Protect leagues created within the last few hours: they may be owned by a
  // concurrent integration run on another branch (the commissioner test user
  // is shared). See MIN_LEAGUE_AGE_FOR_CLEANUP_MS for the rationale (LS-4442).
  const inFlight = matched.filter((l) => isYoungerThanCleanupThreshold(l.name));
  const targets = matched.filter((l) => !isYoungerThanCleanupThreshold(l.name));

  if (inFlight.length > 0) {
    LOGGER.info(
      `[integration teardown] Skipping ${inFlight.length} young league(s) likely in active use by concurrent run(s): ${inFlight
        .map((l) => l.name)
        .join(', ')}`,
    );
  }

  if (targets.length === 0) {
    LOGGER.info(
      `[integration teardown] No stale test leagues to delete — done.`,
    );
    return;
  }

  LOGGER.info(
    `[integration teardown] Deleting ${targets.length} test league(s)...`,
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
}
