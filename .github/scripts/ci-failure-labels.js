/**
 * ci-failure-labels.js — Compute + apply the `CI: *` failure-label set on a PR
 * (LS-9637).
 *
 * WHY THIS EXISTS: the `Label PR on Failure` step in
 * .github/workflows/ci-pipeline.yml's `summarize` job replaces the PR's whole
 * `CI: *` label set on every run (a single `issues.setLabels` PUT) rather than
 * only ever adding labels — that replace-not-add shape is what lets a label
 * for a check that has since turned green get cleared automatically. The bug
 * (LS-9637) was that the "which labels count as CI labels to replace" set
 * (`ALL_CI_LABELS` below) omitted `CI: Lint Failure` and `CI: Formatting` —
 * they are computed from the `lint` job's two failure-excerpt outputs rather
 * than from `labelMap` directly, and were never added to the clearing set.
 * Once applied, either label stuck on the PR forever: `nonCiLabels` (labels
 * NOT recognized as CI labels) preserved it unconditionally, and it was only
 * ever re-added, never dropped, once its check passed on a later commit.
 *
 * Pulled out of the inline `actions/github-script` block into its own module
 * (mirroring ci-gate.js) so this logic is unit-testable — see
 * __tests__/ci-failure-labels.test.mjs and .github/checks/ci-failure-labels-tests.sh.
 */

// Maps a `CI: *` label directly to the `needs.<job>.result` that decides it.
// Lint/Formatting are handled separately below — they share one CI job
// (`lint`) whose two failure-excerpt outputs disambiguate which of the two
// actually failed.
//
// 'CI: Custom Checks' is job-level, not check-level: the custom-checks job
// runs ~10 independent scripts (migration immutability, lint-skills.js,
// validate-workflows.js, lint-touch-map.js, every .github/checks/*.sh, ...),
// so it intentionally does not name any one of them — a label naming a
// specific check (e.g. the former 'CI: Migration Immutability') mislabels
// the other ~9 when one of those fails instead (LS-9630).
const JOB_RESULT_LABEL_MAP = Object.freeze({
  'CI: Custom Checks': 'custom-checks',
  'CI: Test Failure': 'test',
  'CI: Build Failure': 'build',
  'CI: E2E Failure': 'e2e',
});

// Legacy rollup label names, retired but still possibly present on
// long-lived PRs — cleared alongside the current label set so they don't
// linger forever.
const LEGACY_CI_LABELS = Object.freeze([
  'CI: Lint & Format',
  'CI: Quality Gates',
  'CI: Type Error',
  'CI: Migration Immutability',
]);

// The full set of labels this step owns. ANY label in this set is replaced
// wholesale on every run — present here iff it can be both added AND removed
// by this step. Every entry must be added somewhere in computeDesiredCiLabels
// or it will only ever be removed, never (re-)applied.
const ALL_CI_LABELS = new Set([
  ...Object.keys(JOB_RESULT_LABEL_MAP),
  'CI: Lint Failure',
  'CI: Formatting',
  ...LEGACY_CI_LABELS,
]);

/**
 * Decide which `CI: *` labels apply to the PR's CURRENT run, from this run's
 * job results alone (no knowledge of what was previously on the PR — that is
 * `computeFinalLabelSet`'s job).
 *
 * @param {Record<string, string|undefined>} jobResults map of job id (as used
 *   in JOB_RESULT_LABEL_MAP, plus `lint`) → `needs.<job>.result`.
 * @param {{ lintExcerpt?: string, formatExcerpt?: string }} [excerpts]
 * @returns {string[]} labels that should be present on the PR for this run.
 */
