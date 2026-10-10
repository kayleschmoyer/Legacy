// LS-10571: batched merge queue with bisection on failure.
//
// Instead of merging each ready PR on its own, the queue validates a whole
// set of ready PRs together and lands them as one tested unit:
//
//   1. Build   — create `mq/test/<id>` at the current main tip and merge each
//                PR's validated head into it, in queue order (oldest PR
//                first). A final metadata commit (same tree) records the set.
//   2. Test    — dispatch the CI Orchestrator on that ref with base_sha set to
//                the main tip, so CI scopes to the union of the PRs' changes.
//   3. Land    — when the run is green and main has not moved, squash-merge
//                each PR through the merge API in order (one commit per PR on
//                main, so any single PR can still be reverted on its own), then
//                assert main's tree equals the tested tree.
//   4. Bisect  — when a set of N>1 PRs fails, split it into halves and test
//                both halves in parallel on the current main. The first green
//                half lands; if both are green (the failure was an interaction
//                between halves) the first lands and the second is retested on
//                the new main. A failing single-PR set is ejected.
//
// Safety rules (merge-queue review, 2026-10) so that an innocent PR is never
// ejected or starved, and CI is not spent re-learning what is already known:
//
//   - Flakes: a red verdict is confirmed by re-running only the failed jobs
//     once before anything is split or ejected.
//   - Systemic failure: when both halves of a split fail, they are held (and
//     an alert raised) for HOLD_MS before the queue descends further. That
//     pattern usually means main itself, or a shared dependency, is broken.
//     A push to main during the hold retests both halves on the new main.
//   - Lineage: bisection halves and their descendants are rebuilt as-is when
//     main moves under them; they are never mixed back into the general pool,
//     so the culprit is always isolated.
//   - No verdict (infra): re-run once, then rebuilt up to MAX_INFRA_ROUNDS
//     times (counted in the set's metadata, so a rebuild cannot reset it),
//     then bisected like a failure. A PR that hangs CI cannot loop the queue.
//   - Landing: a failed land keeps every other set alive. A green set whose
//     land is refused is retried without new CI; a PR the merge API keeps
//     refusing is ejected rather than wedging the queue.
//   - Unknowns: a PR whose readiness could not be determined this pass (API
//     error, mergeable still computing, a check re-running) keeps its set
//     alive; only a positive change (new head, label removed, failing gate)
//     discards a set. Such a set cannot land until the PR is confirmed again.
//
// State lives entirely in git: every in-flight set is an `mq/test/*` branch
// whose tip commit message carries the set's metadata, and its verdict is the
// CI Orchestrator run on that tip (plus two bookkeeping statuses on the tip).
// Each queue run re-derives everything from those refs, so there is no
// separate store to drift or corrupt.
//
// decideBatchActions() is pure and holds every decision; runBatchQueue() is
// the thin I/O layer that gathers state and executes the decided actions.

const { CI_GATE_CONTEXT, runIdFromTargetUrl } = require('./ci-gate.js');

const BATCH_REF_PREFIX = 'mq/test/';
const MAX_BATCH_SIZE = 16;
const ORCHESTRATOR_WORKFLOW_FILE = 'ci-orchestrator.yml';
// Every batch run gets this many attempts in total. The re-run repeats only
// failed/cancelled jobs: it confirms a red verdict before bisecting or
// ejecting (flakes), and retries a run that ended without a verdict.
const MAX_BATCH_RUN_ATTEMPTS = 2;
// A set whose runs keep ending without a verdict is rebuilt on the current
// main this many times, then bisected as if it had failed.
const MAX_INFRA_ROUNDS = 2;
// A batch run still not completed this long after it started (jobs queued
// with no runner, or hung) counts as a run without a verdict.
const MAX_RUN_AGE_MS = 3 * 60 * 60 * 1000;
// Both halves of a split failed: hold them this long before descending.
const HOLD_MS = 60 * 60 * 1000;
// A green set whose land is refused with nothing landed is retried on later
// passes (no new CI) until this many attempts spanning at least
// LAND_RETRY_WINDOW_MS; then the refusing PR is ejected.
const MAX_LAND_ATTEMPTS = 3;
const LAND_RETRY_WINDOW_MS = 30 * 60 * 1000;
// A dispatched set with no orchestrator run after this long is considered lost
// (dispatch dropped) and is requeued.
const DISPATCH_GRACE_MS = 20 * 60 * 1000;
const META_START = '<!-- mq-batch-meta ';
const META_END = ' -->';
const MERGE_LABEL = 'merge-when-ready';

// LS-10620: informational commit status on each queued PR's head SHA saying
// whether the PR is in the queue's current run, linking to that run. It is
// never a required check, and merge-queue-processor.js ignores it when
// deciding readiness (a `pending` here must not block the PR it describes).
const MERGE_QUEUE_STATUS_CONTEXT = 'merge-queue';
// Bookkeeping statuses written on a batch tip (never on a PR head): land
// attempts so far, and whether the hold alert for this set was already sent.
const LAND_STATUS_CONTEXT = 'merge-queue/land';
const HOLD_STATUS_CONTEXT = 'merge-queue/hold';
// GitHub rejects status descriptions longer than 140 characters.
const STATUS_DESCRIPTION_MAX = 140;

function clipDescription(text) {
  return text.length <= STATUS_DESCRIPTION_MAX
    ? text
    : `${text.slice(0, STATUS_DESCRIPTION_MAX - 1)}…`;
}

function encodeBatchMeta(meta) {
  const prs = meta.prs.map((p) => `#${p.number}`).join(', ');
  return (
    `mq: batch ${meta.id} (${meta.prs.length} PR${meta.prs.length === 1 ? '' : 's'}: ${prs})\n\n` +
    `${META_START}${JSON.stringify(meta)}${META_END}\n`
  );
}

