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
//                between halves) the first lands and the second is requeued on
//                the new main. A failing single-PR set is ejected.
//
// State lives entirely in git: every in-flight set is an `mq/test/*` branch
// whose tip commit message carries the set's metadata, and its verdict is the
// CI Orchestrator run on that tip. Each queue run re-derives everything from
// those refs, so there is no separate store to drift or corrupt.
//
// decideBatchActions() is pure and holds every decision; runBatchQueue() is
// the thin I/O layer that gathers state and executes the decided actions.

const { CI_GATE_CONTEXT } = require('./ci-gate.js');

const BATCH_REF_PREFIX = 'mq/test/';
const MAX_BATCH_SIZE = 16;
const ORCHESTRATOR_WORKFLOW_FILE = 'ci-orchestrator.yml';
// A cancelled/timed-out batch run (runner loss, spot reclaim) is re-run this
// many times in total before the set is requeued from scratch. Infra failures
// never implicate a PR, so they never trigger a bisect or an ejection.
const MAX_BATCH_RUN_ATTEMPTS = 2;
// A dispatched set with no orchestrator run after this long is considered lost
// (dispatch dropped) and is requeued.
const DISPATCH_GRACE_MS = 20 * 60 * 1000;
const META_START = '<!-- mq-batch-meta ';
const META_END = ' -->';
const MERGE_LABEL = 'merge-when-ready';

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
// (posted on the batch tip by ci-gate.js) is authoritative: it already folds
// runner deaths and cancellations into "no verdict" rather than red
// (LS-10140/LS-10311), so a red gate always means the code failed. A run that
// finished without a terminal gate is an infra problem, never a PR's fault.
function classifyBatchRun({ gateState, run, createdAt, now }) {
  if (gateState === 'success') return 'green';
  if (gateState === 'failure' || gateState === 'error') return 'red';
  if (!run) {
    return now - createdAt > DISPATCH_GRACE_MS ? 'lost' : 'pending';
  }
  if (run.status !== 'completed') return 'pending';
  return 'infra';
}

/**
 * Pure reconciliation step. Given the main tip, the in-flight sets (each with
 * a verdict) and the PRs that currently pass every per-PR gate, returns the
 * ordered list of actions to execute:
 *
 *   discard { set, reason }  delete the set's ref (cancelling its run); its PRs
 *                            return to the pool
 *   land    { set }          squash-merge the set's PRs in order
 *   eject   { set }          single-PR set failed CI — remove it from the queue
 *   split   { set }          multi-PR set failed CI — test both halves
 *   rerun   { set }          re-run an infra-cancelled batch run
 *   start   { prs }          build and test a new set from the pool
 *
 * @param {object} args
 * @param {string} args.mainSha current main tip
 * @param {Array<{name:string, meta:object, verdict:string, run:object|null}>} args.sets
 * @param {Map<number,string>} args.ready ready PR number → validated head SHA
 * @param {number} [args.maxBatchSize]
 */