function computeDesiredCiLabels(
  jobResults,
  { lintExcerpt, formatExcerpt } = {},
) {
  const desired = [];
  for (const [label, jobKey] of Object.entries(JOB_RESULT_LABEL_MAP)) {
    const result = jobResults ? jobResults[jobKey] : undefined;
    if (result === 'failure' || result === 'cancelled') {
      desired.push(label);
    }
    // Empty/missing/success/skipped results are left off (don't add).
  }

  // The job can fail/cancel before either excerpt-capture step ran (e.g.
  // cancellation, a setup failure) — neither excerpt is populated then. Fall
  // back to flagging both rather than silently dropping the failure from PR
  // labels.
  const lintResult = jobResults ? jobResults.lint : undefined;
  const excerptsUnknown = !lintExcerpt && !formatExcerpt;
  const jobFailedOrCancelled =
    lintResult === 'failure' || lintResult === 'cancelled';
  if (lintExcerpt || (excerptsUnknown && jobFailedOrCancelled)) {
    desired.push('CI: Lint Failure');
  }
  if (formatExcerpt || (excerptsUnknown && jobFailedOrCancelled)) {
    desired.push('CI: Formatting');
  }

  return desired;
}

/**
 * Compute the PR's final label set: every non-CI label the PR already had,
 * plus exactly the CI labels this run says should apply. Any `CI: *` label
 * from a prior run that is not in `desiredCiLabels` is dropped — this is the
 * mechanism that removes a stale failure label once its check turns green.
 *
 * @param {string[]} existingLabels labels currently on the PR.
 * @param {string[]} desiredCiLabels from computeDesiredCiLabels.
 * @returns {string[]}
 */
function computeFinalLabelSet(existingLabels, desiredCiLabels) {
  const nonCiLabels = (existingLabels || []).filter(
    (l) => !ALL_CI_LABELS.has(l),
  );
  return [...nonCiLabels, ...desiredCiLabels];
}

/**
 * Whether a GitHub REST error is a transient primary/secondary rate limit
 * worth retrying.
 */
function isRetryableLabelError(err) {
  const status = err && err.status;
  if (status === 429) return true;
  if (
    status === 403 &&
    /secondary rate limit/i.test((err && err.message) || '')
  ) {
    return true;
  }
  return false;
}

/**
 * Retry an Octokit call with exponential backoff, but only for transient
 * rate-limit errors — anything else rethrows immediately.
 */
async function withLabelRetry(fn, { core, retries = 3 } = {}) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt === retries - 1;
      if (!isRetryableLabelError(err) || isLast) throw err;
      const delay = 2 ** attempt * 1000;
      if (core) {
        core.warning(`Rate limited (${err.status}), retrying in ${delay}ms…`);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return undefined;
}

/**
 * Recompute and apply the PR's `CI: *` label set for this run: fetch the
 * PR's current labels, fold in this run's job results, and PUT the resulting
 * set in one call (a single `setLabels` avoids both the N sequential DELETEs
 * that trip GitHub's secondary rate limit, and — the point of LS-9637 — is
 * what lets a stale failure label be dropped instead of only ever added to).
 *
 * @param {object} params
 * @param {object} params.github Octokit client (`github` in actions/github-script).
 * @param {object} [params.core] Actions core (`core` in actions/github-script).
 * @param {string} params.owner
 * @param {string} params.repo
 * @param {number} params.prNumber
 * @param {Record<string, string|undefined>} params.jobResults
 * @param {string} [params.lintExcerpt]
 * @param {string} [params.formatExcerpt]
 * @returns {Promise<{finalLabels: string[], desiredCiLabels: string[]}>}
 */
async function applyCiFailureLabels({
  github,
  core,
  owner,
  repo,
  prNumber,
  jobResults,
  lintExcerpt,
  formatExcerpt,
}) {
  const desiredCiLabels = computeDesiredCiLabels(jobResults, {
    lintExcerpt,
    formatExcerpt,
  });

  const { data: pr } = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });
  const existingLabels = pr.labels.map((l) => l.name);
  const finalLabels = computeFinalLabelSet(existingLabels, desiredCiLabels);

  await withLabelRetry(
    () =>
      github.rest.issues.setLabels({
        owner,
        repo,
        issue_number: prNumber,
        labels: finalLabels,
      }),
    { core },
  );
  if (core) {
    core.info(`Labels set: [${finalLabels.join(', ')}]`);
  }

  return { finalLabels, desiredCiLabels };
}

module.exports = {
  JOB_RESULT_LABEL_MAP,
  LEGACY_CI_LABELS,
  ALL_CI_LABELS,
  computeDesiredCiLabels,
  computeFinalLabelSet,
  isRetryableLabelError,
  withLabelRetry,
  applyCiFailureLabels,
};
