/**
 * ci-gate.js — Aggregate "CI Gate" status computation + poster (LS-7991).
 *
 * Phase 2 of LS-7988: collapse the granular `🚀 CI Pipeline / {lint,
 * build,test,custom-checks}` required checks into ONE aggregator commit status,
 * `CI Gate`, posted exactly once per head SHA by the CI Pipeline `summarize`
 * job (.github/workflows/ci-pipeline.yml).
 *
 * WHY A COMMIT STATUS (not a check run):
 *   The root cause of the spurious 405s (LS-7988) is that GitHub's merge-API
 *   ruleset evaluator can latch onto a terminal `cancelled` check-RUN for a
 *   required NAME on a SHA even when a later run for that name succeeded.
 *   Concurrency cancellation + base-push re-triggers leave such duplicates.
 *   Commit statuses do NOT have this ambiguity: GitHub (and the merge-queue
 *   processor's validateStatusChecks) evaluate the LATEST status per context
 *   by created_at — there is no "cancelled" status state, and a summarize job
 *   killed mid-post simply posts nothing rather than a terminal cancelled row.
 *   Posting `CI Gate` as a commit status therefore eliminates the duplicate-
 *   required-name ambiguity at the root. `bot-review` uses the same mechanism.
 *
 * Logging: uses console.* / core.* — this module runs in the GitHub Actions
 * runner's Node sandbox via actions/github-script and cannot import workspace
 * packages like `@legacy-sports/logging`. Build-time scripts are an explicit
 * exception to the no-console rule (see AGENTS.md, Code Quality → No console.*).
 */

const {
  classifyCancelledJob,
  classifyFailedJob,
  gateEffectOfCancellation,
  REAL_FAILURE,
  NEVER_RAN,
  RUNNER_SHUTDOWN,
  DELIBERATE_CANCEL,
  NO_SIGNAL,
} = require('./runner-cancellation.js');

// The required-check context name. Mirrored in .github/ruleset.json (_commitStatus).
const CI_GATE_CONTEXT = 'CI Gate';

// GitHub commit-status `description` has a 140-character hard limit.
const MAX_DESCRIPTION_LENGTH = 140;

// The granular CI Pipeline jobs folded into the gate verdict. This MUST match
// the failure-threshold set in .github/actions/collect-results (the existing
// definition of overall pipeline success): lint (which also runs the format
// check as of LS-8901 — the two share one job), test, build, custom-checks,
// lockfile-check, e2e, e2e-mobile (LS-9411; LS-10332: full sharded suite on
// run-all, one affected-spec shard on a narrow change, skipped when a narrow
// change maps to no affected specs — the job-level `if` never skips it on
// run-all, so `skipped` passing here cannot hide a run-all mobile gap).
// Pass semantics: `success` and `skipped` pass;
// `failure`, `timed_out`, or any missing/unknown value fail.
//
// `cancelled` is DELIBERATELY excluded from the verdict (LS-8219): a cancelled
// granular job is a superseded/duplicate run (concurrency-cancel, post-merge
// SIGINT/exit-130) rather than a real failure. Folding it as FAILURE let a
// cancelled post-merge duplicate latch a fresh red `CI Gate` on a SHA whose
// gating run was already green. This is an intentional divergence from
// collect-results, which treats cancelled as failure for the in-run overall
// status — here we are posting a per-SHA required status that must never go red
// purely because a duplicate run was cancelled.
const GATE_INPUT_JOBS = Object.freeze([
  'lint',
  'test',
  'build',
  'custom-checks',
  'lockfile-check',
  'e2e',
  'e2e-mobile',
]);

/**
 * A job result counts as passing for the gate when it succeeded OR was
 * legitimately skipped (e.g. e2e skipped when no web/api surface changed).
 */
function isPass(result) {
  return result === 'success' || result === 'skipped';
}

/**
 * A `cancelled` granular job is a superseded/duplicate run (concurrency-cancel,
 * post-merge SIGINT/exit-130) or a job the runner pool died under, NOT a real
 * failure. It is never folded as FAILURE, so a cancelled duplicate run can
 * never post a fresh red `CI Gate` on a SHA whose gating run was green
 * (LS-8219).
 */
function isCancelled(result) {
  return result === 'cancelled';
}

/**
 * The third gate conclusion (LS-10140): every folded input that spoke passed,
 * but at least one was CANCELLED and therefore never spoke at all.
 *
 * Neither terminal verdict is honest here. `failure` is the false-red this
 * ticket exists to remove — a job cancelled before it ran any test body did
 * not fail, and posting red burns a re-run allowance, strips
 * `merge-when-ready`, and reads as a code break to the author, the merge
 * queue, and any agent driving the PR. `success` is worse: it would claim the
 * SHA passed checks that never executed.
 *
 * The caller maps this to a PENDING commit status, which blocks the merge
 * (merge-queue-processor.js's validateStatusChecks counts a pending required
 * context as `inProgress`, and GitHub's own evaluator treats it as an unmet
 * requirement) without asserting a failure that did not happen.
 */
const NO_VERDICT = 'no-verdict';

/**
 * Fold the granular job results into a single gate conclusion.
 *
 *   - `success`  — every folded input passed (or was legitimately skipped).
 *   - `failure`  — at least one input genuinely failed. Always wins: a real
 *                  failure alongside a cancellation is still a failure.
 *   - `no-verdict` — nothing failed, but at least one input was cancelled and
 *                  so produced no result. See `NO_VERDICT`.
 *
 * @param {Record<string, string|undefined>} results map of job id → result
 * @returns {{ conclusion: 'success'|'failure'|'no-verdict', failing: string[], cancelled: string[], ignored: string[] }}
 *   `ignored` is retained as an alias of `cancelled` for callers (and log
 *   lines) written against the pre-LS-10140 shape.
 */
function computeGateConclusion(results) {
  const failing = [];
  const cancelled = [];
  for (const job of GATE_INPUT_JOBS) {
    const result = results ? results[job] : undefined;
    if (isCancelled(result)) {
      cancelled.push(job);
      continue;
    }
    if (!isPass(result)) {
      failing.push(`${job} (${result || 'missing'})`);
    }
  }

  let conclusion = 'success';
  if (failing.length > 0) {
    conclusion = 'failure';
  } else if (cancelled.length > 0) {
    conclusion = NO_VERDICT;
  }

  return { conclusion, failing, cancelled, ignored: cancelled };
}

/**
 * Workflow names whose runs post a `CI Gate` verdict for a SHA. The CI Pipeline
 * is a reusable workflow called by the orchestrator and therefore shares the
 * orchestrator's run id; both names are accepted so a directly-invoked pipeline
 * run is still counted. Mirrors the predicate in upload-lambdas.yml (verify-ci).
 */
const CI_RUN_WORKFLOW_NAMES = Object.freeze([
  'Legacy Sports CI Orchestrator',
  'Legacy Sports CI Pipeline',
]);

/**
 * Run conclusions that mean "this run will never post a gate verdict".
 *
 * The summarize job is `always() && !cancelled()`, and a run whose scope step
 * skips the pipeline never reaches it at all. Such a run must NOT be treated as
 * superseding: doing so would make the real gating run withhold its verdict
 * while the superseding run posts nothing, stranding the SHA with NO `CI Gate`
 * status and blocking the merge indefinitely.
 *
 * This is not hypothetical — the orchestrator emits an extra, scoped-out run per
 * `pull_request` label event (`bot:ready-for-review`, the `CI:` result labels),
 * and label churn easily produces one with a higher run id than the real run.
 *
 * An in-flight run has `conclusion: null`, which is deliberately NOT in this set
 * — it has not finished and is still expected to post.
 *
 * This filter is necessary but not sufficient — see `CI_PIPELINE_JOB_NAME` for
 * the job-level counterpart (LS-9565).
 */
const CONCLUSIONS_THAT_POST_NO_VERDICT = Object.freeze([
  'skipped',
  'cancelled',
  'neutral',
]);