function parseBatchMeta(message) {
  if (typeof message !== 'string') return null;
  const start = message.indexOf(META_START);
  if (start === -1) return null;
  const end = message.indexOf(META_END, start + META_START.length);
  if (end === -1) return null;
  try {
    const meta = JSON.parse(message.slice(start + META_START.length, end));
    if (
      !meta ||
      typeof meta.id !== 'string' ||
      typeof meta.base !== 'string' ||
      !Array.isArray(meta.prs) ||
      meta.prs.length === 0 ||
      !meta.prs.every(
        (p) => Number.isInteger(p?.number) && typeof p?.head === 'string',
      )
    ) {
      return null;
    }
    return meta;
  } catch {
    return null;
  }
}

// Land-attempt bookkeeping lives in the description of a status on the batch
// tip: "attempt <n> since <ISO time>: <last error>".
function encodeLandAttempt({ count, since, message }) {
  return clipDescription(
    `attempt ${count} since ${new Date(since).toISOString()}: ${message || 'refused'}`,
  );
}

function parseLandAttempt(description) {
  const m = /^attempt (\d+) since (\S+?Z)/.exec(description ?? '');
  if (!m) return null;
  const since = Date.parse(m[2]);
  if (!Number.isFinite(since)) return null;
  return { count: Number(m[1]), since };
}

// Root ids are base-36 timestamps (fixed width for centuries, and base-36
// digit order matches ASCII order) and child ids extend the parent's
// (`abc` → `abc.1` / `abc.2`), so comparing segment by segment orders older
// batches first and the first half of every split before the second.
function compareBatchIds(a, b) {
  const as = a.split('.');
  const bs = b.split('.');
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    if (as[i] === undefined) return -1;
    if (bs[i] === undefined) return 1;
    if (as[i] !== bs[i]) return as[i] < bs[i] ? -1 : 1;
  }
  return 0;
}

function splitInHalves(prs) {
  const mid = Math.ceil(prs.length / 2);
  return [prs.slice(0, mid), prs.slice(mid)];
}

// Maps the set's CI Gate status and orchestrator run onto a verdict. The gate
// (posted on the batch tip by ci-gate.js) is authoritative once the run has
// finished: it already folds runner deaths and cancellations into "no
// verdict" rather than red (LS-10140/LS-10311). A run still in progress is
// pending even when an earlier attempt left a gate behind — that is what a
// confirmation re-run looks like. A run that finished without a terminal gate,
// or that has been running past MAX_RUN_AGE_MS, is infra, never a PR's fault.
// A success gate posted by the run's current attempt is green even while
// non-gating jobs (the Playwright report deploy) are still running (LS-11029).
function classifyBatchRun({
  gateState,
  gateCreatedAt,
  gateTargetUrl,
  run,
  createdAt,
  now,
}) {
  if (run && run.status !== 'completed') {
    if (
      gateState === 'success' &&
      isGateFromCurrentAttempt({ gateCreatedAt, gateTargetUrl, run })
    ) {
      return 'green';
    }
    const started = Date.parse(run.run_started_at ?? run.created_at);
    if (Number.isFinite(started) && now - started > MAX_RUN_AGE_MS) {
      return 'stuck';
    }
    return 'pending';
  }
  if (gateState === 'success') return 'green';
  if (gateState === 'failure' || gateState === 'error') return 'red';
  if (!run) {
    return now - createdAt > DISPATCH_GRACE_MS ? 'lost' : 'pending';
  }
  return 'infra';
}

// The gate's target_url names only the run, not the attempt, so a gate from
// this attempt is one that points at this run (or at no run) and was posted
// after the attempt started — run_started_at moves forward on every re-run.
function isGateFromCurrentAttempt({ gateCreatedAt, gateTargetUrl, run }) {
  const gateRunId = runIdFromTargetUrl(gateTargetUrl);
  if (gateRunId !== null && run.id !== undefined && gateRunId !== run.id) {
    return false;
  }
  const posted = Date.parse(gateCreatedAt);
  const started = Date.parse(run.run_started_at ?? run.created_at);
  return (
    Number.isFinite(posted) && Number.isFinite(started) && posted >= started
  );
}

/**
 * Pure reconciliation step. Given the main tip, the in-flight sets (each with
 * a verdict) and the PRs that currently pass every per-PR gate, returns the
 * ordered list of actions to execute:
 *
 *   discard { set, reason }  delete the set's ref (cancelling its run); its PRs
 *                            return to the pool
 *   rebuild { set, infraRounds }
 *                            rebuild the same PRs under the same id on the
 *                            current main (lineage kept, never re-pooled)
 *   land    { set }          squash-merge the set's PRs in order
 *   eject   { set, cause }   single-PR set failed — remove it from the queue
 *                            (cause 'red' or 'no-verdict')
 *   split   { set }          multi-PR set failed — test both halves
 *   rerun   { set }          re-run the failed jobs of the set's run
 *   hold    { set, until, notified }
 *                            both halves of a split failed — wait and alert
 *   start   { prs }          build and test a new set from the pool
 *
 * @param {object} args
 * @param {string} args.mainSha current main tip
 * @param {Array<{name:string, meta:object, verdict:string, run:object|null, holdNotified?:boolean}>} args.sets
 * @param {Map<number,string>} args.ready ready PR number → validated head SHA
 * @param {Map<number,string|null>} [args.uncertain] PR number → head SHA (or
 *   null when unknown) for PRs whose readiness could not be determined this
 *   pass. They keep an existing set alive but never let it land.
 * @param {number} [args.now]
 * @param {boolean} [args.landBlocked] decide everything except landing (used
 *   for the second decision after a land attempt in the same pass)
 * @param {number} [args.maxBatchSize]
 */
