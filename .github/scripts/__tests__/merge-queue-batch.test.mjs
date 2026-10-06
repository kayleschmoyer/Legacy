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
  planQueueStatuses,
  publishQueueStatuses,
  MERGE_QUEUE_STATUS_CONTEXT,
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
    statuses: [],
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
        createCommitStatus: async (params) => {
          calls.statuses.push(params);
          return { data: {} };
        },
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

// ── LS-10620: merge-queue commit status ────────────────────────────────────

const QUEUE_RUN = 'https://github.test/o/r/actions/runs/1';
const BATCH_RUN = 'https://github.test/o/r/actions/runs/2';

const cand = (n, ready = true) => ({ number: n, sha: head(n), ready });
const byNumber = (plan) => Object.fromEntries(plan.map((s) => [s.number, s]));

describe('planQueueStatuses', () => {
  it('marks members of an in-flight set pending and links the set run', () => {
    const plan = byNumber(
      planQueueStatuses({
        sets: [set('abc', [1, 2], 'pending', { run: { html_url: BATCH_RUN } })],
        candidates: [cand(1), cand(2)],
        queueRunUrl: QUEUE_RUN,
      }),
    );
    for (const n of [1, 2]) {
      assert.equal(plan[n].state, 'pending');
      assert.equal(plan[n].sha, head(n));
      assert.equal(plan[n].targetUrl, BATCH_RUN);
      assert.match(plan[n].description, /In batch abc \(2 PRs\) – CI running/);
    }
  });

  it('falls back to the queue run before the batch run exists', () => {
    const [s] = planQueueStatuses({
      sets: [set('abc', [1], 'pending')],
      candidates: [cand(1)],
      queueRunUrl: QUEUE_RUN,
    });
    assert.equal(s.targetUrl, QUEUE_RUN);
    assert.match(s.description, /In batch abc \(1 PR\)/);
  });

  it('numbers ready PRs outside any set by queue order', () => {
    const plan = byNumber(
      planQueueStatuses({
        sets: [set('abc', [1], 'pending')],
        candidates: [cand(5), cand(1), cand(3)],
        queueRunUrl: QUEUE_RUN,
      }),
    );
    assert.match(plan[3].description, /^Queued – position 1 of 2/);
    assert.match(plan[5].description, /^Queued – position 2 of 2/);
    assert.equal(plan[3].targetUrl, QUEUE_RUN);
    assert.match(plan[1].description, /^In batch abc/);
  });

  it('marks labeled PRs that are not ready as waiting, outside the queue order', () => {
    const plan = byNumber(
      planQueueStatuses({
        sets: [],
        candidates: [cand(1, false), cand(2)],
        queueRunUrl: QUEUE_RUN,
      }),
    );
    assert.match(plan[1].description, /^Waiting/);
    assert.equal(plan[1].state, 'pending');
    assert.match(plan[2].description, /^Queued – position 1 of 1/);
  });

  it('describes each verdict', () => {
    const phrases = {
      pending: /CI running/,
      green: /CI passed, landing/,
      red: /CI failed, bisecting/,
      infra: /retrying after a runner failure/,
    };
    for (const [verdict, re] of Object.entries(phrases)) {
      const [s] = planQueueStatuses({
        sets: [set('abc', [1], verdict)],
        candidates: [cand(1)],
      });
      assert.match(s.description, re, verdict);
    }
  });

  it('lets a terminal outcome win over set membership', () => {
    const outcomes = new Map([
      [
        1,
        {
          sha: head(1),
          state: 'success',
          description: 'Merged in batch abc',
          targetUrl: BATCH_RUN,
        },
      ],
      [
        2,
        {
          sha: head(2),
          state: 'failure',
          description:
            'Ejected from merge queue – batch CI failed with this PR',
        },
      ],
    ]);
    const plan = byNumber(
      planQueueStatuses({
        sets: [set('abc', [1, 2], 'green')],
        candidates: [cand(1), cand(2)],
        outcomes,
        queueRunUrl: QUEUE_RUN,
      }),
    );
    assert.equal(plan[1].state, 'success');
    assert.equal(plan[1].targetUrl, BATCH_RUN);
    assert.equal(plan[2].state, 'failure');
    assert.equal(plan[2].targetUrl, QUEUE_RUN);
  });

  it('excludes finished PRs from queue positions', () => {
    const outcomes = new Map([
      [1, { sha: head(1), state: 'failure', description: 'Ejected' }],
    ]);
    const plan = byNumber(
      planQueueStatuses({
        sets: [],
        candidates: [cand(1), cand(2)],
        outcomes,
      }),
    );
    assert.match(plan[2].description, /position 1 of 1/);
  });

  it('shows a PR that moved between sets under its new set only', () => {
    // #3 was bisected out of `abc`; only `abc.2` still exists.
    const [s] = planQueueStatuses({
      sets: [set('abc.2', [3, 4], 'pending', { run: { html_url: BATCH_RUN } })],
      candidates: [cand(3)],
    });
    assert.match(s.description, /In batch abc\.2 \(2 PRs\)/);
  });

  it('keeps descriptions within the 140-character API limit', () => {
    const outcomes = new Map([
      [1, { sha: head(1), state: 'failure', description: 'x'.repeat(300) }],
    ]);
    const [s] = planQueueStatuses({
      sets: [],
      candidates: [cand(1)],
      outcomes,
    });
    assert.equal(s.description.length, 140);
  });
});

