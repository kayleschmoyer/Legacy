/**
 * Unit tests for merge-queue-batch.js (LS-10571): batched merging with
 * bisection on failure.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  encodeBatchMeta,
  parseBatchMeta,
  compareBatchIds,
  splitInHalves,
  classifyBatchRun,
  decideBatchActions,
  runBatchQueue,
  MAX_BATCH_SIZE,
  DISPATCH_GRACE_MS,
} = require('../merge-queue-batch.js');

const MAIN = 'main000000000000000000000000000000000000';
const OLD_MAIN = 'old0000000000000000000000000000000000000';

const head = (n) => `head${String(n).padStart(36, '0')}`;
const readyMap = (...nums) => new Map(nums.map((n) => [n, head(n)]));
const prs = (...nums) => nums.map((n) => ({ number: n, head: head(n) }));

function set(id, nums, verdict, { base = MAIN, run = null } = {}) {
  return {
    name: `mq/test/${id}`,
    meta: { id, base, prs: prs(...nums), parent: null, createdAt: 0 },
    verdict,
    run,
  };
}

const types = (actions) =>
  actions.map((a) =>
    a.type === 'start'
      ? `start:${a.prs.map((p) => p.number).join(',')}`
      : `${a.type}:${a.set.meta.id}`,
  );

describe('batch metadata', () => {
  it('round-trips through the commit message', () => {
    const meta = {
      id: 'abc.1',
      base: MAIN,
      prs: prs(3, 7),
      parent: 'abc',
      createdAt: 5,
    };
    const msg = encodeBatchMeta(meta);
    assert.match(msg, /^mq: batch abc\.1 \(2 PRs: #3, #7\)/);
    assert.deepEqual(parseBatchMeta(msg), meta);
  });

  it('rejects messages without valid metadata', () => {
    assert.equal(parseBatchMeta('mq: merge #3'), null);
    assert.equal(parseBatchMeta('<!-- mq-batch-meta {not json} -->'), null);
    assert.equal(
      parseBatchMeta('<!-- mq-batch-meta {"id":"a","base":"b","prs":[]} -->'),
      null,
    );
    assert.equal(parseBatchMeta(undefined), null);
  });
});

describe('helpers', () => {
  it('orders parents before children and first halves before second', () => {
    const ids = ['b', 'a.2', 'a.1.2', 'a', 'a.1', 'a.1.1'];
    assert.deepEqual([...ids].sort(compareBatchIds), [
      'a',
      'a.1',
      'a.1.1',
      'a.1.2',
      'a.2',
      'b',
    ]);
  });

  it('splits with the larger half first', () => {
    assert.deepEqual(splitInHalves([1, 2, 3, 4, 5]), [
      [1, 2, 3],
      [4, 5],
    ]);
    assert.deepEqual(splitInHalves([1, 2]), [[1], [2]]);
  });

  it('classifies from the CI Gate first, then the run', () => {
    const c = (gateState, run, age = 0) =>
      classifyBatchRun({ gateState, run, createdAt: 0, now: age });
    assert.equal(c('success', null), 'green');
    assert.equal(c('failure', { status: 'completed' }), 'red');
    assert.equal(c(null, null), 'pending');
    assert.equal(c(null, null, DISPATCH_GRACE_MS + 1), 'lost');
    assert.equal(c('pending', { status: 'in_progress' }), 'pending');
    // Run finished but the gate never reached a verdict (runner shutdown).
    assert.equal(
      c('pending', { status: 'completed', conclusion: 'failure' }),
      'infra',
    );
  });
});

describe('decideBatchActions', () => {
  it('starts a batch of every ready PR, oldest first', () => {
    const actions = decideBatchActions({
      mainSha: MAIN,
      sets: [],
      ready: readyMap(9, 3, 5),
    });
    assert.deepEqual(types(actions), ['start:3,5,9']);
  });

  it(`caps a batch at ${MAX_BATCH_SIZE} PRs`, () => {
    const nums = Array.from({ length: 20 }, (_, i) => i + 1);
    const [action] = decideBatchActions({
      mainSha: MAIN,
      sets: [],
      ready: readyMap(...nums),
    });
    assert.equal(action.prs.length, MAX_BATCH_SIZE);
    assert.deepEqual(action.prs.at(-1).number, MAX_BATCH_SIZE);
  });

  it('does nothing while a batch is in flight', () => {
    const actions = decideBatchActions({
      mainSha: MAIN,
      sets: [set('a', [1, 2], 'pending')],
      ready: readyMap(1, 2, 3),
    });
    assert.deepEqual(actions, []);
  });

  it('lands a green batch and starts the next from the remaining PRs', () => {
    const actions = decideBatchActions({
      mainSha: MAIN,
      sets: [set('a', [1, 2], 'green')],
      ready: readyMap(1, 2, 3),
    });
    assert.deepEqual(types(actions), ['land:a', 'start:3']);
  });

  it('bisects a failed multi-PR batch and starts nothing else', () => {
    const actions = decideBatchActions({
      mainSha: MAIN,
      sets: [set('a', [1, 2, 3, 4], 'red')],
      ready: readyMap(1, 2, 3, 4, 5),
    });
    assert.deepEqual(types(actions), ['split:a']);
  });

  it('ejects a failed single-PR set and carries on with the rest', () => {
    const actions = decideBatchActions({
      mainSha: MAIN,
      sets: [set('a.1.1', [1], 'red')],
      ready: readyMap(1, 2),
    });
    assert.deepEqual(types(actions), ['eject:a.1.1', 'start:2']);
  });

  it('waits for the first half before landing a green second half', () => {
    const actions = decideBatchActions({
      mainSha: MAIN,
      sets: [set('a.2', [3, 4], 'green'), set('a.1', [1, 2], 'pending')],
      ready: readyMap(1, 2, 3, 4),
    });
    assert.deepEqual(actions, []);
  });

  it('lands the second half when the first failed, and bisects the first on the new main', () => {
    const actions = decideBatchActions({
      mainSha: MAIN,
      sets: [set('a.1', [1, 2], 'red'), set('a.2', [3, 4], 'green')],
      ready: readyMap(1, 2, 3, 4),
    });
    assert.deepEqual(types(actions), ['land:a.2', 'split:a.1']);
  });

  it('when both halves pass (interaction), lands the first and requeues the second', () => {
    const actions = decideBatchActions({
      mainSha: MAIN,
      sets: [set('a.1', [1, 2], 'green'), set('a.2', [3, 4], 'green')],
      ready: readyMap(1, 2, 3, 4),
    });
    assert.deepEqual(types(actions), ['land:a.1', 'discard:a.2', 'start:3,4']);
    assert.equal(actions[1].reason, 'stale-base');
  });

  it('discards a set whose PR moved to a new head', () => {
    const ready = readyMap(1, 2);
    ready.set(2, 'pushed-again');
    const actions = decideBatchActions({
      mainSha: MAIN,
      sets: [set('a', [1, 2], 'green')],
      ready,
    });
    assert.deepEqual(types(actions), ['discard:a', 'start:1,2']);
    assert.equal(actions[0].reason, 'pr-changed');
  });

  it('discards a set whose PR left the queue', () => {
    const actions = decideBatchActions({
      mainSha: MAIN,
      sets: [set('a', [1, 2], 'pending')],
      ready: readyMap(1),
    });
    assert.deepEqual(types(actions), ['discard:a', 'start:1']);
  });

  it('re-runs an infra failure once, then requeues', () => {
    const first = decideBatchActions({
      mainSha: MAIN,
      sets: [set('a', [1], 'infra', { run: { id: 7, run_attempt: 1 } })],
      ready: readyMap(1),
    });
    assert.deepEqual(types(first), ['rerun:a']);
    const second = decideBatchActions({
      mainSha: MAIN,
      sets: [set('a', [1], 'infra', { run: { id: 7, run_attempt: 2 } })],
      ready: readyMap(1),
    });
    assert.deepEqual(types(second), ['discard:a', 'start:1']);
    assert.equal(second[0].reason, 'infra-exhausted');
  });

  it('discards an in-flight set built on an old main', () => {
    const actions = decideBatchActions({
      mainSha: MAIN,
      sets: [set('a', [1], 'pending', { base: OLD_MAIN })],
      ready: readyMap(1),
    });
    assert.deepEqual(types(actions), ['discard:a', 'start:1']);
  });

  it('still bisects a failure reported on an old main', () => {
    const actions = decideBatchActions({
      mainSha: MAIN,
      sets: [set('a', [1, 2], 'red', { base: OLD_MAIN })],
      ready: readyMap(1, 2),
    });
    assert.deepEqual(types(actions), ['split:a']);
  });

  it('requeues a set whose dispatch was lost', () => {
    const actions = decideBatchActions({
      mainSha: MAIN,
      sets: [set('a', [1], 'lost')],
      ready: readyMap(1),
    });
    assert.deepEqual(types(actions), ['discard:a', 'start:1']);
  });
});

// ── runBatchQueue against an in-memory GitHub ──────────────────────────────

function makeFakeGithub({
  main = MAIN,
  conflicts = [],
  gate = {},
  runs = {},
} = {}) {
  const refs = new Map([['heads/main', main]]);
  const commits = new Map([
    [main, { message: 'main', tree: { sha: 'tree-main' }, parents: [] }],
  ]);
  const calls = {
    merges: [],
    dispatches: [],
    deleted: [],
    comments: [],
    removedLabels: [],
    prMerges: [],
  };
  let n = 0;
  const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });

  const github = {
    paginate: async (fn, params) => (await fn(params)).data,
    rest: {
      git: {
        getRef: async ({ ref }) => {
          if (!refs.has(ref)) throw notFound();
          return { data: { object: { sha: refs.get(ref) } } };
        },
        listMatchingRefs: async ({ ref }) => ({
          data: [...refs.entries()]
            .filter(([r]) => r.startsWith(ref))
            .map(([r, sha]) => ({ ref: `refs/${r}`, object: { sha } })),
        }),
        getCommit: async ({ commit_sha }) => {
          if (!commits.has(commit_sha)) throw notFound();
          return { data: commits.get(commit_sha) };
        },
        createRef: async ({ ref, sha }) => {
          refs.set(ref.replace(/^refs\//, ''), sha);
          return { data: {} };
        },
        updateRef: async ({ ref, sha }) => {
          refs.set(ref, sha);
          return { data: {} };
        },
        deleteRef: async ({ ref }) => {
          if (!refs.delete(ref)) throw notFound();
          calls.deleted.push(ref);
          return { data: {} };
        },
        createCommit: async ({ message, tree, parents }) => {
          const sha = `meta${++n}`;
          commits.set(sha, { message, tree: { sha: tree }, parents });
          return { data: { sha } };
        },
      },
      repos: {
        merge: async ({ base, head: h }) => {
          calls.merges.push({ base, head: h });
          if (conflicts.includes(h))
            throw Object.assign(new Error('conflict'), { status: 409 });
          const sha = `m${++n}`;
          const parent = refs.get(`heads/${base}`);
          commits.set(sha, {
            message: `merge ${h}`,
            tree: { sha: `tree-${sha}` },
            parents: [parent],
          });
          refs.set(`heads/${base}`, sha);
          return { status: 201, data: { sha } };
        },
        getCombinedStatusForRef: async ({ ref }) => ({
          data: {
            statuses: gate[ref]
              ? [{ context: 'CI Gate', state: gate[ref] }]
              : [],
          },
        }),
      },
      actions: {
        createWorkflowDispatch: async (params) => {
          calls.dispatches.push(params);
          return { data: {} };
        },
        listWorkflowRuns: async ({ branch }) => ({
          data: { workflow_runs: runs[branch] || [] },
        }),
        cancelWorkflowRun: async () => ({ data: {} }),
        reRunWorkflow: async () => ({ data: {} }),
      },
      issues: {
        removeLabel: async (p) => {
          calls.removedLabels.push(p.issue_number);
          return { data: {} };
        },
        createComment: async (p) => {
          calls.comments.push(p);
          return { data: {} };
        },
      },
    },
  };
  return { github, refs, commits, calls };
}

const readyPR = (n) => ({
  number: n,
  head: { sha: head(n) },
  base: { ref: 'main' },
});

describe('runBatchQueue', () => {
  it('builds a batch ref with every PR merged and dispatches CI on it', async () => {
    const { github, refs, commits, calls } = makeFakeGithub();
    await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(2), readyPR(1)],
      mergePR: async () => assert.fail('nothing should merge'),
      now: () => 1000,
    });
    const id = (1000).toString(36);
    assert.deepEqual(
      calls.merges.map((m) => m.head),
      [head(1), head(2)],
    );
    const tip = refs.get(`heads/mq/test/${id}`);
    const meta = parseBatchMeta(commits.get(tip).message);
    assert.deepEqual(meta.prs, prs(1, 2));
    assert.equal(meta.base, MAIN);
    assert.equal(calls.dispatches.length, 1);
    assert.equal(calls.dispatches[0].ref, `mq/test/${id}`);
    assert.deepEqual(calls.dispatches[0].inputs, {
      base_sha: MAIN,
      run_security: 'false',
    });
  });

  it('splits immediately when PRs in a new batch conflict with each other', async () => {
    const { github, refs, calls } = makeFakeGithub({ conflicts: [head(3)] });
    await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1), readyPR(2), readyPR(3), readyPR(4)],
      mergePR: async () => assert.fail('nothing should merge'),
      now: () => 1000,
    });
    const id = (1000).toString(36);
    // Root fails on #3 → halves [1,2] and [3,4]; [3,4] fails on #3 → [3] and
    // [4]; #3 alone conflicts with main and is ejected.
    assert.ok(refs.has(`heads/mq/test/${id}.1`));
    assert.ok(refs.has(`heads/mq/test/${id}.2.2`));
    assert.ok(!refs.has(`heads/mq/test/${id}`));
    assert.ok(!refs.has(`heads/mq/test/${id}.2`));
    assert.ok(!refs.has(`heads/mq/test/${id}.2.1`));
    assert.deepEqual(calls.removedLabels, [3]);
    assert.deepEqual(calls.dispatches.map((d) => d.ref).sort(), [
      `mq/test/${id}.1`,
      `mq/test/${id}.2.2`,
    ]);
  });

  it('lands a green batch in order, one merge per PR, and cleans up', async () => {
    const fake = makeFakeGithub();
    const { github, refs, commits, calls } = fake;
    // Build the batch first.
    await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1), readyPR(2)],
      mergePR: async () => assert.fail('nothing should merge yet'),
      now: () => 1000,
    });
    const name = `mq/test/${(1000).toString(36)}`;
    const tip = refs.get(`heads/${name}`);
    fake.gate = { [tip]: 'success' };
    github.rest.repos.getCombinedStatusForRef = async ({ ref }) => ({
      data: {
        statuses: ref === tip ? [{ context: 'CI Gate', state: 'success' }] : [],
      },
    });
    const testedTree = commits.get(tip).tree.sha;

    // Each squash merge advances main; the last lands the tested tree.
    const merged = [];
    const mergePR = async (pr) => {
      merged.push(pr.number);
      const sha = `squash${pr.number}`;
      const tree = merged.length === 2 ? testedTree : `partial${pr.number}`;
      commits.set(sha, { message: '', tree: { sha: tree }, parents: [] });
      refs.set('heads/main', sha);
      calls.prMerges.push(pr.number);
      return { merged: true, sha };
    };
    await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1), readyPR(2)],
      mergePR,
      now: () => 2000,
    });
    assert.deepEqual(merged, [1, 2]);
    assert.ok(!refs.has(`heads/${name}`));
    // No PRs left → no new batch.
    assert.equal(calls.dispatches.length, 1);
  });

  it('stops landing when a PR fails to merge', async () => {
    const fake = makeFakeGithub();
    const { github, refs } = fake;
    await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1), readyPR(2)],
      mergePR: async () => assert.fail('nothing should merge yet'),
      now: () => 1000,
    });
    const tip = refs.get(`heads/mq/test/${(1000).toString(36)}`);
    github.rest.repos.getCombinedStatusForRef = async ({ ref }) => ({
      data: {
        statuses: ref === tip ? [{ context: 'CI Gate', state: 'success' }] : [],
      },
    });
    const attempted = [];
    await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1), readyPR(2)],
      mergePR: async (pr) => {
        attempted.push(pr.number);
        return { merged: false };
      },
      now: () => 2000,
    });
    assert.deepEqual(attempted, [1]);
  });

  it('only logs in dry-run mode', async () => {
    const { github, calls } = makeFakeGithub();
    const { actions } = await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1)],
      mergePR: async () => assert.fail('dry run'),
      isDryRun: true,
    });
    assert.deepEqual(types(actions), ['start:1']);
    assert.equal(calls.merges.length, 0);
    assert.equal(calls.dispatches.length, 0);
  });
});