function decideBatchActions({
  mainSha,
  sets,
  ready,
  uncertain = new Map(),
  now = Date.now(),
  landBlocked = false,
  maxBatchSize = MAX_BATCH_SIZE,
}) {
  const actions = [];
  const sorted = [...sets].sort((a, b) =>
    compareBatchIds(a.meta.id, b.meta.id),
  );

  // A set is only meaningful while every PR in it is still in the queue at
  // exactly the head that was tested. A positive change (new push, label
  // removed, a gate failing, PR merged or closed) invalidates the whole set;
  // a PR we merely could not evaluate this pass does not.
  const live = [];
  const unconfirmed = new Set();
  for (const set of sorted) {
    let valid = true;
    for (const p of set.meta.prs) {
      if (ready.get(p.number) === p.head) continue;
      if (uncertain.has(p.number)) {
        const h = uncertain.get(p.number);
        if (h === null || h === undefined || h === p.head) {
          unconfirmed.add(set);
          continue;
        }
      }
      valid = false;
      break;
    }
    if (valid) {
      live.push(set);
    } else {
      actions.push({ type: 'discard', set, reason: 'pr-changed' });
    }
  }

  const attempts = (set) => set.run?.run_attempt ?? 1;
  const infraRounds = (set) => set.meta.infraRounds ?? 0;
  const isConfirmedRed = (set) =>
    set.verdict === 'red' &&
    (!set.run || attempts(set) >= MAX_BATCH_RUN_ATTEMPTS);
  const isInfraExhausted = (set) =>
    set.verdict === 'stuck' ||
    (set.verdict === 'infra' && attempts(set) >= MAX_BATCH_RUN_ATTEMPTS);
  // Failed for good: nothing left to retry at this set's size.
  const hardFailed = (set) =>
    isConfirmedRed(set) ||
    (isInfraExhausted(set) && infraRounds(set) >= MAX_INFRA_ROUNDS);
  const siblingOf = (set) =>
    set.meta.parent
      ? live.find((s) => s !== set && s.meta.parent === set.meta.parent)
      : undefined;
  const finishedAt = (set) => {
    const t = Date.parse(set.run?.updated_at ?? '');
    return Number.isFinite(t) ? t : (set.meta.createdAt ?? 0);
  };

  // Landing: among sets built on the current main, walk in id order and land
  // the first green one — but only once every set ordered before it has
  // failed. An undecided earlier sibling (pending/infra/unconfirmed) blocks,
  // so the first half of a split always gets the first chance to land.
  let landed = null;
  if (!landBlocked) {
    for (const set of live) {
      if (set.meta.base !== mainSha) continue;
      if (set.verdict === 'green' && !unconfirmed.has(set)) {
        landed = set;
        break;
      }
      if (set.verdict !== 'red') break;
    }
  }
  if (landed) actions.push({ type: 'land', set: landed });

  let inFlight = 0;
  const busy = new Set();
  const keep = (set) => {
    inFlight += 1;
    set.meta.prs.forEach((p) => busy.add(p.number));
  };
  // Main moved under a set that is not finished: a bisection descendant is
  // rebuilt as-is (it is implicated, or it is the retest of a green half);
  // a top-level set simply returns its PRs to the pool.
  const onStale = (set) => {
    if (set.meta.parent) {
      actions.push({ type: 'rebuild', set, infraRounds: infraRounds(set) });
      keep(set);
    } else {
      actions.push({ type: 'discard', set, reason: 'stale-base' });
    }
  };
  // The set has failed for good at its size: split it, or eject a single PR.
  // A split child first waits for its sibling's verdict; if the sibling also
  // failed for good, both are held (see the header) before descending.
  const onHardFailure = (set, cause, stale) => {
    const sibling = siblingOf(set);
    if (sibling && !hardFailed(sibling) && sibling.verdict !== 'green') {
      keep(set);
      return;
    }
    if (sibling && hardFailed(sibling)) {
      if (stale) {
        // Main moved while the pair was failing: whatever broke both may be
        // fixed now. Retest both halves on the new main, with fresh budgets.
        actions.push({ type: 'rebuild', set, infraRounds: 0 });
        keep(set);
        return;
      }
      const until = Math.max(finishedAt(set), finishedAt(sibling)) + HOLD_MS;
      if (now < until) {
        actions.push({
          type: 'hold',
          set,
          until,
          notified: !!set.holdNotified,
        });
        keep(set);
        return;
      }
    }
    if (set.meta.prs.length === 1) {
      actions.push({ type: 'eject', set, cause });
    } else {
      actions.push({ type: 'split', set });
      keep(set);
    }
  };

  for (const set of live) {
    if (set === landed) continue;
    // Landing moves main, so every other set's base is stale after it.
    const stale = landed !== null || set.meta.base !== mainSha;
    switch (set.verdict) {
      case 'red':
        if (!isConfirmedRed(set)) {
          // Confirm before acting: re-run only the failed jobs. A red result
          // still implicates the set's content even on a stale base.
          actions.push({ type: 'rerun', set });
          keep(set);
        } else {
          onHardFailure(set, 'red', stale);
        }
        break;
      case 'green':
      case 'pending':
        if (stale) onStale(set);
        else keep(set);
        break;
      case 'infra':
      case 'stuck':
        if (!isInfraExhausted(set) && !stale) {
          actions.push({ type: 'rerun', set });
          keep(set);
        } else if (stale) {
          onStale(set);
        } else if (infraRounds(set) < MAX_INFRA_ROUNDS) {
          actions.push({
            type: 'rebuild',
            set,
            infraRounds: infraRounds(set) + 1,
          });
          keep(set);
        } else {
          onHardFailure(set, 'no-verdict', stale);
        }
        break;
      default:
        // 'lost': dispatch never produced a run — rebuild from scratch.
        if (set.meta.parent) {
          actions.push({
            type: 'rebuild',
            set,
            infraRounds: infraRounds(set),
          });
          keep(set);
        } else {
          actions.push({ type: 'discard', set, reason: set.verdict });
        }
    }
  }

  // Start a new batch only when nothing else is in flight, so CI cost stays at
  // one batch (or one bisection lineage) at a time.
  if (inFlight === 0) {
    const excluded = new Set(busy);
    if (landed) landed.meta.prs.forEach((p) => excluded.add(p.number));
    for (const a of actions) {
      if (a.type === 'eject')
        a.set.meta.prs.forEach((p) => excluded.add(p.number));
    }
    const pool = [...ready.entries()]
      .filter(([number]) => !excluded.has(number))
      .sort(([a], [b]) => a - b)
      .slice(0, maxBatchSize)
      .map(([number, head]) => ({ number, head }));
    if (pool.length > 0) actions.push({ type: 'start', prs: pool });
  }

  return actions;
}

