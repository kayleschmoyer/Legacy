import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapPrGraphQLResponse,
  fetchPrData,
  normalizeBotLogin,
  PR_DATA_QUERY,
} from '../graphql-fetch.mjs';

// ---------------------------------------------------------------------------
// normalizeBotLogin
// ---------------------------------------------------------------------------

describe('normalizeBotLogin', () => {
  it('appends [bot] when __typename is Bot and login lacks suffix', () => {
    assert.strictEqual(
      normalizeBotLogin({
        login: 'legacy-sports-review-bot',
        __typename: 'Bot',
      }),
      'legacy-sports-review-bot[bot]',
    );
  });

  it('does not double-append when login already ends with [bot]', () => {
    assert.strictEqual(
      normalizeBotLogin({ login: 'some-bot[bot]', __typename: 'Bot' }),
      'some-bot[bot]',
    );
  });

  it('returns login unchanged for User authors', () => {
    assert.strictEqual(
      normalizeBotLogin({ login: 'alice', __typename: 'User' }),
      'alice',
    );
  });

  it('returns null for null author', () => {
    assert.strictEqual(normalizeBotLogin(null), null);
  });

  it('returns null for undefined author', () => {
    assert.strictEqual(normalizeBotLogin(undefined), null);
  });
});

// ---------------------------------------------------------------------------
// PR_DATA_QUERY shape — guard against LS-4118 regression
// ---------------------------------------------------------------------------

describe('PR_DATA_QUERY', () => {
  it('requests __typename for reviewThreads comment authors', () => {
    // reviewComments bot-login normalization depends on __typename being present
    // in this selection. If it is removed, getMalformedInlineReplies silently
    // returns [] (LS-4118).
    const reviewThreadsBlock = PR_DATA_QUERY.slice(
      PR_DATA_QUERY.indexOf('reviewThreads(first: 100)'),
    );
    assert.ok(
      reviewThreadsBlock.includes('__typename'),
      'reviewThreads.comments.nodes.author must include __typename',
    );
  });

  it('requests __typename for review authors', () => {
    const reviewsBlock = PR_DATA_QUERY.slice(
      PR_DATA_QUERY.indexOf('reviews(first: 100)'),
      PR_DATA_QUERY.indexOf('comments(first: 100)'),
    );
    assert.ok(
      reviewsBlock.includes('__typename'),
      'reviews.nodes.author must include __typename',
    );
  });
});

// ---------------------------------------------------------------------------

const makePr = (overrides = {}) => ({
  number: 42,
  title: 'feat: add widget',
  body: 'PR body',
  isDraft: false,
  isCrossRepository: false,
  headRefName: 'feat/widget',
  baseRefName: 'main',
  author: { login: 'alice', __typename: 'User' },
  reviews: { nodes: [] },
  comments: { nodes: [] },
  reviewThreads: { nodes: [] },
  commits: { nodes: [] },
  labels: { nodes: [], pageInfo: { hasNextPage: false } },
  ...overrides,
});

describe('mapPrGraphQLResponse — prContext', () => {
  it('maps scalar PR fields', () => {
    const { prContext } = mapPrGraphQLResponse(makePr(), 'diff text');
    assert.strictEqual(prContext.number, 42);
    assert.strictEqual(prContext.title, 'feat: add widget');
    assert.strictEqual(prContext.body, 'PR body');
    assert.strictEqual(prContext.isDraft, false);
    assert.strictEqual(prContext.isCrossRepository, false);
    assert.strictEqual(prContext.headRefName, 'feat/widget');
    assert.strictEqual(prContext.baseRefName, 'main');
    assert.strictEqual(prContext.diff, 'diff text');
  });

  it('sets is_bot=false for User authors', () => {
    const { prContext } = mapPrGraphQLResponse(
      makePr({ author: { login: 'alice', __typename: 'User' } }),
      '',
    );
    assert.strictEqual(prContext.author.login, 'alice');
    assert.strictEqual(prContext.author.is_bot, false);
  });

  it('sets is_bot=true for Bot authors', () => {
    const { prContext } = mapPrGraphQLResponse(
      makePr({ author: { login: 'my-bot[bot]', __typename: 'Bot' } }),
      '',
    );
    assert.strictEqual(prContext.author.login, 'my-bot[bot]');
    assert.strictEqual(prContext.author.is_bot, true);
  });

  it('handles null author gracefully', () => {
    const { prContext } = mapPrGraphQLResponse(makePr({ author: null }), '');
    assert.strictEqual(prContext.author.login, '');
    assert.strictEqual(prContext.author.is_bot, false);
  });

  it('exposes label names as a flat string array (LS-4178)', () => {
    const { prContext } = mapPrGraphQLResponse(
      makePr({
        labels: {
          nodes: [
            { name: 'bot:reset-cycle-counter' },
            { name: 'merge-when-ready' },
          ],
          pageInfo: { hasNextPage: false },
        },
      }),
      '',
    );
    assert.deepEqual(prContext.labels, [
      'bot:reset-cycle-counter',
      'merge-when-ready',
    ]);
  });

  it('defaults labels to an empty array when the field is absent', () => {
    const { prContext } = mapPrGraphQLResponse(
      makePr({ labels: undefined }),
      '',
    );
    assert.deepEqual(prContext.labels, []);
  });
});