/**
 * Workflow-run `status` values meaning "no job has started yet" (LS-9754).
 * GitHub's run-status enum is `queued | in_progress | completed | waiting |
 * requested | pending` — a run blocked on a workflow-level `concurrency:`
 * group can surface as any of `queued`, `pending`, `waiting`, or `requested`
 * depending on exactly why it hasn't started (observed as `pending`, not
 * `queued`, for a run blocked behind the orchestrator's head-SHA-keyed
 * concurrency slot on PR #7830 itself). `in_progress` is deliberately
 * excluded — an already-executing sibling has genuinely started and may
 * finish and post before this run does, so it must still be treated as
 * superseding.
 */
const NOT_YET_STARTED_RUN_STATUSES = new Set([
  'queued',
  'pending',
  'waiting',
  'requested',
]);

/**
 * The orchestrator's `ci-pipeline` job name (`name:` in ci-orchestrator.yml) —
 * the caller job for the reusable `.github/workflows/ci-pipeline.yml`, and the
 * only job in a run that can reach the `summarize` post step.
 *
 * The run-level `CONCLUSIONS_THAT_POST_NO_VERDICT` filter above is necessary but
 * NOT sufficient (LS-9565). A `pull_request_review: approved` run whose
 * `check-prior-success` idempotency guard short-circuits the pipeline still
 * concludes `success` at the RUN level — its `Determine Workflow Scope`,
 * `Secret Detection Scan`, `Security Scan Summary` and `Security Gate` jobs all
 * succeed — while only this ONE job is `skipped`. So the run passes the
 * run-conclusion filter, is treated as superseding, and the older run that
 * actually ran CI withholds its green — leaving the SHA with NO `CI Gate` at
 * all. Exactly what LS-9378's filter was written to prevent, one level down.
 *
 * Observed on PR #7212 (`42f31fc`): run 32585173510 ran the full pipeline green
 * and withheld in favour of run 32586165378, whose `🚀 CI Pipeline` job had
 * concluded `skipped` 55 minutes earlier. Neither posted.
 *
 * A run that invokes the pipeline DIRECTLY (workflow name
 * `Legacy Sports CI Pipeline`) has no such caller job — only the nested
 * `🚀 CI Pipeline / <job>` rows — so the absence of this exact name correctly
 * reads as "this run runs the pipeline".
 *
 * Kept in sync with ci-orchestrator.yml by a unit test that greps the workflow.
 */
const CI_PIPELINE_JOB_NAME = '🚀 CI Pipeline';

/**
 * How many superseding-run candidates may be probed with a jobs lookup before
 * the guard gives up and fails CLOSED on the next one. Real SHAs carry at most
 * a handful of newer runs (label churn, an approval, a manual dispatch); the cap
 * only bounds the API spend in a pathological case.
 */
const MAX_SUPERSEDING_RUN_INSPECTIONS = 10;

/**
 * Whether `runId`'s CI Pipeline job was skipped — i.e. that run performed no CI
 * and will therefore never post a `CI Gate` verdict (LS-9565) — OR whether the
 * run can be PREDICTED to end up in that same state before it has even
 * created that job (LS-9811).
 *
 * NOTE (LS-10030): this function's caller, `assertSuccessIsCurrent`, already
 * filters out any candidate whose `status` is in
 * `NOT_YET_STARTED_RUN_STATUSES` (LS-9754) BEFORE reaching this function, for
 * every trigger event — that check is event-agnostic and safe because
 * ci-orchestrator.yml's concurrency `group:` is keyed purely on head SHA, so
 * a not-yet-started run for the same SHA is provably blocked and cannot race,
 * and `check-prior-success` applies to every trigger type. As a result the
 * `pull_request_review` prediction below is only ever actually exercised for
 * a candidate whose `status` is `in_progress` (excluded from
 * NOT_YET_STARTED_RUN_STATUSES because an already-executing run has genuinely
 * started and may finish first) and has not yet created the pipeline job —
 * NOT for a `queued`/`pending`/`waiting`/`requested` one, even though the
 * doc comment below is written in those terms (they were accurate when this
 * function was introduced; NOT_YET_STARTED_RUN_STATUSES already existed by
 * then but this interaction went unnoticed until it broke this function's
 * own regression test). Do not "fix" a queued/pending pull_request_review
 * test fixture here expecting it to reach `listJobsForWorkflowRun` — it
 * won't; see `ci-gate.test.mjs`'s "a not-yet-started pull_request_review run
 * does not supersede (LS-9811)" describe block.
 *
 * LS-9811: a `pull_request_review`-triggered candidate that has not yet
 * created its '🚀 CI Pipeline' job — including one still sitting at ZERO jobs
 * entirely, e.g. queued behind runner saturation for 20+ minutes — cannot be
 * distinguished from a run that WILL go on to run CI by inspecting its jobs
 * alone. Failing closed there (the pre-LS-9811 behaviour) is exactly what
 * stranded PR #7499: the real, fully-green run withheld its verdict waiting
 * on this candidate, while the candidate's own `check-prior-success` step
 * (ci-orchestrator.yml) was guaranteed to short-circuit the moment it ran —
 * so neither run ever posted `CI Gate` and the merge queue blocked forever.
 *
 * The prediction is sound because this helper is only ever reached from
 * `assertSuccessIsCurrent`, whose caller has ALREADY confirmed every
 * GATE_INPUT_JOBS entry passed in ITS OWN run — i.e. its own orchestrator run
 * is either still in flight or about to post `CI Gate: success` for this
 * exact SHA. By the time a not-yet-started `pull_request_review` candidate's
 * `check-prior-success` step runs, it will find one of:
 *   (a) `CI Gate` already `success` for this SHA (posted by the caller) →
 *       its `allPassed` check passes, or
 *   (b) the caller's own orchestrator run still active with a dispatching
 *       event (`pull_request` / `workflow_dispatch`) → its `siblingDispatching`
 *       check (LS-9887) fires.
 * Either branch sets `ci-already-passed=true`, which skips the candidate's
 * '🚀 CI Pipeline' job via its `if:` — so the candidate is guaranteed never to
 * post, exactly like the already-skipped case this helper already handled.
 * This is why the prediction is scoped tightly to `event ===
 * 'pull_request_review'`: there cannot be a newer PUSH for the same SHA (the
 * SHA is fixed), so a genuinely new `pull_request`/`workflow_dispatch`
 * candidate for it always intends to run CI and must keep failing closed.
 *
 * Fails CLOSED in every other case — a candidate whose pipeline job already
 * exists but has not resolved to `skipped`, a completed run that somehow
 * never created the job, or any API error — returning `false` ("assume it
 * will post"), which makes the caller withhold its own success. Withholding
 * is the safe direction — a missing `CI Gate` blocks the merge, whereas
 * wrongly posting green over a newer run's verdict lands a red PR (the
 * LS-9378 invariant, which this prediction does not weaken: it only ever
 * removes a candidate that is PROVEN to never speak from consideration, the
 * same guarantee the LS-9565 skipped-job case already relies on).
 *
 * @param {object} params
 * @param {number} params.runId
 * @param {string} [params.event] the candidate run's trigger event
 *   (`workflow_runs[].event` from the Actions API), used only for the
 *   `pull_request_review` prediction above.
 * @param {string} [params.status] the candidate run's `status`
 *   (`workflow_runs[].status`) — the prediction only applies while the run
 *   has not yet reached `'completed'`.
 * @returns {Promise<boolean>}
 */
async function pipelineJobWasSkipped({
  github,
  core,
  owner,
  repo,
  runId,
  event,
  status,
}) {
  try {
    const { data } = await github.rest.actions.listJobsForWorkflowRun({
      owner,
      repo,
      run_id: runId,
      per_page: 100,
    });
    const jobs = data.jobs || [];
    const pipelineJob = jobs.find((job) => job.name === CI_PIPELINE_JOB_NAME);

    if (pipelineJob) {
      // `status: 'completed'` matters: a job GitHub has created but not yet
      // resolved carries a null conclusion and is still expected to run.
      return Boolean(
        pipelineJob.status === 'completed' &&
        pipelineJob.conclusion === 'skipped',
      );
    }

    // No '🚀 CI Pipeline' job exists in this run yet — either it genuinely has
    // zero jobs so far, or it has some jobs (e.g. "Determine Workflow Scope")
    // but hasn't reached the point of creating the pipeline job. LS-9811: for
    // a still-running `pull_request_review` candidate this is predictable
    // (see the doc comment above) rather than ambiguous; every other trigger,
    // and a candidate that has already finished without ever creating the
    // job, keeps the pre-existing fail-closed default below.
    if (event === 'pull_request_review' && status !== 'completed') {
      core.info(
        `CI Gate: run ${runId} is a pull_request_review candidate with no ` +
          `'${CI_PIPELINE_JOB_NAME}' job yet (status: ${status || 'unknown'}, ` +
          `${jobs.length} job(s) so far) — its check-prior-success guard is ` +
          'guaranteed to short-circuit once this run speaks, so it is not ' +
          'treated as superseding.',
      );
      return true;
    }

    return false;
  } catch (e) {
    core.warning(
      `CI Gate: could not list jobs for run ${runId} (${e.message}) — assuming ` +
        'it runs the pipeline and will post its own verdict.',
    );
    return false;
  }
}