const VERDICT_PHRASE = {
  pending: 'CI running',
  green: 'CI passed, landing',
  red: 'CI failed, confirming',
  infra: 'retrying after a runner failure',
  stuck: 'CI stuck, retrying',
  lost: 'CI dispatch lost, requeueing',
};

/**
 * Pure: decides the `merge-queue` status for every candidate PR.
 *
 *   outcome (landed / ejected this pass)  → terminal state, wins over all else
 *   member of an in-flight set            → pending, links to the set's run
 *   ready but not in a set                → pending "Queued – position N of M"
 *   labeled but not ready for a batch     → pending "Waiting"
 *
 * @param {object} args
 * @param {Array<{name:string, meta:object, verdict:string, run:object|null}>} args.sets
 *   in-flight sets as they stand AFTER this pass's actions
 * @param {Array<{number:number, sha:string, ready:boolean}>} args.candidates
 *   every merge-when-ready PR targeting main, with its current head SHA
 * @param {Map<number,{sha:string,state:string,description:string,targetUrl?:string}>} args.outcomes
 * @param {string} [args.queueRunUrl] the queue workflow run doing this pass
 * @returns {Array<{number:number, sha:string, state:string, description:string, targetUrl?:string}>}
 */
function planQueueStatuses({
  sets,
  candidates,
  outcomes = new Map(),
  queueRunUrl,
}) {
  const setOf = new Map();
  for (const set of sets) {
    for (const p of set.meta.prs) setOf.set(p.number, set);
  }
  const waiting = candidates
    .filter((c) => c.ready && !setOf.has(c.number) && !outcomes.has(c.number))
    .sort((a, b) => a.number - b.number);
  const position = new Map(waiting.map((c, i) => [c.number, i + 1]));

  return candidates.map((c) => {
    const outcome = outcomes.get(c.number);
    if (outcome) {
      return {
        number: c.number,
        sha: outcome.sha ?? c.sha,
        state: outcome.state,
        description: clipDescription(outcome.description),
        targetUrl: outcome.targetUrl ?? queueRunUrl,
      };
    }
    const set = setOf.get(c.number);
    if (set) {
      const n = set.meta.prs.length;
      return {
        number: c.number,
        sha: c.sha,
        state: 'pending',
        description: clipDescription(
          `In batch ${set.meta.id} (${n} PR${n === 1 ? '' : 's'}) – ${VERDICT_PHRASE[set.verdict] ?? VERDICT_PHRASE.pending}`,
        ),
        targetUrl: set.run?.html_url ?? queueRunUrl,
      };
    }
    if (position.has(c.number)) {
      return {
        number: c.number,
        sha: c.sha,
        state: 'pending',
        description: clipDescription(
          `Queued – position ${position.get(c.number)} of ${waiting.length} for the next batch`,
        ),
        targetUrl: queueRunUrl,
      };
    }
    return {
      number: c.number,
      sha: c.sha,
      state: 'pending',
      description: clipDescription(
        'Waiting – not yet ready for a batch (checks, review or conflicts)',
      ),
      targetUrl: queueRunUrl,
    };
  });
}

/**
 * Best-effort publisher: a failed status write is logged and never fails or
 * aborts the queue pass. A status identical to the PR's current one is not
 * re-written — every pass would otherwise add one status per PR, and GitHub
 * stops accepting statuses for a context after 1000 per commit.
 */
async function publishQueueStatuses({
  client,
  owner,
  repo,
  plan,
  isDryRun = false,
}) {
  for (const s of plan) {
    if (isDryRun) {
      console.log(
        `🏃 DRY RUN: would set ${MERGE_QUEUE_STATUS_CONTEXT} on #${s.number}: ${s.state} – ${s.description}`,
      );
      continue;
    }
    try {
      if (await isCurrentStatus(s)) continue;
      await client.rest.repos.createCommitStatus({
        owner,
        repo,
        sha: s.sha,
        state: s.state,
        context: MERGE_QUEUE_STATUS_CONTEXT,
        description: s.description,
        ...(s.targetUrl ? { target_url: s.targetUrl } : {}),
      });
    } catch (error) {
      console.warn(
        `⚠️ Could not set ${MERGE_QUEUE_STATUS_CONTEXT} status on #${s.number}: ${error.message}`,
      );
    }
  }

  // Any read failure just means "write it".
  async function isCurrentStatus(s) {
    if (typeof client.rest.repos.getCombinedStatusForRef !== 'function') {
      return false;
    }
    try {
      const { data } = await client.rest.repos.getCombinedStatusForRef({
        owner,
        repo,
        ref: s.sha,
        per_page: 100,
      });
      const current = (data?.statuses || []).find(
        (st) => st.context === MERGE_QUEUE_STATUS_CONTEXT,
      );
      return (
        !!current &&
        current.state === s.state &&
        current.description === s.description &&
        (current.target_url || undefined) === (s.targetUrl || undefined)
      );
    } catch {
      return false;
    }
  }
}

