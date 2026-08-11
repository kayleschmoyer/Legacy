import type { FullConfig } from '@playwright/test';
// Importing LOGGER from @legacy-sports/logging transitively pulls
// @legacy-sports/env-utilities into the typecheck graph (via Logger.ts).
// Both path mappings must stay in apps/web-e2e/tsconfig.json — removing the
// env-utilities entry causes tsc to fail with TS2307 (LS-4442).
import { LOGGER } from '@legacy-sports/logging';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  ACTIVE_RUN_LOCK_STALE_MS,
  isActiveRunLockFresh,
  isTestLeague,
  isYoungerThanCleanupThreshold,
  listIntegrationSpecSlugs,
  resolveShardIdentity,
  writeActiveRunLock,
} from './test-league-cleanup';
import {
  getSpecUserJwt,
  getTestUserJwt,
  TEST_USERS,
} from '../utils/test-user-auth';
import { fetchWithBackoff } from '../utils/retry-with-backoff';

/**
 * Wall-clock budget for the per-spec commissioner sweep (LS-7704). Minting one
 * JWT per spec hits the oauth-proxy's per-IP login rate limit (5/60s), so the
 * sweep is throttled and bounded: it stops once this budget elapses rather than
 * blocking shard-1 startup indefinitely. The disk JWT cache (LS-5149) makes
 * steady-state runs cheap; leftover identities not reached this run are reaped
 * on a subsequent run.
 */
const PER_SPEC_SWEEP_BUDGET_MS = 90_000;

/** Spacing between per-spec commissioner mints to ease oauth-proxy throttling. */
const PER_SPEC_MINT_SPACING_MS = 250;

/**
 * Personas the per-spec fixtures authenticate as (`api` → MANAGER_1, `api2` →
 * MANAGER_2, `apiCommissioner` → COMMISSIONER — see `fixtures/api.ts`). These
 * are the identities pre-warmed by `warmPerSpecFixtureJwts` so the concurrent
 * test phase only ever reads the JWT cache.
 */
const PER_SPEC_FIXTURE_PERSONAS = [
  'MANAGER_1',
  'MANAGER_2',
  'COMMISSIONER',
] as const;

/**
 * Wall-clock budget for the per-spec fixture JWT pre-warm (LS-7866). Each
 * identity is a distinct oauth-proxy login against the shared per-IP rate limit
 * (5/60s), so warming the whole suite is paced by the backoff and bounded here;
 * any identity not reached falls back to the existing lazy (cached) mint.
 */
const PER_SPEC_WARM_BUDGET_MS = 5 * 60_000;

/**
 * Playwright global setup for integration tests.
 *
 * Always deletes test leagues owned by the authenticated test user before tests
 * run, so that successive runs never hit the free-tier league limit (max 3).
 *
 * Safety: before performing any deletions the resolved JWT is decoded and the
 * email claim is verified against known integration-test user patterns.  If
 * the token belongs to an unrecognised user (e.g. a developer's personal CLI
 * session) or is expired, cleanup is skipped to prevent accidental data loss.
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
  // Best-effort cleanup call: retries 429 + transient network errors with
  // exponential backoff honouring Retry-After (LS-7866), then returns undefined
  // on any persistent failure so a cleanup miss never throws out of globalSetup.
  try {
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
      { label: 'integration-setup gqlFetch' },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      LOGGER.error(
        `[integration setup] HTTP ${res.status}: ${body.slice(0, 200)}`,
      );
      return undefined;
    }
    const json = (await res.json()) as GqlResponse<T>;
    if (json.errors?.length) {
      LOGGER.error(
        `[integration setup] GraphQL error: ${json.errors[0].message}`,
      );
      return undefined;
    }
    return json.data;
  } catch (err) {
    LOGGER.error(
      `[integration setup] Network error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }
}

/**
 * Pre-warm every spec's per-spec fixture identities (MANAGER_1 / MANAGER_2 /
 * COMMISSIONER — LS-4940) into the shared disk JWT cache (LS-5149) BEFORE any
 * spec runs, so the test phase only ever reads the cache and never logs in
 * (LS-7866).
 *
 * Why this matters for concurrency: `warmTestUserJwtCache` above only mints the
 * four *base* personas, but the fixtures authenticate as per-spec identities
 * (`manager1-<hash>@…`), which are otherwise minted lazily on first use inside
 * each spec. With more than one worker on a runner, those lazy first-use logins
 * fire simultaneously and stampede the oauth-proxy login route (5/60s per IP).
 * Pre-minting them here — sequentially, paced by the shared Retry-After backoff,
 * to the /tmp disk cache every worker on this runner reads — decouples auth from
 * the concurrent test phase: tests can run simultaneously without re-minting.
 *
 * Gated on `workers > 1` by the caller: at the serial `workers=1` ceiling there
 * is no stampede to prevent, so the lazy path is left untouched and startup
 * pays nothing. JWTs live 24h (oauth-proxy `jwt.ts`), far longer than a full
 * suite, so a token warmed at startup never expires mid-run. Best-effort and
 * budget-bounded — any identity not reached falls back to lazy (cached) mint.
 */