/**
 * Job-name substrings identifying, in the Jobs API within THIS run, the two
 * GATE_INPUT_JOBS entries that can mask a real failure behind a `cancelled`
 * rollup (LS-9467). Matched via `.includes()`, not an anchor, because the
 * reusable-workflow call prefixes the job name with its calling job label —
 * the real name is "🚀 CI Pipeline / E2E Tests (Shard 1/1)", not a bare
 * "E2E Tests (Shard 1/1)". `e2e` is a matrix job (one instance per shard);
 * GitHub folds every matrix instance's result into one `needs.e2e.result` for
 * the summarize job, so a genuine test failure in one shard and an external
 * cancellation of the SAME shard can both surface as
 * `needs.e2e.result == 'cancelled'` if the cancellation is what the job rolls
 * up to.
 *
 * Consumed by e2e-affected-gate.js as well as this module. LS-10140 widened
 * the gate's own cancellation handling to every GATE_INPUT_JOBS entry — see
 * `GATE_JOB_LEAF_NAMES` — but this constant keeps its original two-key shape
 * because that is the contract e2e-affected-gate.js is written against.
 */
const CANCELLABLE_TEST_JOB_NAME_PREFIX = Object.freeze({
  e2e: 'E2E Tests (Shard',
  'e2e-mobile': 'E2E Tests (Mobile Chrome',
});

/**
 * Every GATE_INPUT_JOBS key mapped to the LEAF of its job name in the Jobs API
 * — the part after the reusable-workflow call prefix ("🚀 CI Pipeline / ").
 * These are the `name:` values in .github/workflows/ci-pipeline.yml; a unit
 * test greps that workflow to catch drift.
 *
 * WHY A LEAF MATCH RATHER THAN `.includes()` (LS-10140): widening the lookup
 * from the two matrix keys to all seven brings in short names — `test`,
 * `build` — that a naive substring match would find inside unrelated job
 * names. The leaf is split on " / " (space-slash-space), which the matrix
 * shard suffix "(Shard 1/1)" does not contain, so the split is unambiguous.
 * The match is the whole leaf, or the leaf up to a word boundary: the two
 * matrix names carry a per-shard suffix ("E2E Tests (Shard 1/1)") that
 * equality would reject. Requiring the trailing space keeps `build` from
 * matching an unrelated "build-scan" job, which a bare `startsWith` would.
 */
const GATE_JOB_LEAF_NAMES = Object.freeze({
  lint: 'lint & format',
  test: 'test',
  build: 'build',
  'custom-checks': 'custom-checks',
  'lockfile-check': 'lockfile-check',
  e2e: 'E2E Tests (Shard',
  'e2e-mobile': 'E2E Tests (Mobile Chrome',
});

/**
 * Whether `jobName` (as reported by the Jobs API, prefix and all) is an
 * instance of the GATE_INPUT_JOBS entry `jobKey`.
 */
function jobNameMatchesGateKey(jobName, jobKey) {
  const leafName = GATE_JOB_LEAF_NAMES[jobKey];
  if (!leafName || typeof jobName !== 'string') return false;
  const separatorAt = jobName.lastIndexOf(' / ');
  const leaf = separatorAt === -1 ? jobName : jobName.slice(separatorAt + 3);
  return leaf === leafName || leaf.startsWith(`${leafName} `);
}

/**
 * How many bytes of a cancelled job's log to read. The two markers
 * `classifyJobLog` compares sit at the very end, but GitHub writes an
 * `##[end-action …skipped]` pair for every remaining step after the cancel, so
 * the gap between them grows with the job's step count. 64 KB covers the
 * longest jobs in this repo — the same window .github/actions/
 * detect-runner-shutdown uses, deliberately, so the two paths classify the
 * same job identically.
 */
const JOB_LOG_TAIL_BYTES = 65536;

/**
 * Fetch the tail of one job's log.
 *
 * A 404 is not an error here — it is EVIDENCE. GitHub returns 404
 * (BlobNotFound) for a job that was cancelled before it ever produced output,
 * which is exactly the "never ran" signal `classifyCancelledJob` keys on
 * (LS-10140). Any other error degrades to "log unreadable but assumed to
 * exist", which keeps the classification on the log-ordering path rather than
 * asserting the job never ran.
 *
 * @returns {Promise<{ available: boolean, text: string }>}
 */
async function fetchJobLogTail({ github, core, owner, repo, jobId }) {
  try {
    const res = await github.rest.actions.downloadJobLogsForWorkflowRun({
      owner,
      repo,
      job_id: jobId,
    });
    const body = res && res.data;
    const text =
      typeof body === 'string'
        ? body
        : body
          ? Buffer.from(body).toString('utf8')
          : '';
    return { available: true, text: text.slice(-JOB_LOG_TAIL_BYTES) };
  } catch (e) {
    if (e && e.status === 404) {
      core.info(
        `CI Gate: job ${jobId} has no log blob (404 BlobNotFound) — it never ` +
          'produced output.',
      );
      return { available: false, text: '' };
    }
    core.warning(
      `CI Gate: could not read the log for job ${jobId} (${e.message}) — ` +
        'classifying from its step list alone.',
    );
    return { available: true, text: '' };
  }
}

/**
 * List every job in `runId`, paginated.
 *
 * @returns {Promise<Array<object>|null>} null when the lookup failed.
 */
async function listRunJobs({ github, core, owner, repo, runId }) {
  try {
    let jobs = [];
    let page = 1;
    while (true) {
      const { data } = await github.rest.actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: runId,
        per_page: 100,
        page,
      });
      jobs = jobs.concat(data.jobs);
      if (data.jobs.length < 100) break;
      page++;
    }
    return jobs;
  } catch (e) {
    core.warning(
      `CI Gate: could not list jobs for run ${runId} (${e.message}) — a ` +
        'cancelled gate input cannot be classified and is treated as ' +
        'unattributed.',
    );
    return null;
  }
}

/**
 * Ordering used to fold several instances of one gate input (matrix shards)
 * into a single classification. A real failure always wins — no other signal
 * may mask it. Runner churn outranks the "never ran" and deliberate classes so
 * the gate description names the infrastructure cause when one shard died to
 * it.
 */
const CLASSIFICATION_PRECEDENCE = Object.freeze([
  REAL_FAILURE,
  RUNNER_SHUTDOWN,
  NEVER_RAN,
  DELIBERATE_CANCEL,
  NO_SIGNAL,
]);

/**
 * Classify why the GATE_INPUT_JOBS entry `jobKey` reported `cancelled`, from
 * the job instances in THIS run (LS-10140).
 *
 * This is the gate's half of "detection and the gate must agree": it applies
 * .github/scripts/runner-cancellation.js's rules — the same module
 * .github/actions/detect-runner-shutdown runs — BEFORE the verdict is
 * computed, rather than reporting the shutdown afterwards in a PR comment
 * nothing reads.
 *
 * Fails to `no-signal` (an unattributed cancel, which the gate folds as
 * `no-verdict` → pending) whenever the evidence cannot be gathered. That is
 * the conservative direction: pending blocks the merge without claiming a
 * failure that was never observed.
 *
 * @param {Array<object>} jobs All jobs in the run (from `listRunJobs`).
 * @returns {Promise<string>} a `classifyCancelledJob` result.
 */
