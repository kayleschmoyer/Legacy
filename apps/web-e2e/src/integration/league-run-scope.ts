/**
 * Per-run league namespacing for the live-backend integration + shared-live
 * suites (LS-10330).
 *
 * Every run that touches the shared dev backend authenticates as the same
 * pool of test users, so every run sees every other run's leagues. The
 * pre-run / end-of-run sweeps used to decide what to delete purely from the
 * `E2E <timestamp>` marker plus a 4h age guard. That guard is a heuristic:
 * anything it misclassifies — or any name that carries no parseable
 * timestamp — is deleted out from under a concurrent run mid-test (the
 * `updateDraftSettings` INTERNAL_SERVER_ERROR on an already-deleted league in
 * LS-10330's evidence).
 *
 * This module stamps each league name with a *run tag* so cleanup can reason
 * about ownership instead of age alone:
 *
 *   `<Label> E2E <runTag> <unix-ms>`     e.g. `Settings E2E r36685892280 1727683200000`
 *
 * - In CI the tag is derived from `INTEGRATION_RUN_ID` (set by the workflows
 *   to `github.run_id`) **plus a per-job key** (`s<N>` for integration shard N,
 *   `INTEGRATION_JOB_KEY` — e.g. `sl` for the shared-live job — otherwise), so
 *   every live-backend job gets its own tag and two overlapping runs never
 *   share one. The tag must be per *job*, not per run: cleanup treats "my tag"
 *   as "nothing else can be using this league", and the integration shards and
 *   the shared-live job of one run execute concurrently. When they shared one
 *   run-wide tag (LS-10330 → LS-11054), shard 1's global-setup and the
 *   shared-live job's setup + teardown deleted the live-draft league shard 2
 *   was mid-draft in (run 38084841194).
 *   A `run_attempt` retry of a job reproduces that job's tag, so the retry's
 *   pre-run sweep still reclaims the dead attempt's leftovers.
 * - Locally the tag is generated once per Playwright process (`l<base36>`) in
 *   `globalSetup`, published back into `process.env` so worker processes
 *   inherit it.
 *
 * Kept free of `fs`/`path` so spec files and the dual-mode `test-data.ts`
 * fixture can import it without dragging node-only cleanup plumbing along.
 */

export const INTEGRATION_RUN_ID_ENV = 'INTEGRATION_RUN_ID';

/**
 * Optional explicit job discriminator for CI jobs that are not integration
 * shards but still run live-backend specs concurrently with them (the
 * `shared-live` job sets `sl`). Integration shards don't need it — their key is
 * derived from `INTEGRATION_SHARD_CURRENT`.
 */
export const INTEGRATION_JOB_KEY_ENV = 'INTEGRATION_JOB_KEY';

/** Longest job key kept, so the run-id part keeps most of the tag budget. */
const MAX_JOB_KEY_LENGTH = 3;

/** Server-side cap enforced by `createLeagueAndTeams` (leagues/mutations.ts). */
export const MAX_LEAGUE_NAME_LENGTH = 50;

/**
 * Run tag grammar: a one-letter source prefix (`r` = CI run id, `l` = local
 * process) followed by lowercase base36. Kept short because the tag competes
 * with the label and the 13-digit timestamp for the 50-character league-name
 * budget.
 */
const RUN_TAG_RE = /^[rl][0-9a-z]{1,11}$/;

/** `<Label> E2E <runTag> <13-digit unix ms>` — the tag is capture group 1. */
const TAGGED_NAME_RE = /\bE2E\s+([rl][0-9a-z]{1,11})\s+\d{13}\s*$/;

function sanitizeRunId(raw: string): string {
  return raw.toLowerCase().replace(/[^0-9a-z]/g, '');
}

/**
 * Per-job key folded into a CI run tag: the explicit `INTEGRATION_JOB_KEY`
 * when set, else `s<N>` for a sharded integration job (shard N of >1), else
 * `''` (a single live-backend job owns the whole run).
 */
export function resolveJobKey(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = sanitizeRunId(env[INTEGRATION_JOB_KEY_ENV] ?? '');
  if (explicit.length > 0) return explicit.slice(0, MAX_JOB_KEY_LENGTH);
  const current = Number(env.INTEGRATION_SHARD_CURRENT);
  const total = Number(env.INTEGRATION_SHARD_TOTAL);
  if (
    Number.isInteger(current) &&
    Number.isInteger(total) &&
    total > 1 &&
    current >= 1 &&
    current <= total
  ) {
    return `s${current}`.slice(0, MAX_JOB_KEY_LENGTH);
  }
  return '';
}