async function warmPerSpecFixtureJwts(): Promise<void> {
  const slugs = listIntegrationSpecSlugs();
  if (slugs.length === 0) return;

  const personas = PER_SPEC_FIXTURE_PERSONAS.filter(
    (persona) => TEST_USERS[persona].password,
  );
  if (personas.length === 0) {
    LOGGER.info(
      '[integration setup] No persona passwords configured — skipping per-spec JWT pre-warm.',
    );
    return;
  }

  const start = Date.now();
  let warmed = 0;
  let attempted = 0;
  for (const slug of slugs) {
    for (const persona of personas) {
      if (Date.now() - start > PER_SPEC_WARM_BUDGET_MS) {
        LOGGER.info(
          `[integration setup] Per-spec JWT pre-warm budget elapsed after ${warmed}/${attempted} identity(ies); remaining identities fall back to lazy (cached) mint.`,
        );
        return;
      }
      attempted++;
      try {
        await getSpecUserJwt(persona, slug);
        warmed++;
      } catch (err) {
        LOGGER.info(
          `[integration setup] Per-spec JWT pre-warm skipped ${persona}/${slug}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      await new Promise((r) => setTimeout(r, PER_SPEC_MINT_SPACING_MS));
    }
  }

  LOGGER.info(
    `[integration setup] Per-spec JWT pre-warm: cached ${warmed}/${attempted} fixture identity(ies) across ${slugs.length} spec(s).`,
  );
}

/**
 * Decode a JWT payload without verification (we only need the email claim for
 * the safety guard — the GraphQL server validates the signature).
 */
function decodeJwtEmail(jwt: string): string | undefined {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return undefined;
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf-8'),
    ) as { email?: string; exp?: number };
    return decoded.email;
  } catch {
    return undefined;
  }
}

function isJwtExpired(jwt: string): boolean {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return true;
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf-8'),
    ) as { exp?: number };
    if (!decoded.exp) return false;
    return decoded.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

/**
 * Email patterns that identify known integration-test users.  Any JWT whose
 * email does not match is treated as a personal developer token.
 */
const ALLOWED_TEST_EMAIL_PATTERNS = [/@test\.legacysports\.dev$/];

function isAllowedTestUser(email: string): boolean {
  return ALLOWED_TEST_EMAIL_PATTERNS.some((re) => re.test(email));
}

/**
 * Mint each test user's JWT once before specs start so worker processes hit
 * the disk cache instead of stampeding the oauth-proxy's per-IP rate limit
 * (LS-5149). Runs sequentially with 200 ms spacing — well under the 5/60s
 * AUTH_RATE_LIMIT in lambdas/oauth-proxy. Best-effort: if a mint fails,
 * specs fall through to the existing login/register retry path.
 */
async function warmTestUserJwtCache(): Promise<void> {
  const users: Array<[string, (typeof TEST_USERS)[keyof typeof TEST_USERS]]> = [
    ['COMMISSIONER', TEST_USERS.COMMISSIONER],
    ['MANAGER_1', TEST_USERS.MANAGER_1],
    ['MANAGER_2', TEST_USERS.MANAGER_2],
    ['MANAGER_3', TEST_USERS.MANAGER_3],
  ];
  for (const [name, creds] of users) {
    if (!creds.email || !creds.password) {
      LOGGER.warn(
        `[integration-globalsetup] skipping ${name}: credentials not set`,
      );
      continue;
    }
    try {
      await getTestUserJwt(creds);
      LOGGER.info(`[integration-globalsetup] minted JWT for ${creds.email}`);
    } catch (err) {
      LOGGER.error(
        `[integration-globalsetup] failed to mint JWT for ${creds.email}`,
        err instanceof Error ? err : new Error(String(err)),
      );
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

/**
 * Delete stale, test-pattern-matched leagues owned (as far as `userLeagues`
 * is concerned) by `jwt`'s identity. Guards on token expiry and the
 * allowed-test-user email domain so a misconfigured or personal token can
 * never trigger deletions. Protects leagues younger than the 4h threshold
 * (likely in use by a concurrent run). Best-effort — never throws. Returns
 * the number of leagues deleted.
 *
 * `deleteJwt` defaults to `jwt` (the legacy owner-deletes-its-own-leagues
 * path). Pass a distinct admin identity when `jwt`'s leagues are ones it is
 * merely a *member* of rather than the owner of — `deleteLeague` only allows
 * the owner or an admin caller (LS-9280).
 */
async function sweepStaleTestLeaguesForJwt(
  jwt: string,
  label: string,
  deleteJwt: string = jwt,
): Promise<number> {
  if (isJwtExpired(jwt)) {
    LOGGER.warn(`[integration setup] ${label}: token expired — skipping.`);
    return 0;
  }
  const email = decodeJwtEmail(jwt);
  if (!email || !isAllowedTestUser(email)) {
    LOGGER.warn(
      `[integration setup] ${label}: token belongs to "${email ?? 'unknown'}" ` +
        'which is not a recognised integration test user — skipping to prevent ' +
        'accidental data loss.',
    );
    return 0;
  }

  const data = await gqlFetch<{
    userLeagues: Array<{ id: number; name: string }>;
  }>(jwt, 'query { userLeagues { id name } }');

  const leagues = data?.userLeagues;
  if (!leagues?.length) return 0;

  const matched = leagues.filter((l) => isTestLeague(l.name));
  if (matched.length === 0) return 0;

  // Protect leagues created within the last few hours: they may be owned by a
  // concurrent integration run on another branch (test users are shared across
  // runs). See MIN_LEAGUE_AGE_FOR_CLEANUP_MS for the rationale (LS-4442).
  const inFlight = matched.filter((l) => isYoungerThanCleanupThreshold(l.name));
  const targets = matched.filter((l) => !isYoungerThanCleanupThreshold(l.name));

  if (inFlight.length > 0) {
    LOGGER.info(
      `[integration setup] ${label}: skipping ${inFlight.length} young league(s) likely in active use.`,
    );
  }
  if (targets.length === 0) return 0;

  // Delete newest-first: `deleteLeague` does not cascade the `previousLeagueId`
  // lineage FK, so a renewed season-2 league (higher id) must be removed before
  // its frozen season-1 parent or the parent delete fails (LS-7704).
  targets.sort((a, b) => b.id - a.id);

  let deleted = 0;
  for (const league of targets) {
    const result = await gqlFetch<{ deleteLeague: string }>(
      deleteJwt,
      'mutation($leagueId: Int!) { deleteLeague(leagueId: $leagueId) }',
      { leagueId: league.id },
    );
    if (result?.deleteLeague) {
      deleted++;
    } else {
      // Best-effort cleanup miss: gqlFetch returns undefined (not an Error)
      // after logging the underlying GraphQL/HTTP failure internally, so there
      // is no Error instance to attach here. Use warn — this summary line is
      // informational, not a stack-trace-worthy failure (LS-7704).
      LOGGER.warn(
        `[integration setup] ${label}: failed to delete league ${league.id} (${league.name})`,
      );
    }
  }

  LOGGER.info(
    `[integration setup] ${label}: cleaned ${deleted}/${targets.length} stale test league(s).`,
  );
  return deleted;
}

/**
 * Sweep stale test leagues by MANAGER_1/2/3 *membership* rather than by
 * commissioner ownership (LS-9280, root-caused duplicate of LS-8915).
 *
 * `sweepPerSpecCommissioners` below reaches at most ~7 of the ~23 per-spec
 * COMMISSIONER identities each run (bounded by `PER_SPEC_SWEEP_BUDGET_MS`
 * against the oauth-proxy's 5/60s per-IP login limit), so leagues owned by
 * the other ~16 stay live. Those leagues still count against whichever
 * MANAGER persona joined them — and only 3 manager identities are shared
 * across every spec, so the manager's membership count, not the
 * commissioner-ownership sweep coverage, is the resource that actually runs
 * out first (18/24 specs failing on `joinLeagueByCode`'s 3-league cap even
 * though only ~30% of commissioner identities go unswept per run).
 *
 * This sweeps the resource that's exhausted directly: enumerate each of the
 * 3 base MANAGER personas' own memberships. That's 3 identities instead of
 * 23, all already warmed by `warmTestUserJwtCache` above — no additional
 * oauth-proxy logins, so this comfortably fits inside the existing sweep
 * budget. Managers never own the leagues they join (they're general_manager,
 * not commissioner, on every league this matches), so deletion goes through
 * the base COMMISSIONER identity — provisioned `access_level = 'admin'` in
 * the dev DB, which hits the `deleteLeague` isAdmin bypass instead of the
 * owner-only check. Best-effort — never throws.
 */
async function sweepStaleLeaguesByManagerMembership(
  commissionerJwt: string,
): Promise<void> {
  if (isJwtExpired(commissionerJwt)) {
    LOGGER.warn(
      '[integration setup] manager-membership sweep: commissioner token expired — skipping.',
    );
    return;
  }
  const commissionerEmail = decodeJwtEmail(commissionerJwt);
  if (!commissionerEmail || !isAllowedTestUser(commissionerEmail)) {
    LOGGER.warn(
      `[integration setup] manager-membership sweep: commissioner token belongs to ` +
        `"${commissionerEmail ?? 'unknown'}" which is not a recognised integration ` +
        'test user — skipping to prevent an unscoped admin-delete of unknown leagues.',
    );
    return;
  }

  for (const persona of ['MANAGER_1', 'MANAGER_2', 'MANAGER_3'] as const) {
    const creds = TEST_USERS[persona];
    if (!creds.email || !creds.password) {
      LOGGER.info(
        `[integration setup] manager-membership sweep: no credentials configured for ` +
          `${persona} — skipping.`,
      );
      continue;
    }
    try {
      const managerJwt = await getTestUserJwt(creds);
      await sweepStaleTestLeaguesForJwt(
        managerJwt,
        `manager-membership ${persona}`,
        commissionerJwt,
      );
    } catch (err) {
      LOGGER.info(
        `[integration setup] manager-membership sweep skipped ${persona}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

/**
 * Pre-flight quota check (LS-9280, carrying over LS-8915's third AC): after
 * the manager-membership sweep, read each MANAGER persona's true league count
 * (`userLeagueCount` — unlike `userLeagues`, this is not subject to the
 * 50-per-page default, LS-9101) and log loudly if any persona is still at or
 * above the free-tier cap. A quota exhaustion that survives the sweep is an
 * environment/infra condition, not a code regression — this makes that
 * legible to whoever triages the next red run instead of leaving them to
 * rediscover LS-9280 from scratch. Best-effort — never throws, so a read
 * failure here can never block the suite.
 */
const FREE_TIER_LEAGUE_CAP = 3;

async function preflightCheckManagerQuota(): Promise<void> {
  for (const persona of ['MANAGER_1', 'MANAGER_2', 'MANAGER_3'] as const) {
    const creds = TEST_USERS[persona];
    if (!creds.email || !creds.password) continue;
    try {
      const managerJwt = await getTestUserJwt(creds);
      if (isJwtExpired(managerJwt)) continue;
      const data = await gqlFetch<{ userLeagueCount: number }>(
        managerJwt,
        'query { userLeagueCount }',
      );
      const total = data?.userLeagueCount;
      if (typeof total === 'number' && total >= FREE_TIER_LEAGUE_CAP) {
        LOGGER.error(
          `[integration setup] pre-flight: manager persona ${persona} is at ` +
            `${total}/${FREE_TIER_LEAGUE_CAP} leagues after the manager-membership ` +
            'sweep — the free-tier league cap will fail joinLeagueByCode for every ' +
            'spec using this persona. This is a shared-environment quota condition ' +
            '(LS-9280/LS-8915), not a code regression in the current run.',
        );
      }
    } catch (err) {
      LOGGER.info(
        `[integration setup] pre-flight quota check skipped ${persona}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

/**
 * Sweep stale leagues for every spec's per-spec commissioner identity
 * (`commissioner-<hash>@test.legacysports.dev`, LS-4940). The base-commissioner
 * sweep never reached these identities, so leagues leaked by a spec accumulated
 * there until the next run tripped the 3-league limit (LS-7704).
 *
 * Minting one JWT per spec stresses the oauth-proxy's per-IP login rate limit
 * (5/60s), so this pass is throttled (`PER_SPEC_MINT_SPACING_MS`) and bounded by
 * a wall-clock budget (`PER_SPEC_SWEEP_BUDGET_MS`): identities not reached this
 * run are reaped on a later run, and the disk JWT cache (LS-5149) makes
 * steady-state runs cheap. Best-effort — individual mint/sweep failures are
 * logged and skipped, never thrown.
 */
async function sweepPerSpecCommissioners(): Promise<void> {
  const slugs = listIntegrationSpecSlugs();
  if (slugs.length === 0) return;
  if (!TEST_USERS.COMMISSIONER.password) {
    LOGGER.info(
      '[integration setup] No commissioner password configured — skipping per-spec sweep.',
    );
    return;
  }

  const start = Date.now();
  let totalDeleted = 0;
  let swept = 0;
  for (const slug of slugs) {
    if (Date.now() - start > PER_SPEC_SWEEP_BUDGET_MS) {
      LOGGER.info(
        `[integration setup] Per-spec sweep budget elapsed after ${swept}/${slugs.length} spec(s); remaining identities will be reaped next run.`,
      );
      break;
    }
    try {
      const jwt = await getSpecUserJwt('COMMISSIONER', slug);
      totalDeleted += await sweepStaleTestLeaguesForJwt(
        jwt,
        `per-spec ${slug}`,
      );
    } catch (err) {
      LOGGER.info(
        `[integration setup] Per-spec sweep skipped ${slug}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    swept++;
    await new Promise((r) => setTimeout(r, PER_SPEC_MINT_SPACING_MS));
  }

  LOGGER.info(
    `[integration setup] Per-spec sweep cleaned ${totalDeleted} league(s) across ${swept} spec identity(ies).`,
  );
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  // In sharded CI runs, only the first shard runs pre-test cleanup. Shards
  // 2+ skipping here prevents them from deleting leagues that shard 1's tests
  // are actively using (LS-4391). Mirrors the guard in global-teardown.ts
  // (LS-4318) which already skips teardown entirely when sharding is active.
  // Shard identity comes from INTEGRATION_SHARD_CURRENT/TOTAL under the
  // weighted-balance partition (LS-7845), falling back to config.shard.
  const shard = resolveShardIdentity(config);
  if (shard && shard.current !== 1) {
    LOGGER.info(
      `[integration setup] Shard ${shard.current}/${shard.total} — skipping pre-run cleanup (runs on shard 1 only).`,
    );
    return;
  }

  await warmTestUserJwtCache();

  // Pre-warm per-spec fixture identities only when the run is actually
  // concurrent (workers > 1). At the serial workers=1 ceiling the lazy
  // (cached) mint path is sufficient and startup pays nothing (LS-7866).
  if (config.workers > 1) {
    LOGGER.info(
      `[integration setup] workers=${config.workers} — pre-warming per-spec fixture JWTs for concurrent execution.`,
    );
    await warmPerSpecFixtureJwts();
  }

  const jwt = await getAuthJwt();
  if (!jwt) {
    LOGGER.info(
      '[integration setup] No auth token available — skipping pre-run league cleanup.',
    );
    return;
  }

  // Active-run sentinel — file-based lockfile (LS-4539). Aborts the sweep if
  // another Playwright process on this machine started within the last few
  // minutes. Stale locks (older than `ACTIVE_RUN_LOCK_STALE_MS`) are ignored
  // so a crashed previous run cannot block crash recovery indefinitely. Cross-
  // machine concurrency is still protected by the per-league 4h age guard;
  // the lockfile is an extra layer for same-machine reruns.
  if (isActiveRunLockFresh()) {
    LOGGER.warn(
      `[integration setup] Active-run lockfile is fresh (<${
        ACTIVE_RUN_LOCK_STALE_MS / 60_000
      } min old) — another integration process may be running on this host; ` +
        `skipping the entire pre-run sweep.`,
    );
    return;
  }
  writeActiveRunLock();

  // Sweep the base commissioner (legacy single-user path) and then every
  // per-spec commissioner identity (LS-7704). Each call is independently
  // guarded and best-effort.
  await sweepStaleTestLeaguesForJwt(jwt, 'base commissioner');
  await sweepPerSpecCommissioners();

  // Sweep by manager membership (LS-9280) — the resource the per-spec
  // commissioner sweep above cannot fully reach within its budget. Mint the
  // base COMMISSIONER identity explicitly (not the resolved `jwt` above,
  // which may be a local CLI/env override) since the admin bypass this
  // depends on is specific to that identity. Already warmed by
  // `warmTestUserJwtCache`, so this is a disk-cache hit, not a new login.
  if (TEST_USERS.COMMISSIONER.password) {
    try {
      const commissionerJwt = await getTestUserJwt(TEST_USERS.COMMISSIONER);
      await sweepStaleLeaguesByManagerMembership(commissionerJwt);
    } catch (err) {
      LOGGER.info(
        `[integration setup] manager-membership sweep skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  await preflightCheckManagerQuota();
}