async function classifyCancelledGateJob({
  github,
  core,
  owner,
  repo,
  jobs,
  jobKey,
}) {
  const instances = (jobs || []).filter(
    (job) =>
      job &&
      job.conclusion === 'cancelled' &&
      jobNameMatchesGateKey(job.name, jobKey),
  );

  if (instances.length === 0) return NO_SIGNAL;

  const verdicts = [];
  for (const job of instances) {
    // A job whose steps already record a failure needs no log read at all —
    // the verdict is settled and the log download (multi-MB for an E2E shard)
    // would be pure cost.
    const settledBySteps = classifyCancelledJob({ steps: job.steps });
    if (settledBySteps === REAL_FAILURE) {
      verdicts.push(REAL_FAILURE);
      continue;
    }
    const log = await fetchJobLogTail({
      github,
      core,
      owner,
      repo,
      jobId: job.id,
    });
    const verdict = classifyCancelledJob({
      steps: job.steps,
      logText: log.text,
      logAvailable: log.available,
    });
    core.info(
      `CI Gate: cancelled job "${job.name}" (${jobKey}) classified as ` +
        `${verdict}.`,
    );
    verdicts.push(verdict);
  }

  return (
    CLASSIFICATION_PRECEDENCE.find((c) => verdicts.includes(c)) || NO_SIGNAL
  );
}

/**
 * Decide whether the GATE_INPUT_JOBS entry `jobKey`, which reported `failure`,
 * failed only because its runner died (LS-10311).
 *
 * A spot-reclaimed runner often leaves its job concluded `failure` with no
 * failed step. Without this check that job posts a red gate for code that
 * never failed, and the orchestrator run's `failure` conclusion keeps
 * rerun-cancelled-ci.yml from ever re-running it.
 *
 * Returns true only when at least one instance concluded `failure` and EVERY
 * such instance classifies as runner-shutdown (`classifyFailedJob`). A matrix
 * key where one shard really failed and another shard lost its runner stays
 * red. A jobs lookup that failed (`jobs === null`) or found no matching
 * instance also stays red. The job already said `failure`, so red is the
 * conservative direction.
 *
 * @param {Array<object>|null} jobs All jobs in the run (from `listRunJobs`).
 * @returns {Promise<boolean>}
 */
async function failedGateJobWasRunnerDeath({
  github,
  core,
  owner,
  repo,
  jobs,
  jobKey,
}) {
  const instances = (jobs || []).filter(
    (job) =>
      job &&
      job.conclusion === 'failure' &&
      jobNameMatchesGateKey(job.name, jobKey),
  );
  if (instances.length === 0) return false;

  for (const job of instances) {
    // A failed step settles the verdict — skip the (possibly multi-MB) log.
    if (
      (job.steps || []).some((step) => step && step.conclusion === 'failure')
    ) {
      return false;
    }
    const log = await fetchJobLogTail({
      github,
      core,
      owner,
      repo,
      jobId: job.id,
    });
    const verdict = classifyFailedJob({ steps: job.steps, logText: log.text });
    core.info(
      `CI Gate: failed job "${job.name}" (${jobKey}) classified as ${verdict}.`,
    );
    if (verdict !== RUNNER_SHUTDOWN) return false;
  }
  return true;
}

/**
 * Whether a GATE_INPUT_JOBS entry reported `cancelled` even though one of its
 * underlying job instances (within THIS run) actually recorded a real
 * `failure` step before the cancellation landed (LS-9467).
 *
 * WHY THIS EXISTS: PR #6909 merged with a deterministically-broken e2e spec
 * because its gating run's own `e2e` job hit its 30-minute `timeout-minutes`
 * in the narrow window after the "E2E Tests (affected specs)" step had
 * already recorded `conclusion: failure` — GitHub rolled the JOB's overall
 * conclusion up to `cancelled` even though every step (including the one that
 * failed) had already completed normally. The LS-8219 exclusion then folded
 * that `cancelled` result as "not a failure" — its evidence (PR #5540 et al.)
 * was jobs that were SIGINT'd cleanly with every step having already
 * PASSED, a materially different case. This check discriminates the two: a
 * `cancelled` job whose steps contain no `failure` is still excluded (LS-8219
 * intent preserved); a `cancelled` job with a genuinely failed step is
 * promoted to `failure` before folding.
 *
 * Scoped to CANCELLABLE_TEST_JOB_NAME_PREFIX's two matrix keys, which is the
 * contract e2e-affected-gate.js mirrors. `postCiGate` itself no longer calls
 * this — since LS-10140 it runs `classifyCancelledGateJob` over EVERY
 * GATE_INPUT_JOBS entry, of which this is the narrow, backwards-compatible
 * special case.
 *
 * Fails OPEN (returns `false`, i.e. "no real failure detected") on a lookup
 * error — this check is additive on top of the pre-existing LS-8219 default,
 * so an API hiccup here degrades to that prior behavior rather than newly
 * blocking a merge the lookup couldn't confirm.
 *
 * @returns {Promise<boolean>}
 */
async function cancelledJobHadRealFailure({
  github,
  core,
  owner,
  repo,
  runId,
  jobKey,
}) {
  if (!CANCELLABLE_TEST_JOB_NAME_PREFIX[jobKey]) return false;
  const jobs = await listRunJobs({ github, core, owner, repo, runId });
  if (jobs === null) return false;
  return jobs
    .filter((j) => jobNameMatchesGateKey(j.name, jobKey))
    .some(
      (j) =>
        j.conclusion === 'cancelled' &&
        (j.steps || []).some((s) => s.conclusion === 'failure'),
    );
}

/**
 * Extract the Actions run id from a commit status `target_url` of the shape
 * `https://github.com/<owner>/<repo>/actions/runs/<id>`.
 *
 * @returns {number|null} the run id, or null when the URL is absent or is not
 *   an Actions run URL.
 */
function runIdFromTargetUrl(targetUrl) {
  if (typeof targetUrl !== 'string') return null;
  const match = /\/actions\/runs\/(\d+)/.exec(targetUrl);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}

/**
 * Decide whether THIS run may post a `success` verdict for `sha` (LS-9378).
 *
 * WHY: a commit status is last-writer-wins by created_at, and `results`
 * reflects only THIS run's view of the pipeline. Re-running an OLDER run for a
 * SHA that a NEWER run has already ruled on replays a stale verdict over the
 * newer one. That is exactly how PR #7006 merged with a failing E2E shard: run
 * 31462018381 posted `failure` (e2e) at 2026-08-11T05:51:38, then the older run
 * 31458492265 was re-run ~35h later and its summarize job re-posted its own
 * stale `success`, re-arming `merge-when-ready`. The merge followed 17 minutes
 * later. The pre-existing SHA-currency guard did not fire because the PR head
 * SHA had never moved — only the verdict did.
 *
 * THE INVARIANT: a `failure` verdict may ALWAYS be posted — turning a SHA red is
 * never unsafe. A `success` verdict must PROVE it is the newest word on the SHA.
 * Both checks below therefore fail CLOSED: when recency cannot be established
 * (missing run id, API error), success is withheld. A missing `CI Gate` status
 * blocks the merge on its own, so withholding is the safe direction.
 *
 * Run IDs are compared rather than timestamps because a run id is assigned once
 * at creation and is immutable and monotonic across re-run attempts, whereas
 * re-running a run moves its timestamps and can make an older run look newer.
 *
 * @param {object} params
 * @param {number} params.selfRunId this run's `GITHUB_RUN_ID`.
 * @returns {Promise<{allowed: boolean, reason?: string, supersededBy?: number, apiFailure?: boolean}>}
 */