describe('mapPrGraphQLResponse — reviews', () => {
  it('maps review fields including commit oid as commitId', () => {
    const pr = makePr({
      reviews: {
        nodes: [
          {
            databaseId: 1001,
            author: { login: 'reviewer-bot[bot]' },
            state: 'CHANGES_REQUESTED',
            body: 'Please fix X',
            submittedAt: '2024-01-01T00:00:00Z',
            commit: { oid: 'abc123' },
          },
        ],
      },
    });
    const { reviews } = mapPrGraphQLResponse(pr, '');
    assert.strictEqual(reviews.length, 1);
    assert.strictEqual(reviews[0].id, 1001);
    assert.strictEqual(reviews[0].userLogin, 'reviewer-bot[bot]');
    assert.strictEqual(reviews[0].state, 'CHANGES_REQUESTED');
    assert.strictEqual(reviews[0].body, 'Please fix X');
    assert.strictEqual(reviews[0].submittedAt, '2024-01-01T00:00:00Z');
    assert.strictEqual(reviews[0].commitId, 'abc123');
  });

  it('sets commitId=null when commit is null', () => {
    const pr = makePr({
      reviews: {
        nodes: [
          {
            databaseId: 1002,
            author: { login: 'bot[bot]' },
            state: 'APPROVED',
            body: null,
            submittedAt: '2024-01-02T00:00:00Z',
            commit: null,
          },
        ],
      },
    });
    const { reviews } = mapPrGraphQLResponse(pr, '');
    assert.strictEqual(reviews[0].commitId, null);
    assert.strictEqual(reviews[0].body, null);
  });

  it('appends [bot] to login when review author __typename is Bot (LS-4112)', () => {
    const pr = makePr({
      reviews: {
        nodes: [
          {
            databaseId: 1004,
            author: { login: 'legacy-sports-review-bot', __typename: 'Bot' },
            state: 'CHANGES_REQUESTED',
            body: 'Cycle 1 review',
            submittedAt: '2024-01-04T00:00:00Z',
            commit: { oid: 'def456' },
          },
        ],
      },
    });
    const { reviews } = mapPrGraphQLResponse(pr, '');
    assert.strictEqual(reviews[0].userLogin, 'legacy-sports-review-bot[bot]');
  });

  it('does not double-append [bot] when bot login already ends with [bot]', () => {
    const pr = makePr({
      reviews: {
        nodes: [
          {
            databaseId: 1006,
            author: { login: 'some-bot[bot]', __typename: 'Bot' },
            state: 'APPROVED',
            body: null,
            submittedAt: '2024-01-06T00:00:00Z',
            commit: null,
          },
        ],
      },
    });
    const { reviews } = mapPrGraphQLResponse(pr, '');
    assert.strictEqual(reviews[0].userLogin, 'some-bot[bot]');
  });

  it('does not modify login when review author __typename is User', () => {
    const pr = makePr({
      reviews: {
        nodes: [
          {
            databaseId: 1005,
            author: { login: 'alice', __typename: 'User' },
            state: 'APPROVED',
            body: null,
            submittedAt: '2024-01-05T00:00:00Z',
            commit: null,
          },
        ],
      },
    });
    const { reviews } = mapPrGraphQLResponse(pr, '');
    assert.strictEqual(reviews[0].userLogin, 'alice');
  });

  it('sets userLogin=null for reviews with null author', () => {
    const pr = makePr({
      reviews: {
        nodes: [
          {
            databaseId: 1003,
            author: null,
            state: 'COMMENTED',
            body: '',
            submittedAt: '2024-01-03T00:00:00Z',
            commit: null,
          },
        ],
      },
    });
    const { reviews } = mapPrGraphQLResponse(pr, '');
    assert.strictEqual(reviews[0].userLogin, null);
  });

  it('returns empty array when no reviews', () => {
    const { reviews } = mapPrGraphQLResponse(makePr(), '');
    assert.deepEqual(reviews, []);
  });
});

