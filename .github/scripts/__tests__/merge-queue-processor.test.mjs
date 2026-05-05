/**
 * Unit tests for merge-queue-processor.js — bot approval / thread check interaction.
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

const require = createRequire(import.meta.url);
const processor = require(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../merge-queue-processor.js',
  ),
);

// ── Fixture helpers ──────────────────────────────────────────────────────────

const HEAD_SHA = 'abc123def456abc123def456abc123def456abc123';

function makePR(overrides = {}) {
  return {
    number: 1,
    title: 'Test PR',
    body: 'Test body',
    draft: false,
    mergeable: true,
    base: { ref: 'main' },
    head: { sha: HEAD_SHA, ref: 'feature/test' },
    labels: [{ name: 'merge-when-ready' }],
    ...overrides,
  };
}

// Builds a minimal GitHub mock. `reviews` controls what listReviews returns;
// `unresolvedThreads` controls the reviewThreads GraphQL response.
function makeGithub({
  reviews = [],
  unresolvedThreads = [],
  reviewDecision = 'APPROVED',
} = {}) {
  const calls = { merges: [], comments: [] };

  const github = {
    hook: { after: () => {} },

    // paginate dispatches on the endpoint function reference
    paginate: async (fn, args) => {
      if (fn === github.rest.pulls.listReviews) return reviews;
      // default: PR list
      return [makePR()];
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
      throw new Error(`Unexpected graphql query: ${query.slice(0, 80)}`);
    },

    rest: {
      pulls: {
        // Called twice per merge attempt: initial fetch + TOCTOU guard
        get: async () => ({ data: makePR() }),
        listReviews: async () => ({ data: reviews }),
        merge: async (args) => {
          calls.merges.push(args);
          return { data: { sha: 'merged-sha' } };
        },
        // retargetDependentPRs
        list: async () => ({ data: [] }),
        update: async () => {},
        dismissReview: async () => {},
      },
      repos: {
        // 404 → no branch protection → evaluate all checks
        getBranchProtection: async () => {
          throw Object.assign(new Error('Not Found'), { status: 404 });
        },
        listCommitStatusesForRef: async () => ({ data: [] }),
      },
      checks: {
        // Return one non-lightweight passing check so CI is considered done
        listForRef: async () => ({
          data: {
            check_runs: [
              {
                name: 'CI Pipeline',
                status: 'completed',
                conclusion: 'success',
                completed_at: '2026-01-01T00:00:00Z',
                started_at: '2026-01-01T00:00:00Z',
              },
            ],
          },
        }),
      },
      issues: {
        listComments: async () => ({ data: [] }),
        createComment: async (args) => {
          calls.comments.push(args);
          return { data: { id: 1 } };
        },
        updateComment: async () => {},
        addLabels: async () => {},
        removeLabel: async () => {},
      },
      git: { deleteRef: async () => {} },
    },

    // self-retry dispatch — never fires in tests (eventName is workflow_run)
    request: async () => {},
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