async function assertSuccessIsCurrent({
  github,
  core,
  owner,
  repo,
  sha,
  selfRunId,
}) {
  if (!Number.isSafeInteger(selfRunId)) {
    core.warning(
      'CI Gate: GITHUB_RUN_ID is unavailable — withholding the success verdict ' +
        'because it cannot be proven current.',
    );
    return { allowed: false, reason: 'unknown-run-id' };
  }

  // Fetch existing `CI Gate` statuses for the SHA up front — used both to catch
  // a newer run's already-posted RED verdict (B, below) and, since LS-9579, to
  // tell whether a newer COMPLETED candidate run in (A) ever actually spoke.
  let existingGateStatuses;
  try {
    const { data } = await withStatusRetry(() =>
      github.rest.repos.listCommitStatusesForRef({
        owner,
        repo,
        ref: sha,
        per_page: 100,
      }),
    );
    existingGateStatuses = (data || []).filter(
      (status) => status.context === CI_GATE_CONTEXT,
    );
  } catch (e) {
    core.warning(
      `CI Gate: could not list commit statuses for ${sha} (${e.message}) — ` +
        'withholding the success verdict because currency cannot be confirmed ' +
        '(not because a newer failure was found).',
    );
    return {
      allowed: false,
      reason: 'status-lookup-failed',
      apiFailure: true,
    };
  }

  // Run ids that have already posted SOME `CI Gate` status (any state) for this
  // SHA — used below (LS-9579) to tell a candidate that genuinely has not had
  // its chance to speak yet from one that already ran to completion and simply
  // never managed to post (e.g. its own `createCommitStatus` call exhausted
  // retries under a rate-limited installation token).
  const postedRunIds = new Set(
    existingGateStatuses
      .map((status) => runIdFromTargetUrl(status.target_url))
      .filter((id) => id !== null),
  );

  // (A) Does a NEWER CI run exist for this SHA that will post its own verdict?
  // If so we are a superseded re-run and our verdict is stale by construction.
  // Runs that can never post are ignored so we do not withhold in favour of a
  // run that will never speak — at the run level (CONCLUSIONS_THAT_POST_NO_VERDICT)
  // and, since LS-9565, at the job level too (CI_PIPELINE_JOB_NAME skipped).
  try {
    const { data } = await withStatusRetry(() =>
      github.rest.actions.listWorkflowRunsForRepo({
        owner,
        repo,
        head_sha: sha,
        per_page: 100,
      }),
    );
    const candidates = (data.workflow_runs || [])
      .filter(
        (run) =>
          CI_RUN_WORKFLOW_NAMES.includes(run.name) &&
          run.id > selfRunId &&
          !CONCLUSIONS_THAT_POST_NO_VERDICT.includes(run.conclusion),
      )
      .sort((a, b) => b.id - a.id);

    // LS-9565: the run-level filter above misses a run that concluded `success`
    // overall but whose CI Pipeline JOB was short-circuited by the
    // check-prior-success guard. Such a run performs no CI and posts no verdict,
    // so it must not silence this one. Walk newest-first and stop at the first
    // candidate that will actually speak.
    for (const [index, candidate] of candidates.entries()) {
      if (index >= MAX_SUPERSEDING_RUN_INSPECTIONS) {
        core.warning(
          `CI Gate: more than ${MAX_SUPERSEDING_RUN_INSPECTIONS} newer CI runs ` +
            `for ${sha} — withholding success rather than probing further.`,
        );
        return {
          allowed: false,
          reason: 'superseded-run',
          supersededBy: candidate.id,
        };
      }
      // LS-9754: a candidate sitting in a NOT_YET_STARTED_RUN_STATUS has not
      // started a single job — the orchestrator's `concurrency:` block is
      // workflow-level, so a run blocked on it has not even begun evaluating
      // jobs, let alone run any CI. GitHub surfaces this pre-start state as
      // `queued`, `pending`, `waiting`, or `requested` depending on exactly
      // why the run hasn't started (concurrency-group contention observed as
      // `pending` on PR #7830 itself, not `queued` — see below); `in_progress`
      // is excluded from this set deliberately; see its own case below. Since
      // LS-9754 keyed that concurrency group on head SHA, a not-yet-started
      // sibling for THIS SAME SHA is guaranteed to be blocked behind this
      // run's own concurrency slot — it cannot be executing concurrently and
      // will only start once this run finishes. Treating it as superseding
      // here withholds this run's genuine green verdict for nothing: the
      // blocked run's own `check-prior-success` guard has no posted `CI Gate`
      // to see once it finally starts, so it dispatches a full, redundant
      // sequential re-run of the entire pipeline before it can post anything
      // itself — replacing the parallel-duplicate waste LS-9754 fixed with a
      // sequential-duplicate one. Posting now carries no race risk precisely
      // because the blocked run hasn't started: check-prior-success will see
      // this posted success once it does.
      //
      // Observed in production on this exact PR (#7830): an initial fix here
      // checked only `status === 'queued'`, but the concurrency-blocked
      // sibling run's actual API status was `pending` — a distinct value in
      // GitHub's run-status enum — so it slipped past that check entirely and
      // reproduced the identical wasteful sequential re-run one run later.
      // Matching the full not-yet-started set (not just `queued`) closes that
      // gap.
      if (NOT_YET_STARTED_RUN_STATUSES.has(candidate.status)) {
        core.info(
          `CI Gate: ignoring newer run ${candidate.id} for ${sha} — its ` +
            `status is '${candidate.status}' (no job has started) and it ` +
            "cannot be running concurrently under this SHA's concurrency group.",
        );
        continue;
      }

      const skipped = await pipelineJobWasSkipped({
        github,
        core,
        owner,
        repo,
        runId: candidate.id,
        event: candidate.event,
        status: candidate.status,
      });
      if (skipped) {
        core.info(
          `CI Gate: ignoring newer run ${candidate.id} for ${sha} — its ` +
            `'${CI_PIPELINE_JOB_NAME}' job was skipped (prior-success ` +
            'short-circuit), so it runs no CI and posts no verdict.',
        );
        continue;
      }
      // LS-9579: a candidate run that has fully finished (`status ===
      // 'completed'`) but never posted ANY `CI Gate` status for this SHA has
      // silently failed to post (e.g. `createCommitStatus` itself exhausted
      // its retries while the installation's REST quota was exhausted) —
      // continue-on-error hides that from the job's own conclusion, so such
      // a run will NEVER speak. Treating it as superseding strands the SHA
      // in the exact deadlock this guard exists to prevent: the newest run
      // posts nothing, and every older re-run withholds forever "because the
      // newer run's verdict stands" — except it never will.
      //
      // This is ONLY safe to skip past when the candidate's run-level
      // `conclusion` is `'success'` — none of GATE_INPUT_JOBS run with
      // JOB-level continue-on-error (only steps inside summarize do), so a
      // genuine lint/test/build/etc. failure always bubbles the RUN
      // conclusion to `'failure'`, never `'success'`. A `'success'`
      // conclusion is therefore a reliable proof that the real CI content
      // passed and only the post step (or something after it) is what
      // silently failed. A `'failure'` conclusion must NOT be treated as
      // silent-and-safe: it could be a genuine GATE_INPUT_JOBS failure whose
      // own failure-post also got rate-limited, and letting an older run's
      // stale success through in that case would replay exactly the PR
      // #7006 danger (LS-9378) this guard exists to prevent — so it still
      // falls through to superseding below, the pre-existing safe default.
      // An in-flight run (`status !== 'completed'`) likewise still has not
      // had its chance to post and must still supersede.
      if (
        candidate.status === 'completed' &&
        candidate.conclusion === 'success' &&
        !postedRunIds.has(candidate.id)
      ) {
        core.info(
          `CI Gate: ignoring newer run ${candidate.id} for ${sha} — it ` +
            `completed successfully without posting any '${CI_GATE_CONTEXT}' ` +
            'status (the post likely failed silently under continue-on-error), ' +
            'so it will never speak.',
        );
        continue;
      }
      return {
        allowed: false,
        reason: 'superseded-run',
        supersededBy: candidate.id,
      };
    }
  } catch (e) {
    core.warning(
      `CI Gate: could not list CI runs for ${sha} (${e.message}) — withholding ` +
        'the success verdict because currency cannot be confirmed (not because ' +
        'a newer run was found).',
    );
    return { allowed: false, reason: 'run-lookup-failed', apiFailure: true };
  }

  // (B) Has a newer run already posted a RED gate for this SHA? Redundant with
  // (A) when the runs listing is complete, but it survives pagination and API
  // lag — and a red verdict from a newer run is the exact thing we must never
  // overwrite. Reuses the statuses fetched above.
  const newerFailure = existingGateStatuses
    .filter((status) => status.state === 'failure')
    .map((status) => runIdFromTargetUrl(status.target_url))
    .filter((id) => id !== null && id > selfRunId)
    .sort((a, b) => b - a)[0];
  if (newerFailure !== undefined) {
    return {
      allowed: false,
      reason: 'newer-failure-posted',
      supersededBy: newerFailure,
    };
  }

  return { allowed: true };
}