describe('mapPrGraphQLResponse — commits', () => {
  it('returns commit SHAs as a flat string array', () => {
    const pr = makePr({
      commits: {
        nodes: [{ commit: { oid: 'aaa111' } }, { commit: { oid: 'bbb222' } }],
      },
    });
    const { commits } = mapPrGraphQLResponse(pr, '');
    assert.deepEqual(commits, ['aaa111', 'bbb222']);
  });

  it('returns empty array when no commits', () => {
    const { commits } = mapPrGraphQLResponse(makePr(), '');
    assert.deepEqual(commits, []);
  });
});

describe('mapPrGraphQLResponse — reviewComments', () => {
  it('sets inReplyToId=null for the root comment in a thread', () => {
    const pr = makePr({
      reviewThreads: {
        nodes: [
          {
            comments: {
              nodes: [
                {
                  databaseId: 500,
                  author: { login: 'reviewer' },
                  body: 'Root comment',
                  createdAt: '2024-01-01T00:00:00Z',
                },
              ],
            },
          },
        ],
      },
    });
    const { reviewComments } = mapPrGraphQLResponse(pr, '');
    assert.strictEqual(reviewComments.length, 1);
    assert.strictEqual(reviewComments[0].id, 500);
    assert.strictEqual(reviewComments[0].inReplyToId, null);
    assert.strictEqual(reviewComments[0].userLogin, 'reviewer');
    assert.strictEqual(reviewComments[0].body, 'Root comment');
  });

  it('points all thread replies to the root comment databaseId', () => {
    const pr = makePr({
      reviewThreads: {
        nodes: [
          {
            comments: {
              nodes: [
                {
                  databaseId: 100,
                  author: { login: 'bot[bot]' },
                  body: 'Finding',
                  createdAt: '2024-01-01T00:00:00Z',
                },
                {
                  databaseId: 101,
                  author: { login: 'author' },
                  body: 'FIX: abc123',
                  createdAt: '2024-01-02T00:00:00Z',
                },
                {
                  databaseId: 102,
                  author: { login: 'bot[bot]' },
                  body: 'Acknowledged',
                  createdAt: '2024-01-03T00:00:00Z',
                },
              ],
            },
          },
        ],
      },
    });
    const { reviewComments } = mapPrGraphQLResponse(pr, '');
    assert.strictEqual(reviewComments.length, 3);
    assert.strictEqual(reviewComments[0].inReplyToId, null);
    assert.strictEqual(reviewComments[1].inReplyToId, 100);
    assert.strictEqual(reviewComments[2].inReplyToId, 100);
  });

  it('flattens comments from multiple threads', () => {
    const pr = makePr({
      reviewThreads: {
        nodes: [
          {
            comments: {
              nodes: [
                {
                  databaseId: 1,
                  author: { login: 'a' },
                  body: 'T1',
                  createdAt: '',
                },
              ],
            },
          },
          {
            comments: {
              nodes: [
                {
                  databaseId: 2,
                  author: { login: 'b' },
                  body: 'T2',
                  createdAt: '',
                },
                {
                  databaseId: 3,
                  author: { login: 'c' },
                  body: 'T2 reply',
                  createdAt: '',
                },
              ],
            },
          },
        ],
      },
    });
    const { reviewComments } = mapPrGraphQLResponse(pr, '');
    assert.strictEqual(reviewComments.length, 3);
    assert.strictEqual(reviewComments[0].id, 1);
    assert.strictEqual(reviewComments[1].id, 2);
    assert.strictEqual(reviewComments[2].inReplyToId, 2);
  });

  it('handles null author in review comments', () => {
    const pr = makePr({
      reviewThreads: {
        nodes: [
          {
            comments: {
              nodes: [
                { databaseId: 10, author: null, body: 'text', createdAt: '' },
              ],
            },
          },
        ],
      },
    });
    const { reviewComments } = mapPrGraphQLResponse(pr, '');
    assert.strictEqual(reviewComments[0].userLogin, null);
  });

  it('appends [bot] to login when reviewComment author __typename is Bot (LS-4118)', () => {
    const pr = makePr({
      reviewThreads: {
        nodes: [
          {
            comments: {
              nodes: [
                {
                  databaseId: 200,
                  author: {
                    login: 'legacy-sports-review-bot',
                    __typename: 'Bot',
                  },
                  body: 'Finding',
                  createdAt: '2024-01-01T00:00:00Z',
                },
              ],
            },
          },
        ],
      },
    });
    const { reviewComments } = mapPrGraphQLResponse(pr, '');
    assert.strictEqual(
      reviewComments[0].userLogin,
      'legacy-sports-review-bot[bot]',
    );
  });

  it('does not double-append [bot] when reviewComment bot login already ends with [bot]', () => {
    const pr = makePr({
      reviewThreads: {
        nodes: [
          {
            comments: {
              nodes: [
                {
                  databaseId: 201,
                  author: { login: 'some-bot[bot]', __typename: 'Bot' },
                  body: 'Finding',
                  createdAt: '2024-01-01T00:00:00Z',
                },
              ],
            },
          },
        ],
      },
    });
    const { reviewComments } = mapPrGraphQLResponse(pr, '');
    assert.strictEqual(reviewComments[0].userLogin, 'some-bot[bot]');
  });

  it('does not modify login when reviewComment author __typename is User', () => {
    const pr = makePr({
      reviewThreads: {
        nodes: [
          {
            comments: {
              nodes: [
                {
                  databaseId: 202,
                  author: { login: 'alice', __typename: 'User' },
                  body: 'Comment',
                  createdAt: '2024-01-01T00:00:00Z',
                },
              ],
            },
          },
        ],
      },
    });
    const { reviewComments } = mapPrGraphQLResponse(pr, '');
    assert.strictEqual(reviewComments[0].userLogin, 'alice');
  });
});

