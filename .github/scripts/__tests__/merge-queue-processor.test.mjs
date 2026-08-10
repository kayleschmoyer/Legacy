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
  };

  const github = {
    hook: { after: () => {} },

    // paginate dispatches on the endpoint function reference
    paginate: async (fn, args) => {
      if (fn === github.rest.pulls.listReviews) return reviews;
      if (fn === github.rest.pulls.list) return sweepPRs;
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
      },
      checks: {
        listForRef: async () => ({ data: { check_runs: checkRuns } }),
      },
      issues: {
        listComments: async () => ({ data: [] }),
        createComment: async (args) => {
          calls.comments.push(args);
          return { data: { id: 1 } };
        },
        updateComment: async () => {},
        addLabels: async (args) => {
          calls.labels.push(args);
        },
        removeLabel: async (args) => {
          calls.labelsRemoved.push(args);
        },
      },
      git: { deleteRef: async () => {} },
      actions: {
        // remediateCancelledCiRun (LS-9053)
        listWorkflowRuns: async () => ({
          data: { workflow_runs: workflowRuns },
        }),
        reRunWorkflow: async (args) => {
          calls.reruns.push(args);
          return {};
        },
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

  it('treats a bot-review pending older than 45 minutes as a dead reviewer run and re-triggers', async () => {
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