/**
 * Decide whether THIS run may post a `failure` verdict for `sha` (LS-9754).
 *
 * WHY: `assertSuccessIsCurrent` already stops a stale `success` from
 * overwriting a newer run's already-posted `failure` (part B there). Nothing
 * previously guarded the reverse: a `failure` post was considered always safe
 * (LS-9378 — "turning a SHA red is never unsafe"), which holds for a true
 * re-run of the same logical attempt but not for two full pipelines the
 * orchestrator accidentally ran in parallel on the identical head SHA
 * (LS-9754's root cause — fixed separately via a head-SHA-keyed concurrency
 * group, but this guard is the reconciliation half: it must hold even if a
 * duplicate slips through). Observed on PR #7374: one duplicate's isolated
 * E2E flake posted `failure` while its sibling had already posted a clean
 * `success` for the exact same SHA — and because `failure` posted with no
 * currency check, GitHub's last-writer-wins-by-created_at commit-status
 * semantics let that stale failure keep outranking the already-posted green
 * verdict for 30+ minutes, blocking the merge queue on a result the sibling
 * run had already superseded.
 *
 * This mirrors `get_check_runs`' job-listing behavior, which dedupes by job
 * name and keeps only the newest run's result — CI Gate is a single commit
 * status rather than a per-job check run, so it has no such dedup for free
 * and has to compare run ids explicitly the same way `assertSuccessIsCurrent`
 * already does for the success direction.
 *
 * THE INVARIANT: only an already-POSTED newer `success` withholds a `failure`
 * — this does NOT do the expensive newer-run-existence lookup
 * `assertSuccessIsCurrent` performs, so a genuine failure with no newer
 * verdict posted yet always goes through immediately. That keeps this
 * narrowly scoped to the reported symptom (a stale failure outliving an
 * already-green sibling) without reintroducing the deadlock risk a full
 * "failure must also prove currency" rule would carry — a real failure must
 * still always eventually become visible.
 *
 * Fails OPEN (posts the failure) on a missing run id or a status-lookup
 * error: a real failure must always be visible, and this guard only ever
 * withholds when it can positively confirm a newer green already stands.
 *
 * @param {object} params
 * @param {number} params.selfRunId this run's `GITHUB_RUN_ID`.
 * @returns {Promise<{allowed: boolean, reason?: string, supersededBy?: number}>}
 */
async function assertFailureIsCurrent({
  github,
  core,
  owner,
  repo,
  sha,
  selfRunId,
}) {
  if (!Number.isSafeInteger(selfRunId)) {
    return { allowed: true };
  }

  let existingGateStatuses;
  try {
    const { data } = await withStatusRetry(() =>
      github.rest.repos.listCommitStatusesForRef({
        owner,
        repo,
        ref: sha,
        per_page: 100,
      }),
    );
    existingGateStatuses = (data || []).filter(
      (status) => status.context === CI_GATE_CONTEXT,
    );
  } catch (e) {
    core.warning(
      `CI Gate: could not confirm currency before posting failure for ${sha} ` +
        `(${e.message}) — posting anyway (a real failure must always be visible).`,
    );
    return { allowed: true };
  }

  const newerSuccess = existingGateStatuses
    .filter((status) => status.state === 'success')
    .map((status) => runIdFromTargetUrl(status.target_url))
    .filter((id) => id !== null && id > selfRunId)
    .sort((a, b) => b - a)[0];

  if (newerSuccess !== undefined) {
    return {
      allowed: false,
      reason: 'newer-success-posted',
      supersededBy: newerSuccess,
    };
  }

  return { allowed: true };
}

/**
 * Decide whether THIS run may post the `no-verdict` PENDING gate for `sha`
 * (LS-10140).
 *
 * WHY: a cancelled job produced no evidence. It cannot prove the SHA passed,
 * which is why the gate goes pending rather than green — but by the same token
 * it cannot overturn a verdict a run that DID execute already earned. Commit
 * statuses are last-writer-wins by created_at, so posting pending over an
 * existing `success` would re-block an already-merge-ready SHA, and posting it
 * over an existing `failure` would hide a real break behind an in-flight
 * amber. Both are regressions of LS-8219, whose evidence was exactly this
 * shape: a cancelled post-merge duplicate speaking last on a SHA whose gating
 * run had already spoken.
 *
 * Unlike `assertSuccessIsCurrent` this does NOT compare run ids. Age is
 * irrelevant here: a cancelled run has nothing to say at any age, so ANY
 * terminal verdict already on the SHA — older or newer — outranks it. The
 * seeded `pending` from `seedPendingCiGate` is not terminal and is correctly
 * overwritten (both are pending; the fuller description wins).
 *
 * Fails CLOSED (withholds the pending post) when the statuses lookup errors:
 * the alternative is overwriting a verdict we could not read. A missing
 * pending is harmless — `seedPendingCiGate` has already left a pending status
 * on the SHA, so the gate is never silently absent.
 *
 * @returns {Promise<{allowed: boolean, reason?: string, existingState?: string}>}
 */
async function assertNoVerdictIsSafe({ github, core, owner, repo, sha }) {
  let existingGateStatuses;
  try {
    const { data } = await withStatusRetry(() =>
      github.rest.repos.listCommitStatusesForRef({
        owner,
        repo,
        ref: sha,
        per_page: 100,
      }),
    );
    existingGateStatuses = (data || []).filter(
      (status) => status.context === CI_GATE_CONTEXT,
    );
  } catch (e) {
    core.warning(
      `CI Gate: could not list commit statuses for ${sha} (${e.message}) — ` +
        'withholding the no-verdict pending rather than risking an overwrite ' +
        'of a terminal verdict this lookup could not read.',
    );
    return { allowed: false, reason: 'status-lookup-failed' };
  }

  const terminal = existingGateStatuses.find(
    (status) => status.state === 'success' || status.state === 'failure',
  );
  if (terminal) {
    return {
      allowed: false,
      reason: 'terminal-verdict-exists',
      existingState: terminal.state,
    };
  }

  return { allowed: true };
}

/**
 * Whether an Octokit REST error is a transient rate-limit/5xx condition worth
 * retrying (LS-9359). Primary GitHub App installation rate limits surface as
 * 403 with an "API rate limit exceeded" message; secondary rate limits can
 * surface as 403 or 429; server-side failures are 5xx.
 */
function isRetryableStatusError(err) {
  const status = err && err.status;
  if (typeof status !== 'number') return false;
  if (status >= 500) return true;
  if (status === 429) return true;
  if (status === 403 && /rate limit/i.test(err.message || '')) return true;
  return false;
}

/**
 * Retry an Octokit call a couple of times with a short fixed backoff, but only
 * for transient rate-limit/5xx errors (isRetryableStatusError). Any other
 * error — or the final exhausted attempt — rethrows so the caller decides how
 * to degrade.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ retries?: number, delayMs?: number }} [opts]
 * @returns {Promise<T>}
 */