/**
 * Build the run tag for a raw run id and job key. CI passes the numeric
 * `github.run_id`, which is re-encoded as base36 (11 decimal digits → 7-8
 * chars) to leave room for the job key; anything else (a developer exporting
 * a custom id) is normalised to base36 characters. The id part is truncated so
 * the job key always survives and the name budget still holds.
 */
export function runTagFromRunId(rawRunId: string, jobKey = ''): string {
  const cleaned = sanitizeRunId(rawRunId);
  if (cleaned.length === 0) {
    throw new Error(
      `${INTEGRATION_RUN_ID_ENV} must contain at least one alphanumeric character (got ${JSON.stringify(rawRunId)})`,
    );
  }
  // Digit strings up to 15 long stay exact as a double (< 2^53).
  const idPart = /^\d{1,15}$/.test(cleaned)
    ? Number(cleaned).toString(36)
    : cleaned;
  const key = sanitizeRunId(jobKey).slice(0, MAX_JOB_KEY_LENGTH);
  return `r${idPart.slice(0, 11 - key.length)}${key}`;
}

/** Fresh local tag: `l` + base36 timestamp (8 chars today) + 2 random chars. */
export function generateLocalRunTag(now: number = Date.now()): string {
  const rand = Math.floor(Math.random() * 36 * 36)
    .toString(36)
    .padStart(2, '0');
  return `l${now.toString(36)}${rand}`;
}

let cachedRunTag: string | undefined;

/**
 * Resolve this process's run tag. Order: memoised value → `INTEGRATION_RUN_ID`
 * env (+ the per-job key, see `resolveJobKey`) → freshly generated local tag. The resolved tag is written back to
 * `process.env.INTEGRATION_RUN_ID` so Playwright worker processes forked after
 * `globalSetup` see the same value (Playwright propagates env mutations made
 * in `globalSetup` to workers).
 */
export function resolveRunTag(env: NodeJS.ProcessEnv = process.env): string {
  if (cachedRunTag) return cachedRunTag;
  const raw = env[INTEGRATION_RUN_ID_ENV]?.trim();
  const tag =
    raw && raw.length > 0
      ? RUN_TAG_RE.test(raw)
        ? raw
        : runTagFromRunId(raw, resolveJobKey(env))
      : generateLocalRunTag();
  env[INTEGRATION_RUN_ID_ENV] = tag;
  cachedRunTag = tag;
  return tag;
}

/** Test-only: forget the memoised tag so the next resolve re-reads env. */
export function resetRunTagCacheForTests(): void {
  cachedRunTag = undefined;
}

/**
 * Compose a sweep-eligible, run-scoped league name.
 *
 * Throws when the result would exceed the server's 50-character cap so a
 * too-long label fails at the call site with a clear message instead of as an
 * opaque `createLeagueAndTeams` validation error 45 s later.
 */
export function testLeagueName(
  label: string,
  options: { now?: number; runTag?: string } = {},
): string {
  const now = options.now ?? Date.now();
  const runTag = options.runTag ?? resolveRunTag();
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    throw new Error('testLeagueName: label must be non-empty');
  }
  const name = `${trimmed} E2E ${runTag} ${now}`;
  if (name.length > MAX_LEAGUE_NAME_LENGTH) {
    throw new Error(
      `testLeagueName: "${name}" is ${name.length} chars; the server caps league names at ${MAX_LEAGUE_NAME_LENGTH}. Shorten the label "${trimmed}" (max ${
        MAX_LEAGUE_NAME_LENGTH - (name.length - trimmed.length)
      } chars with this run tag).`,
    );
  }
  return name;
}

/** The run tag embedded in a league name, or `undefined` for untagged names. */
export function extractRunTag(name: string): string | undefined {
  return TAGGED_NAME_RE.exec(name)?.[1];
}

/** True when `name` carries `runTag` — i.e. this job of this run created it. */
export function belongsToRun(name: string, runTag: string): boolean {
  return extractRunTag(name) === runTag;
}
