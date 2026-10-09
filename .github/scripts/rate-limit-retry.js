/**
 * rate-limit-retry.js — shared GitHub API rate-limit handling for status-posting
 * CI jobs (LS-10296; extracted from the Security Gate's inline helper, LS-9231).
 *
 * WHY: the CI GitHub App installation shares one hourly REST budget across every
 * workflow. When it is exhausted, a bare `github.rest.*` call throws
 * `HttpError: API rate limit exceeded for installation` (403) and the job dies
 * with `##[error]Unhandled error`, so the REQUIRED commit status never posts
 * and the merge queue shows it as "(not yet registered)". These helpers give
 * every status-posting job the same behaviour: bounded backoff, an optional
 * wait for the window to reset, and — if still limited — an explicit
 * "transient, rerun this job" failure instead of an unhandled exception.
 *
 * Consumed from actions/github-script steps via
 * `require('./.github/scripts/rate-limit-retry.js')` after checkout. The
 * Security Gate (LS-10280) can adopt it the same way.
 *
 * Logging: uses the injected `core` (actions/github-script) — this module runs
 * in the runner's Node sandbox and cannot import workspace packages.
 */

const DEFAULT_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 2000;
const RATE_LIMIT_MIN_REMAINING = 5;
const RATE_LIMIT_MAX_WAIT_MS = 60_000;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True for primary (403 "API rate limit exceeded") and secondary (403/429) limits. */
function isRateLimitError(e) {
  if (!e) return false;
  if (e.status === 429) return true;
  return (
    e.status === 403 &&
    /rate limit/i.test(typeof e.message === 'string' ? e.message : '')
  );
}

/**
 * Run `fn`, retrying rate-limit errors with exponential backoff. Non-rate-limit
 * errors and the final rate-limit error are rethrown unchanged.
 */
async function withRateLimitRetry(
  fn,
  {
    attempts = DEFAULT_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    label = 'github api',
    core,
    sleep = defaultSleep,
  } = {},
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isRateLimitError(e) || attempt >= attempts) throw e;
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      core?.warning(
        `${label}: GitHub API rate limit hit (attempt ${attempt}/${attempts}), retrying in ${delayMs}ms`,
      );
      await sleep(delayMs);
    }
  }
}

/**
 * Best-effort proactive check: if core headroom is thin, wait (capped) for the
 * window to reset rather than spend an attempt on a call that will 403.
 * `rateLimit.get` does not count against the quota.
 */
async function ensureRateLimitHeadroom({
  github,
  core,
  label = 'github api',
  sleep = defaultSleep,
  now = Date.now,
  minRemaining = RATE_LIMIT_MIN_REMAINING,
  maxWaitMs = RATE_LIMIT_MAX_WAIT_MS,
}) {
  let rateLimit;
  try {
    rateLimit = (await github.rest.rateLimit.get()).data.resources.core;
  } catch (e) {
    core?.warning(
      `${label}: failed to check rate limit headroom (${e.message}); proceeding anyway`,
    );
    return;
  }
  if (rateLimit.remaining > minRemaining) return;
  const waitMs = Math.max(
    0,
    Math.min(rateLimit.reset * 1000 - now(), maxWaitMs),
  );
  core?.warning(
    `${label}: only ${rateLimit.remaining} API calls remaining (resets at ${new Date(rateLimit.reset * 1000).toISOString()}); ` +
      `waiting ${waitMs}ms before proceeding to avoid a foreseeable 403`,
  );
  if (waitMs > 0) await sleep(waitMs);
}

/**
 * Post a commit status with headroom check + retry. On final rate-limit
 * exhaustion, fails the job with an explicit, rerun-friendly message (never an
 * unhandled exception) and returns false. Other errors are rethrown.
 *
 * @returns {Promise<boolean>} true when the status was posted.
 */
async function postCommitStatusResilient({
  github,
  core,
  params,
  label = 'createCommitStatus',
  ...opts
}) {
  try {
    await ensureRateLimitHeadroom({ github, core, label, ...opts });
    await withRateLimitRetry(
      () => github.rest.repos.createCommitStatus(params),
      { core, label, ...opts },
    );
    return true;
  } catch (e) {
    if (!isRateLimitError(e)) throw e;
    core.setFailed(
      `Could not post the '${params.context}' status (${params.state}: ${params.description}). ` +
        'GitHub API rate limit exhausted for this app installation — transient, ' +
        'rerun this job once the rate limit window resets.',
    );
    return false;
  }
}

module.exports = {
  isRateLimitError,
  withRateLimitRetry,
  ensureRateLimitHeadroom,
  postCommitStatusResilient,
};
