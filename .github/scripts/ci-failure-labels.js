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
 *
 * CANCELLED IS NOT A FAILURE (LS-9887). `computeDesiredCiLabels` used to label on
 * `result === 'failure' || result === 'cancelled'`. But a job cancelled by
 * GitHub's concurrency group — or by a self-hosted runner shutting down
 * mid-run — is not a test failure, and labelling it as one is actively
 * misleading: on PR #7585 (LS-9860) an E2E shard cancelled by concurrency
 * produced `CI: E2E Failure` while every other shard on the same head SHA was
 * green. Runner-shutdown cancellations already have their own, accurate label
 * (`CI: Runner Flake`, applied by ci-orchestrator.yml), so dropping
 * `cancelled` here does not lose the signal.
 *
 * LAST WRITER MUST NOT WIN (LS-9887). Two orchestrator runs can execute for the SAME
 * head SHA (see ci-orchestrator.yml's check-prior-success guard and its
 * runner-starvation hole). Each run's `summarize` job PUTs the whole `CI: *`
 * set, so whichever finishes LAST decides the labels — even when it is the
 * older, superseded run whose shards were cancelled out from under it. On
 * PR #7585 the newer run passed all six E2E shards at 17:16 and the older
 * (runner-starved) run then finished at 17:34 and relabelled the PR red.
 * `filterSupersededLabels` closes this: before PUTting, every candidate label
 * is re-checked against the LIVE check runs on the head SHA, and a label is
 * dropped unless the most recent COMPLETED check run for its context actually
 * failed. This makes the label a function of the head SHA's real state rather
 * than of which run happened to finish last.
 */

const { isRetryableStatusError } = require('./ci-gate.js');

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
    if (result === 'failure') {
      desired.push(label);
    }
    // Empty/missing/success/skipped/cancelled results are left off. See
    // the CANCELLED-IS-NOT-A-FAILURE note in this file's header for why.
  }

  // The job can fail before either excerpt-capture step ran (e.g. a setup
  // failure) — neither excerpt is populated then. Fall back to flagging both
  // rather than silently dropping the failure from PR labels. A *cancelled*
  // lint job no longer reaches here at all.
  const lintResult = jobResults ? jobResults.lint : undefined;
  const excerptsUnknown = !lintExcerpt && !formatExcerpt;
  const jobFailed = lintResult === 'failure';
  if (lintExcerpt || (excerptsUnknown && jobFailed)) {
    desired.push('CI: Lint Failure');
  }
  if (formatExcerpt || (excerptsUnknown && jobFailed)) {
    desired.push('CI: Formatting');
  }

  return desired;
}

// Maps each `CI: *` label to the check-run name prefix(es) that carry its
// real verdict on the head SHA. These are the job names ci-pipeline.yml
// publishes through the orchestrator's `🚀 CI Pipeline` job — e.g.
// "🚀 CI Pipeline / custom-checks", "🚀 CI Pipeline / E2E Tests (Shard 1/3)",
// "🚀 CI Pipeline / lint & format". Prefix matching (not equality) is
// deliberate: the E2E matrix fans out to six differently-named shard check
// runs, and lint/format share one job whose name may gain suffixes.
//
// Legacy labels are intentionally absent: they have no live check run, so
// they are never re-applied by this module anyway (only cleared).
const CI_PIPELINE_PREFIX = '🚀 CI Pipeline /';
const LABEL_CHECK_RUN_PREFIXES = Object.freeze({
  'CI: Custom Checks': [`${CI_PIPELINE_PREFIX} custom-checks`],
  'CI: Test Failure': [`${CI_PIPELINE_PREFIX} test`],
  'CI: Build Failure': [`${CI_PIPELINE_PREFIX} build`],
  'CI: E2E Failure': [`${CI_PIPELINE_PREFIX} E2E Tests`],
  'CI: Lint Failure': [`${CI_PIPELINE_PREFIX} lint`],
  'CI: Formatting': [`${CI_PIPELINE_PREFIX} lint`],
});

// Check-run conclusions that represent a genuine red result. `cancelled`,
// `skipped`, `neutral` and `success` are all NOT failures — see the
// CANCELLED IS NOT A FAILURE note in this file's header.
const FAILING_CONCLUSIONS = new Set([
  'failure',
  'timed_out',
  'action_required',
]);

/**
 * Reduce a head SHA's check runs to the most recent COMPLETED run per check
 * name. GitHub returns every attempt (and every duplicate run's copy) of a
 * given name, so "did this context fail?" is only well-defined once you pick
 * the latest completed one per name — the same latest-wins rule GitHub's own
 * ruleset evaluator applies to commit statuses.
 *
 * In-flight (`queued`/`in_progress`) check runs are ignored rather than
 * treated as green: a context whose only completed result is a failure keeps
 * its label while a newer attempt is still running.
 *
 * @param {Array<{name: string, status: string, conclusion: string|null, completed_at?: string, started_at?: string}>} checkRuns
 * @returns {Map<string, string|null>} check name → latest completed conclusion.
 */
function latestCompletedConclusionByName(checkRuns) {
  const latest = new Map();
  const stamps = new Map();
  for (const cr of checkRuns || []) {
    if (!cr || cr.status !== 'completed') continue;
    const at = Date.parse(cr.completed_at || cr.started_at || 0) || 0;
    if (!stamps.has(cr.name) || at >= stamps.get(cr.name)) {
      stamps.set(cr.name, at);
      latest.set(cr.name, cr.conclusion ?? null);
    }
  }
  return latest;
}