describe('publishQueueStatuses', () => {
  const plan = [
    {
      number: 1,
      sha: head(1),
      state: 'pending',
      description: 'Queued – position 1 of 1 for the next batch',
      targetUrl: QUEUE_RUN,
    },
    { number: 2, sha: head(2), state: 'pending', description: 'Waiting' },
  ];

  it('posts the merge-queue context with description and target_url', async () => {
    const { github, calls } = makeFakeGithub();
    await publishQueueStatuses({ client: github, owner: 'o', repo: 'r', plan });
    assert.equal(calls.statuses.length, 2);
    assert.deepEqual(calls.statuses[0], {
      owner: 'o',
      repo: 'r',
      sha: head(1),
      state: 'pending',
      context: MERGE_QUEUE_STATUS_CONTEXT,
      description: 'Queued – position 1 of 1 for the next batch',
      target_url: QUEUE_RUN,
    });
    assert.ok(!('target_url' in calls.statuses[1]));
  });

  it('keeps going when a write fails', async () => {
    const written = [];
    const client = {
      rest: {
        repos: {
          createCommitStatus: async (p) => {
            if (p.sha === head(1)) throw new Error('403');
            written.push(p.sha);
          },
        },
      },
    };
    await publishQueueStatuses({ client, owner: 'o', repo: 'r', plan });
    assert.deepEqual(written, [head(2)]);
  });

  it('writes nothing in dry-run mode', async () => {
    const { github, calls } = makeFakeGithub();
    await publishQueueStatuses({
      client: github,
      owner: 'o',
      repo: 'r',
      plan,
      isDryRun: true,
    });
    assert.equal(calls.statuses.length, 0);
  });
});