function decideBatchActions({
  mainSha,
  sets,
  ready,
  maxBatchSize = MAX_BATCH_SIZE,
}) {
  const actions = [];
  const sorted = [...sets].sort((a, b) =>
    compareBatchIds(a.meta.id, b.meta.id),
  );

  // A set is only meaningful while every PR in it is still ready at exactly
  // the head that was tested. Anything else (new push, label removed, a gate
  // regressed, PR merged or closed) invalidates the whole set.
  const live = [];
  for (const set of sorted) {
    const valid = set.meta.prs.every((p) => ready.get(p.number) === p.head);
    if (valid) {
      live.push(set);
    } else {
      actions.push({ type: 'discard', set, reason: 'pr-changed' });
    }
  }

  // Landing: among sets built on the current main, walk in id order and land
  // the first green one — but only once every set ordered before it has
  // failed. An undecided earlier sibling (pending/infra) blocks, so the first
  // half of a split always gets the first chance to land.
  let landed = null;
  for (const set of live) {
    if (set.meta.base !== mainSha) continue;
    if (set.verdict === 'green') {
      landed = set;
      break;
    }
    if (set.verdict !== 'red') break;
  }
  if (landed) actions.push({ type: 'land', set: landed });

  let inFlight = 0;
  const busy = new Set();
  for (const set of live) {
    if (set === landed) continue;
    // Landing moves main, so every other set's base is stale after it.
    const stale = landed !== null || set.meta.base !== mainSha;
    switch (set.verdict) {
      case 'red':
        // A failure still implicates this set even on a stale base.
        if (set.meta.prs.length === 1) {
          actions.push({ type: 'eject', set });
        } else {
          actions.push({ type: 'split', set });
          inFlight += 1;
          set.meta.prs.forEach((p) => busy.add(p.number));
        }
        break;
      case 'green':
      case 'pending':
        if (stale) {
          actions.push({ type: 'discard', set, reason: 'stale-base' });
        } else {
          inFlight += 1;
          set.meta.prs.forEach((p) => busy.add(p.number));
        }
        break;
      case 'infra':
        if (!stale && (set.run?.run_attempt ?? 1) < MAX_BATCH_RUN_ATTEMPTS) {
          actions.push({ type: 'rerun', set });
          inFlight += 1;
          set.meta.prs.forEach((p) => busy.add(p.number));
        } else {
          actions.push({
            type: 'discard',
            set,
            reason: stale ? 'stale-base' : 'infra-exhausted',
          });
        }
        break;
      default:
        // 'lost': dispatch never produced a run — requeue from scratch.
        actions.push({ type: 'discard', set, reason: set.verdict });
    }
  }

  // Start a new batch only when nothing else is in flight, so CI cost stays at
  // one batch (or one pair of bisect halves) at a time.
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

/**
 * Gathers batch state from GitHub, decides, and executes.
 *
 * @param {object} deps
 * @param {object} deps.github Octokit (Merge Queue app)
 * @param {string} deps.owner
 * @param {string} deps.repo
 * @param {Array<object>} deps.readyPRs PR objects (pulls.get shape) that pass
 *   every per-PR gate and target main
 * @param {(pr: object, verdict: string) => Promise<{merged: boolean, sha?: string}>} deps.mergePR
 * @param {boolean} [deps.isDryRun]
 * @param {() => number} [deps.now]
 * @param {number} [deps.maxBatchSize]
 */
async function runBatchQueue({
  github,
  owner,
  repo,
  readyPRs,
  mergePR,
  isDryRun = false,
  now = () => Date.now(),
  maxBatchSize = MAX_BATCH_SIZE,
}) {
  const ready = new Map(readyPRs.map((pr) => [pr.number, pr.head.sha]));
  const readyByNumber = new Map(readyPRs.map((pr) => [pr.number, pr]));
  const mainSha = await getMainSha();
  const sets = await listSets();

  console.log(
    `\n🧺 Batch queue: main=${mainSha.slice(0, 7)}, ${readyPRs.length} ready PR(s), ${sets.length} in-flight set(s)`,
  );
  for (const set of sets) {
    console.log(
      `   • ${set.name} base=${set.meta.base.slice(0, 7)} verdict=${set.verdict} PRs=${set.meta.prs.map((p) => '#' + p.number).join(',')}`,
    );
  }

  const actions = decideBatchActions({ mainSha, sets, ready, maxBatchSize });
  if (actions.length === 0) {
    console.log('🧺 Batch queue: nothing to do');
    return { actions };
  }
  if (isDryRun) {
    for (const a of actions) {
      console.log(
        `🏃 DRY RUN: would ${a.type} ${a.set ? a.set.name : a.prs.map((p) => '#' + p.number).join(',')}`,
      );
    }
    return { actions };
  }

  for (const action of actions) {
    try {
      switch (action.type) {
        case 'discard':
          console.log(`🗑️ Discarding ${action.set.name} (${action.reason})`);
          await discardSet(action.set);
          break;
        case 'land':
          await landSet(action.set);
          break;
        case 'eject':
          await ejectSet(action.set);
          break;
        case 'split':
          await splitSet(action.set);
          break;
        case 'rerun':
          console.log(`🔁 Re-running batch CI for ${action.set.name}`);
          await github.rest.actions.reRunWorkflow({
            owner,
            repo,
            run_id: action.set.run.id,
          });
          break;
        case 'start':
          await startSet(newBatchId(), action.prs, await getMainSha(), null);
          break;
      }
    } catch (error) {
      console.error(`💥 Batch action ${action.type} failed: ${error.message}`);
    }
  }
  return { actions };

  // ── I/O helpers ──────────────────────────────────────────────────────────

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
      const gateState = await getGateState(sha);
      out.push({
        name,
        sha,
        tree: commit.tree.sha,
        meta,
        run,
        verdict: classifyBatchRun({
          gateState,
          run,
          createdAt: meta.createdAt,
          now: now(),
        }),
      });
    }
    return out;
  }

  async function getGateState(sha) {
    const { data } = await github.rest.repos.getCombinedStatusForRef({
      owner,
      repo,
      ref: sha,
      per_page: 100,
    });
    return (
      (data.statuses || []).find((st) => st.context === CI_GATE_CONTEXT)
        ?.state ?? null
    );
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
  // splits immediately (no CI needed to know the set cannot land together);
  // a conflicting single PR is ejected.
  async function startSet(id, prs, baseSha, parent) {
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
        } catch (error) {
          if (error.status !== 409) throw error;
          console.log(
            `⚔️ #${p.number} conflicts with the rest of ${name} (or main)`,
          );
          await deleteRef(name);
          if (prs.length === 1) {
            await eject(
              prs[0].number,
              `it conflicts with \`main\` at \`${baseSha.slice(0, 7)}\``,
            );
          } else {
            const [a, b] = splitInHalves(prs);
            await startSet(`${id}.1`, a, baseSha, id);
            await startSet(`${id}.2`, b, baseSha, id);
          }
          return;
        }
      }
      const { data: tipCommit } = await github.rest.git.getCommit({
        owner,
        repo,
        commit_sha: tip,
      });
      const meta = { id, base: baseSha, prs, parent, createdAt: now() };
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
      `✂️ ${set.name} failed CI — bisecting into [${a.map((p) => '#' + p.number)}] and [${b.map((p) => '#' + p.number)}]`,
    );
    await deleteRef(set.name);
    const base = await getMainSha();
    await startSet(`${set.meta.id}.1`, a, base, set.meta.id);
    await startSet(`${set.meta.id}.2`, b, base, set.meta.id);
  }

  async function ejectSet(set) {
    await deleteRef(set.name);
    const runUrl = set.run?.html_url ? ` ([run](${set.run.html_url}))` : '';
    await eject(
      set.meta.prs[0].number,
      `batch CI failed with this PR on \`main\` at \`${set.meta.base.slice(0, 7)}\`${runUrl}` +
        (set.meta.parent
          ? ` — bisected out of batch \`${set.meta.parent.split('.')[0]}\``
          : ''),
    );
  }

  async function eject(number, why) {
    console.log(`⏏️ Ejecting #${number} from the merge queue: ${why}`);
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
    let landedAll = true;
    for (const p of set.meta.prs) {
      const current = await getMainSha();
      if (current !== expected) {
        console.log(
          `⚠️ main moved outside the queue (${expected.slice(0, 7)} → ${current.slice(0, 7)}); stopping landing of ${set.name} before #${p.number}`,
        );
        landedAll = false;
        break;
      }
      const pr = readyByNumber.get(p.number);
      const result = await mergePR(
        pr,
        `batch-validated (${set.name}, ${set.meta.prs.length} PR${set.meta.prs.length === 1 ? '' : 's'})`,
      );
      if (!result?.merged) {
        console.log(
          `⚠️ #${p.number} did not merge; stopping landing of ${set.name} — the rest requeue`,
        );
        landedAll = false;
        break;
      }
      expected = result.sha;
    }
    await deleteRef(set.name);

    if (landedAll) {
      const { data: mainCommit } = await github.rest.git.getCommit({
        owner,
        repo,
        commit_sha: expected,
      });
      if (mainCommit.tree.sha !== set.tree) {
        console.log(
          `::error::LS-10571 batch tree mismatch: main ${expected} tree ${mainCommit.tree.sha} != tested ${set.name} tree ${set.tree}. ` +
            'The squash merges did not reproduce the tested content — check main CI.',
        );
      } else {
        console.log(
          `✅ Landed ${set.name}; main tree matches the tested batch tree`,
        );
      }
    }
  }
}

module.exports = {
  BATCH_REF_PREFIX,
  MAX_BATCH_SIZE,
  MAX_BATCH_RUN_ATTEMPTS,
  DISPATCH_GRACE_MS,
  encodeBatchMeta,
  parseBatchMeta,
  compareBatchIds,
  splitInHalves,
  classifyBatchRun,
  decideBatchActions,
  runBatchQueue,
};