/**
 * Gathers batch state from GitHub, decides, and executes.
 *
 * @param {object} deps
 * @param {object} deps.github Octokit (Merge Queue app)
 * @param {string} deps.owner
 * @param {string} deps.repo
 * @param {Array<object>} deps.readyPRs PR objects (pulls.get shape) that pass
 *   every per-PR gate and target main
 * @param {(pr: object, verdict: string) => Promise<{merged: boolean, sha?: string, reason?: string, message?: string}>} deps.mergePR
 *   `reason` on a refusal: 'head-moved', 'required-check-pending',
 *   'codeowner-review'. A throw is treated as reason 'error'.
 * @param {Map<number,string|null>} [deps.uncertainPRs] PRs labeled for the
 *   queue whose readiness could not be determined this pass (see
 *   decideBatchActions)
 * @param {(message: string) => Promise<void>} [deps.onAlert] raise a
 *   human-facing alert (held bisection, tree mismatch). Best-effort.
 * @param {boolean} [deps.isDryRun]
 * @param {() => number} [deps.now]
 * @param {number} [deps.maxBatchSize]
 * @param {Array<object>} [deps.candidatePRs] every merge-when-ready PR
 *   targeting main (pulls.get shape), ready or not — the PRs that get a
 *   `merge-queue` status (LS-10620). Defaults to readyPRs.
 * @param {object} [deps.statusClient] Octokit allowed to write commit statuses
 *   (the CI app — the Merge Queue app cannot, LS-9773). Defaults to github.
 * @param {string} [deps.queueRunUrl] URL of the queue workflow run doing this
 *   pass, used as the status link when a PR has no batch run yet
 */