describe('mapPrGraphQLResponse — issueComments', () => {
  it('maps issue comment fields', () => {
    const pr = makePr({
      comments: {
        nodes: [
          {
            databaseId: 999,
            author: { login: 'author' },
            body: 'JUSTIFY: this is fine',
            createdAt: '2024-03-01T00:00:00Z',
          },
        ],
      },
    });
    const { issueComments } = mapPrGraphQLResponse(pr, '');
    assert.strictEqual(issueComments.length, 1);
    assert.strictEqual(issueComments[0].id, 999);
    assert.strictEqual(issueComments[0].userLogin, 'author');
    assert.strictEqual(issueComments[0].body, 'JUSTIFY: this is fine');
    assert.strictEqual(issueComments[0].createdAt, '2024-03-01T00:00:00Z');
  });

  it('returns empty array when no issue comments', () => {
    const { issueComments } = mapPrGraphQLResponse(makePr(), '');
    assert.deepEqual(issueComments, []);
  });
});

// ── fetchPrData ──────────────────────────────────────────────────────────────

const noPagination = { hasNextPage: false };

const makeFullPr = (overrides = {}) => ({
  ...makePr(overrides),
  reviews: { nodes: [], pageInfo: noPagination },
  comments: { nodes: [], pageInfo: noPagination },
  reviewThreads: { nodes: [], pageInfo: noPagination },
  commits: { nodes: [], pageInfo: noPagination },
  labels: { nodes: [], pageInfo: noPagination },
  ...overrides,
});

function makeExec(graphqlPayload, diffOutput = 'diff text') {
  return (_cmd, args, _opts) => {
    if (args.includes('graphql')) return JSON.stringify(graphqlPayload);
    if (args.includes('diff')) return diffOutput;
    if (args.includes('view'))
      return JSON.stringify({ owner: { login: 'owner' }, name: 'repo' });
    throw new Error(`Unexpected gh args: ${args.join(' ')}`);
  };
}