/**
 * Drop any candidate label the head SHA's live check runs contradict.
 *
 * A label survives only if the most recent completed check run for at least
 * one of its contexts has a failing conclusion. A label whose contexts are
 * all green, all cancelled, or entirely absent from the head SHA is dropped —
 * that is precisely the false-label shape from PR #7585, where a superseded
 * run relabelled a PR whose live head was green.
 *
 * Fail-safe direction is deliberately INVERTED relative to check-prior-success:
 * there, doubt means "run CI"; here, doubt means "do not assert a failure".
 * A label is only ever dropped on positive evidence (a completed non-failing
 * check run for that context). When a label has no mapped context at all, or
 * the head SHA has no check runs whatsoever (an API read we could not make),
 * the caller keeps the computed label rather than silently going green.
 *
 * @param {string[]} desiredCiLabels from computeDesiredCiLabels.
 * @param {Array<object>} checkRuns check runs on the PR's head SHA.
 * @param {{ core?: object }} [opts]
 * @returns {string[]} the subset of labels the head SHA actually supports.
 */
function filterSupersededLabels(desiredCiLabels, checkRuns, { core } = {}) {
  if (!checkRuns || checkRuns.length === 0) return [...(desiredCiLabels || [])];
  const latest = latestCompletedConclusionByName(checkRuns);

  return (desiredCiLabels || []).filter((label) => {
    const prefixes = LABEL_CHECK_RUN_PREFIXES[label];
    // No mapped context (legacy labels) — nothing to contradict it with.
    if (!prefixes) return true;

    const matches = [...latest.entries()].filter(([name]) =>
      prefixes.some((prefix) => name.startsWith(prefix)),
    );
    // The context never reported on this SHA: keep the label rather than
    // inventing a green verdict from missing data.
    if (matches.length === 0) return true;

    const stillFailing = matches.some(([, conclusion]) =>
      FAILING_CONCLUSIONS.has(conclusion),
    );
    if (!stillFailing && core) {
      core.info(
        `Dropping '${label}': the latest completed check run(s) for this ` +
          `context on the head SHA are [${matches
            .map(([name, conclusion]) => `${name}=${conclusion}`)
            .join(', ')}] — no failure. This run is superseded.`,
      );
    }
    return stillFailing;
  });
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
 * Whether a GitHub REST error is a transient rate-limit/5xx condition worth
 * retrying. Delegates to ci-gate.js's classifier (LS-9591) so both scripts
 * treat a primary-quota 403 ("API rate limit exceeded") the same way as a
 * secondary-rate-limit 403 or a 429/5xx — this used to only cover the latter
 * two, so a primary-quota exhaustion (exactly what stranded PR #7243/#7323)
 * fell through as non-retryable and threw on the first attempt.
 */
function isRetryableLabelError(err) {
  return isRetryableStatusError(err);
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
 * @param {string} [params.headSha] the PR's head SHA. When given, candidate
 *   labels are verified against that SHA's live check runs so a superseded
 *   run cannot relabel a PR whose head is actually green.
 * @returns {Promise<{finalLabels: string[]|null, desiredCiLabels: string[], skipped?: boolean}>}
 *   `skipped: true` (finalLabels: null) means a rate-limit/5xx error survived
 *   retries and the label update was skipped for this run rather than thrown
 *   (LS-9591) — see the try/catch below.
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
  headSha,
}) {
  const computedCiLabels = computeDesiredCiLabels(jobResults, {
    lintExcerpt,
    formatExcerpt,
  });

  // LAST WRITER MUST NOT WIN (see header): re-check every candidate label
  // against the live check runs on the head SHA before asserting it. Without
  // `headSha` this degrades to the old, unverified behaviour rather than
  // failing — the caller in ci-pipeline.yml always supplies it.
  let desiredCiLabels = computedCiLabels;
  if (headSha && computedCiLabels.length > 0) {
    try {
      const checkRuns = await withLabelRetry(
        () =>
          github.paginate(github.rest.checks.listForRef, {
            owner,
            repo,
            ref: headSha,
            per_page: 100,
          }),
        { core },
      );
      desiredCiLabels = filterSupersededLabels(computedCiLabels, checkRuns, {
        core,
      });
    } catch (err) {
      // Doubt means "do not drop" — keep this run's own verdict.
      if (core) {
        core.warning(
          `Could not read check runs for ${headSha} (${err.message}) — ` +
            'applying the labels from this run unverified.',
        );
      }
    }
  }

  // LS-9591: pulls.get and setLabels previously ran unguarded — a GitHub App
  // installation rate-limit blip here threw unhandled and marked the whole
  // `Label PR on Failure` step (and therefore the summarize job) as failed,
  // even though every real CI check had already passed (PR #7243). Retry
  // transient errors with the same classifier ci-gate.js uses for its own
  // status-post retries; if they persist past retries, degrade to a skipped
  // no-op rather than crashing the job — a subsequent run relabels normally.
  try {
    const { data: pr } = await withLabelRetry(
      () =>
        github.rest.pulls.get({
          owner,
          repo,
          pull_number: prNumber,
        }),
      { core },
    );
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
  } catch (e) {
    if (!isRetryableLabelError(e)) throw e;
    if (core) {
      core.warning(
        `CI failure labels: giving up on PR #${prNumber}'s label update after ` +
          `retries (${e.message}) — skipping rather than failing the job over ` +
          'a rate-limit/5xx blip; a subsequent run will relabel normally.',
      );
    }
    return { finalLabels: null, desiredCiLabels, skipped: true };
  }
}

module.exports = {
  JOB_RESULT_LABEL_MAP,
  LEGACY_CI_LABELS,
  ALL_CI_LABELS,
  LABEL_CHECK_RUN_PREFIXES,
  FAILING_CONCLUSIONS,
  computeDesiredCiLabels,
  latestCompletedConclusionByName,
  filterSupersededLabels,
  computeFinalLabelSet,
  isRetryableLabelError,
  withLabelRetry,
  applyCiFailureLabels,
};