async function runBatchQueue({
  github,
  owner,
  repo,
  readyPRs,
  mergePR,
  uncertainPRs = new Map(),
  onAlert = async () => {},
  isDryRun = false,
  now = () => Date.now(),
  maxBatchSize = MAX_BATCH_SIZE,
  candidatePRs = readyPRs,
  statusClient = github,
  queueRunUrl,
}) {
  const ready = new Map(readyPRs.map((pr) => [pr.number, pr.head.sha]));
  const uncertain = new Map(uncertainPRs);
  const readyByNumber = new Map(readyPRs.map((pr) => [pr.number, pr]));
  // PRs landed or ejected during this pass → their terminal merge-queue status.
  const outcomes = new Map();
  let mainSha = await getMainSha();
  let sets = await listSets();

  console.log(
    `\n🧺 Batch queue: main=${mainSha.slice(0, 7)}, ${readyPRs.length} ready PR(s), ` +
      `${uncertain.size} undetermined, ${sets.length} in-flight set(s)`,
  );
  for (const set of sets) {
    console.log(
      `   • ${set.name} base=${set.meta.base.slice(0, 7)} verdict=${set.verdict} PRs=${set.meta.prs.map((p) => '#' + p.number).join(',')}`,
    );
  }

  const decide = (landBlocked) =>
    decideBatchActions({
      mainSha,
      sets,
      ready,
      uncertain,
      now: now(),
      landBlocked,
      maxBatchSize,
    });

  let actions = decide(false);
  if (actions.length === 0) {
    console.log('🧺 Batch queue: nothing to do');
    // The sets are unchanged, but membership/queue position still needs
    // refreshing on the PRs.
    await syncStatuses(sets);
    return { actions };
  }
  if (isDryRun) {
    for (const a of actions) {
      console.log(
        `🏃 DRY RUN: would ${a.type} ${a.set ? a.set.name : a.prs.map((p) => '#' + p.number).join(',')}`,
      );
    }
    await syncStatuses(sets);
    return { actions };
  }

  // A land runs on its own first. Everything else was decided assuming the
  // land would move main; whether it did (fully, partly, or not at all) is
  // only known afterwards, so re-derive the rest from fresh state. A refused
  // land must not throw away other sets' CI.
  const landAction = actions.find((a) => a.type === 'land');
  if (landAction) {
    await execute(landAction);
    for (const n of outcomes.keys()) {
      ready.delete(n);
      uncertain.delete(n);
    }
    mainSha = await getMainSha();
    sets = await listSets();
    actions = [landAction, ...decide(true)];
    for (const action of actions.slice(1)) await execute(action);
  } else {
    for (const action of actions) await execute(action);
  }

  // Re-read the sets so statuses describe what is actually in flight now
  // (new/split sets, discarded ones), not what the plan intended.
  try {
    await syncStatuses(await listSets());
  } catch (error) {
    console.warn(
      `⚠️ Skipping ${MERGE_QUEUE_STATUS_CONTEXT} status sync: ${error.message}`,
    );
  }
  return { actions };

  // ── I/O helpers ──────────────────────────────────────────────────────────

  async function execute(action) {
    try {
      switch (action.type) {
        case 'discard':
          console.log(`🗑️ Discarding ${action.set.name} (${action.reason})`);
          await discardSet(action.set);
          break;
        case 'rebuild':
          console.log(
            `♻️ Rebuilding ${action.set.name} on the current main (infra round ${action.infraRounds})`,
          );
          await discardSet(action.set);
          await startSet(action.set.meta.id, action.set.meta.prs, {
            baseSha: await getMainSha(),
            parent: action.set.meta.parent ?? null,
            infraRounds: action.infraRounds,
          });
          break;
        case 'land':
          await landSet(action.set);
          break;
        case 'eject':
          await ejectSet(action.set, action.cause);
          break;
        case 'split':
          await splitSet(action.set);
          break;
        case 'rerun':
          console.log(
            `🔁 Re-running the failed jobs of batch CI for ${action.set.name} (${action.set.verdict})`,
          );
          try {
            await github.rest.actions.reRunWorkflowFailedJobs({
              owner,
              repo,
              run_id: action.set.run.id,
            });
          } catch (error) {
            // No failed job to re-run (the gate went red without one): re-run
            // the whole workflow so the attempt still counts, instead of
            // retrying this call on every pass.
            console.log(
              `⚠️ Could not re-run failed jobs for ${action.set.name} (${error.message}) — re-running the whole run`,
            );
            await github.rest.actions.reRunWorkflow({
              owner,
              repo,
              run_id: action.set.run.id,
            });
          }
          break;
        case 'hold':
          await holdSet(action);
          break;
        case 'start':
          await startSet(newBatchId(), action.prs, {
            baseSha: await getMainSha(),
            parent: null,
            infraRounds: 0,
          });
          break;
      }
    } catch (error) {
      console.error(`💥 Batch action ${action.type} failed: ${error.message}`);
    }
  }

  async function alert(message) {
    console.log(`::error::${message}`);
    try {
      await onAlert(message);
    } catch (error) {
      console.warn(`⚠️ Could not raise merge-queue alert: ${error.message}`);
    }
  }

  async function syncStatuses(currentSets) {
    const plan = planQueueStatuses({
      sets: currentSets,
      candidates: candidatePRs.map((pr) => ({
        number: pr.number,
        sha: pr.head.sha,
        ready: ready.get(pr.number) === pr.head.sha,
      })),
      outcomes,
      queueRunUrl,
    });
    await publishQueueStatuses({
      client: statusClient,
      owner,
      repo,
      plan,
      isDryRun,
    });
  }

  function newBatchId() {
    return now().toString(36);
  }

  async function getMainSha() {
    const { data } = await github.rest.git.getRef({
      owner,
      repo,
      ref: 'heads/main',
    });
    return data.object.sha;
  }

  async function listSets() {
    let refs;
    try {
      refs = await github.paginate(github.rest.git.listMatchingRefs, {
        owner,
        repo,
        ref: `heads/${BATCH_REF_PREFIX}`,
      });
    } catch (error) {
      if (error.status === 404) return [];
      throw error;
    }
    const out = [];
    for (const ref of refs) {
      const name = ref.ref.replace(/^refs\/heads\//, '');
      const sha = ref.object.sha;
      const { data: commit } = await github.rest.git.getCommit({
        owner,
        repo,
        commit_sha: sha,
      });
      const meta = parseBatchMeta(commit.message);
      if (!meta) {
        // Mid-build (crashed run) or foreign ref: no metadata commit yet.
        console.log(`⚠️ ${name} has no batch metadata — deleting`);
        await deleteRef(name);
        continue;
      }
      const run = await findRun(name, sha);
      const tip = await getTipStatuses(sha);
      out.push({
        name,
        sha,
        tree: commit.tree.sha,
        meta,
        run,
        landAttempt: tip.landAttempt,
        holdNotified: tip.holdNotified,
        verdict: classifyBatchRun({
          gateState: tip.gateState,
          gateCreatedAt: tip.gateCreatedAt,
          gateTargetUrl: tip.gateTargetUrl,
          run,
          createdAt: meta.createdAt,
          now: now(),
        }),
      });
    }
    return out;
  }

  async function getTipStatuses(sha) {
    const { data } = await github.rest.repos.getCombinedStatusForRef({
      owner,
      repo,
      ref: sha,
      per_page: 100,
    });
    const byContext = (ctx) =>
      (data.statuses || []).find((st) => st.context === ctx);
    const gate = byContext(CI_GATE_CONTEXT);
    return {
      gateState: gate?.state ?? null,
      gateCreatedAt: gate?.created_at ?? null,
      gateTargetUrl: gate?.target_url ?? null,
      landAttempt: parseLandAttempt(
        byContext(LAND_STATUS_CONTEXT)?.description,
      ),
      holdNotified: !!byContext(HOLD_STATUS_CONTEXT),
    };
  }

  async function setTipStatus(sha, context, state, description) {
    try {
      await statusClient.rest.repos.createCommitStatus({
        owner,
        repo,
        sha,
        state,
        context,
        description: clipDescription(description),
      });
      return true;
    } catch (error) {
      console.warn(
        `⚠️ Could not set ${context} on batch tip ${sha.slice(0, 7)}: ${error.message}`,
      );
      return false;
    }
  }

  async function findRun(branch, sha) {
    const { data } = await github.rest.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: ORCHESTRATOR_WORKFLOW_FILE,
      branch,
      event: 'workflow_dispatch',
      per_page: 10,
    });
    const runs = (data.workflow_runs || [])
      .filter((r) => r.head_sha === sha)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return runs[0] || null;
  }

  async function deleteRef(name) {
    try {
      await github.rest.git.deleteRef({ owner, repo, ref: `heads/${name}` });
    } catch (error) {
      if (error.status !== 404 && error.status !== 422) throw error;
    }
  }

  async function discardSet(set) {
    if (set.run && set.run.status !== 'completed') {
      try {
        await github.rest.actions.cancelWorkflowRun({
          owner,
          repo,
          run_id: set.run.id,
        });
      } catch (error) {
        console.warn(
          `⚠️ Could not cancel run ${set.run.id} for ${set.name}: ${error.message}`,
        );
      }
    }
    await deleteRef(set.name);
  }

  // Builds `mq/test/<id>` on baseSha with every PR merged in, adds the
  // metadata commit, and dispatches CI. A textual conflict while stacking
  // never fans out into extra CI runs: the first PR conflicting with main
  // itself is ejected, and a PR conflicting only with PRs merged before it is
  // left out of this set (it stays in the pool for a later batch, where
  // GitHub's mergeable check reports the conflict to its author).
  async function startSet(id, prs, { baseSha, parent, infraRounds }) {
    const name = `${BATCH_REF_PREFIX}${id}`;
    console.log(
      `🧪 Building ${name} on ${baseSha.slice(0, 7)}: ${prs.map((p) => '#' + p.number).join(', ')}`,
    );
    await github.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${name}`,
      sha: baseSha,
    });
    let tip = baseSha;
    const included = [];
    try {
      for (const p of prs) {
        try {
          const res = await github.rest.repos.merge({
            owner,
            repo,
            base: name,
            head: p.head,
            commit_message: `mq: merge #${p.number} (${p.head.slice(0, 7)}) into ${name}`,
          });
          if (res.status === 201) tip = res.data.sha;
          included.push(p);
        } catch (error) {
          if (error.status !== 409) throw error;
          if (included.length === 0) {
            console.log(`⚔️ #${p.number} conflicts with main — ejecting`);
            await eject(
              p.number,
              `it conflicts with \`main\` at \`${baseSha.slice(0, 7)}\``,
              { short: 'conflicts with main' },
            );
          } else {
            console.log(
              `⚔️ #${p.number} conflicts with PRs earlier in ${name} — leaving it for a later batch`,
            );
          }
        }
      }
      if (included.length === 0) {
        await deleteRef(name);
        return;
      }
      const { data: tipCommit } = await github.rest.git.getCommit({
        owner,
        repo,
        commit_sha: tip,
      });
      const meta = {
        id,
        base: baseSha,
        prs: included,
        parent,
        createdAt: now(),
        ...(infraRounds ? { infraRounds } : {}),
      };
      const { data: metaCommit } = await github.rest.git.createCommit({
        owner,
        repo,
        message: encodeBatchMeta(meta),
        tree: tipCommit.tree.sha,
        parents: [tip],
      });
      await github.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${name}`,
        sha: metaCommit.sha,
      });
      await github.rest.actions.createWorkflowDispatch({
        owner,
        repo,
        workflow_id: ORCHESTRATOR_WORKFLOW_FILE,
        ref: name,
        inputs: { base_sha: baseSha, run_security: 'false' },
      });
      console.log(`🚀 Dispatched batch CI for ${name}`);
    } catch (error) {
      await deleteRef(name);
      throw error;
    }
  }

  async function splitSet(set) {
    const [a, b] = splitInHalves(set.meta.prs);
    console.log(
      `✂️ ${set.name} failed (${set.verdict}) — bisecting into [${a.map((p) => '#' + p.number)}] and [${b.map((p) => '#' + p.number)}]`,
    );
    await discardSet(set);
    const base = await getMainSha();
    await startSet(`${set.meta.id}.1`, a, {
      baseSha: base,
      parent: set.meta.id,
      infraRounds: 0,
    });
    await startSet(`${set.meta.id}.2`, b, {
      baseSha: base,
      parent: set.meta.id,
      infraRounds: 0,
    });
  }

  async function holdSet({ set, until, notified }) {
    const at = new Date(until).toISOString();
    console.log(
      `⏸️ ${set.name} and its sibling both failed — holding until ${at} before bisecting further`,
    );
    if (notified) return;
    await setTipStatus(
      set.sha,
      HOLD_STATUS_CONTEXT,
      'pending',
      `Both halves failed; holding until ${at}`,
    );
    await alert(
      `Merge queue: both halves of batch \`${set.meta.parent}\` failed CI (` +
        `${set.name}: ${set.meta.prs.map((p) => '#' + p.number).join(', ')}). ` +
        `This usually means main or a shared dependency is broken, not the PRs. ` +
        `Bisection is paused until ${at}; a push to main before then retests both halves.` +
        (set.run?.html_url ? ` Run: ${set.run.html_url}` : ''),
    );
  }

  async function ejectSet(set, cause) {
    await deleteRef(set.name);
    const runUrl = set.run?.html_url ? ` ([run](${set.run.html_url}))` : '';
    const where = `on \`main\` at \`${set.meta.base.slice(0, 7)}\`${runUrl}`;
    const from = set.meta.parent
      ? ` — bisected out of batch \`${set.meta.parent.split('.')[0]}\``
      : '';
    if (cause === 'no-verdict') {
      await eject(
        set.meta.prs[0].number,
        `batch CI never reached a verdict with this PR ${where}, across ` +
          `${MAX_INFRA_ROUNDS + 1} rebuilds — check for a hanging test or job timeout${from}`,
        {
          short: 'batch CI never finished with this PR',
          targetUrl: set.run?.html_url,
        },
      );
      return;
    }
    await eject(
      set.meta.prs[0].number,
      `batch CI failed twice with this PR ${where}${from}`,
      { short: 'batch CI failed with this PR', targetUrl: set.run?.html_url },
    );
  }

  async function eject(number, why, { short, targetUrl } = {}) {
    console.log(`⏏️ Ejecting #${number} from the merge queue: ${why}`);
    outcomes.set(number, {
      sha: ready.get(number) ?? uncertain.get(number) ?? undefined,
      state: 'failure',
      description: `Ejected from merge queue – ${short ?? 'see PR comment'}`,
      targetUrl,
    });
    try {
      await github.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: number,
        name: MERGE_LABEL,
      });
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body:
        '## ⏏️ Removed from merge queue\n\n' +
        `This PR was removed from the batched merge queue because ${why}.\n\n` +
        'Fix the failure (merge `main` in and check CI), then re-add the ' +
        `\`${MERGE_LABEL}\` label.\n\n` +
        '---\n*Automated message from merge queue system (LS-10571)*',
    });
  }

  async function landSet(set) {
    console.log(
      `🛬 Landing ${set.name}: ${set.meta.prs.map((p) => '#' + p.number).join(', ')}`,
    );
    let expected = set.meta.base;
    let landedCount = 0;
    let failure = null;
    for (const p of set.meta.prs) {
      const current = await getMainSha();
      if (current !== expected) {
        console.log(
          `⚠️ main moved outside the queue (${expected.slice(0, 7)} → ${current.slice(0, 7)}); stopping landing of ${set.name} before #${p.number}`,
        );
        failure = { number: p.number, reason: 'main-moved' };
        break;
      }
      const pr = readyByNumber.get(p.number);
      let result;
      try {
        result = await mergePR(
          pr,
          `batch-validated (${set.name}, ${set.meta.prs.length} PR${set.meta.prs.length === 1 ? '' : 's'})`,
        );
      } catch (error) {
        result = { merged: false, reason: 'error', message: error.message };
      }
      if (!result?.merged) {
        failure = {
          number: p.number,
          reason: result?.reason ?? 'refused',
          message: result?.message,
        };
        console.log(
          `⚠️ #${p.number} did not merge (${failure.reason}${failure.message ? `: ${failure.message}` : ''}); stopping landing of ${set.name}`,
        );
        break;
      }
      landedCount += 1;
      expected = result.sha;
      outcomes.set(p.number, {
        sha: p.head,
        state: 'success',
        description: `Merged in batch ${set.meta.id}`,
        targetUrl: set.run?.html_url,
      });
    }

    // Nothing landed and the refusal may clear on its own (a required check
    // still settling, an API error): keep the green set and retry the land on
    // a later pass, with no new CI. Past the retry budget, eject the PR the
    // merge API keeps refusing so it cannot head every batch forever.
    const retryable =
      failure &&
      landedCount === 0 &&
      ['required-check-pending', 'error', 'refused'].includes(failure.reason);
    if (retryable) {
      const prev = set.landAttempt;
      const attempt = {
        count: (prev?.count ?? 0) + 1,
        since: prev?.since ?? now(),
        message: failure.message ?? failure.reason,
      };
      const exhausted =
        attempt.count >= MAX_LAND_ATTEMPTS &&
        now() - attempt.since >= LAND_RETRY_WINDOW_MS;
      if (!exhausted) {
        const recorded = await setTipStatus(
          set.sha,
          LAND_STATUS_CONTEXT,
          'pending',
          encodeLandAttempt(attempt),
        );
        if (recorded) {
          console.log(
            `⏳ Keeping ${set.name} for another land attempt (${attempt.count}/${MAX_LAND_ATTEMPTS})`,
          );
          return;
        }
        // Without a durable attempt count the retry could loop forever, so
        // fall through and requeue as before.
      } else {
        await deleteRef(set.name);
        await eject(
          failure.number,
          `GitHub's merge API refused it ${attempt.count} times while landing a green batch ` +
            `(last: ${attempt.message}). If the PR's checks are all green this is usually a ` +
            'stale ruleset verdict on the commit — push a new commit (e.g. ' +
            '`node scripts/detect-stalled-prs.mjs --fix`)',
          { short: 'merge refused while landing' },
        );
        return;
      }
    }

    await deleteRef(set.name);

    if (failure?.reason === 'codeowner-review') {
      await eject(
        failure.number,
        'GitHub requires a code owner review before it can merge — re-add the label once ' +
          'the code owner approves',
        { short: 'awaiting code owner review' },
      );
    }

    if (failure) {
      if (landedCount > 0) {
        console.log(
          `⚠️ ${set.name} landed ${landedCount} of ${set.meta.prs.length} PRs; the rest requeue`,
        );
      }
      return;
    }

    const { data: mainCommit } = await github.rest.git.getCommit({
      owner,
      repo,
      commit_sha: expected,
    });
    if (mainCommit.tree.sha !== set.tree) {
      await alert(
        `LS-10571 batch tree mismatch: main ${expected} tree ${mainCommit.tree.sha} != tested ${set.name} ` +
          `tree ${set.tree}. The squash merges did not reproduce the tested content — check main CI.`,
      );
    } else {
      console.log(
        `✅ Landed ${set.name}; main tree matches the tested batch tree`,
      );
    }
  }
}

module.exports = {
  BATCH_REF_PREFIX,
  MAX_BATCH_SIZE,
  MAX_BATCH_RUN_ATTEMPTS,
  MAX_INFRA_ROUNDS,
  MAX_RUN_AGE_MS,
  HOLD_MS,
  MAX_LAND_ATTEMPTS,
  LAND_RETRY_WINDOW_MS,
  DISPATCH_GRACE_MS,
  MERGE_QUEUE_STATUS_CONTEXT,
  LAND_STATUS_CONTEXT,
  HOLD_STATUS_CONTEXT,
  planQueueStatuses,
  publishQueueStatuses,
  encodeBatchMeta,
  parseBatchMeta,
  parseLandAttempt,
  compareBatchIds,
  splitInHalves,
  classifyBatchRun,
  decideBatchActions,
  runBatchQueue,
};