describe('fetchPrData', () => {
  it('throws on GraphQL errors in the response', () => {
    const exec = makeExec({ errors: [{ message: 'not authorized' }] });
    assert.throws(
      () => fetchPrData(42, exec),
      /GraphQL errors.*not authorized/,
    );
  });

  it('throws when PR is not found', () => {
    const exec = makeExec({ data: { repository: { pullRequest: null } } });
    assert.throws(() => fetchPrData(42, exec), /not found or inaccessible/);
  });

  it('throws when repository is null', () => {
    const exec = makeExec({ data: { repository: null } });
    assert.throws(() => fetchPrData(42, exec), /not found or inaccessible/);
  });

  it('throws when reviews collection is truncated', () => {
    const pr = makeFullPr({
      reviews: { nodes: [], pageInfo: { hasNextPage: true } },
    });
    const exec = makeExec({ data: { repository: { pullRequest: pr } } });
    assert.throws(() => fetchPrData(42, exec), /exceeds 100-item.*reviews/);
  });

  it('throws when commits collection is truncated', () => {
    const pr = makeFullPr({
      commits: { nodes: [], pageInfo: { hasNextPage: true } },
    });
    const exec = makeExec({ data: { repository: { pullRequest: pr } } });
    assert.throws(() => fetchPrData(42, exec), /exceeds 100-item.*commits/);
  });

  it('throws when labels collection is truncated', () => {
    const pr = makeFullPr({
      labels: { nodes: [], pageInfo: { hasNextPage: true } },
    });
    const exec = makeExec({ data: { repository: { pullRequest: pr } } });
    assert.throws(() => fetchPrData(42, exec), /exceeds 100-item.*labels/);
  });

  it('throws when a review thread inner comments are truncated', () => {
    const pr = makeFullPr({
      reviewThreads: {
        nodes: [{ comments: { nodes: [], pageInfo: { hasNextPage: true } } }],
        pageInfo: noPagination,
      },
    });
    const exec = makeExec({ data: { repository: { pullRequest: pr } } });
    assert.throws(
      () => fetchPrData(42, exec),
      /exceeds 100-item.*comments within a review thread/,
    );
  });

  it('propagates gh pr diff errors', () => {
    const original = process.env.GITHUB_REPOSITORY;
    process.env.GITHUB_REPOSITORY = 'myorg/myrepo';
    try {
      const pr = makeFullPr();
      const exec = (_cmd, args, _opts) => {
        if (args.includes('graphql'))
          return JSON.stringify({ data: { repository: { pullRequest: pr } } });
        if (args.includes('diff')) throw new Error('gh: diff failed');
        throw new Error(`Unexpected: ${args.join(' ')}`);
      };
      assert.throws(() => fetchPrData(42, exec), /diff failed/);
    } finally {
      if (original === undefined) delete process.env.GITHUB_REPOSITORY;
      else process.env.GITHUB_REPOSITORY = original;
    }
  });

  it('returns mapped PR data on success', () => {
    const pr = makeFullPr({ number: 99 });
    const exec = makeExec(
      { data: { repository: { pullRequest: pr } } },
      'the diff',
    );
    const result = fetchPrData(99, exec);
    assert.strictEqual(result.prContext.number, 99);
    assert.strictEqual(result.prContext.diff, 'the diff');
    assert.deepEqual(result.reviews, []);
    assert.deepEqual(result.commits, []);
  });

  it('uses GITHUB_REPOSITORY env var instead of gh repo view', () => {
    const original = process.env.GITHUB_REPOSITORY;
    process.env.GITHUB_REPOSITORY = 'myorg/myrepo';
    try {
      const pr = makeFullPr();
      const allCalls = [];
      const exec = (_cmd, args, _opts) => {
        allCalls.push([...args]);
        if (args.includes('graphql'))
          return JSON.stringify({ data: { repository: { pullRequest: pr } } });
        if (args.includes('diff')) return '';
        throw new Error(`Unexpected: ${args.join(' ')}`);
      };
      fetchPrData(42, exec);
      assert.ok(
        !allCalls.some((args) => args.includes('view')),
        'should not call gh repo view when GITHUB_REPOSITORY is set',
      );
    } finally {
      if (original === undefined) delete process.env.GITHUB_REPOSITORY;
      else process.env.GITHUB_REPOSITORY = original;
    }
  });
});