async function withStatusRetry(fn, { retries = 2, delayMs = 500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isRetryableStatusError(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

/**
 * Post the aggregate `CI Gate` commit status for the PR head SHA.
 *
 * SHA-currency guard: re-fetch the PR's current head SHA and no-op (post
 * nothing) if it advanced past the SHA this run evaluated. A stale verdict
 * posted to an old SHA cannot satisfy the gate for the current head anyway, but
 * skipping avoids racing a newer run and avoids spending an API write on a SHA
 * nobody will merge.
 *
 * @param {object} params
 * @param {number} [params.prNumber] PR number to post against when the run
 *   has no `pull_request` in its event payload (LS-9148: workflow_dispatch
 *   runs the orchestrator resolved a PR for). Ignored when a payload PR is
 *   present — the payload is always the authoritative source when it exists.
 * @param {string} [params.headSha] Head SHA to target alongside `prNumber`.
 *   Required together with `prNumber` for the no-payload path; without it
 *   there is no SHA to post the status to.
 * @returns {Promise<{posted: boolean, reason?: string, state?: string, sha?: string, currentSha?: string, failing?: string[]}>}
 */
async function postCiGate({
  github,
  context,
  core,
  results,
  prNumber,
  headSha,
}) {
  const { owner, repo } = context.repo;
  const payloadPr = context.payload && context.payload.pull_request;

  // LS-9148: workflow_dispatch (manual re-runs, and the ci:run label handler,
  // which routes through workflow_dispatch to avoid displacing the
  // orchestrator's concurrency group) carries no `pull_request` in the event
  // payload. When the orchestrator resolved a PR for such a run, the caller
  // passes prNumber/headSha explicitly — fall back to those before giving up.
  const pr =
    payloadPr ||
    (prNumber && headSha ? { number: prNumber, head: { sha: headSha } } : null);

  if (!pr) {
    core.info(
      'CI Gate: no pull_request in the event payload and no prNumber/headSha ' +
        'provided — skipping (not a PR-scoped run).',
    );
    return { posted: false, reason: 'no-pr' };
  }

  const targetSha = pr.head.sha;

  // SHA-currency guard — re-read the PR's live head.
  let currentSha = targetSha;
  try {
    const { data: fresh } = await github.rest.pulls.get({
      owner,
      repo,
      pull_number: pr.number,
    });
    currentSha = fresh.head.sha;
  } catch (e) {
    core.warning(
      `CI Gate: could not re-fetch PR #${pr.number} head SHA (${e.message}) — ` +
        `proceeding with the event head ${targetSha}.`,
    );
  }

  if (currentSha !== targetSha) {
    core.info(
      `CI Gate: PR #${pr.number} head advanced (${targetSha} → ${currentSha}) ` +
        `since this run started — skipping stale verdict. A run for the current ` +
        `head will post its own gate.`,
    );
    return { posted: false, reason: 'stale', sha: targetSha, currentSha };
  }

  // LS-9467 / LS-10140: a `cancelled` gate input is not self-explanatory. It
  // can mean a real failure that completed just before the job's rollup landed
  // on `cancelled` (LS-9467), a runner the pool tore down mid-install, a job
  // that never got a runner at all and recorded zero steps, or a deliberate
  // stop. Classify each one from the run's own jobs BEFORE folding — the same
  // runner-cancellation.js rules .github/actions/detect-runner-shutdown
  // applies — so the gate and the shutdown reporter can never disagree about
  // the same job (LS-10140 AC2).
  const selfRunIdForJobCheck = Number(process.env.GITHUB_RUN_ID);
  let effectiveResults = results;
  /** @type {Record<string, string>} jobKey → classifyCancelledJob result */
  const cancelClassifications = {};
  const cancelledKeys = GATE_INPUT_JOBS.filter(
    (jobKey) => results && results[jobKey] === 'cancelled',
  );
  const failedKeys = GATE_INPUT_JOBS.filter(
    (jobKey) => results && results[jobKey] === 'failure',
  );

  if (
    (cancelledKeys.length > 0 || failedKeys.length > 0) &&
    Number.isSafeInteger(selfRunIdForJobCheck)
  ) {
    // One paginated Jobs lookup for the whole run, shared across every
    // cancelled or failed key — this path only runs when something went wrong.
    const jobs = await listRunJobs({
      github,
      core,
      owner,
      repo,
      runId: selfRunIdForJobCheck,
    });
    // LS-10311: a `failure` that is really a dead runner becomes a cancelled
    // runner-shutdown, so it folds as no-verdict (pending) instead of red.
    for (const jobKey of failedKeys) {
      const runnerDeath = await failedGateJobWasRunnerDeath({
        github,
        core,
        owner,
        repo,
        jobs,
        jobKey,
      });
      if (runnerDeath) {
        if (effectiveResults === results) effectiveResults = { ...results };
        effectiveResults[jobKey] = 'cancelled';
        cancelClassifications[jobKey] = RUNNER_SHUTDOWN;
        core.warning(
          `CI Gate: "${jobKey}" reported 'failure' but its runner was shut ` +
            'down under it with no failed step — treating it as a runner ' +
            'shutdown, not a code failure (LS-10311).',
        );
      }
    }
    for (const jobKey of cancelledKeys) {
      const classification = await classifyCancelledGateJob({
        github,
        core,
        owner,
        repo,
        jobs,
        jobKey,
      });
      cancelClassifications[jobKey] = classification;
      if (gateEffectOfCancellation(classification) === 'failure') {
        if (effectiveResults === results) effectiveResults = { ...results };
        effectiveResults[jobKey] = 'failure';
        core.warning(
          `CI Gate: "${jobKey}" rolled up to 'cancelled' but a matching job ` +
            `instance had a real failing step — treating it as 'failure' ` +
            `(LS-9467).`,
        );
      }
    }
  }

  const { conclusion, failing, cancelled, ignored } =
    computeGateConclusion(effectiveResults);
  const state =
    conclusion === 'success'
      ? 'success'
      : conclusion === NO_VERDICT
        ? 'pending'
        : 'failure';

  if (cancelled.length > 0) {
    const detail = cancelled
      .map(
        (jobKey) => `${jobKey} (${cancelClassifications[jobKey] || NO_SIGNAL})`,
      )
      .join(', ');
    core.info(
      `CI Gate: cancelled jobs for PR #${pr.number} ${targetSha}: ${detail}`,
    );
  }
  // LS-9378: red may always be posted; green must prove it is the newest word
  // on this SHA. Without this, re-running a superseded run replays its stale
  // verdict over a newer run's failure. See assertSuccessIsCurrent.
  const selfRunId = Number(process.env.GITHUB_RUN_ID);
  let effectiveState = state;
  let pendingReason;
  let description;
  if (conclusion === 'success') {
    description = 'All CI checks passed';
  } else if (conclusion === NO_VERDICT) {
    // Name the cause rather than just "cancelled": on a runner shutdown the
    // author needs to read "not your code" from the required check itself, not
    // only from the separate PR comment.
    const detail = cancelled
      .map(
        (jobKey) => `${jobKey}: ${cancelClassifications[jobKey] || NO_SIGNAL}`,
      )
      .join(', ');
    description = `No verdict — ${detail}; re-run pending`.slice(
      0,
      MAX_DESCRIPTION_LENGTH,
    );
  } else {
    description = `Failing: ${failing.join(', ')}`.slice(
      0,
      MAX_DESCRIPTION_LENGTH,
    );
  }

  if (state === 'pending') {
    // LS-10140: a cancelled run produced NO evidence, so it must never
    // downgrade a verdict some run actually earned for this SHA. Commit
    // statuses are last-writer-wins by created_at, so posting pending over an
    // existing green would block a merge that was legitimately unblocked —
    // precisely the LS-8219 hazard (a cancelled post-merge duplicate latching
    // onto a SHA whose gating run was already green), re-armed in a different
    // colour. Withhold whenever ANY terminal `CI Gate` verdict already stands.
    const pendingSafety = await assertNoVerdictIsSafe({
      github,
      core,
      owner,
      repo,
      sha: targetSha,
    });
    if (!pendingSafety.allowed) {
      core.info(
        `CI Gate: withholding the no-verdict 'pending' for ${targetSha} on PR ` +
          `#${pr.number} — a terminal '${pendingSafety.existingState}' verdict ` +
          'already stands for this SHA and a cancelled run has no evidence to ' +
          'overturn it.',
      );
      return {
        posted: false,
        reason: pendingSafety.reason,
        sha: targetSha,
        failing,
        cancelled,
        ignored,
        cancelClassifications,
      };
    }
  }

  if (state === 'failure') {
    // LS-9754: a stale failure must not outrank an already-posted newer
    // success — see assertFailureIsCurrent.
    const failureCurrency = await assertFailureIsCurrent({
      github,
      core,
      owner,
      repo,
      sha: targetSha,
      selfRunId,
    });
    if (!failureCurrency.allowed) {
      core.info(
        `CI Gate: withholding 'failure' for ${targetSha} on PR #${pr.number} ` +
          `(${failureCurrency.reason}, superseded by run ` +
          `${failureCurrency.supersededBy}) — the newer run's success stands.`,
      );
      return {
        posted: false,
        reason: failureCurrency.reason,
        sha: targetSha,
        supersededBy: failureCurrency.supersededBy,
        failing,
        ignored,
      };
    }
  }

  if (state === 'success') {
    const currency = await assertSuccessIsCurrent({
      github,
      core,
      owner,
      repo,
      sha: targetSha,
      selfRunId,
    });
    if (!currency.allowed) {
      // LS-9591: a currency check that failed because an API call errored
      // (rate limit / 5xx) has NOT confirmed a newer run exists — it simply
      // could not look. Withholding silently in that case stranded the SHA
      // with no `CI Gate` context at all (PR #7243, PR #7323): the merge
      // queue then waits on a status that will never appear unless a human
      // notices and manually re-triggers the job. Post a `pending` verdict
      // instead so the stall is visible on the SHA and can be superseded by
      // this or any later run's terminal verdict (commit statuses are
      // last-writer-wins by created_at). A genuinely confirmed newer run
      // (superseded-run / newer-failure-posted) still gets the pre-existing
      // silent no-op — that newer run owns posting the verdict for this SHA.
      if (currency.apiFailure) {
        effectiveState = 'pending';
        pendingReason = currency.reason;
        description =
          `CI Gate: withheld (${currency.reason}) — retry pending`.slice(
            0,
            MAX_DESCRIPTION_LENGTH,
          );
        core.info(
          `CI Gate: posting 'pending' for ${targetSha} on PR #${pr.number} ` +
            `(${currency.reason}) — currency could not be confirmed due to an ` +
            'API error, not because a newer run was found. A later run will ' +
            'supersede this with a terminal verdict.',
        );
      } else {
        core.info(
          `CI Gate: withholding 'success' for ${targetSha} on PR #${pr.number} ` +
            `(${currency.reason}` +
            (currency.supersededBy
              ? `, superseded by run ${currency.supersededBy}`
              : '') +
            `) — the newer run's verdict stands.`,
        );
        return {
          posted: false,
          reason: currency.reason,
          sha: targetSha,
          supersededBy: currency.supersededBy,
        };
      }
    }
  }

  const target_url = Number.isSafeInteger(selfRunId)
    ? `https://github.com/${owner}/${repo}/actions/runs/${selfRunId}`
    : undefined;

  // LS-9359: a GitHub App installation rate-limit/5xx blip here must not throw
  // unhandled — that fails the whole summarize job (and CI Gate /
  // process-merge-queue with it) even though every real check already passed.
  // Retry transient errors briefly; if they persist, degrade to a no-op post
  // (mirroring the pulls.get() fallback above) rather than crashing the job.
  try {
    await withStatusRetry(() =>
      github.rest.repos.createCommitStatus({
        owner,
        repo,
        sha: targetSha,
        state: effectiveState,
        context: CI_GATE_CONTEXT,
        description,
        target_url,
      }),
    );
  } catch (e) {
    core.warning(
      `CI Gate: failed to post '${effectiveState}' for ${targetSha} on PR ` +
        `#${pr.number} after retries (${e.message}) — the gate status was not ` +
        'posted; a subsequent run or manual retrigger will post it.',
    );
    return {
      posted: false,
      reason: 'status-post-failed',
      sha: targetSha,
      failing,
      ignored,
    };
  }

  core.info(
    `CI Gate: posted '${effectiveState}' for ${targetSha} on PR #${pr.number} — ${description}`,
  );
  return {
    posted: true,
    state: effectiveState,
    sha: targetSha,
    failing,
    cancelled,
    ignored,
    cancelClassifications,
    ...(pendingReason ? { reason: pendingReason } : {}),
  };
}

/**
 * Seed a `pending` `CI Gate` commit status on the PR head SHA as soon as a PR
 * is opened, synchronized, or reopened (LS-9543).
 *
 * WHY: PR #7202 squash-merged to main while `CI Gate` had never been posted
 * for its head SHA — the self-hosted runner queue (~14 min to first job) was
 * slower than the open→merge window (6m21s), so at merge time the required
 * context simply did not exist. `bypass_actors` in .github/ruleset.json grant
 * the repo owner an unconditional status-check bypass, and with the context
 * entirely ABSENT that bypass produced a silent, no-warning merge — nothing
 * in the UI or API surfaced an outstanding requirement to deliberately
 * override. A `pending` status is not silent: GitHub's merge evaluator
 * treats it as an unmet requirement like any other in-flight check, so
 * getting past it (bypass or not) requires the explicit "merge without
 * waiting for requirements" action rather than an ordinary merge that looks
 * indistinguishable from one with no outstanding CI at all. This closes the
 * hole named in LS-9543's acceptance criteria without touching
 * `bypass_actors` — the owner's emergency escape hatch stays intact, but
 * using it now leaves a deliberate, visible trail.
 *
 * Runs on a GitHub-hosted runner (ci-orchestrator.yml's `seed-ci-gate` job)
 * specifically so it is NOT subject to the same self-hosted runner queue
 * latency that created the race in the first place — it must win against the
 * open→merge window, not just the CI pipeline.
 *
 * Idempotent and non-destructive: no-ops if ANY `CI Gate` status already
 * exists for this SHA (pending, success, or failure), so this can never
 * regress a terminal verdict back to pending — commit statuses are
 * last-writer-wins by created_at, and the real `postCiGate` verdict from the
 * CI Pipeline's `summarize` job supersedes this seed once CI completes.
 *
 * Fails closed on lookup errors (skips the seed rather than risking a
 * duplicate/racing post) and degrades gracefully on post errors — either way
 * the terminal `postCiGate` call is unaffected and still owns the real
 * verdict.
 *
 * @param {object} params
 * @returns {Promise<{seeded: boolean, reason?: string, sha?: string}>}
 */
async function seedPendingCiGate({ github, context, core }) {
  const { owner, repo } = context.repo;
  const pr = context.payload && context.payload.pull_request;

  if (!pr) {
    core.info(
      'CI Gate seed: no pull_request in the event payload — skipping (not a PR-scoped run).',
    );
    return { seeded: false, reason: 'no-pr' };
  }

  const sha = pr.head.sha;

  let existingStatuses;
  try {
    const { data } = await withStatusRetry(() =>
      github.rest.repos.listCommitStatusesForRef({
        owner,
        repo,
        ref: sha,
        per_page: 100,
      }),
    );
    existingStatuses = data || [];
  } catch (e) {
    core.warning(
      `CI Gate seed: could not list commit statuses for ${sha} (${e.message}) — ` +
        'skipping the seed rather than risking a duplicate/racing post. The ' +
        "CI Pipeline's terminal verdict is unaffected.",
    );
    return { seeded: false, reason: 'status-lookup-failed', sha };
  }

  const alreadyPosted = existingStatuses.some(
    (status) => status.context === CI_GATE_CONTEXT,
  );
  if (alreadyPosted) {
    core.info(
      `CI Gate seed: a '${CI_GATE_CONTEXT}' status already exists for ${sha} — ` +
        'not overwriting it with pending.',
    );
    return { seeded: false, reason: 'already-posted', sha };
  }

  try {
    await withStatusRetry(() =>
      github.rest.repos.createCommitStatus({
        owner,
        repo,
        sha,
        state: 'pending',
        context: CI_GATE_CONTEXT,
        description: 'Waiting for CI Pipeline to report results',
      }),
    );
  } catch (e) {
    core.warning(
      `CI Gate seed: failed to post 'pending' for ${sha} on PR #${pr.number} ` +
        `after retries (${e.message}) — the SHA is unguarded until the CI ` +
        'Pipeline posts its terminal verdict.',
    );
    return { seeded: false, reason: 'status-post-failed', sha };
  }

  core.info(`CI Gate seed: posted 'pending' for ${sha} on PR #${pr.number}.`);
  return { seeded: true, sha };
}

module.exports = {
  CI_GATE_CONTEXT,
  CI_PIPELINE_JOB_NAME,
  CI_RUN_WORKFLOW_NAMES,
  CANCELLABLE_TEST_JOB_NAME_PREFIX,
  GATE_JOB_LEAF_NAMES,
  GATE_INPUT_JOBS,
  NO_VERDICT,
  MAX_SUPERSEDING_RUN_INSPECTIONS,
  computeGateConclusion,
  pipelineJobWasSkipped,
  runIdFromTargetUrl,
  cancelledJobHadRealFailure,
  classifyCancelledGateJob,
  jobNameMatchesGateKey,
  assertNoVerdictIsSafe,
  assertSuccessIsCurrent,
  assertFailureIsCurrent,
  isRetryableStatusError,
  postCiGate,
  seedPendingCiGate,
};