describe('runBatchQueue merge-queue statuses', () => {
  const statusOf = (calls, n) =>
    calls.statuses.filter((s) => s.sha === head(n)).at(-1);

  // A completed/in-progress orchestrator run on the batch tip.
  const runOn = (tip, status = 'in_progress') => ({
    data: {
      workflow_runs: [
        {
          id: 2,
          head_sha: tip,
          status,
          created_at: new Date(1000).toISOString(),
          html_url: BATCH_RUN,
        },
      ],
    },
  });
  const gateOn =
    (tip, state) =>
    async ({ ref }) => ({
      data: {
        statuses: ref === tip ? [{ context: 'CI Gate', state }] : [],
      },
    });

  it('reports a freshly started batch as in-flight, linked to the queue run', async () => {
    const { github, calls } = makeFakeGithub();
    await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1), readyPR(2)],
      mergePR: async () => assert.fail('nothing should merge'),
      now: () => 1000,
      queueRunUrl: QUEUE_RUN,
    });
    const id = (1000).toString(36);
    for (const n of [1, 2]) {
      const s = statusOf(calls, n);
      assert.equal(s.context, MERGE_QUEUE_STATUS_CONTEXT);
      assert.equal(s.state, 'pending');
      assert.match(s.description, new RegExp(`In batch ${id} \\(2 PRs\\)`));
      assert.equal(s.target_url, QUEUE_RUN);
    }
  });

  it('links an in-flight batch to its CI Orchestrator run on later passes', async () => {
    const { github, refs, calls } = makeFakeGithub();
    await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1)],
      mergePR: async () => assert.fail('nothing should merge'),
      now: () => 1000,
    });
    const tip = refs.get(`heads/mq/test/${(1000).toString(36)}`);
    github.rest.actions.listWorkflowRuns = async () => runOn(tip);
    calls.statuses.length = 0;
    // Nothing to decide (pending set, nothing else ready) — statuses must
    // still refresh so the link appears once the run exists.
    const { actions } = await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1)],
      mergePR: async () => assert.fail('nothing should merge'),
      now: () => 1500,
      queueRunUrl: QUEUE_RUN,
    });
    assert.deepEqual(actions, []);
    const s = statusOf(calls, 1);
    assert.equal(s.target_url, BATCH_RUN);
    assert.match(s.description, /CI running/);
  });

  it('marks PRs landed by a green batch as merged, linked to the batch run', async () => {
    const { github, refs, commits, calls } = makeFakeGithub();
    await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1), readyPR(2)],
      mergePR: async () => assert.fail('nothing should merge yet'),
      now: () => 1000,
    });
    const id = (1000).toString(36);
    const tip = refs.get(`heads/mq/test/${id}`);
    github.rest.repos.getCombinedStatusForRef = gateOn(tip, 'success');
    github.rest.actions.listWorkflowRuns = async () => runOn(tip, 'completed');
    const testedTree = commits.get(tip).tree.sha;
    let merged = 0;
    const mergePR = async (pr) => {
      merged += 1;
      const sha = `squash${pr.number}`;
      commits.set(sha, {
        message: '',
        tree: { sha: merged === 2 ? testedTree : `partial${pr.number}` },
        parents: [],
      });
      refs.set('heads/main', sha);
      return { merged: true, sha };
    };
    calls.statuses.length = 0;
    await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1), readyPR(2)],
      mergePR,
      now: () => 2000,
      queueRunUrl: QUEUE_RUN,
    });
    for (const n of [1, 2]) {
      const s = statusOf(calls, n);
      assert.equal(s.state, 'success');
      assert.equal(s.description, `Merged in batch ${id}`);
      assert.equal(s.target_url, BATCH_RUN);
    }
  });

  it('marks a PR that conflicts with main as ejected', async () => {
    const { github, calls } = makeFakeGithub({ conflicts: [head(1)] });
    await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1)],
      mergePR: async () => assert.fail('nothing should merge'),
      now: () => 1000,
      queueRunUrl: QUEUE_RUN,
    });
    const s = statusOf(calls, 1);
    assert.equal(s.state, 'failure');
    assert.match(
      s.description,
      /^Ejected from merge queue – conflicts with main/,
    );
    assert.equal(s.target_url, QUEUE_RUN);
  });

  it('marks a PR ejected by a failed single-PR batch, linked to the failing run', async () => {
    const { github, refs, calls } = makeFakeGithub();
    await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1)],
      mergePR: async () => assert.fail('nothing should merge'),
      now: () => 1000,
    });
    const tip = refs.get(`heads/mq/test/${(1000).toString(36)}`);
    github.rest.repos.getCombinedStatusForRef = gateOn(tip, 'failure');
    github.rest.actions.listWorkflowRuns = async () => runOn(tip, 'completed');
    calls.statuses.length = 0;
    await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1)],
      mergePR: async () => assert.fail('nothing should merge'),
      now: () => 2000,
      queueRunUrl: QUEUE_RUN,
    });
    const s = statusOf(calls, 1);
    assert.equal(s.state, 'failure');
    assert.match(s.description, /batch CI failed with this PR/);
    assert.equal(s.target_url, BATCH_RUN);
  });

  it('shows bisected PRs under their new half, not the failed parent batch', async () => {
    const { github, refs, calls } = makeFakeGithub();
    await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1), readyPR(2)],
      mergePR: async () => assert.fail('nothing should merge'),
      now: () => 1000,
    });
    const id = (1000).toString(36);
    const tip = refs.get(`heads/mq/test/${id}`);
    github.rest.repos.getCombinedStatusForRef = gateOn(tip, 'failure');
    calls.statuses.length = 0;
    await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1), readyPR(2)],
      mergePR: async () => assert.fail('nothing should merge'),
      now: () => 2000,
      queueRunUrl: QUEUE_RUN,
    });
    assert.match(
      statusOf(calls, 1).description,
      new RegExp(`In batch ${id}\\.1 \\(1 PR\\)`),
    );
    assert.match(
      statusOf(calls, 2).description,
      new RegExp(`In batch ${id}\\.2 \\(1 PR\\)`),
    );
  });

  it('posts statuses for labeled PRs that are not ready, using candidatePRs', async () => {
    const { github, calls } = makeFakeGithub();
    await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1)],
      candidatePRs: [readyPR(1), readyPR(9)],
      mergePR: async () => assert.fail('nothing should merge'),
      now: () => 1000,
      queueRunUrl: QUEUE_RUN,
    });
    assert.match(statusOf(calls, 9).description, /^Waiting/);
    assert.match(statusOf(calls, 1).description, /In batch/);
  });

  it('uses the dedicated statusClient and tolerates it failing', async () => {
    const { github, calls } = makeFakeGithub();
    const statusClient = {
      rest: {
        repos: {
          createCommitStatus: async () => {
            throw Object.assign(new Error('403'), { status: 403 });
          },
        },
      },
    };
    const { actions } = await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1)],
      mergePR: async () => assert.fail('nothing should merge'),
      now: () => 1000,
      statusClient,
    });
    assert.deepEqual(types(actions), ['start:1']);
    assert.equal(calls.dispatches.length, 1, 'the batch still dispatched');
    assert.equal(calls.statuses.length, 0, 'nothing went through `github`');
  });

  it('writes no statuses in dry-run mode', async () => {
    const { github, calls } = makeFakeGithub();
    await runBatchQueue({
      github,
      owner: 'o',
      repo: 'r',
      readyPRs: [readyPR(1)],
      mergePR: async () => assert.fail('dry run'),
      isDryRun: true,
    });
    assert.equal(calls.statuses.length, 0);
  });
});
