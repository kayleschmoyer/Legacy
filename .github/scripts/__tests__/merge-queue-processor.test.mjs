/**
 * Unit tests for merge-queue-processor.js.
 *
 * Covers:
 *  - Bot approval / unresolved-thread interaction (LS-4174)
 *  - mergeable_state=behind merges directly (LS-4183: strict policy disabled)
 *
 * The processor is a CommonJS closure; helpers are not exported, so tests
 * exercise the behaviour through the public module interface with mocked
 * GitHub API objects.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The processor reads config-tracked required checks from
// $GITHUB_WORKSPACE/.github/ruleset.json (LS-7963). GITHUB_WORKSPACE is always
// set on Actions runners, which would make every test below pick up the REAL
// repo ruleset and gate the mocked PRs on its contexts. Unset it so tests run
// identically locally and in CI; the LS-7963 suite opts back in per-test with
// a fixture workspace.
delete process.env.GITHUB_WORKSPACE;

const require = createRequire(import.meta.url);
const processor = require(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../merge-queue-processor.js',
  ),
);

// ── Fixture helpers ──────────────────────────────────────────────────────────

const HEAD_SHA = 'abc123def456abc123def456abc123def456abc123';
// LS-9969: the base tip a squash merge lands on — the anchor for every
// post-merge content comparison.
const MERGE_PARENT_SHA = 'parent0000parent0000parent0000parent0000';

// LS-9969: post-merge content verification issues its own compares, all of them
// anchored to the squash commit's parent. Assertions about the pre-merge
// staleness guard care only about the compares made during validation.
const validationCompares = (calls) =>
  calls.compares.filter((basehead) => !basehead.includes(MERGE_PARENT_SHA));

function makePR(overrides = {}) {
  return {
    number: 1,
    title: 'Test PR',
    body: 'Test body',
    draft: false,
    mergeable: true,
    mergeable_state: 'clean',
    base: { ref: 'main' },
    head: { sha: HEAD_SHA, ref: 'feature/test' },
    labels: [{ name: 'merge-when-ready' }],
    user: { login: 'test-author' },
    // issues.listForRepo returns both issues and PRs; PRs carry a pull_request
    // field (plain issues do not), which the processor uses to filter PR entries.
    pull_request: { url: '', merged_at: null },
    ...overrides,
  };
}

// A single passing non-lightweight check run so CI is considered "done" by
// default (used when a test does not supply its own `checkRuns`).
const DEFAULT_CHECK_RUNS = [
  {
    name: 'CI Pipeline',
    status: 'completed',
    conclusion: 'success',
    completed_at: '2026-01-01T00:00:00Z',
    started_at: '2026-01-01T00:00:00Z',
  },
];

// Builds a minimal GitHub mock. `reviews` controls what listReviews returns;
// `unresolvedThreads` controls the reviewThreads GraphQL response;
// `pr` overrides the PR returned by paginate/get.
// `checkRuns` / `commitStatuses` override the check runs and commit statuses
// posted to the head SHA; `branchRules` overrides the ruleset rules returned by
// GET /repos/.../rules/branches/{branch} (null/[] → no required checks → the
// processor evaluates all checks).
function makeGithub({
  reviews = [],
  unresolvedThreads = [],
  reviewDecision = 'APPROVED',
  pr = makePR(),
  checkRuns = DEFAULT_CHECK_RUNS,
  commitStatuses = [],
  branchRules = [],
  workflowRuns = [],
  // merge-when-ready listing (the queued-path loop). Defaults to [pr] so
  // existing tests exercise the queued path unchanged; pass [] to test the
  // LS-9209 review-stall sweep in isolation.
  mergeReadyItems = undefined,
  // Open-PR listing served to the LS-9209 review-stall sweep
  // (paginate(pulls.list)). Defaults to [] so the sweep is inert in tests
  // that don't exercise it.
  sweepPRs = [],
  // LS-8779: BaseRefChangedEvent timeline nodes served to
  // detectSquashedStackedBase's first GraphQL query. Defaults to [] (no base
  // retarget on record) so unrelated merge-conflict tests fall through to the
  // generic advice.
  baseRefChangedEvents = [],
  // LS-8779: the old base branch's own (now-merged) PR, served to
  // detectSquashedStackedBase's second GraphQL query. Defaults to null (no
  // matching merged PR found for the retargeted-from ref).
  oldBasePR = null,
  // LS-9490: job counts per workflow-run id, served to
  // listJobsForWorkflowRun(run_id). A run with no entry (or an explicit 0)
  // reports zero jobs — the "dead, zero-job run" signature.
  jobCountsByRunId = {},
  // LS-9662: workflow-run details per run id, served to getWorkflowRun (the
  // staleness guard resolves the last-validated base SHA from the CI Gate
  // run's pull_requests[].base.sha). Missing id → run with no pull_requests.
  workflowRunDetails = {},
  // LS-9662: compare-API responses keyed by the `basehead` string passed to
  // compareCommitsWithBasehead. An Error value throws; a missing key returns
  // an empty comparison (0 commits, no merge_base_commit).
  compareResults = {},
  // LS-9662: rows served to pulls.listFiles (the PR's own changed files).
  prListFiles = [],
  // LS-9774: when set, reRunWorkflow throws this Error instead of
  // succeeding — used to exercise the "too old to rerun" fallback path.
  reRunWorkflowError = null,
  // LS-9404 / LS-9969: parent SHAs served to getCommit, keyed by commit ref.
  // Post-merge content verification anchors every comparison to the squash
  // commit's first parent (the base tip it landed on), so the merge commit
  // needs one. Defaults leave the compare stub returning empty file lists,
  // which reads as "nothing dropped" — override `compareResults` to exercise
  // the mismatch-detection path.
  commitParents = { 'merged-sha': [{ sha: MERGE_PARENT_SHA }] },
  // LS-9831: run-integration-tests.yml runs served to
  // checkInFlightIntegrationRun, kept separate from `workflowRuns` (which
  // feeds the unrelated ci-orchestrator.yml lookups) so existing orchestrator
  // fixtures don't accidentally trip the new in-flight-integration merge
  // guard. Defaults to [] (no in-flight integration run).
  integrationWorkflowRuns = [],
  // LS-10965: review.yml (Reviewer W1) runs served to the bot-review
  // self-heal's live-run guard, kept separate from `workflowRuns` so the
  // orchestrator fixtures never hold off a heal. An Error value makes
  // listWorkflowRuns throw for review.yml. Defaults to [] (no live W1 run).
  reviewWorkflowRuns = [],
  // LS-9753: existing issue comments served to issues.listComments — used to
  // seed the staleness-guard's retrigger-history marker (or any other PR
  // comment state a test wants visible before the run). Defaults to [].
  issueComments = [],
} = {}) {
  const calls = {
    merges: [],
    comments: [],
    updateBranch: [],
    labels: [],
    labelsRemoved: [],
    statuses: [],
    dispatches: [],
    reruns: [],
    cancels: [],
    compares: [],
  };

  const github = {
    hook: { after: () => {} },

    // paginate dispatches on the endpoint function reference
    paginate: async (fn, args) => {
      if (fn === github.rest.pulls.listReviews) return reviews;
      if (fn === github.rest.pulls.list) return sweepPRs;
      if (fn === github.rest.pulls.listFiles) return prListFiles;
      if (fn === github.rest.issues.listComments) {
        // Delegate to the endpoint (like the checks/statuses branches below)
        // rather than returning the seed array directly: tests that override
        // github.rest.issues.listComments must still be honoured, and walking
        // the pages is what makes the mock a faithful stand-in for paginate.
        const perPage = args?.per_page ?? 30;
        const all = [];
        for (let page = 1; ; page++) {
          const res = await github.rest.issues.listComments({
            ...args,
            per_page: perPage,
            page,
          });
          all.push(...res.data);
          if (res.data.length < perPage) break;
        }
        return all;
      }
      if (fn === github.rest.checks.listForRef) {
        const res = await github.rest.checks.listForRef(args);
        return res.data.check_runs;
      }
      if (fn === github.rest.repos.listCommitStatusesForRef) {
        const res = await github.rest.repos.listCommitStatusesForRef(args);
        return res.data;
      }
      // default: merge-when-ready PR list
      return mergeReadyItems ?? [pr];
    },

    graphql: async (query) => {
      if (query.includes('reviewDecision')) {
        return { repository: { pullRequest: { reviewDecision } } };
      }
      if (query.includes('reviewThreads')) {
        return {
          repository: {
            pullRequest: { reviewThreads: { nodes: unresolvedThreads } },
          },
        };
      }
      if (query.includes('BaseRefChangedEvent')) {
        return {
          repository: {
            pullRequest: { timelineItems: { nodes: baseRefChangedEvents } },
          },
        };
      }
      if (query.includes('mergeCommit')) {
        return {
          repository: {
            pullRequests: { nodes: oldBasePR ? [oldBasePR] : [] },
          },
        };
      }
      throw new Error(`Unexpected graphql query: ${query.slice(0, 80)}`);
    },

    rest: {
      pulls: {
        // Called twice per merge attempt: initial fetch + TOCTOU guard
        get: async () => ({ data: pr }),
        listReviews: async () => ({ data: reviews }),
        merge: async (args) => {
          calls.merges.push(args);
          return { data: { sha: 'merged-sha' } };
        },
        updateBranch: async (args) => {
          calls.updateBranch.push(args);
          return {};
        },
        // retargetDependentPRs
        list: async () => ({ data: [] }),
        update: async () => {},
        dismissReview: async () => {},
        // LS-9662: the PR's own changed files (staleness guard)
        listFiles: async () => ({ data: prListFiles }),
      },
      repos: {
        // 404 → no classic branch protection. Required checks (if any) come
        // from the ruleset via github.request below.
        getBranchProtection: async () => {
          throw Object.assign(new Error('Not Found'), { status: 404 });
        },
        listCommitStatusesForRef: async () => ({ data: commitStatuses }),
        createCommitStatus: async (args) => {
          calls.statuses.push(args);
          return { data: {} };
        },
        // LS-9404 / LS-9969: merge-commit parent lookup (content verification)
        getCommit: async (args) => ({
          data: { parents: commitParents[args.ref] ?? [] },
        }),
        // LS-9662: gap comparison + merge-base fallback (staleness guard)
        compareCommitsWithBasehead: async (args) => {
          calls.compares.push(args.basehead);
          const entry = compareResults[args.basehead];
          if (entry instanceof Error) throw entry;
          if (!entry) {
            return {
              data: {
                total_commits: 0,
                commits: [],
                files: [],
                merge_base_commit: null,
              },
            };
          }
          return { data: entry };
        },
      },
      checks: {
        listForRef: async () => ({ data: { check_runs: checkRuns } }),
      },
      issues: {
        // LS-10123: GitHub serves issue comments one page at a time
        // (per_page defaults to 30), so the mock must too. Returning the whole
        // list unconditionally hid a real first-page-only read in the
        // production code — the paginated-read regression tests below depend
        // on this staying faithful.
        listComments: async (args = {}) => {
          const perPage = args.per_page ?? 30;
          const page = args.page ?? 1;
          return {
            data: issueComments.slice((page - 1) * perPage, page * perPage),
          };
        },
        createComment: async (args) => {
          calls.comments.push(args);
          return { data: { id: 1 } };
        },
        updateComment: async (args) => {
          calls.comments.push(args);
        },
        addLabels: async (args) => {
          calls.labels.push(args);
        },
        removeLabel: async (args) => {
          calls.labelsRemoved.push(args);
        },
      },
      git: { deleteRef: async () => {} },
      actions: {
        // remediateCancelledCiRun (LS-9053) and checkInFlightIntegrationRun
        // (LS-9831) share this endpoint but query different workflow files —
        // route by workflow_id so each gets its own fixture list.
        listWorkflowRuns: async (args) => {
          if (args.workflow_id === 'review.yml') {
            if (reviewWorkflowRuns instanceof Error) throw reviewWorkflowRuns;
            return { data: { workflow_runs: reviewWorkflowRuns } };
          }
          return {
            data: {
              workflow_runs:
                args.workflow_id === 'run-integration-tests.yml'
                  ? integrationWorkflowRuns
                  : workflowRuns,
            },
          };
        },
        reRunWorkflow: async (args) => {
          calls.reruns.push(args);
          if (reRunWorkflowError) throw reRunWorkflowError;
          return {};
        },
        // LS-9490: dead-run detection + cancellation
        listJobsForWorkflowRun: async (args) => ({
          data: {
            jobs: Array.from(
              { length: jobCountsByRunId[args.run_id] ?? 0 },
              (_, i) => ({ id: i }),
            ),
          },
        }),
        cancelWorkflowRun: async (args) => {
          calls.cancels.push(args);
          return {};
        },
        // LS-9662: CI Gate run lookup (staleness guard base-SHA resolution)
        getWorkflowRun: async (args) => ({
          data: workflowRunDetails[args.run_id] ?? { pull_requests: [] },
        }),
      },
    },

    // Serves the ruleset endpoint (GET /repos/.../rules/branches/{branch}) so
    // getRequiredChecks can resolve required-check names. Self-retry
    // workflow_dispatch POSTs are recorded in calls.dispatches; any other
    // request resolves to an empty object.
    request: async (route, params) => {
      if (typeof route === 'string' && route.includes('/rules/branches/')) {
        return { data: branchRules ?? [] };
      }
      if (typeof route === 'string' && route.includes('/dispatches')) {
        calls.dispatches.push(params);
        return {};
      }
      return {};
    },
  };

  return { github, calls };
}

const context = {
  repo: { owner: 'test-owner', repo: 'test-repo' },
  // workflow_run suppresses self-retry dispatch and avoids needing to mock it
  eventName: 'workflow_run',
};

const UNRESOLVED_THREAD = {
  isResolved: false,
  isOutdated: false,
  comments: { nodes: [{ author: { login: 'legacy-sports-review-bot[bot]' } }] },
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('merge-queue-processor — bot approval skips unresolved-thread check', () => {
  it('merges when bot has APPROVED and threads are unresolved (thread check skipped)', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      unresolvedThreads: [UNRESOLVED_THREAD],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.merges.length, 1, 'should attempt merge');
    assert.strictEqual(
      calls.comments.filter((c) => c.body?.includes('Cannot Merge')).length,
      0,
      'should not post a blocker comment',
    );
  });

  it('blocks merge when no bot review exists and threads are unresolved', async () => {
    const { github, calls } = makeGithub({
      reviews: [],
      unresolvedThreads: [UNRESOLVED_THREAD],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.merges.length, 0, 'should not attempt merge');
    assert.ok(
      calls.comments.some((c) =>
        c.body?.includes('unresolved review comment thread'),
      ),
      'should post unresolved-thread blocker',
    );
  });

  it('blocks merge when bot review is DISMISSED and threads are unresolved', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        {
          user: { login: 'legacy-sports-review-bot[bot]' },
          state: 'DISMISSED',
        },
      ],
      unresolvedThreads: [UNRESOLVED_THREAD],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.merges.length, 0, 'should not attempt merge');
    assert.ok(
      calls.comments.some((c) =>
        c.body?.includes('unresolved review comment thread'),
      ),
      'should post unresolved-thread blocker',
    );
  });

  it('merges when multiple bot reviews exist (CHANGES_REQUESTED then APPROVED) with unresolved threads', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        {
          user: { login: 'legacy-sports-review-bot[bot]' },
          state: 'CHANGES_REQUESTED',
        },
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      unresolvedThreads: [UNRESOLVED_THREAD],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.merges.length, 1, 'should attempt merge');
  });

  it('blocks merge when only a human APPROVED review exists and threads are unresolved', async () => {
    const { github, calls } = makeGithub({
      reviews: [{ user: { login: 'human-reviewer' }, state: 'APPROVED' }],
      unresolvedThreads: [UNRESOLVED_THREAD],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.merges.length,
      0,
      'human approval should not skip thread check',
    );
    assert.ok(
      calls.comments.some((c) =>
        c.body?.includes('unresolved review comment thread'),
      ),
      'should post unresolved-thread blocker',
    );
  });

  it('reports correct thread count in blocker comment', async () => {
    const { github, calls } = makeGithub({
      reviews: [],
      unresolvedThreads: [
        UNRESOLVED_THREAD,
        UNRESOLVED_THREAD,
        UNRESOLVED_THREAD,
      ],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.ok(
      calls.comments.some((c) =>
        c.body?.includes('3 unresolved review comment thread'),
      ),
      'blocker comment should mention count of 3',
    );
  });

  it('merges cleanly when bot APPROVED and no unresolved threads (normal happy path)', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      unresolvedThreads: [],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.merges.length, 1);
  });

  it('outdated threads do not count as unresolved even without bot approval', async () => {
    const outdatedThread = {
      isResolved: false,
      isOutdated: true,
      comments: { nodes: [] },
    };
    const { github, calls } = makeGithub({
      reviews: [],
      unresolvedThreads: [outdatedThread],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.merges.length,
      1,
      'outdated thread should not block merge',
    );
  });
});

describe('merge-queue-processor — mergeable_state=behind merges directly (LS-4183)', () => {
  it('merges a behind PR without calling updateBranch', async () => {
    const behindPR = makePR({ mergeable_state: 'behind' });
    const { github, calls } = makeGithub({
      pr: behindPR,
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.updateBranch.length,
      0,
      'updateBranch must not be called — strict policy is disabled',
    );
    assert.strictEqual(
      calls.merges.length,
      1,
      'behind PR with all gates green should merge directly',
    );
  });
});

// ── LS-9831 ──────────────────────────────────────────────────────────────────

describe('merge-queue-processor — in-flight integration run blocks merge (LS-9831)', () => {
  it('does not merge while run-integration-tests.yml is still in_progress for the head SHA', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      integrationWorkflowRuns: [
        {
          id: 42,
          status: 'in_progress',
          html_url: 'https://github.com/example/repo/actions/runs/42',
        },
      ],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.merges.length,
      0,
      'must not merge while the integration suite is still in flight',
    );
  });

  it('merges once run-integration-tests.yml has completed for the head SHA', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      integrationWorkflowRuns: [
        {
          id: 42,
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://github.com/example/repo/actions/runs/42',
        },
      ],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.merges.length,
      1,
      'a completed integration run must not block an otherwise-green merge',
    );
  });

  it('fails open (merges) when listing integration-test runs errors', async () => {
    const { github: baseGithub, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
    });
    const github = {
      ...baseGithub,
      rest: {
        ...baseGithub.rest,
        actions: {
          ...baseGithub.rest.actions,
          listWorkflowRuns: async (args) => {
            if (args.workflow_id === 'run-integration-tests.yml') {
              throw new Error('API unavailable');
            }
            return baseGithub.rest.actions.listWorkflowRuns(args);
          },
        },
      },
    };

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.merges.length,
      1,
      'an API error checking for in-flight integration runs should fail open, not wedge the queue',
    );
  });
});

// ── LS-4181 ──────────────────────────────────────────────────────────────────

describe('merge-queue-processor — 405 required-checks-expected handling (LS-4181)', () => {
  function make405CheckExpectedError() {
    const err = Object.assign(new Error('Repository rule violations found'), {
      status: 405,
      response: {
        data: {
          message:
            'Repository rule violations found\n\n' +
            '5 of 7 required status checks are expected.',
        },
      },
    });
    return err;
  }

  it('treats 405 "N of M required status checks are expected" as pending — no error comment, no throw', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      unresolvedThreads: [],
    });
    github.rest.pulls.merge = async () => {
      calls.merges.push({});
      throw make405CheckExpectedError();
    };

    await assert.doesNotReject(
      () =>
        processor({
          github,
          context,
          isDryRun: false,
          forceCheck: false,
          isRetry: false,
        }),
      'processor should not throw when checks-not-yet-registered race occurs',
    );

    assert.strictEqual(
      calls.merges.length,
      1,
      'merge attempt should have been made',
    );
    assert.strictEqual(
      calls.comments.filter((c) =>
        c.body?.includes('Merge Queue Processing Error'),
      ).length,
      0,
      'should NOT post a Processing Error comment for the pending-checks race',
    );
  });

  it('treats 405 "N of M required status checks have not succeeded" as pending — no error comment, no throw (LS-4184)', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      unresolvedThreads: [],
    });
    github.rest.pulls.merge = async () => {
      calls.merges.push({});
      throw Object.assign(new Error('Repository rule violations found'), {
        status: 405,
        response: {
          data: {
            message:
              'Repository rule violations found\n\n' +
              '5 of 7 required status checks have not succeeded: .',
          },
        },
      });
    };

    await assert.doesNotReject(
      () =>
        processor({
          github,
          context,
          isDryRun: false,
          forceCheck: false,
          isRetry: false,
        }),
      'processor should not throw when checks-pending race occurs',
    );

    assert.strictEqual(
      calls.merges.length,
      1,
      'merge attempt should have been made',
    );
    assert.strictEqual(
      calls.comments.filter((c) =>
        c.body?.includes('Merge Queue Processing Error'),
      ).length,
      0,
      'should NOT post a Processing Error comment for the pending-checks race',
    );
  });

  it('treats 405 single-check "Required status check \\"X\\" is cancelled" as pending — no error comment, no throw (LS-7989)', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      unresolvedThreads: [],
    });
    github.rest.pulls.merge = async () => {
      calls.merges.push({});
      throw Object.assign(new Error('Repository rule violations found'), {
        status: 405,
        response: {
          data: {
            message:
              'Repository rule violations found\n\n' +
              'Required status check "🚀 CI Pipeline / lint" is cancelled.',
          },
        },
      });
    };

    await assert.doesNotReject(
      () =>
        processor({
          github,
          context,
          isDryRun: false,
          forceCheck: false,
          isRetry: false,
        }),
      'processor should not throw when a required check is reported cancelled',
    );

    assert.strictEqual(
      calls.merges.length,
      1,
      'merge attempt should have been made',
    );
    assert.strictEqual(
      calls.comments.filter((c) =>
        c.body?.includes('Merge Queue Processing Error'),
      ).length,
      0,
      'should NOT post a Processing Error comment for a cancelled-duplicate race',
    );
  });

  it('treats 405 single-check "Required status check \\"X\\" is expected" as pending (LS-7989)', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      unresolvedThreads: [],
    });
    github.rest.pulls.merge = async () => {
      calls.merges.push({});
      throw Object.assign(new Error('Repository rule violations found'), {
        status: 405,
        response: {
          data: {
            message:
              'Repository rule violations found\n\n' +
              'Required status check "Verify All Migrations Applied" is expected.',
          },
        },
      });
    };

    await assert.doesNotReject(() =>
      processor({
        github,
        context,
        isDryRun: false,
        forceCheck: false,
        isRetry: false,
      }),
    );

    assert.strictEqual(
      calls.comments.filter((c) =>
        c.body?.includes('Merge Queue Processing Error'),
      ).length,
      0,
      'should NOT post a Processing Error comment for an expecting-check race',
    );
  });

  it('logs verbatim 405 response body (message + documentation_url) before interpretation (LS-4926)', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      unresolvedThreads: [],
    });
    github.rest.pulls.merge = async () => {
      calls.merges.push({});
      throw Object.assign(new Error('Repository rule violations found'), {
        status: 405,
        response: {
          data: {
            message:
              'Repository rule violations found\n\n' +
              '5 of 7 required status checks are expected.',
            documentation_url:
              'https://docs.github.com/rest/pulls/pulls#merge-a-pull-request',
          },
        },
      });
    };

    const captured = [];
    const originalLog = console.log;
    console.log = (...args) => {
      captured.push(args.map((a) => String(a)).join(' '));
    };
    try {
      await processor({
        github,
        context,
        isDryRun: false,
        forceCheck: false,
        isRetry: false,
      });
    } finally {
      console.log = originalLog;
    }

    const all = captured.join('\n');
    assert.match(
      all,
      /GitHub merge API 405 — Repository rule violations found/,
      'should log the verbatim GitHub-supplied message',
    );
    assert.match(
      all,
      /5 of 7 required status checks are expected/,
      'should include the full message body',
    );
    assert.match(
      all,
      /docs\.github\.com\/rest\/pulls\/pulls#merge-a-pull-request/,
      'should include documentation_url when present',
    );
    assert.match(
      all,
      /CI still registering or in-progress/,
      'existing interpretive line should remain (retry behavior unchanged)',
    );
  });

  it('logs verbatim 405 body even for non-pending 405 causes (ruleset misconfig case, LS-4926)', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      unresolvedThreads: [],
    });
    github.rest.pulls.merge = async () => {
      calls.merges.push({});
      throw Object.assign(new Error('Method Not Allowed'), {
        status: 405,
        response: {
          data: { message: 'Pull Request is not mergeable' },
        },
      });
    };

    const captured = [];
    const originalLog = console.log;
    console.log = (...args) => {
      captured.push(args.map((a) => String(a)).join(' '));
    };
    try {
      await processor({
        github,
        context,
        isDryRun: false,
        forceCheck: false,
        isRetry: false,
      });
    } finally {
      console.log = originalLog;
    }

    assert.match(
      captured.join('\n'),
      /GitHub merge API 405 — Pull Request is not mergeable/,
      'verbatim body should be logged even when no documentation_url is present',
    );
  });

  it('still surfaces other 405 causes as real errors with a comment', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      unresolvedThreads: [],
    });
    github.rest.pulls.merge = async () => {
      calls.merges.push({});
      throw Object.assign(new Error('Method Not Allowed'), {
        status: 405,
        response: {
          data: { message: 'Pull Request is not mergeable' },
        },
      });
    };

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.comments.filter((c) =>
        c.body?.includes('Merge Queue Processing Error'),
      ).length,
      1,
      'should post a Processing Error comment for unrelated 405 errors',
    );
  });
});

// ── LS-4185 ──────────────────────────────────────────────────────────────────

describe('merge-queue-processor — Discord CODEOWNER notification (LS-4185)', () => {
  it('posts CODEOWNER blocker comment and skips Discord when env var unset', async () => {
    delete process.env.ESCALATION_WEBHOOK_URL;
    const { github, calls } = makeGithub({ reviewDecision: 'REVIEW_REQUIRED' });

    await assert.doesNotReject(
      () =>
        processor({
          github,
          context,
          isDryRun: false,
          forceCheck: false,
          isRetry: false,
        }),
      'processor should not throw when ESCALATION_WEBHOOK_URL is unset',
    );

    assert.strictEqual(calls.merges.length, 0, 'should not merge');
    assert.ok(
      calls.comments.some((c) => c.body?.includes('CODEOWNER approval')),
      'should post CODEOWNER blocker comment',
    );
  });

  it('attempts Discord webhook when env var is set for CODEOWNER block', async () => {
    process.env.ESCALATION_WEBHOOK_URL =
      'https://discord.com/api/webhooks/test/token';
    const { github, calls } = makeGithub({ reviewDecision: 'REVIEW_REQUIRED' });

    const https = require('https');
    const requestCalls = [];
    const originalRequest = https.request;
    https.request = (opts, cb) => {
      requestCalls.push(opts);
      // Simulate a minimal IncomingMessage-like response
      const res = {
        statusCode: 204,
        resume: () => {},
        on: () => res,
      };
      if (cb) cb(res);
      return { on: () => {}, write: () => {}, end: () => {} };
    };

    try {
      await processor({
        github,
        context,
        isDryRun: false,
        forceCheck: false,
        isRetry: false,
      });
    } finally {
      https.request = originalRequest;
      delete process.env.ESCALATION_WEBHOOK_URL;
    }

    assert.strictEqual(calls.merges.length, 0, 'should not merge');
    assert.strictEqual(
      requestCalls.length,
      1,
      'should make exactly one Discord webhook request',
    );
    assert.strictEqual(
      requestCalls[0].hostname,
      'discord.com',
      'request should target discord.com',
    );
  });

  it('does not send Discord notification for non-CODEOWNER blockers', async () => {
    process.env.ESCALATION_WEBHOOK_URL =
      'https://discord.com/api/webhooks/test/token';
    const conflictPR = makePR({ mergeable: false });
    const { github } = makeGithub({ pr: conflictPR });

    const https = require('https');
    const requestCalls = [];
    const originalRequest = https.request;
    https.request = (opts, cb) => {
      requestCalls.push(opts);
      const res = { statusCode: 204, resume: () => {}, on: () => res };
      if (cb) cb(res);
      return { on: () => {}, write: () => {}, end: () => {} };
    };

    try {
      await processor({
        github,
        context,
        isDryRun: false,
        forceCheck: false,
        isRetry: false,
      });
    } finally {
      https.request = originalRequest;
      delete process.env.ESCALATION_WEBHOOK_URL;
    }

    assert.strictEqual(
      requestCalls.length,
      0,
      'should not send Discord notification for merge conflict blocker',
    );
  });
});

// ── LS-8603 ──────────────────────────────────────────────────────────────────

describe('merge-queue-processor — Discord CODEOWNER ping dedup (LS-8603)', () => {
  const STATUS_MARKER = '<!-- MERGE-QUEUE-STATUS -->';
  const pingMarkerFor = (sha) => `<!-- CODEOWNER-PING:${sha} -->`;

  function mockDiscord() {
    const https = require('https');
    const requestCalls = [];
    const originalRequest = https.request;
    https.request = (opts, cb) => {
      requestCalls.push(opts);
      const res = { statusCode: 204, resume: () => {}, on: () => res };
      if (cb) cb(res);
      return { on: () => {}, write: () => {}, end: () => {} };
    };
    return { requestCalls, restore: () => (https.request = originalRequest) };
  }

  function withExistingComment(github, body, updates) {
    github.rest.issues.listComments = async () => ({
      data: [{ id: 42, body }],
    });
    github.rest.issues.updateComment = async (args) => {
      updates.push(args);
    };
  }

  it('records a ping marker for the head SHA in the status comment on first ping', async () => {
    process.env.ESCALATION_WEBHOOK_URL =
      'https://discord.com/api/webhooks/test/token';
    const { github, calls } = makeGithub({ reviewDecision: 'REVIEW_REQUIRED' });
    const discord = mockDiscord();

    try {
      await processor({
        github,
        context,
        isDryRun: false,
        forceCheck: false,
        isRetry: false,
      });
    } finally {
      discord.restore();
      delete process.env.ESCALATION_WEBHOOK_URL;
    }

    assert.strictEqual(discord.requestCalls.length, 1, 'should ping once');
    assert.ok(
      calls.comments.some((c) => c.body?.includes(pingMarkerFor(HEAD_SHA))),
      'status comment should persist the ping marker for the head SHA',
    );
  });

  it('does not re-ping when the status comment already has the marker for the same SHA', async () => {
    process.env.ESCALATION_WEBHOOK_URL =
      'https://discord.com/api/webhooks/test/token';
    const { github } = makeGithub({ reviewDecision: 'REVIEW_REQUIRED' });
    const updates = [];
    withExistingComment(
      github,
      `${STATUS_MARKER}\n## 🚫 Merge Queue: Cannot Merge\n${pingMarkerFor(HEAD_SHA)}`,
      updates,
    );
    const discord = mockDiscord();

    try {
      await processor({
        github,
        context,
        isDryRun: false,
        forceCheck: false,
        isRetry: false,
      });
    } finally {
      discord.restore();
      delete process.env.ESCALATION_WEBHOOK_URL;
    }

    assert.strictEqual(
      discord.requestCalls.length,
      0,
      'should not re-ping while blocked on the same head SHA',
    );
    assert.ok(
      updates.some((u) => u.body?.includes(pingMarkerFor(HEAD_SHA))),
      'updated status comment should keep the ping marker',
    );
  });

  it('re-pings once when the head SHA has changed since the last ping', async () => {
    process.env.ESCALATION_WEBHOOK_URL =
      'https://discord.com/api/webhooks/test/token';
    const { github } = makeGithub({ reviewDecision: 'REVIEW_REQUIRED' });
    const updates = [];
    withExistingComment(
      github,
      `${STATUS_MARKER}\n## 🚫 Merge Queue: Cannot Merge\n${pingMarkerFor('oldsha000')}`,
      updates,
    );
    const discord = mockDiscord();

    try {
      await processor({
        github,
        context,
        isDryRun: false,
        forceCheck: false,
        isRetry: false,
      });
    } finally {
      discord.restore();
      delete process.env.ESCALATION_WEBHOOK_URL;
    }

    assert.strictEqual(
      discord.requestCalls.length,
      1,
      'should ping again for a new head SHA',
    );
    assert.ok(
      updates.some(
        (u) =>
          u.body?.includes(pingMarkerFor(HEAD_SHA)) &&
          !u.body?.includes(pingMarkerFor('oldsha000')),
      ),
      'marker should be replaced with the new head SHA',
    );
  });

  it('carries the ping marker forward across a non-codeowner status rewrite', async () => {
    process.env.ESCALATION_WEBHOOK_URL =
      'https://discord.com/api/webhooks/test/token';
    // Blocked on merge conflicts this cycle — the status comment is rewritten
    // with a different reason, and must not drop the dedup marker.
    const conflictPR = makePR({ mergeable: false });
    const { github } = makeGithub({ pr: conflictPR });
    const updates = [];
    withExistingComment(
      github,
      `${STATUS_MARKER}\n## 🚫 Merge Queue: Cannot Merge\n${pingMarkerFor(HEAD_SHA)}`,
      updates,
    );
    const discord = mockDiscord();

    try {
      await processor({
        github,
        context,
        isDryRun: false,
        forceCheck: false,
        isRetry: false,
      });
    } finally {
      discord.restore();
      delete process.env.ESCALATION_WEBHOOK_URL;
    }

    assert.strictEqual(
      discord.requestCalls.length,
      0,
      'conflict blocker should not ping Discord',
    );
    assert.ok(
      updates.some(
        (u) =>
          u.body?.includes('merge conflicts') &&
          u.body?.includes(pingMarkerFor(HEAD_SHA)),
      ),
      'rewritten status comment should carry the ping marker forward',
    );
  });
});

// ── LS-8779 ──────────────────────────────────────────────────────────────────

describe('merge-queue-processor — squash-merged stacked-base rebase advice (LS-8779)', () => {
  const OLD_BASE_TIP_SHA = 'oldbase111tip222sha333abc444def555abc666';

  it('emits --onto advice when the base branch was squash-merged (1-parent merge commit)', async () => {
    const conflictPR = makePR({ mergeable: false, base: { ref: 'main' } });
    const { github, calls } = makeGithub({
      pr: conflictPR,
      baseRefChangedEvents: [
        { previousRefName: 'claude/old-base-branch', currentRefName: 'main' },
      ],
      oldBasePR: {
        headRefOid: OLD_BASE_TIP_SHA,
        mergeCommit: { parents: { totalCount: 1 } },
      },
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    const statusComment = calls.comments.find((c) =>
      c.body?.includes('Merge Queue: Cannot Merge'),
    );
    assert.ok(statusComment, 'should post a blocked-merge status comment');
    assert.ok(
      statusComment.body.includes(
        `git rebase --onto origin/main ${OLD_BASE_TIP_SHA} ${conflictPR.head.ref}`,
      ),
      'should advise the --onto rebase using the old base branch tip SHA',
    );
    assert.ok(
      statusComment.body.includes('claude/old-base-branch'),
      'should name the old base branch that was squash-merged',
    );
    assert.ok(
      !statusComment.body.includes('git merge main'),
      'should not also emit the generic merge-main advice',
    );
  });

  it('falls back to generic advice when the old base was a real (2-parent) merge commit', async () => {
    const conflictPR = makePR({ mergeable: false, base: { ref: 'main' } });
    const { github, calls } = makeGithub({
      pr: conflictPR,
      baseRefChangedEvents: [
        { previousRefName: 'claude/old-base-branch', currentRefName: 'main' },
      ],
      oldBasePR: {
        headRefOid: OLD_BASE_TIP_SHA,
        mergeCommit: { parents: { totalCount: 2 } },
      },
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    const statusComment = calls.comments.find((c) =>
      c.body?.includes('Merge Queue: Cannot Merge'),
    );
    assert.ok(statusComment, 'should post a blocked-merge status comment');
    assert.ok(
      statusComment.body.includes('git merge main'),
      'a 2-parent merge commit means the old commits are still reachable — plain advice applies',
    );
    assert.ok(
      !statusComment.body.includes('rebase --onto'),
      'should not emit --onto advice when a plain rebase is safe',
    );
  });

  it('falls back to generic advice when there is no base-retarget history', async () => {
    const conflictPR = makePR({ mergeable: false, base: { ref: 'main' } });
    const { github, calls } = makeGithub({
      pr: conflictPR,
      baseRefChangedEvents: [],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    const statusComment = calls.comments.find((c) =>
      c.body?.includes('Merge Queue: Cannot Merge'),
    );
    assert.ok(statusComment, 'should post a blocked-merge status comment');
    assert.ok(
      statusComment.body.includes('git merge main'),
      'no retarget history means the generic advice applies',
    );
  });
});

// ── LS-7963 ──────────────────────────────────────────────────────────────────

describe('merge-queue-processor — config-tracked required checks gate (LS-7963)', () => {
  // The live required set as returned by GET /repos/.../rules/branches/main at
  // the time of the #5110 incident — note `🚀 CI Pipeline / e2e-affected` is
  // tracked in .github/ruleset.json but absent here (apply-ruleset.sh not run).
  const LIVE_REQUIRED = [
    'bot-review',
    'No Merge Conflicts',
    'Verify All Migrations Applied',
    '🚀 CI Pipeline / lint',
    '🚀 CI Pipeline / format',
    '🚀 CI Pipeline / build',
    '🚀 CI Pipeline / test',
    '🚀 CI Pipeline / custom-checks',
  ];

  const FIXTURE_WORKSPACE = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'fixtures',
    'ls-7963-config-ruleset',
  );

  // Wires the makeGithub mock so the live ruleset API returns LIVE_REQUIRED,
  // commit statuses cover the status-type contexts, and check runs cover the
  // check-run-type contexts — all green — plus any extra check runs supplied
  // (e.g. a failing e2e-affected).
  function wireLiveChecks(github, { extraCheckRuns = [] } = {}) {
    github.request = async (route) => {
      if (
        typeof route === 'string' &&
        route.startsWith('GET /repos/{owner}/{repo}/rules/branches/{branch}')
      ) {
        return {
          data: [
            {
              type: 'required_status_checks',
              parameters: {
                required_status_checks: LIVE_REQUIRED.map((context) => ({
                  context,
                })),
              },
            },
          ],
        };
      }
      return {};
    };
    github.rest.repos.listCommitStatusesForRef = async () => ({
      data: [
        {
          context: 'bot-review',
          state: 'success',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    });
    github.rest.checks.listForRef = async () => ({
      data: {
        check_runs: [
          ...LIVE_REQUIRED.filter((n) => n !== 'bot-review').map((name) => ({
            name,
            status: 'completed',
            conclusion: 'success',
            completed_at: '2026-01-01T00:00:00Z',
            started_at: '2026-01-01T00:00:00Z',
          })),
          ...extraCheckRuns,
        ],
      },
    });
  }

  const FAILING_E2E_AFFECTED = {
    name: '🚀 CI Pipeline / e2e-affected',
    status: 'completed',
    conclusion: 'failure',
    completed_at: '2026-01-01T00:10:00Z',
    started_at: '2026-01-01T00:00:00Z',
  };

  async function runProcessor(github) {
    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });
  }

  function withFixtureWorkspace(fn) {
    return async () => {
      const original = process.env.GITHUB_WORKSPACE;
      process.env.GITHUB_WORKSPACE = FIXTURE_WORKSPACE;
      try {
        await fn();
      } finally {
        if (original === undefined) delete process.env.GITHUB_WORKSPACE;
        else process.env.GITHUB_WORKSPACE = original;
      }
    };
  }

  it('reproduces the #5110 gap: without config visibility, a failing e2e-affected check does not block merge', async () => {
    delete process.env.GITHUB_WORKSPACE;
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      unresolvedThreads: [],
    });
    wireLiveChecks(github, { extraCheckRuns: [FAILING_E2E_AFFECTED] });

    await runProcessor(github);

    assert.strictEqual(
      calls.merges.length,
      1,
      'live-only required set ignores the failing e2e-affected check — the documented #5110 gap',
    );
  });

  it(
    'blocks merge when the config-tracked e2e-affected check is failing',
    withFixtureWorkspace(async () => {
      const { github, calls } = makeGithub({
        reviews: [
          {
            user: { login: 'legacy-sports-review-bot[bot]' },
            state: 'APPROVED',
          },
        ],
        unresolvedThreads: [],
      });
      wireLiveChecks(github, { extraCheckRuns: [FAILING_E2E_AFFECTED] });

      await runProcessor(github);

      assert.strictEqual(calls.merges.length, 0, 'should not attempt merge');
      assert.ok(
        calls.comments.some((c) => c.body?.includes('e2e-affected (failure)')),
        'blocker comment should name the failing e2e-affected check',
      );
    }),
  );

  it(
    'waits (no merge) while the config-tracked e2e-affected check has not registered yet',
    withFixtureWorkspace(async () => {
      const { github, calls } = makeGithub({
        reviews: [
          {
            user: { login: 'legacy-sports-review-bot[bot]' },
            state: 'APPROVED',
          },
        ],
        unresolvedThreads: [],
      });
      // Live checks all green; e2e-affected absent (CI still in flight — the
      // exact #5110 timeline: merge fired 27s after the e2e shards started).
      wireLiveChecks(github);

      await runProcessor(github);

      assert.strictEqual(calls.merges.length, 0, 'should not attempt merge');
      assert.ok(
        calls.comments.some(
          (c) =>
            c.body?.includes('Waiting') &&
            c.body?.includes('e2e-affected (not yet registered)'),
        ),
        'should post a waiting comment naming the unregistered check',
      );
    }),
  );

  it(
    'merges when the config-tracked e2e-affected check succeeds (and _staged entries do not gate)',
    withFixtureWorkspace(async () => {
      const { github, calls } = makeGithub({
        reviews: [
          {
            user: { login: 'legacy-sports-review-bot[bot]' },
            state: 'APPROVED',
          },
        ],
        unresolvedThreads: [],
      });
      // staged-check-must-not-gate / staged-rule-must-not-gate are never
      // posted — if they gated, this would block as "not yet registered".
      wireLiveChecks(github, {
        extraCheckRuns: [{ ...FAILING_E2E_AFFECTED, conclusion: 'success' }],
      });

      await runProcessor(github);

      assert.strictEqual(calls.merges.length, 1, 'should merge');
    }),
  );

  it(
    'does not apply config contexts to non-main bases (stacked merge-to-parent PRs)',
    withFixtureWorkspace(async () => {
      const stackedPR = makePR({
        base: { ref: 'claude/parent-branch' },
        labels: [{ name: 'merge-when-ready' }, { name: 'merge-to-parent' }],
      });
      const { github, calls } = makeGithub({
        reviews: [
          {
            user: { login: 'legacy-sports-review-bot[bot]' },
            state: 'APPROVED',
          },
        ],
        unresolvedThreads: [],
        pr: stackedPR,
      });
      // Default mocks: no live protection for the parent branch, one generic
      // passing check. If the config union applied here, e2e-affected would be
      // "(not yet registered)" and the merge would be blocked.

      await runProcessor(github);

      assert.strictEqual(
        calls.merges.length,
        1,
        'config contexts target ~DEFAULT_BRANCH and must not gate non-main bases',
      );
    }),
  );
});

describe('merge-queue-processor — log sanitization (LS-4181)', () => {
  it('does not emit raw ##[ workflow command escapes from PR body content', async () => {
    const injectedPR = makePR({
      body:
        'Description with quoted error:\n\n' +
        '```\n' +
        '##[error]injected from pr body\n' +
        '```\n',
    });
    const { github } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      unresolvedThreads: [],
      pr: injectedPR,
    });
    // Force a non-fast-path merge failure that goes through reportProcessingError.
    github.rest.pulls.merge = async () => {
      throw Object.assign(new Error('boom ##[error]from-error-message'), {
        status: 500,
        response: {
          data: {
            message: 'Internal ##[error]from-response-body',
          },
        },
      });
    };

    const captured = [];
    const originalErr = console.error;
    console.error = (...args) => {
      captured.push(args.map((a) => String(a)).join(' '));
    };
    try {
      await processor({
        github,
        context,
        isDryRun: false,
        forceCheck: false,
        isRetry: false,
      });
    } finally {
      console.error = originalErr;
    }

    const all = captured.join('\n');
    assert.ok(
      !/##\[error\]/.test(all),
      'no raw ##[error] escape should appear in stderr; got:\n' + all,
    );
    // The sanitized form (with U+200B between `#` and `#[`) should still carry the original text.
    assert.ok(
      /from-error-message/.test(all),
      'sanitized output should still contain the underlying message',
    );
  });
});

// ── LS-7991 ──────────────────────────────────────────────────────────────────

describe('merge-queue-processor — CI Gate aggregator ruleset (LS-7991)', () => {
  // Ruleset that requires ONLY the aggregate `CI Gate` commit status (the
  // step-3 target state), as returned by GET /repos/.../rules/branches/{branch}.
  const CI_GATE_ONLY_RULES = [
    {
      type: 'required_status_checks',
      parameters: {
        required_status_checks: [{ context: 'CI Gate' }],
      },
    },
  ];

  // Cancelled + duplicate terminal check-RUNS for the OLD granular required
  // names on the head SHA — the exact shape that 405s a green PR today
  // (LS-7988). With a CI-Gate-only ruleset these are no longer required names,
  // so the processor filters them out entirely.
  const CANCELLED_GRANULAR_DUPLICATES = [
    {
      name: '🚀 CI Pipeline / lint',
      status: 'completed',
      conclusion: 'cancelled',
      completed_at: '2026-01-01T00:01:00Z',
      started_at: '2026-01-01T00:00:00Z',
    },
    {
      name: '🚀 CI Pipeline / lint',
      status: 'completed',
      conclusion: 'success',
      completed_at: '2026-01-01T00:02:00Z',
      started_at: '2026-01-01T00:01:30Z',
    },
    {
      name: '🚀 CI Pipeline / test',
      status: 'completed',
      conclusion: 'cancelled',
      completed_at: '2026-01-01T00:01:00Z',
      started_at: '2026-01-01T00:00:00Z',
    },
  ];

  it('merges a green PR whose SHA carries cancelled granular duplicates (CI Gate passing)', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      unresolvedThreads: [],
      branchRules: CI_GATE_ONLY_RULES,
      checkRuns: CANCELLED_GRANULAR_DUPLICATES,
      commitStatuses: [
        {
          context: 'CI Gate',
          state: 'success',
          created_at: '2026-01-01T00:03:00Z',
        },
      ],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.merges.length,
      1,
      'CI Gate success should allow merge despite cancelled granular duplicates',
    );
    assert.strictEqual(
      calls.comments.filter((c) => c.body?.includes('Cannot Merge')).length,
      0,
      'should not post a blocker comment',
    );
  });

  it('blocks merge when the CI Gate commit status itself failed', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      unresolvedThreads: [],
      branchRules: CI_GATE_ONLY_RULES,
      checkRuns: CANCELLED_GRANULAR_DUPLICATES,
      commitStatuses: [
        {
          context: 'CI Gate',
          state: 'failure',
          created_at: '2026-01-01T00:03:00Z',
        },
      ],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.merges.length,
      0,
      'a failing CI Gate must block the merge',
    );
    assert.ok(
      calls.comments.some((c) => c.body?.includes('CI Gate')),
      'blocker comment should name the failing CI Gate check',
    );
  });

  it('does not block on the OLD granular cancelled duplicates once CI Gate is the only required check', async () => {
    const { github } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      unresolvedThreads: [],
      branchRules: CI_GATE_ONLY_RULES,
      checkRuns: CANCELLED_GRANULAR_DUPLICATES,
      commitStatuses: [
        {
          context: 'CI Gate',
          state: 'success',
          created_at: '2026-01-01T00:03:00Z',
        },
      ],
    });

    // Capture the blocker reason (if any) by spying on console.log.
    const captured = [];
    const originalLog = console.log;
    console.log = (...args) => {
      captured.push(args.map((a) => String(a)).join(' '));
    };
    try {
      await processor({
        github,
        context,
        isDryRun: true, // dry-run: validate only, never call the merge API
        forceCheck: false,
        isRetry: false,
      });
    } finally {
      console.log = originalLog;
    }

    const all = captured.join('\n');
    assert.match(all, /ready for merge/i, 'PR should validate as merge-ready');
    assert.ok(
      !/🚀 CI Pipeline \/ (lint|test).*cancelled/.test(all),
      'cancelled granular duplicates must not appear as failing checks',
    );
  });
});

// ── bot-review self-heal (LS-8289) ───────────────────────────────────────────

describe('merge-queue-processor — bot-review self-heal (LS-8289)', () => {
  // Ruleset requiring bot-review alongside the CI check, mirroring production.
  const BOT_REVIEW_RULES = [
    {
      type: 'required_status_checks',
      parameters: {
        required_status_checks: [
          { context: 'bot-review' },
          { context: 'CI Pipeline' },
        ],
      },
    },
  ];

  const APPROVED_BOT_REVIEW = [
    { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
  ];

  it('applies bot:ready-for-review when bot-review never registered on the head SHA', async () => {
    const { github, calls } = makeGithub({
      reviews: APPROVED_BOT_REVIEW,
      branchRules: BOT_REVIEW_RULES,
      // CI Pipeline registered and green; bot-review never registered.
      checkRuns: DEFAULT_CHECK_RUNS,
      commitStatuses: [],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.merges.length, 0, 'must not merge');
    assert.strictEqual(calls.labels.length, 1, 'should apply one label');
    assert.deepStrictEqual(calls.labels[0].labels, ['bot:ready-for-review']);
  });

  it('cycles (removes then re-adds) the label when bot:ready-for-review is already present (LS-9209)', async () => {
    // Pre-LS-9209 this state no-op'd with "needs manual attention", leaving
    // the PR stalled indefinitely — a bare re-add fires no labeled event, but
    // remove + re-add does.
    const { github, calls } = makeGithub({
      reviews: APPROVED_BOT_REVIEW,
      branchRules: BOT_REVIEW_RULES,
      checkRuns: DEFAULT_CHECK_RUNS,
      commitStatuses: [],
      pr: makePR({
        labels: [
          { name: 'merge-when-ready' },
          { name: 'bot:ready-for-review' },
        ],
      }),
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.labelsRemoved.length,
      1,
      'should remove the stale label first',
    );
    assert.strictEqual(calls.labelsRemoved[0].name, 'bot:ready-for-review');
    assert.strictEqual(calls.labels.length, 1, 'should re-add the label');
    assert.deepStrictEqual(calls.labels[0].labels, ['bot:ready-for-review']);
    assert.ok(
      calls.statuses.some(
        (s) =>
          s.context === 'bot-review' &&
          s.state === 'pending' &&
          s.description.includes('self-heal re-trigger #1'),
      ),
      'should stamp the self-heal attempt marker on the head SHA',
    );
  });

  it('LS-9773: stamps the self-heal pending marker via the injected CI app client when ciAppToken is supplied', async () => {
    const { github, calls } = makeGithub({
      reviews: APPROVED_BOT_REVIEW,
      branchRules: BOT_REVIEW_RULES,
      checkRuns: DEFAULT_CHECK_RUNS,
      commitStatuses: [],
      pr: makePR({
        labels: [
          { name: 'merge-when-ready' },
          { name: 'bot:ready-for-review' },
        ],
      }),
    });

    const ciStatusCalls = [];
    const fakeCiOctokit = {
      rest: {
        repos: {
          createCommitStatus: async (args) => {
            ciStatusCalls.push(args);
            return { data: {} };
          },
        },
      },
    };
    let factoryCalledWithToken;
    const octokitFactory = (token) => {
      factoryCalledWithToken = token;
      return fakeCiOctokit;
    };

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
      ciAppToken: 'fake-ci-app-token',
      octokitFactory,
    });

    assert.strictEqual(
      factoryCalledWithToken,
      'fake-ci-app-token',
      'octokitFactory should be minted with the supplied ciAppToken',
    );
    assert.ok(
      ciStatusCalls.some(
        (s) =>
          s.context === 'bot-review' &&
          s.state === 'pending' &&
          s.description.includes('self-heal re-trigger #1'),
      ),
      'the self-heal pending marker should post through the injected CI app client',
    );
    assert.strictEqual(
      calls.statuses.length,
      0,
      'the Merge Queue app client (github mock) should NOT receive the status write',
    );
  });

  for (const [label, octokitFactory] of [
    ['no octokitFactory is supplied', undefined],
    [
      'octokitFactory throws',
      () => {
        throw new Error("Cannot find module '@actions/github'");
      },
    ],
  ]) {
    it(`LS-10559: falls back to the Merge Queue app client when ciAppToken is set but ${label}`, async () => {
      const { github, calls } = makeGithub({
        reviews: APPROVED_BOT_REVIEW,
        branchRules: BOT_REVIEW_RULES,
        checkRuns: DEFAULT_CHECK_RUNS,
        commitStatuses: [],
        pr: makePR({
          labels: [
            { name: 'merge-when-ready' },
            { name: 'bot:ready-for-review' },
          ],
        }),
      });

      await processor({
        github,
        context,
        isDryRun: false,
        forceCheck: false,
        isRetry: false,
        ciAppToken: 'fake-ci-app-token',
        octokitFactory,
      });

      assert.ok(
        calls.statuses.some(
          (s) =>
            s.context === 'bot-review' &&
            s.state === 'pending' &&
            s.description.includes('self-heal re-trigger #1'),
        ),
        'the status write should fall back to the Merge Queue app client',
      );
    });
  }

  it('re-triggers the reviewer when CHANGES_REQUESTED is stale (no bot-review status on head SHA)', async () => {
    const { github, calls } = makeGithub({
      reviews: [],
      reviewDecision: 'CHANGES_REQUESTED',
      branchRules: BOT_REVIEW_RULES,
      checkRuns: DEFAULT_CHECK_RUNS,
      commitStatuses: [],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.merges.length, 0, 'must not merge');
    assert.strictEqual(calls.labels.length, 1, 'should apply one label');
    assert.deepStrictEqual(calls.labels[0].labels, ['bot:ready-for-review']);
  });

  it('does not re-trigger when the reviewer adjudicated the current head SHA', async () => {
    const { github, calls } = makeGithub({
      reviews: [],
      reviewDecision: 'CHANGES_REQUESTED',
      branchRules: BOT_REVIEW_RULES,
      checkRuns: DEFAULT_CHECK_RUNS,
      commitStatuses: [
        {
          context: 'bot-review',
          state: 'failure',
          created_at: new Date().toISOString(),
        },
      ],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.labels.length,
      0,
      'a bot-review verdict on the current SHA means agent action is needed, not a re-review',
    );
  });

  it('treats a bot-review pending older than 60 minutes as a dead reviewer run and re-triggers', async () => {
    const { github, calls } = makeGithub({
      reviews: APPROVED_BOT_REVIEW,
      branchRules: BOT_REVIEW_RULES,
      checkRuns: DEFAULT_CHECK_RUNS,
      commitStatuses: [
        {
          context: 'bot-review',
          state: 'pending',
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        },
      ],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.labels.length, 1, 'should apply one label');
  });

  it('leaves a fresh bot-review pending alone (reviewer may still be running)', async () => {
    const { github, calls } = makeGithub({
      reviews: APPROVED_BOT_REVIEW,
      branchRules: BOT_REVIEW_RULES,
      checkRuns: DEFAULT_CHECK_RUNS,
      commitStatuses: [
        {
          context: 'bot-review',
          state: 'pending',
          created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        },
      ],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.labels.length, 0, 'must not add labels');
  });

  it('dry-run mode logs the remediation without applying the label', async () => {
    const { github, calls } = makeGithub({
      reviews: APPROVED_BOT_REVIEW,
      branchRules: BOT_REVIEW_RULES,
      checkRuns: DEFAULT_CHECK_RUNS,
      commitStatuses: [],
    });

    await processor({
      github,
      context,
      isDryRun: true,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.labels.length, 0, 'dry run must not add labels');
  });

  it('workflow_run-triggered runs remediate but do not self-dispatch a retry', async () => {
    const { github, calls } = makeGithub({
      reviews: APPROVED_BOT_REVIEW,
      branchRules: BOT_REVIEW_RULES,
      checkRuns: DEFAULT_CHECK_RUNS,
      commitStatuses: [],
    });

    await processor({
      github,
      context, // default eventName: workflow_run
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.dispatches.length,
      0,
      'workflow_run triggers must not chain workflow_dispatch retries',
    );
    assert.strictEqual(
      calls.labels.length,
      1,
      'remediation runs on every trigger type',
    );
  });

  it('label/dispatch-triggered runs still self-dispatch a retry when checks are pending', async () => {
    const { github, calls } = makeGithub({
      reviews: APPROVED_BOT_REVIEW,
      branchRules: BOT_REVIEW_RULES,
      checkRuns: DEFAULT_CHECK_RUNS,
      commitStatuses: [],
      pr: makePR({
        labels: [
          { name: 'merge-when-ready' },
          { name: 'bot:ready-for-review' },
        ],
      }),
    });

    await processor({
      github,
      context: { ...context, eventName: 'pull_request' },
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.dispatches.length,
      1,
      'event-triggered runs keep the single self-retry',
    );
  });
});

// ── review-stall sweep + escalation (LS-9209) ────────────────────────────────

describe('merge-queue-processor — review-stall sweep (LS-9209)', () => {
  const STALE_PENDING_AT = new Date(
    Date.now() - 2 * 60 * 60 * 1000,
  ).toISOString();

  // A non-queued PR (no merge-when-ready) carrying the review trigger label.
  const sweepPR = (overrides = {}) => ({
    number: 42,
    draft: false,
    labels: [{ name: 'bot:ready-for-review' }],
    head: { sha: HEAD_SHA },
    ...overrides,
  });

  it('cycles the label on a non-queued PR whose head SHA has no bot-review status', async () => {
    const { github, calls } = makeGithub({
      mergeReadyItems: [], // queue empty — the common stall scenario
      sweepPRs: [sweepPR()],
      commitStatuses: [],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.labelsRemoved.length, 1, 'label removed first');
    assert.strictEqual(calls.labels.length, 1, 'label re-added');
    assert.deepStrictEqual(calls.labels[0].labels, ['bot:ready-for-review']);
    assert.strictEqual(calls.labels[0].issue_number, 42);
    assert.ok(
      calls.statuses.some(
        (s) => s.state === 'pending' && s.description.includes('#1'),
      ),
      'attempt marker stamped',
    );
  });

  it('heals a stale-pending footprint (dead W1 run after the LS-9209 early footprint posted)', async () => {
    const { github, calls } = makeGithub({
      mergeReadyItems: [],
      sweepPRs: [sweepPR()],
      commitStatuses: [
        {
          context: 'bot-review',
          state: 'pending',
          description: 'Review cycle starting — awaiting Reviewer (W1)',
          created_at: STALE_PENDING_AT,
        },
      ],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.labels.length, 1, 'stale pending → re-trigger');
  });

  it('leaves fresh pendings, terminal statuses, drafts, and arbitration-owned PRs alone', async () => {
    const { github, calls } = makeGithub({
      mergeReadyItems: [],
      sweepPRs: [
        sweepPR({ number: 50 }),
        sweepPR({ number: 51, draft: true }),
        sweepPR({
          number: 52,
          labels: [
            { name: 'bot:ready-for-review' },
            { name: 'needs-human-arbitration' },
          ],
        }),
        { number: 53, draft: false, labels: [], head: { sha: HEAD_SHA } },
      ],
      // Fresh pending covers PR 50 (shared SHA fixture).
      commitStatuses: [
        {
          context: 'bot-review',
          state: 'pending',
          created_at: new Date().toISOString(),
        },
      ],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.labels.length, 0, 'nothing to heal');
    assert.strictEqual(calls.labelsRemoved.length, 0);
  });

  it('escalates to bot-review failure + needs-human-arbitration after the per-SHA attempt cap', async () => {
    const { github, calls } = makeGithub({
      mergeReadyItems: [],
      sweepPRs: [sweepPR()],
      // Two prior self-heal attempts already stamped on this SHA, the latest
      // itself stale — the re-triggered W1 runs died too.
      commitStatuses: [
        {
          context: 'bot-review',
          state: 'pending',
          description:
            'self-heal re-trigger #1: re-firing Reviewer (W1) (LS-9209)',
          created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        },
        {
          context: 'bot-review',
          state: 'pending',
          description:
            'self-heal re-trigger #2: re-firing Reviewer (W1) (LS-9209)',
          created_at: STALE_PENDING_AT,
        },
      ],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.ok(
      calls.statuses.some(
        (s) => s.state === 'failure' && s.context === 'bot-review',
      ),
      'terminal failure posted instead of a third re-trigger',
    );
    assert.deepStrictEqual(
      calls.labels.map((l) => l.labels).flat(),
      ['needs-human-arbitration'],
      'arbitration label applied, trigger label NOT cycled again',
    );
    assert.strictEqual(calls.labelsRemoved.length, 0);
  });

  it('LS-9773: posts the terminal bot-review failure via the injected CI app client when ciAppToken is supplied', async () => {
    const { github, calls } = makeGithub({
      mergeReadyItems: [],
      sweepPRs: [sweepPR()],
      commitStatuses: [
        {
          context: 'bot-review',
          state: 'pending',
          description:
            'self-heal re-trigger #1: re-firing Reviewer (W1) (LS-9209)',
          created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        },
        {
          context: 'bot-review',
          state: 'pending',
          description:
            'self-heal re-trigger #2: re-firing Reviewer (W1) (LS-9209)',
          created_at: STALE_PENDING_AT,
        },
      ],
    });

    const ciStatusCalls = [];
    const octokitFactory = () => ({
      rest: {
        repos: {
          createCommitStatus: async (args) => {
            ciStatusCalls.push(args);
            return { data: {} };
          },
        },
      },
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
      ciAppToken: 'fake-ci-app-token',
      octokitFactory,
    });

    assert.ok(
      ciStatusCalls.some(
        (s) => s.state === 'failure' && s.context === 'bot-review',
      ),
      'terminal failure should post through the injected CI app client',
    );
    assert.strictEqual(
      calls.statuses.length,
      0,
      'the Merge Queue app client (github mock) should NOT receive the status write',
    );
    assert.deepStrictEqual(
      calls.labels.map((l) => l.labels).flat(),
      ['needs-human-arbitration'],
      'arbitration label applied regardless of which client posted the status',
    );
  });

  it('does not double-process a PR already handled by the queued-path loop', async () => {
    const queuedPR = makePR({
      labels: [{ name: 'merge-when-ready' }, { name: 'bot:ready-for-review' }],
    });
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      pr: queuedPR,
      branchRules: [
        {
          type: 'required_status_checks',
          parameters: {
            required_status_checks: [
              { context: 'bot-review' },
              { context: 'CI Pipeline' },
            ],
          },
        },
      ],
      commitStatuses: [],
      // The same PR also appears in the open-PR listing the sweep reads.
      sweepPRs: [queuedPR],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.labels.length,
      1,
      'exactly one remediation — the sweep must skip the queued PR',
    );
  });

  it('dry-run sweep logs but performs no mutations', async () => {
    const { github, calls } = makeGithub({
      mergeReadyItems: [],
      sweepPRs: [sweepPR()],
      commitStatuses: [],
    });

    await processor({
      github,
      context,
      isDryRun: true,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.labels.length, 0);
    assert.strictEqual(calls.labelsRemoved.length, 0);
    assert.strictEqual(calls.statuses.length, 0);
  });
});

// ── bot-review self-heal timing guards (LS-10965) ───────────────────────────

describe('merge-queue-processor — bot-review self-heal timing guards (LS-10965)', () => {
  const minutesAgo = (m) => new Date(Date.now() - m * 60 * 1000).toISOString();

  const sweepPR = (overrides = {}) => ({
    number: 42,
    draft: false,
    labels: [{ name: 'bot:ready-for-review' }],
    head: { sha: HEAD_SHA },
    ...overrides,
  });

  const pendingAt = (createdAt) => [
    {
      context: 'bot-review',
      state: 'pending',
      description: 'Review cycle starting — awaiting Reviewer (W1)',
      created_at: createdAt,
    },
  ];

  async function runSweep(opts) {
    const { github, calls } = makeGithub({
      mergeReadyItems: [],
      sweepPRs: [sweepPR()],
      ...opts,
    });
    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });
    return { github, calls };
  }

  it('leaves a 50-minute-old pending alone (inside the 30m job timeout + runner queue window)', async () => {
    const { calls } = await runSweep({
      commitStatuses: pendingAt(minutesAgo(50)),
    });
    assert.strictEqual(calls.labels.length, 0, 'not stale yet — no cycle');
    assert.strictEqual(calls.labelsRemoved.length, 0);
    assert.strictEqual(calls.statuses.length, 0, 'no marker stamped');
  });

  it('does not cycle a stale pending while a Reviewer (W1) run for the head SHA is still in progress', async () => {
    const { calls } = await runSweep({
      commitStatuses: pendingAt(minutesAgo(90)),
      reviewWorkflowRuns: [
        {
          id: 901,
          head_sha: HEAD_SHA,
          status: 'in_progress',
          created_at: minutesAgo(70),
        },
      ],
    });
    assert.strictEqual(
      calls.labelsRemoved.length,
      0,
      'cycling would cancel the live review via cancel-in-progress',
    );
    assert.strictEqual(calls.labels.length, 0);
    assert.strictEqual(calls.statuses.length, 0, 'no attempt burned');
  });

  it('does not heal a missing status while a Reviewer (W1) run is still queued', async () => {
    const { calls } = await runSweep({
      commitStatuses: [],
      reviewWorkflowRuns: [
        {
          id: 902,
          head_sha: HEAD_SHA,
          status: 'queued',
          created_at: minutesAgo(2),
        },
      ],
    });
    assert.strictEqual(calls.labels.length, 0);
    assert.strictEqual(calls.labelsRemoved.length, 0);
  });

  it('does not escalate to arbitration while a Reviewer (W1) run is still live', async () => {
    const { calls } = await runSweep({
      commitStatuses: [
        {
          context: 'bot-review',
          state: 'pending',
          description:
            'self-heal re-trigger #1: re-firing Reviewer (W1) (LS-9209)',
          created_at: minutesAgo(240),
        },
        {
          context: 'bot-review',
          state: 'pending',
          description:
            'self-heal re-trigger #2: re-firing Reviewer (W1) (LS-9209)',
          created_at: minutesAgo(120),
        },
      ],
      reviewWorkflowRuns: [
        {
          id: 903,
          head_sha: HEAD_SHA,
          status: 'in_progress',
          created_at: minutesAgo(20),
        },
      ],
    });
    assert.strictEqual(calls.statuses.length, 0, 'no terminal failure');
    assert.strictEqual(calls.labels.length, 0, 'no arbitration label');
  });

  it('ignores completed runs, runs for other SHAs, and wedged runs older than the live ceiling', async () => {
    const { calls } = await runSweep({
      commitStatuses: pendingAt(minutesAgo(90)),
      reviewWorkflowRuns: [
        {
          id: 904,
          head_sha: HEAD_SHA,
          status: 'completed',
          created_at: minutesAgo(80),
        },
        {
          id: 905,
          head_sha: 'other0000other0000other0000other0000othe',
          status: 'in_progress',
          created_at: minutesAgo(10),
        },
        {
          id: 906,
          head_sha: HEAD_SHA,
          status: 'queued',
          created_at: minutesAgo(4 * 60),
        },
      ],
    });
    assert.strictEqual(calls.labelsRemoved.length, 1, 'label cycled');
    assert.strictEqual(calls.labels.length, 1);
  });

  it('stands down when the Reviewer (W1) runs cannot be listed', async () => {
    const { calls } = await runSweep({
      commitStatuses: pendingAt(minutesAgo(90)),
      reviewWorkflowRuns: new Error('Server Error'),
    });
    assert.strictEqual(calls.labels.length, 0);
    assert.strictEqual(calls.labelsRemoved.length, 0);
    assert.strictEqual(calls.statuses.length, 0);
  });

  it('stamps the attempt marker before cycling the label', async () => {
    const order = [];
    const { github, calls } = makeGithub({
      mergeReadyItems: [],
      sweepPRs: [sweepPR()],
      commitStatuses: pendingAt(minutesAgo(90)),
    });
    const { createCommitStatus } = github.rest.repos;
    const { removeLabel, addLabels } = github.rest.issues;
    github.rest.repos.createCommitStatus = async (args) => {
      order.push('status');
      return createCommitStatus(args);
    };
    github.rest.issues.removeLabel = async (args) => {
      order.push('remove');
      return removeLabel(args);
    };
    github.rest.issues.addLabels = async (args) => {
      order.push('add');
      return addLabels(args);
    };
    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });
    assert.deepStrictEqual(order, ['status', 'remove', 'add']);
    assert.ok(
      calls.statuses[0].description.includes('self-heal re-trigger #1'),
    );
  });

  it('skips the re-trigger when the attempt marker cannot be written (no uncounted cycle)', async () => {
    const { github, calls } = makeGithub({
      mergeReadyItems: [],
      sweepPRs: [sweepPR()],
      commitStatuses: pendingAt(minutesAgo(90)),
    });
    github.rest.repos.createCommitStatus = async () => {
      throw Object.assign(new Error('Resource not accessible by integration'), {
        status: 403,
      });
    };
    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });
    assert.strictEqual(calls.labelsRemoved.length, 0, 'label not removed');
    assert.strictEqual(calls.labels.length, 0, 'label not re-added');
  });
});

// ── codeowner-blocked merge handling (LS-8297) ───────────────────────────────

describe('merge-queue-processor — codeowner-blocked 405 is a clean blocker (LS-8297)', () => {
  const CODEOWNER_405 = () => {
    throw Object.assign(new Error('Repository rule violations found'), {
      status: 405,
      response: {
        data: {
          message:
            'Repository rule violations found\n\n' +
            'Waiting on code owner review from bkrupa.',
          documentation_url:
            'https://docs.github.com/rest/pulls/pulls#merge-a-pull-request',
        },
      },
    });
  };

  it('reports a CODEOWNER blocker comment instead of failing the run', async () => {
    delete process.env.ESCALATION_WEBHOOK_URL;
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
    });
    github.rest.pulls.merge = async () => CODEOWNER_405();

    // Must not throw — a codeowner block is a legitimate waiting state.
    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.merges.length, 0, 'merge API rejected');
    assert.ok(
      calls.comments.some((c) => c.body?.includes('CODEOWNER approval')),
      'should post the CODEOWNER blocker comment',
    );
    assert.ok(
      !calls.comments.some((c) => c.body?.includes('Processing Error')),
      'must not post a processing-error comment',
    );
  });

  it('still propagates unrecognized 405 causes as processing errors', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
    });
    github.rest.pulls.merge = async () => {
      throw Object.assign(new Error('Pull Request is not mergeable'), {
        status: 405,
        response: { data: { message: 'Pull Request is not mergeable' } },
      });
    };

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.ok(
      calls.comments.some((c) => c.body?.includes('Processing Error')),
      'unknown 405 causes still surface as processing errors',
    );
  });
});

// ── LS-9053 ──────────────────────────────────────────────────────────────────

describe('merge-queue-processor — cancelled orchestrator run self-heal (LS-9053)', () => {
  const CI_GATE_ONLY_RULES = [
    {
      type: 'required_status_checks',
      parameters: {
        required_status_checks: [{ context: 'CI Gate' }],
      },
    },
  ];

  // "CI Gate (not yet registered)": required context with no status posted and
  // no check runs beyond a lightweight auto-registering one.
  const baseArgs = {
    reviews: [
      { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
    ],
    unresolvedThreads: [],
    branchRules: CI_GATE_ONLY_RULES,
    checkRuns: [],
    commitStatuses: [],
  };

  const cancelledPullRequestRun = (overrides = {}) => ({
    id: 111,
    event: 'pull_request',
    status: 'completed',
    conclusion: 'cancelled',
    run_attempt: 1,
    created_at: '2026-01-01T00:05:00Z',
    ...overrides,
  });

  it('re-runs the latest cancelled pull_request orchestrator run when CI Gate never registered', async () => {
    const { github, calls } = makeGithub({
      ...baseArgs,
      workflowRuns: [
        cancelledPullRequestRun({
          id: 110,
          created_at: '2026-01-01T00:01:00Z',
        }),
        cancelledPullRequestRun({ id: 111 }),
        // review-event runs are never rerun candidates
        {
          id: 112,
          event: 'pull_request_review',
          status: 'completed',
          conclusion: 'cancelled',
          run_attempt: 1,
          created_at: '2026-01-01T00:06:00Z',
        },
      ],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.merges.length,
      0,
      'must not merge without CI Gate',
    );
    assert.deepStrictEqual(
      calls.reruns.map((r) => r.run_id),
      [111],
      'should re-run only the newest cancelled pull_request run',
    );
  });

  it('LS-9774: dispatches a fresh orchestrator run when the cancelled run is too old to rerun', async () => {
    const { github, calls } = makeGithub({
      ...baseArgs,
      workflowRuns: [cancelledPullRequestRun({ id: 111 })],
      reRunWorkflowError: new Error(
        'Unable to retry this workflow run because it was created over a month ago',
      ),
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.deepStrictEqual(
      calls.reruns.map((r) => r.run_id),
      [111],
      'should still attempt the rerun first',
    );
    const dispatch = calls.dispatches.find(
      (d) => d.workflow_id === 'ci-orchestrator.yml',
    );
    assert.ok(
      dispatch,
      'should fall back to dispatching a fresh orchestrator run',
    );
    assert.strictEqual(dispatch.ref, 'main');
    assert.strictEqual(dispatch.inputs.pr_number, String(makePR().number));
  });

  it('LS-9774: does not fall back to dispatch for a non-"too old" rerun error', async () => {
    const { github, calls } = makeGithub({
      ...baseArgs,
      workflowRuns: [cancelledPullRequestRun({ id: 111 })],
      reRunWorkflowError: new Error('some other transient failure'),
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.dispatches.filter((d) => d.workflow_id === 'ci-orchestrator.yml')
        .length,
      0,
      'should not dispatch a fresh run for an unrelated rerun failure',
    );
  });

  it('does not re-run while an orchestrator run for the SHA is still active', async () => {
    const { github, calls } = makeGithub({
      ...baseArgs,
      workflowRuns: [
        cancelledPullRequestRun(),
        {
          id: 113,
          event: 'pull_request_review',
          status: 'in_progress',
          conclusion: null,
          run_attempt: 1,
          created_at: '2026-01-01T00:06:00Z',
        },
      ],
      // Has posted a job — genuinely in flight, not the LS-9490 dead-run case.
      jobCountsByRunId: { 113: 1 },
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.reruns.length, 0, 'active run means CI is coming');
  });

  it('gives up after MAX_ORCHESTRATOR_RUN_ATTEMPTS', async () => {
    const { github, calls } = makeGithub({
      ...baseArgs,
      workflowRuns: [cancelledPullRequestRun({ run_attempt: 3 })],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.reruns.length,
      0,
      'a thrice-cancelled run must not loop forever',
    );
  });

  it('does not fire when only bot-review is unregistered', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      unresolvedThreads: [],
      branchRules: [
        {
          type: 'required_status_checks',
          parameters: {
            required_status_checks: [{ context: 'bot-review' }],
          },
        },
      ],
      checkRuns: [],
      commitStatuses: [],
      workflowRuns: [cancelledPullRequestRun()],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.reruns.length,
      0,
      'bot-review gaps are healed by the label remediation, not a CI rerun',
    );
  });

  it('dry run logs but does not re-run', async () => {
    const { github, calls } = makeGithub({
      ...baseArgs,
      workflowRuns: [cancelledPullRequestRun()],
    });

    await processor({
      github,
      context,
      isDryRun: true,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.reruns.length, 0, 'dry run must not mutate');
  });
});

// ── LS-9490 ──────────────────────────────────────────────────────────────────

describe('merge-queue-processor — dead zero-job orchestrator run self-heal (LS-9490)', () => {
  const CI_GATE_ONLY_RULES = [
    {
      type: 'required_status_checks',
      parameters: {
        required_status_checks: [{ context: 'CI Gate' }],
      },
    },
  ];

  const baseArgs = {
    reviews: [
      { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
    ],
    unresolvedThreads: [],
    branchRules: CI_GATE_ONLY_RULES,
    checkRuns: [],
    commitStatuses: [],
  };

  const cancelledPullRequestRun = (overrides = {}) => ({
    id: 111,
    event: 'pull_request',
    status: 'completed',
    conclusion: 'cancelled',
    run_attempt: 1,
    created_at: '2026-01-01T00:05:00Z',
    ...overrides,
  });

  // A pull_request_review-triggered run that never produced a job and was
  // created far enough in the past to clear STUCK_RUN_MS (10m) relative to
  // the real clock the test runs under.
  const deadReviewRun = (overrides = {}) => ({
    id: 222,
    event: 'pull_request_review',
    status: 'pending',
    conclusion: null,
    run_attempt: 1,
    created_at: '2026-01-01T00:06:00Z',
    ...overrides,
  });

  it('cancels a dead zero-job run and re-runs the cancelled pull_request run', async () => {
    const { github, calls } = makeGithub({
      ...baseArgs,
      workflowRuns: [cancelledPullRequestRun(), deadReviewRun()],
      jobCountsByRunId: { 222: 0 },
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.deepStrictEqual(
      calls.cancels.map((c) => c.run_id),
      [222],
      'should cancel the dead zero-job run',
    );
    assert.deepStrictEqual(
      calls.reruns.map((r) => r.run_id),
      [111],
      'should re-run the cancelled pull_request run once the dead run is cleared',
    );
  });

  it('does not cancel or re-run when the non-completed run has posted jobs', async () => {
    const { github, calls } = makeGithub({
      ...baseArgs,
      workflowRuns: [cancelledPullRequestRun(), deadReviewRun()],
      jobCountsByRunId: { 222: 1 },
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.cancels.length,
      0,
      'a run with jobs is genuinely in flight, not dead',
    );
    assert.strictEqual(calls.reruns.length, 0);
  });

  it('does not treat a young non-completed run as dead even with zero jobs', async () => {
    const { github, calls } = makeGithub({
      ...baseArgs,
      workflowRuns: [
        cancelledPullRequestRun(),
        deadReviewRun({ id: 223, created_at: new Date().toISOString() }),
      ],
      jobCountsByRunId: { 223: 0 },
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.cancels.length,
      0,
      'a freshly-created run has not had time to post a job yet',
    );
    assert.strictEqual(calls.reruns.length, 0);
  });

  it('dry run logs cancellation but does not mutate', async () => {
    const { github, calls } = makeGithub({
      ...baseArgs,
      workflowRuns: [cancelledPullRequestRun(), deadReviewRun()],
      jobCountsByRunId: { 222: 0 },
    });

    await processor({
      github,
      context,
      isDryRun: true,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.cancels.length, 0, 'dry run must not cancel');
    assert.strictEqual(calls.reruns.length, 0, 'dry run must not re-run');
  });
});

// ── LS-9662 ──────────────────────────────────────────────────────────────────

describe('merge-queue-processor — surface-intersection staleness guard (LS-9662)', () => {
  const GUARD_WORKSPACE = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'fixtures',
    'ls-9662-surface-map',
  );

  const VALIDATED_BASE = 'validbase111validbase222validbase333vali';
  const GATE_RUN_ID = 555;
  const CI_GATE_SUCCESS = {
    context: 'CI Gate',
    state: 'success',
    created_at: '2026-01-01T00:03:00Z',
    target_url: `https://github.com/test-owner/test-repo/actions/runs/${GATE_RUN_ID}`,
  };
  const GATE_RUN_DETAILS = {
    [GATE_RUN_ID]: {
      pull_requests: [
        {
          number: 1,
          base: { ref: 'main', sha: VALIDATED_BASE },
          head: { ref: 'feature/test', sha: HEAD_SHA },
        },
      ],
    },
  };
  const GAP_BASEHEAD = `${VALIDATED_BASE}...main`;

  const gapCommit = (sha) => ({ sha });
  const gapFile = (filename) => ({ filename });

  // Fully-green PR whose head carries a successful CI Gate pointing at the
  // validated run — the state in which the guard is the last stop before merge.
  function makeGuardGithub(overrides = {}) {
    return makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      unresolvedThreads: [],
      commitStatuses: [CI_GATE_SUCCESS],
      workflowRunDetails: GATE_RUN_DETAILS,
      ...overrides,
    });
  }

  function withGuardWorkspace(fn) {
    return async () => {
      const original = process.env.GITHUB_WORKSPACE;
      process.env.GITHUB_WORKSPACE = GUARD_WORKSPACE;
      try {
        await fn();
      } finally {
        if (original === undefined) delete process.env.GITHUB_WORKSPACE;
        else process.env.GITHUB_WORKSPACE = original;
      }
    };
  }

  async function runCapturingLogs(github, { isDryRun = false } = {}) {
    const captured = [];
    const originalLog = console.log;
    console.log = (...args) => {
      captured.push(args.map((a) => String(a)).join(' '));
    };
    try {
      await processor({
        github,
        context,
        isDryRun,
        forceCheck: false,
        isRetry: false,
      });
    } finally {
      console.log = originalLog;
    }
    return captured.join('\n');
  }

  it(
    'merges directly when the validated base is current (no gap, zero added latency)',
    withGuardWorkspace(async () => {
      const { github, calls } = makeGuardGithub({
        compareResults: {
          [GAP_BASEHEAD]: { total_commits: 0, commits: [], files: [] },
        },
      });

      const logs = await runCapturingLogs(github);

      assert.strictEqual(calls.merges.length, 1, 'should merge directly');
      assert.strictEqual(calls.updateBranch.length, 0);
      assert.deepStrictEqual(
        validationCompares(calls),
        [GAP_BASEHEAD],
        'gap comparison must use the CI-Gate-run base SHA (exact, not merge-base)',
      );
      assert.match(
        logs,
        /Staleness guard \[PR #1\]: verdict=no-gap/,
        'verdict must be logged for overlap-rate measurement (AC6)',
      );
      assert.ok(
        calls.comments.some((c) =>
          c.body?.includes('Staleness guard: `no-gap`'),
        ),
        'merge success comment should record the guard verdict (AC6)',
      );
    }),
  );

  it(
    'merges a behind-base PR directly when the gap and the PR share no spec surface',
    withGuardWorkspace(async () => {
      const { github, calls } = makeGuardGithub({
        pr: makePR({ mergeable_state: 'behind' }),
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 2,
            commits: [gapCommit('gap0001aaa'), gapCommit('gap0002bbb')],
            files: [gapFile('apps/web/src/pages/beta/BetaPage.tsx')],
          },
        },
        prListFiles: [gapFile('apps/web/src/pages/alpha/AlphaPage.tsx')],
      });

      const logs = await runCapturingLogs(github);

      assert.strictEqual(
        calls.merges.length,
        1,
        'disjoint spec sets must merge exactly as today (AC2)',
      );
      assert.strictEqual(calls.updateBranch.length, 0);
      assert.match(logs, /verdict=disjoint/);
    }),
  );

  it(
    'blocks the merge and triggers update-branch when gap and PR surfaces overlap',
    withGuardWorkspace(async () => {
      const { github, calls } = makeGuardGithub({
        pr: makePR({ mergeable_state: 'behind' }),
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 1,
            commits: [gapCommit('gap0001aaa2222bbb3333ccc4444ddd5555eee66')],
            files: [gapFile('apps/web/src/pages/alpha/AlphaService.ts')],
          },
        },
        prListFiles: [gapFile('apps/web/src/pages/alpha/AlphaPage.tsx')],
      });

      const logs = await runCapturingLogs(github);

      assert.strictEqual(
        calls.merges.length,
        0,
        'overlap must not merge (AC3)',
      );
      assert.strictEqual(
        calls.updateBranch.length,
        1,
        'revalidation must be triggered via update-branch',
      );
      assert.strictEqual(
        calls.updateBranch[0].expected_head_sha,
        HEAD_SHA,
        'update-branch must pin the validated head SHA',
      );
      assert.match(logs, /verdict=overlap/);
      const blocker = calls.comments.find((c) =>
        c.body?.includes('Cannot Merge'),
      );
      assert.ok(blocker, 'should post an explanatory PR comment');
      assert.ok(
        blocker.body.includes('apps/web-e2e/src/tests/alpha.spec.ts'),
        'comment must name the overlapping spec(s)',
      );
      assert.ok(
        blocker.body.includes('`gap0001`'),
        'comment must name the gap commit(s)',
      );
    }),
  );

  it(
    'treats a runAllWhenChanged gap file as overlapping any PR with affected specs',
    withGuardWorkspace(async () => {
      const { github, calls } = makeGuardGithub({
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 1,
            commits: [gapCommit('gap0003ccc')],
            files: [gapFile('lambdas/db/schema.graphql')],
          },
        },
        prListFiles: [gapFile('apps/web/src/pages/alpha/AlphaPage.tsx')],
      });

      await runCapturingLogs(github);

      assert.strictEqual(calls.merges.length, 0, 'must not merge');
      assert.strictEqual(calls.updateBranch.length, 1);
    }),
  );

  it(
    'falls back to the compare-API merge-base when the CI Gate carries no run URL',
    withGuardWorkspace(async () => {
      const MERGE_BASE_BASEHEAD = `main...${HEAD_SHA}`;
      const { github, calls } = makeGuardGithub({
        commitStatuses: [{ ...CI_GATE_SUCCESS, target_url: undefined }],
        compareResults: {
          [MERGE_BASE_BASEHEAD]: {
            merge_base_commit: { sha: VALIDATED_BASE },
            total_commits: 3,
            commits: [],
            files: [],
          },
          [GAP_BASEHEAD]: { total_commits: 0, commits: [], files: [] },
        },
      });

      const logs = await runCapturingLogs(github);

      assert.deepStrictEqual(
        validationCompares(calls),
        [MERGE_BASE_BASEHEAD, GAP_BASEHEAD],
        'should resolve the merge-base first, then compare it against main',
      );
      assert.strictEqual(calls.merges.length, 1, 'no-gap → merge');
      assert.match(logs, /verdict=no-gap.*merge-base/);
    }),
  );

  it(
    'fails open (merges as today) when the compare API errors',
    withGuardWorkspace(async () => {
      const { github, calls } = makeGuardGithub({
        compareResults: {
          [GAP_BASEHEAD]: Object.assign(new Error('boom'), { status: 500 }),
        },
      });

      const logs = await runCapturingLogs(github);

      assert.strictEqual(
        calls.merges.length,
        1,
        'guard errors must fall back to merging (AC4 — never wedge the queue)',
      );
      assert.strictEqual(calls.updateBranch.length, 0);
      assert.match(logs, /verdict=fail-open:error/);
    }),
  );

  it(
    'fails open (merges as today) when update-branch itself fails on an overlap',
    withGuardWorkspace(async () => {
      const { github, calls } = makeGuardGithub({
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 1,
            commits: [gapCommit('gap0004ddd')],
            files: [gapFile('apps/web/src/pages/alpha/AlphaService.ts')],
          },
        },
        prListFiles: [gapFile('apps/web/src/pages/alpha/AlphaPage.tsx')],
      });
      github.rest.pulls.updateBranch = async () => {
        throw Object.assign(new Error('update failed'), { status: 403 });
      };

      const logs = await runCapturingLogs(github);

      assert.strictEqual(
        calls.merges.length,
        1,
        'an overlap the queue cannot revalidate merges as today, loudly (AC4)',
      );
      assert.match(logs, /verdict=fail-open:update-branch-failed/);
    }),
  );

  it(
    'revalidates conservatively when the gap file list hits the compare-API cap',
    withGuardWorkspace(async () => {
      const truncatedFiles = Array.from({ length: 300 }, (_, i) =>
        gapFile(`docs/unrelated-${i}.md`),
      );
      const { github, calls } = makeGuardGithub({
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 5,
            commits: [gapCommit('gap0005eee')],
            files: truncatedFiles,
          },
        },
        prListFiles: [gapFile('apps/web/src/pages/alpha/AlphaPage.tsx')],
      });

      const logs = await runCapturingLogs(github);

      assert.strictEqual(
        calls.merges.length,
        0,
        'a truncated gap cannot be proven disjoint — revalidate, do not merge',
      );
      assert.strictEqual(calls.updateBranch.length, 1);
      assert.match(logs, /verdict=overlap:gap-files-truncated/);
    }),
  );

  it('fails open when no surface manifest exists in the workspace (unit-test default)', async () => {
    delete process.env.GITHUB_WORKSPACE;
    const { github, calls } = makeGuardGithub({
      pr: makePR({ mergeable_state: 'behind' }),
    });

    const logs = await runCapturingLogs(github);

    assert.strictEqual(
      calls.merges.length,
      1,
      'without a manifest the guard must not change LS-4183 behavior',
    );
    assert.strictEqual(
      validationCompares(calls).length,
      0,
      'no API spend when skipped',
    );
    assert.match(logs, /verdict=fail-open:manifest-unavailable/);
  });

  it(
    'dry run reports the overlap verdict without calling update-branch',
    withGuardWorkspace(async () => {
      const { github, calls } = makeGuardGithub({
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 1,
            commits: [gapCommit('gap0006fff')],
            files: [gapFile('apps/web/src/pages/alpha/AlphaService.ts')],
          },
        },
        prListFiles: [gapFile('apps/web/src/pages/alpha/AlphaPage.tsx')],
      });

      const logs = await runCapturingLogs(github, { isDryRun: true });

      assert.strictEqual(calls.merges.length, 0);
      assert.strictEqual(
        calls.updateBranch.length,
        0,
        'dry run must not mutate the branch',
      );
      assert.match(logs, /DRY RUN: Would update branch on PR #1/);
    }),
  );

  // ── LS-9753: narrow the overlap heuristic by changed-file proximity ────────

  it(
    'merges directly when gap and PR files only share a broad spec bucket in unrelated subdirectories',
    withGuardWorkspace(async () => {
      const { github, calls } = makeGuardGithub({
        pr: makePR({ mergeable_state: 'behind' }),
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 2,
            commits: [gapCommit('gap0007ggg')],
            // gamma covers two unrelated subdirectories (broad glob) — this
            // file is nowhere near the PR's own gamma file.
            files: [gapFile('apps/web/src/pages/gamma/scores/ScoresPage.tsx')],
          },
        },
        prListFiles: [
          gapFile('apps/web/src/pages/gamma/settings/SettingsPage.tsx'),
        ],
      });

      const logs = await runCapturingLogs(github);

      assert.strictEqual(
        calls.merges.length,
        1,
        'bucket-only overlap with no file-level proximity must merge (LS-9753 AC1)',
      );
      assert.strictEqual(calls.updateBranch.length, 0);
      assert.match(logs, /verdict=disjoint:no-proximate-overlap/);
      assert.match(logs, /narrowed by changed-file proximity, LS-9753/);
    }),
  );

  it(
    'still blocks when gap and PR files share a broad bucket AND are path-proximate',
    withGuardWorkspace(async () => {
      const { github, calls } = makeGuardGithub({
        pr: makePR({ mergeable_state: 'behind' }),
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 1,
            commits: [gapCommit('gap0008hhh')],
            files: [
              gapFile('apps/web/src/pages/gamma/settings/SettingsService.ts'),
            ],
          },
        },
        prListFiles: [
          gapFile('apps/web/src/pages/gamma/settings/SettingsPage.tsx'),
        ],
      });

      const logs = await runCapturingLogs(github);

      assert.strictEqual(
        calls.merges.length,
        0,
        'same-directory files sharing a bucket are a real overlap',
      );
      assert.strictEqual(calls.updateBranch.length, 1);
      assert.match(logs, /verdict=overlap(?!:narrowed)/);
    }),
  );

  it(
    'does not narrow a runAllWhenChanged overlap by proximity',
    withGuardWorkspace(async () => {
      const { github, calls } = makeGuardGithub({
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 1,
            commits: [gapCommit('gap0009iii')],
            files: [gapFile('lambdas/db/schema.graphql')],
          },
        },
        prListFiles: [
          gapFile('apps/web/src/pages/gamma/settings/SettingsPage.tsx'),
        ],
      });

      const logs = await runCapturingLogs(github);

      assert.strictEqual(calls.merges.length, 0, 'must not merge');
      assert.strictEqual(calls.updateBranch.length, 1);
      assert.doesNotMatch(logs, /narrowed by changed-file proximity/);
    }),
  );

  // ── LS-9753 / LS-10123: cap retriggers within a rolling window ──────────────

  it(
    'fails open once the retrigger cap is reached instead of retriggering again',
    withGuardWorkspace(async () => {
      // Exactly at the cap (LS-10123 lowered it to 2), so this also pins the
      // boundary: the Nth retrigger is the last one allowed.
      const recentHistory = Array.from({ length: 2 }, (_, i) =>
        new Date(Date.now() - (i + 1) * 60 * 1000).toISOString(),
      );
      const { github, calls } = makeGuardGithub({
        pr: makePR({ mergeable_state: 'behind' }),
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 1,
            commits: [gapCommit('gap0010jjj')],
            files: [gapFile('apps/web/src/pages/alpha/AlphaService.ts')],
          },
        },
        prListFiles: [gapFile('apps/web/src/pages/alpha/AlphaPage.tsx')],
        issueComments: [
          {
            id: 42,
            body:
              '<!-- MERGE-QUEUE-STATUS -->\nprior status\n' +
              `<!-- LS-9662-RETRIGGERS:${JSON.stringify(recentHistory)} -->`,
          },
        ],
      });

      const logs = await runCapturingLogs(github);

      assert.strictEqual(
        calls.merges.length,
        1,
        'cap reached → fail open and merge rather than retrigger again (LS-9753 AC2)',
      );
      assert.strictEqual(calls.updateBranch.length, 0);
      assert.match(logs, /verdict=fail-open:retrigger-cap-reached/);
    }),
  );

  it(
    'ignores retrigger history older than the rolling window',
    withGuardWorkspace(async () => {
      // Older than the LS-10123 window (4h), so a long-lived PR is never
      // permanently exempt from the guard on the strength of ancient history.
      const staleHistory = Array.from({ length: 4 }, (_, i) =>
        new Date(Date.now() - (5 * 60 + i) * 60 * 1000).toISOString(),
      );
      const { github, calls } = makeGuardGithub({
        pr: makePR({ mergeable_state: 'behind' }),
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 1,
            commits: [gapCommit('gap0011kkk')],
            files: [gapFile('apps/web/src/pages/alpha/AlphaService.ts')],
          },
        },
        prListFiles: [gapFile('apps/web/src/pages/alpha/AlphaPage.tsx')],
        issueComments: [
          {
            id: 42,
            body:
              '<!-- MERGE-QUEUE-STATUS -->\nprior status\n' +
              `<!-- LS-9662-RETRIGGERS:${JSON.stringify(staleHistory)} -->`,
          },
        ],
      });

      const logs = await runCapturingLogs(github);

      assert.strictEqual(
        calls.updateBranch.length,
        1,
        'history older than the window must not count against the cap',
      );
      assert.match(logs, /verdict=overlap/);
      const blocker = calls.comments.find((c) =>
        c.body?.includes('Cannot Merge'),
      );
      assert.match(
        blocker.body,
        /<!-- LS-9662-RETRIGGERS:\[".*"\] -->/,
        'a fresh retrigger marker with exactly one (new) timestamp must be persisted',
      );
    }),
  );

  // ── LS-10123: the counter must be durable and the cap reachable ─────────────
  //
  // Root cause: the two issues.listComments reads backing the retrigger marker
  // were the only unpaginated list calls in the processor. The merge-queue
  // status comment is rewritten in place, so it keeps its original position;
  // once a PR accumulates more than one page of comments the first-page read
  // stops finding it. The counter then reset every cycle and the cap could
  // never engage — PR #7961 was retriggered 3 times in 1h45m, the third
  // landing 53s after approval.

  // 30+ comments of unrelated traffic (review cycles, bots) ahead of the queue
  // status comment, which is what a real long-running PR looks like.
  const commentNoise = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: 1000 + i,
      body: `unrelated comment ${i}`,
    }));

  it(
    'reads the retrigger history from a status comment beyond the first page',
    withGuardWorkspace(async () => {
      const recentHistory = Array.from({ length: 2 }, (_, i) =>
        new Date(Date.now() - (i + 1) * 60 * 1000).toISOString(),
      );
      const { github, calls } = makeGuardGithub({
        pr: makePR({ mergeable_state: 'behind' }),
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 1,
            commits: [gapCommit('gap0013mmm')],
            files: [gapFile('apps/web/src/pages/alpha/AlphaService.ts')],
          },
        },
        prListFiles: [gapFile('apps/web/src/pages/alpha/AlphaPage.tsx')],
        issueComments: [
          ...commentNoise(40),
          {
            id: 42,
            body:
              '<!-- MERGE-QUEUE-STATUS -->\nprior status\n' +
              `<!-- LS-9662-RETRIGGERS:${JSON.stringify(recentHistory)} -->`,
          },
        ],
      });

      const logs = await runCapturingLogs(github);

      assert.strictEqual(
        calls.updateBranch.length,
        0,
        'history on page 2 must still count against the cap — an unpaginated ' +
          'read reports "no history" and retriggers forever (LS-10123)',
      );
      assert.strictEqual(calls.merges.length, 1);
      assert.match(logs, /verdict=fail-open:retrigger-cap-reached/);
    }),
  );

  it(
    'updates the existing status comment beyond the first page instead of duplicating it',
    withGuardWorkspace(async () => {
      const { github, calls } = makeGuardGithub({
        pr: makePR({ mergeable_state: 'behind' }),
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 1,
            commits: [gapCommit('gap0014nnn')],
            files: [gapFile('apps/web/src/pages/alpha/AlphaService.ts')],
          },
        },
        prListFiles: [gapFile('apps/web/src/pages/alpha/AlphaPage.tsx')],
        issueComments: [
          ...commentNoise(40),
          { id: 42, body: '<!-- MERGE-QUEUE-STATUS -->\nprior status' },
        ],
      });

      await runCapturingLogs(github);

      const blocker = calls.comments.find((c) =>
        c.body?.includes('Cannot Merge'),
      );
      assert.ok(blocker, 'the revalidation blocker comment must be written');
      assert.strictEqual(
        blocker.comment_id,
        42,
        'must UPDATE the existing status comment; a first-page-only lookup ' +
          'creates a duplicate queue comment every cycle (LS-10123)',
      );
    }),
  );

  it(
    'counts retriggers spanning more than an hour (the PR #7961 starvation pattern)',
    withGuardWorkspace(async () => {
      // The real incident: retriggers at 17:10, 17:35 and 18:54 — 1h45m apart
      // end to end. Under the original one-hour window each evaluation saw an
      // empty window, so the cap never engaged and the PR had no progress
      // guarantee at all.
      const spreadHistory = [95, 70].map((minutesAgo) =>
        new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
      );
      const { github, calls } = makeGuardGithub({
        pr: makePR({ mergeable_state: 'behind' }),
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 1,
            commits: [gapCommit('gap0015ooo')],
            files: [gapFile('apps/web/src/pages/alpha/AlphaService.ts')],
          },
        },
        prListFiles: [gapFile('apps/web/src/pages/alpha/AlphaPage.tsx')],
        issueComments: [
          {
            id: 42,
            body:
              '<!-- MERGE-QUEUE-STATUS -->\nprior status\n' +
              `<!-- LS-9662-RETRIGGERS:${JSON.stringify(spreadHistory)} -->`,
          },
        ],
      });

      const logs = await runCapturingLogs(github);

      assert.strictEqual(
        calls.updateBranch.length,
        0,
        'two retriggers 95 and 70 minutes ago must reach the cap — a window ' +
          'shorter than the ~25min validation cycle is unreachable (LS-10123)',
      );
      assert.strictEqual(
        calls.merges.length,
        1,
        'at the cap the PR merges on the validation it already passed',
      );
      assert.match(logs, /verdict=fail-open:retrigger-cap-reached/);
    }),
  );

  // ── LS-10098: absolute starvation cap for a steady drip of retriggers ──────
  //
  // Root cause: the rolling window only bounds retrigger RATE. A PR bounced
  // by gap commits arriving slower than the window (but still steadily) never
  // accumulates MAX_STALENESS_RETRIGGERS retriggers inside any single
  // trailing window — each earlier entry ages out just before the next
  // overlap lands — so the burst cap never engages. PR #7906 went green 4
  // times over 7h without ever merging: retriggers landed roughly every
  // 2h20m, comfortably below the 4h window's threshold for "count as a
  // burst" each time it was evaluated.

  it(
    'fails open once a PR has been continuously bounced past the starvation cap, even though no single window ever saw two retriggers',
    withGuardWorkspace(async () => {
      // The PR #7906 pattern: 3 prior retriggers ~2h20m apart, spanning 7h.
      // At any given evaluation, only the single most recent entry falls
      // inside the 4h rolling window — the burst cap (>=2) never sees it.
      const steadyDripHistory = [420, 280, 140].map((minutesAgo) =>
        new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
      );
      const { github, calls } = makeGuardGithub({
        pr: makePR({ mergeable_state: 'behind' }),
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 1,
            commits: [gapCommit('gap0018rrr')],
            files: [gapFile('apps/web/src/pages/alpha/AlphaService.ts')],
          },
        },
        prListFiles: [gapFile('apps/web/src/pages/alpha/AlphaPage.tsx')],
        issueComments: [
          {
            id: 42,
            body:
              '<!-- MERGE-QUEUE-STATUS -->\nprior status\n' +
              `<!-- LS-9662-RETRIGGERS:${JSON.stringify(steadyDripHistory)} -->`,
          },
        ],
      });

      const logs = await runCapturingLogs(github);

      assert.strictEqual(
        calls.updateBranch.length,
        0,
        'a steady drip of retriggers, each individually below the burst-window ' +
          'threshold, must still eventually stop retriggering (LS-10098)',
      );
      assert.strictEqual(
        calls.merges.length,
        1,
        'the PR must merge on the validation it already passed rather than ' +
          'being starved forever',
      );
      assert.match(logs, /verdict=fail-open:starvation-cap-reached/);
      assert.doesNotMatch(
        logs,
        /verdict=fail-open:retrigger-cap-reached/,
        'this scenario is specifically the one the rolling-window burst cap misses',
      );
    }),
  );

  // Negative control: the same steady-drip shape as above, but the run has
  // only been going for 1h — well under the starvation cap — so the guard
  // must still behave exactly as it did before LS-10098: block and retrigger.
  it(
    'still blocks and retriggers a short-lived steady drip that has not reached the starvation cap',
    withGuardWorkspace(async () => {
      const shortDripHistory = [60].map((minutesAgo) =>
        new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
      );
      const { github, calls } = makeGuardGithub({
        pr: makePR({ mergeable_state: 'behind' }),
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 1,
            commits: [gapCommit('gap0019sss')],
            files: [gapFile('apps/web/src/pages/alpha/AlphaService.ts')],
          },
        },
        prListFiles: [gapFile('apps/web/src/pages/alpha/AlphaPage.tsx')],
        issueComments: [
          {
            id: 42,
            body:
              '<!-- MERGE-QUEUE-STATUS -->\nprior status\n' +
              `<!-- LS-9662-RETRIGGERS:${JSON.stringify(shortDripHistory)} -->`,
          },
        ],
      });

      const logs = await runCapturingLogs(github);

      assert.strictEqual(
        calls.updateBranch.length,
        1,
        'a single retrigger an hour ago must not trip either cap yet',
      );
      assert.strictEqual(calls.merges.length, 0);
      assert.match(logs, /verdict=overlap(?!:narrowed)/);
      assert.doesNotMatch(logs, /fail-open:starvation-cap-reached/);
      assert.doesNotMatch(logs, /fail-open:retrigger-cap-reached/);
    }),
  );

  // Negative control: an old, disconnected retrigger cluster (already covered
  // by "ignores retrigger history older than the rolling window" for the
  // burst cap) must also not trip the NEW starvation cap — a long-dormant PR
  // that picks up a fresh, unrelated overlap is not "continuously starved"
  // and must not be punished for ancient history the window has every right
  // to forget.
  it(
    'does not apply the starvation cap to an old, disconnected retrigger cluster',
    withGuardWorkspace(async () => {
      const disconnectedHistory = [400, 401, 402].map((minutesAgo) =>
        new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
      );
      const { github, calls } = makeGuardGithub({
        pr: makePR({ mergeable_state: 'behind' }),
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 1,
            commits: [gapCommit('gap0020ttt')],
            files: [gapFile('apps/web/src/pages/alpha/AlphaService.ts')],
          },
        },
        prListFiles: [gapFile('apps/web/src/pages/alpha/AlphaPage.tsx')],
        issueComments: [
          {
            id: 42,
            body:
              '<!-- MERGE-QUEUE-STATUS -->\nprior status\n' +
              `<!-- LS-9662-RETRIGGERS:${JSON.stringify(disconnectedHistory)} -->`,
          },
        ],
      });

      const logs = await runCapturingLogs(github);

      assert.strictEqual(
        calls.updateBranch.length,
        1,
        'a fresh overlap after a long-dormant gap must retrigger normally, not ' +
          'be treated as a continuation of ancient, disconnected history',
      );
      assert.strictEqual(calls.merges.length, 0);
      assert.doesNotMatch(logs, /fail-open:starvation-cap-reached/);
    }),
  );

  it(
    'names the retrigger count and cap in the revalidation comment',
    withGuardWorkspace(async () => {
      const { github, calls } = makeGuardGithub({
        pr: makePR({ mergeable_state: 'behind' }),
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 1,
            commits: [gapCommit('gap0016ppp')],
            files: [gapFile('apps/web/src/pages/alpha/AlphaService.ts')],
          },
        },
        prListFiles: [gapFile('apps/web/src/pages/alpha/AlphaPage.tsx')],
      });

      await runCapturingLogs(github);

      const blocker = calls.comments.find((c) =>
        c.body?.includes('Cannot Merge'),
      );
      assert.match(
        blocker.body,
        /Revalidation 1 of 2 for this PR in the last 4h/,
        'repeat starvation must be visible on the PR, not only in queue logs',
      );
    }),
  );

  it(
    'reports the would-be revalidation ordinal on a dry run without advancing it',
    withGuardWorkspace(async () => {
      const priorHistory = [
        new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      ];
      const { github, calls } = makeGuardGithub({
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 1,
            commits: [gapCommit('gap0017qqq')],
            files: [gapFile('apps/web/src/pages/alpha/AlphaService.ts')],
          },
        },
        prListFiles: [gapFile('apps/web/src/pages/alpha/AlphaPage.tsx')],
        issueComments: [
          {
            id: 42,
            body:
              '<!-- MERGE-QUEUE-STATUS -->\nprior status\n' +
              `<!-- LS-9662-RETRIGGERS:${JSON.stringify(priorHistory)} -->`,
          },
        ],
      });

      await runCapturingLogs(github, { isDryRun: true });

      const blocker = calls.comments.find((c) =>
        c.body?.includes('Cannot Merge'),
      );
      assert.match(
        blocker.body,
        /Revalidation 2 of 2 for this PR in the last 4h/,
        'the ordinal counts this revalidation, so it cannot be read off the ' +
          'marker array — a dry run deliberately does not advance that',
      );
      assert.match(
        blocker.body,
        /<!-- LS-9662-RETRIGGERS:\["[^"]+"\] -->/,
        'the persisted marker must still hold exactly the one prior entry',
      );
    }),
  );

  it(
    'dry run does not advance the retrigger history',
    withGuardWorkspace(async () => {
      const { github, calls } = makeGuardGithub({
        compareResults: {
          [GAP_BASEHEAD]: {
            total_commits: 1,
            commits: [gapCommit('gap0012lll')],
            files: [gapFile('apps/web/src/pages/alpha/AlphaService.ts')],
          },
        },
        prListFiles: [gapFile('apps/web/src/pages/alpha/AlphaPage.tsx')],
      });

      await runCapturingLogs(github, { isDryRun: true });

      assert.strictEqual(calls.updateBranch.length, 0);
      const blocker = calls.comments.find((c) =>
        c.body?.includes('Cannot Merge'),
      );
      assert.match(
        blocker.body,
        /<!-- LS-9662-RETRIGGERS:\[\] -->/,
        'a dry run must not record a real retrigger against the cap',
      );
    }),
  );
});

describe('merge-queue-processor - post-merge content verification (LS-9404)', () => {
  // Shorthand for the three comparisons verifyMergedContent makes, keyed the
  // way compareCommitsWithBasehead receives them.
  const compares = ({ validated = [], landed = [], baseDrift = [] }) => ({
    [`${MERGE_PARENT_SHA}...${HEAD_SHA}`]: {
      merge_base_commit: { sha: 'mergebase-sha' },
      files: validated,
    },
    [`${MERGE_PARENT_SHA}...merged-sha`]: { files: landed },
    [`mergebase-sha...${MERGE_PARENT_SHA}`]: { files: baseDrift },
  });

  const file = (filename, sha, status = 'modified') => ({
    filename,
    sha,
    status,
  });

  it('applies no arbitration label when the validated patch landed intact', async () => {
    const { github, calls } = makeGithub({
      compareResults: compares({
        validated: [file('lib/a.ts', 'blob-a')],
        landed: [file('lib/a.ts', 'blob-a')],
      }),
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.merges.length, 1, 'should merge');
    assert.strictEqual(
      calls.labels.length,
      0,
      'an intact patch should not apply needs-human-arbitration',
    );
    assert.ok(
      calls.comments.some(
        (c) =>
          c.body?.includes('Successfully Merged') &&
          !c.body?.includes('Merge Content Mismatch'),
      ),
      'success comment should not carry a mismatch warning',
    );
  });

  // LS-9969: the regression that made this detector fire on ~100% of merges.
  // A squash merge lands `base + PR diff`, so once main advances past the PR's
  // merge-base the merge commit's tree necessarily differs from the head's.
  // Base drift alone must never be reported as dropped content.
  it('applies no arbitration label when the base advanced during the queue wait', async () => {
    const { github, calls } = makeGithub({
      compareResults: compares({
        validated: [file('lib/a.ts', 'blob-a')],
        // The squash commit also carries the commits main gained while this PR
        // was queued - the PR's own file still landed verbatim.
        landed: [
          file('lib/a.ts', 'blob-a'),
          file('lib/unrelated.ts', 'blob-drift'),
        ],
        baseDrift: [file('lib/unrelated.ts', 'blob-drift')],
      }),
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.merges.length, 1, 'should merge');
    assert.strictEqual(
      calls.labels.length,
      0,
      'base drift is not a content mismatch',
    );
  });

  // A file both sides touched is legitimately reconciled by the merge, so its
  // landed blob matches neither side. Exempt, not a mismatch.
  it('applies no arbitration label when the base also changed a PR-touched file', async () => {
    const { github, calls } = makeGithub({
      compareResults: compares({
        validated: [file('lib/shared.ts', 'blob-pr')],
        landed: [file('lib/shared.ts', 'blob-reconciled')],
        baseDrift: [file('lib/shared.ts', 'blob-base')],
      }),
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.labels.length,
      0,
      'a file changed on both sides is reconciled by the merge, not dropped',
    );
  });

  it('flags a content mismatch when a validated file never landed', async () => {
    const { github, calls } = makeGithub({
      compareResults: compares({
        validated: [file('lib/a.ts', 'blob-a'), file('lib/b.ts', 'blob-b')],
        // lib/b.ts is missing - the squash landed an older head's content.
        landed: [file('lib/a.ts', 'blob-a')],
      }),
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.merges.length,
      1,
      'merge still proceeds - this is detection, not a gate',
    );
    assert.ok(
      calls.labels.some((l) => l.labels?.includes('needs-human-arbitration')),
      'a dropped file should apply needs-human-arbitration',
    );
    assert.ok(
      calls.comments.some(
        (c) =>
          c.body?.includes('Merge Content Mismatch Detected') &&
          c.body?.includes('lib/b.ts') &&
          !c.body?.includes('`lib/a.ts`'),
      ),
      'success comment should name only the dropped file',
    );
  });

  it('flags a content mismatch when a validated file landed with a stale blob', async () => {
    const { github, calls } = makeGithub({
      compareResults: compares({
        validated: [file('lib/a.ts', 'blob-fixed')],
        landed: [file('lib/a.ts', 'blob-stale')],
      }),
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.ok(
      calls.labels.some((l) => l.labels?.includes('needs-human-arbitration')),
      'a stale blob should apply needs-human-arbitration',
    );
  });

  // The landed diff carries the base's drift too, which can re-pair GitHub's
  // rename detection: one `renamed` entry on the validated side can surface as
  // `added` on the landed side. The blob is the same, so it is not a mismatch.
  it('applies no arbitration label when rename detection re-pairs a file', async () => {
    const { github, calls } = makeGithub({
      compareResults: compares({
        validated: [file('lib/new-name.ts', 'blob-x', 'renamed')],
        landed: [file('lib/new-name.ts', 'blob-x', 'added')],
      }),
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.labels.length,
      0,
      'a differing status with an identical blob is not a mismatch',
    );
  });

  // The compare API caps `files` at 300 with no truncation flag, so a truncated
  // listing would read as "these files never landed".
  it('fails open (no mismatch reported) when a comparison hits the 300-file API cap', async () => {
    const many = (prefix, count) =>
      Array.from({ length: count }, (_, i) =>
        file(`lib/${prefix}${i}.ts`, `blob-${prefix}${i}`),
      );

    const { github, calls } = makeGithub({
      compareResults: compares({
        validated: many('a', 300),
        // Truncation would make every validated file look dropped.
        landed: [],
      }),
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.labels.length,
      0,
      'a capped comparison must fail open, not escalate 300 false drops',
    );
  });

  it('fails open (no mismatch reported) when the merge commit has no parent', async () => {
    const { github, calls } = makeGithub({
      commitParents: {},
      compareResults: compares({
        validated: [file('lib/a.ts', 'blob-a')],
        landed: [],
      }),
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.labels.length,
      0,
      'an unresolvable parent must fail open, not escalate',
    );
  });
  it('fails open (no mismatch reported) when the commit lookup errors', async () => {
    const { github: baseGithub, calls } = makeGithub();
    const github = {
      ...baseGithub,
      rest: {
        ...baseGithub.rest,
        repos: {
          ...baseGithub.rest.repos,
          getCommit: async () => {
            throw new Error('503 Service Unavailable');
          },
        },
      },
    };

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.merges.length, 1, 'merge should still complete');
    assert.strictEqual(
      calls.labels.length,
      0,
      'a lookup error must not itself trigger arbitration',
    );
  });
});

// ── #reviews forum threads ───────────────────────────────────────────────────

describe('merge-queue-processor — Discord #reviews per-PR threads', () => {
  const THREAD_MARKER = (id) => `<!-- DISCORD-REVIEWS-THREAD:${id} -->`;

  // Replies with the given status codes in order; 200s carry a channel_id body.
  function mockDiscordThreads(statuses, channelId = '9001') {
    const https = require('https');
    const requests = [];
    const original = https.request;
    https.request = (opts, cb) => {
      const statusCode = statuses[requests.length] ?? 200;
      requests.push({ opts, body: '' });
      const entry = requests[requests.length - 1];
      return {
        on: () => undefined,
        write: (b) => (entry.body += b),
        end: () => {
          const handlers = {};
          const res = {
            statusCode,
            resume: () => {},
            on: (ev, fn) => ((handlers[ev] = fn), res),
          };
          cb(res);
          handlers.data?.(JSON.stringify({ id: '1', channel_id: channelId }));
          handlers.end?.();
        },
      };
    };
    return { requests, restore: () => (https.request = original) };
  }

  async function run(github) {
    process.env.ESCALATION_WEBHOOK_URL =
      'https://discord.com/api/webhooks/test/token';
    try {
      await processor({
        github,
        context,
        isDryRun: false,
        forceCheck: false,
        isRetry: false,
      });
    } finally {
      delete process.env.ESCALATION_WEBHOOK_URL;
    }
  }

  it('opens a thread named after the PR and persists its id in a PR comment', async () => {
    const { github, calls } = makeGithub({ reviewDecision: 'REVIEW_REQUIRED' });
    const discord = mockDiscordThreads([200]);
    try {
      await run(github);
    } finally {
      discord.restore();
    }

    assert.strictEqual(discord.requests.length, 1);
    assert.match(discord.requests[0].body, /"thread_name":"PR #\d+: /);
    assert.ok(!discord.requests[0].opts.path.includes('thread_id'));
    assert.ok(
      calls.comments.some((c) => c.body?.includes(THREAD_MARKER('9001'))),
      'thread id should be persisted as a hidden PR comment',
    );
  });

  it('posts into the stored thread instead of opening a new one', async () => {
    const { github, calls } = makeGithub({ reviewDecision: 'REVIEW_REQUIRED' });
    github.rest.issues.listComments = async () => ({
      data: [{ id: 7, body: `${THREAD_MARKER('4242')}\nthread` }],
    });
    const discord = mockDiscordThreads([200]);
    try {
      await run(github);
    } finally {
      discord.restore();
    }

    assert.strictEqual(discord.requests.length, 1);
    assert.ok(discord.requests[0].opts.path.includes('thread_id=4242'));
    assert.ok(!discord.requests[0].body.includes('thread_name'));
    assert.ok(
      !calls.comments.some((c) => c.body?.includes('DISCORD-REVIEWS-THREAD')),
      'no new marker when the stored thread is reused',
    );
  });

  it('opens a fresh thread when the stored one was deleted (404)', async () => {
    const { github, calls } = makeGithub({ reviewDecision: 'REVIEW_REQUIRED' });
    github.rest.issues.listComments = async () => ({
      data: [{ id: 7, body: THREAD_MARKER('4242') }],
    });
    const discord = mockDiscordThreads([404, 200], '5555');
    try {
      await run(github);
    } finally {
      discord.restore();
    }

    assert.strictEqual(discord.requests.length, 2);
    assert.ok(discord.requests[0].opts.path.includes('thread_id=4242'));
    assert.match(discord.requests[1].body, /thread_name/);
    assert.ok(
      calls.comments.some((c) => c.body?.includes(THREAD_MARKER('5555'))),
    );
  });

  it('does not open a duplicate thread on a non-404 failure of the stored thread', async () => {
    const { github } = makeGithub({ reviewDecision: 'REVIEW_REQUIRED' });
    github.rest.issues.listComments = async () => ({
      data: [{ id: 7, body: THREAD_MARKER('4242') }],
    });
    const discord = mockDiscordThreads([429]);
    try {
      await run(github);
    } finally {
      discord.restore();
    }

    assert.strictEqual(discord.requests.length, 1);
  });

  it('falls back to a plain post when the webhook is not a forum channel (400)', async () => {
    const { github } = makeGithub({ reviewDecision: 'REVIEW_REQUIRED' });
    const discord = mockDiscordThreads([400, 200]);
    try {
      await run(github);
    } finally {
      discord.restore();
    }

    assert.strictEqual(discord.requests.length, 2);
    assert.match(discord.requests[0].body, /thread_name/);
    assert.ok(!discord.requests[1].body.includes('thread_name'));
  });
});

describe('merge-queue-processor — batch mode (LS-10571)', () => {
  function withBatchApi(github, calls) {
    const basePaginate = github.paginate;
    github.paginate = async (fn, args) =>
      fn === github.rest.git.listMatchingRefs ? [] : basePaginate(fn, args);
    calls.batchRefs = [];
    calls.batchMerges = [];
    github.rest.git = {
      ...github.rest.git,
      getRef: async () => ({ data: { object: { sha: 'main-tip' } } }),
      listMatchingRefs: async () => ({ data: [] }),
      createRef: async ({ ref }) => {
        calls.batchRefs.push(ref);
        return { data: {} };
      },
      getCommit: async () => ({ data: { tree: { sha: 'tree' } } }),
      createCommit: async () => ({ data: { sha: 'meta-sha' } }),
      updateRef: async () => ({ data: {} }),
    };
    github.rest.repos = {
      ...github.rest.repos,
      merge: async ({ head }) => {
        calls.batchMerges.push(head);
        return { status: 201, data: { sha: `m-${head}` } };
      },
    };
    github.rest.actions = {
      ...github.rest.actions,
      createWorkflowDispatch: async (params) => {
        calls.dispatches.push(params);
        return { data: {} };
      },
    };
  }

  it('queues a ready main-targeting PR for batch testing instead of merging it', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
    });
    withBatchApi(github, calls);

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
      batchMode: true,
    });

    assert.strictEqual(calls.merges.length, 0, 'should not merge inline');
    assert.strictEqual(calls.batchRefs.length, 1, 'should build one batch ref');
    assert.match(calls.batchRefs[0], /^refs\/heads\/mq\/test\//);
    assert.deepStrictEqual(calls.batchMerges, [HEAD_SHA]);
    const dispatch = calls.dispatches.find(
      (d) => d.workflow_id === 'ci-orchestrator.yml',
    );
    assert.ok(dispatch, 'should dispatch batch CI');
    assert.deepStrictEqual(dispatch.inputs, {
      base_sha: 'main-tip',
      run_security: 'false',
    });
    // The batch CI subsumes the staleness guard — no gap compares.
    assert.strictEqual(validationCompares(calls).length, 0);
  });

  it('keeps a GitHub-blocked PR (e.g. awaiting code owner) out of batches', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      pr: makePR({ mergeable_state: 'blocked' }),
    });
    withBatchApi(github, calls);

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
      batchMode: true,
    });

    assert.strictEqual(calls.merges.length, 0);
    assert.strictEqual(calls.batchRefs.length, 0, 'should not batch');
  });

  it('still merges PRs targeting a parent branch one at a time', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      pr: makePR({
        base: { ref: 'feature/parent' },
        labels: [{ name: 'merge-when-ready' }, { name: 'merge-to-parent' }],
      }),
    });
    withBatchApi(github, calls);

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
      batchMode: true,
    });

    assert.strictEqual(calls.merges.length, 1, 'should merge inline');
    assert.strictEqual(calls.batchRefs.length, 0, 'should not batch');
  });

  // ── LS-10620: merge-queue commit status ────────────────────────────────────

  const queueStatuses = (calls) =>
    calls.statuses.filter((s) => s.context === 'merge-queue');

  it('LS-10620: posts a merge-queue status on a queued PR, linking to the queue run', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
    });
    withBatchApi(github, calls);

    await processor({
      github,
      context: { ...context, runId: 4242, serverUrl: 'https://github.test' },
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
      batchMode: true,
    });

    const [status, ...rest] = queueStatuses(calls);
    assert.strictEqual(rest.length, 0, 'exactly one status for the one PR');
    assert.strictEqual(status.sha, HEAD_SHA);
    assert.strictEqual(status.state, 'pending');
    assert.match(status.description, /Queued|In batch/);
    assert.strictEqual(
      status.target_url,
      'https://github.test/test-owner/test-repo/actions/runs/4242',
    );
  });

  it('LS-10620: marks a labeled-but-blocked PR as waiting, not in a batch', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      pr: makePR({ mergeable_state: 'blocked' }),
    });
    withBatchApi(github, calls);

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
      batchMode: true,
    });

    const [status] = queueStatuses(calls);
    assert.strictEqual(status.state, 'pending');
    assert.match(status.description, /^Waiting/);
  });

  it('LS-10620: posts no merge-queue status for PRs that bypass the batch queue', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      pr: makePR({
        base: { ref: 'feature/parent' },
        labels: [{ name: 'merge-when-ready' }, { name: 'merge-to-parent' }],
      }),
    });
    withBatchApi(github, calls);

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
      batchMode: true,
    });

    assert.strictEqual(queueStatuses(calls).length, 0);
  });

  it('LS-10620: writes the status without throwing when the status API fails', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
    });
    withBatchApi(github, calls);
    github.rest.repos.createCommitStatus = async () => {
      throw Object.assign(new Error('Resource not accessible'), {
        status: 403,
      });
    };

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
      batchMode: true,
    });

    assert.strictEqual(calls.batchRefs.length, 1, 'the pass still completes');
  });

  it('LS-10620: does not write statuses in dry-run mode', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
    });
    withBatchApi(github, calls);

    await processor({
      github,
      context,
      isDryRun: true,
      forceCheck: false,
      isRetry: false,
      batchMode: true,
    });

    assert.strictEqual(queueStatuses(calls).length, 0);
  });

  it('LS-10620: overwrites the status when merge-when-ready is removed', async () => {
    const { github, calls } = makeGithub({ mergeReadyItems: [] });
    withBatchApi(github, calls);

    await processor({
      github,
      context: {
        ...context,
        eventName: 'pull_request',
        payload: {
          action: 'unlabeled',
          label: { name: 'merge-when-ready' },
          pull_request: {
            number: 1,
            base: { ref: 'main' },
            head: { sha: 'sha1' },
          },
        },
      },
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
      batchMode: true,
    });

    const [status] = queueStatuses(calls);
    assert.strictEqual(status.sha, 'sha1');
    assert.strictEqual(status.state, 'success');
    assert.match(status.description, /^Not in the merge queue/);
  });

  it('LS-10620: a failing merge-queue status never blocks the PR (required-checks lookup unavailable)', async () => {
    // branchRules [] → requiredCheckNames is null → every status context
    // counts, so only the explicit exclusion keeps our own status from gating.
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      commitStatuses: [
        {
          context: 'merge-queue',
          state: 'failure',
          created_at: '2026-01-01T00:03:00Z',
        },
      ],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(calls.merges.length, 1, 'PR should still merge');
  });

  it('LS-10620: control — another failing status context still blocks the PR', async () => {
    const { github, calls } = makeGithub({
      reviews: [
        { user: { login: 'legacy-sports-review-bot[bot]' }, state: 'APPROVED' },
      ],
      commitStatuses: [
        {
          context: 'some-other-check',
          state: 'failure',
          created_at: '2026-01-01T00:03:00Z',
        },
      ],
    });

    await processor({
      github,
      context,
      isDryRun: false,
      forceCheck: false,
      isRetry: false,
    });

    assert.strictEqual(
      calls.merges.length,
      0,
      'other failures must still gate',
    );
  });
});
