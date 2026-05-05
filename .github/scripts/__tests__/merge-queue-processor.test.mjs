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
    mergeable_state: 'clean',
    base: { ref: 'main' },
    head: { sha: HEAD_SHA, ref: 'feature/test' },
    labels: [{ name: 'merge-when-ready' }],
    user: { login: 'test-author' },
    ...overrides,
  };
}

// Builds a minimal GitHub mock. `reviews` controls what listReviews returns;
// `unresolvedThreads` controls the reviewThreads GraphQL response;
// `pr` overrides the PR returned by paginate/get.
function makeGithub({
  reviews = [],
  unresolvedThreads = [],
  reviewDecision = 'APPROVED',
  pr = makePR(),
} = {}) {
  const calls = { merges: [], comments: [], updateBranch: [] };

  const github = {
    hook: { after: () => {} },

    // paginate dispatches on the endpoint function reference
    paginate: async (fn, args) => {
      if (fn === github.rest.pulls.listReviews) return reviews;
      // default: PR list
      return [pr];
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
