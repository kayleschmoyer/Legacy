jest.mock('../github-api', () => ({
  githubGraphQL: jest.fn(),
  githubRest: jest.fn(),
}));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { githubGraphQL, githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';
import { listReviews, __test } from './list-reviews';

const mockedGraphQL = githubGraphQL as jest.MockedFunction<
  typeof githubGraphQL
>;
const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

function parse(result: { content: { text: string }[] }): unknown {
  return JSON.parse(result.content[0].text);
}

function reviewNode(
  overrides: Partial<{
    login: string;
    state: string;
    submittedAt: string;
    body: string;
    totalCount: number;
  }> = {},
) {
  return {
    author: { login: overrides.login ?? 'alice' },
    state: overrides.state ?? 'APPROVED',
    submittedAt: overrides.submittedAt ?? '2026-01-01T00:00:00Z',
    body: overrides.body ?? 'lgtm',
    comments: { totalCount: overrides.totalCount ?? 0 },
  };
}

function reviewsNodes(
  nodes: ReturnType<typeof reviewNode>[],
  totalCount: number = nodes.length,
) {
  return { nodes, totalCount };
}

describe('listReviews (LS-8166)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRepo.mockResolvedValue({ owner: 'o', name: 'r' });
  });

  describe('buildBatchQuery', () => {
    it('emits one aliased sub-query per PR number', () => {
      const query = __test.buildBatchQuery([1, 2, 3]);
      expect(query).toContain('pr1: pullRequest(number: 1)');
      expect(query).toContain('pr2: pullRequest(number: 2)');
      expect(query).toContain('pr3: pullRequest(number: 3)');
    });
  });

  describe('batch mode', () => {
    it('returns reviews keyed by PR number from a single GraphQL call', async () => {
      mockedGraphQL.mockResolvedValue({
        data: {
          repository: {
            pr10: {
              number: 10,
              reviews: reviewsNodes([reviewNode({ login: 'a' })]),
            },
            pr11: {
              number: 11,
              reviews: reviewsNodes([
                reviewNode({ login: 'b', state: 'COMMENTED', totalCount: 3 }),
              ]),
            },
          },
        },
      });

      const result = await listReviews({ prs: [10, 11] });
      const parsed = parse(result) as {
        reviews: Record<string, unknown[]>;
        missing: number[];
        truncated: number[];
      };

      expect(mockedGraphQL).toHaveBeenCalledTimes(1);
      expect(mockedRest).not.toHaveBeenCalled();
      expect(parsed.missing).toEqual([]);
      expect(parsed.truncated).toEqual([]);
      expect(parsed.reviews[10]).toEqual([
        {
          reviewer: 'a',
          state: 'APPROVED',
          submittedAt: '2026-01-01T00:00:00Z',
          bodyLength: 4,
          commentCount: 0,
        },
      ]);
      expect(parsed.reviews[11]).toEqual([
        {
          reviewer: 'b',
          state: 'COMMENTED',
          submittedAt: '2026-01-01T00:00:00Z',
          bodyLength: 4,
          commentCount: 3,
        },
      ]);
    });

    it('uses exactly one GraphQL call regardless of batch size', async () => {
      const prs = Array.from({ length: 50 }, (_, i) => i + 1);
      const nodes: Record<string, unknown> = {};
      for (const n of prs) {
        nodes[`pr${n}`] = { number: n, reviews: reviewsNodes([]) };
      }
      mockedGraphQL.mockResolvedValue({ data: { repository: nodes } });

      await listReviews({ prs });

      expect(mockedGraphQL).toHaveBeenCalledTimes(1);
    });

    it('reports null PRs in `missing` without failing the call', async () => {
      mockedGraphQL.mockResolvedValue({
        data: {
          repository: {
            pr10: { number: 10, reviews: reviewsNodes([reviewNode()]) },
            pr99: null,
          },
        },
      });

      const parsed = parse(await listReviews({ prs: [10, 99] })) as {
        reviews: Record<string, unknown[]>;
        missing: number[];
      };

      expect(parsed.missing).toEqual([99]);
      expect(parsed.reviews[10]).toHaveLength(1);
      expect(parsed.reviews[99]).toBeUndefined();
    });

    it('applies reviewer filter per PR', async () => {
      mockedGraphQL.mockResolvedValue({
        data: {
          repository: {
            pr1: {
              number: 1,
              reviews: reviewsNodes([
                reviewNode({ login: 'alice' }),
                reviewNode({ login: 'bob' }),
              ]),
            },
          },
        },
      });

      const parsed = parse(
        await listReviews({ prs: [1], reviewer: 'ALICE' }),
      ) as { reviews: Record<string, { reviewer: string }[]> };

      expect(parsed.reviews[1]).toHaveLength(1);
      expect(parsed.reviews[1][0].reviewer).toBe('alice');
    });

    it('latestOnly keeps the most recent review per reviewer (default true)', async () => {
      mockedGraphQL.mockResolvedValue({
        data: {
          repository: {
            pr1: {
              number: 1,
              reviews: reviewsNodes([
                reviewNode({
                  login: 'a',
                  submittedAt: '2026-01-01T00:00:00Z',
                  state: 'COMMENTED',
                }),
                reviewNode({
                  login: 'a',
                  submittedAt: '2026-02-01T00:00:00Z',
                  state: 'APPROVED',
                }),
              ]),
            },
          },
        },
      });

      const parsed = parse(await listReviews({ prs: [1] })) as {
        reviews: Record<string, { state: string }[]>;
      };
      expect(parsed.reviews[1]).toHaveLength(1);
      expect(parsed.reviews[1][0].state).toBe('APPROVED');
    });

    it('latestOnly=false returns all reviews', async () => {
      mockedGraphQL.mockResolvedValue({
        data: {
          repository: {
            pr1: {
              number: 1,
              reviews: reviewsNodes([
                reviewNode({
                  login: 'a',
                  submittedAt: '2026-01-01T00:00:00Z',
                }),
                reviewNode({
                  login: 'a',
                  submittedAt: '2026-02-01T00:00:00Z',
                }),
              ]),
            },
          },
        },
      });

      const parsed = parse(
        await listReviews({ prs: [1], latestOnly: false }),
      ) as { reviews: Record<string, unknown[]> };
      expect(parsed.reviews[1]).toHaveLength(2);
    });

    it('reports PRs whose review count exceeds the per-PR cap in `truncated`', async () => {
      mockedGraphQL.mockResolvedValue({
        data: {
          repository: {
            pr1: {
              number: 1,
              reviews: reviewsNodes([reviewNode()], 150),
            },
            pr2: {
              number: 2,
              reviews: reviewsNodes([reviewNode()], 5),
            },
          },
        },
      });

      const parsed = parse(await listReviews({ prs: [1, 2] })) as {
        truncated: number[];
      };
      expect(parsed.truncated).toEqual([1]);
    });

    it('returns an error when prs is empty', async () => {
      const result = await listReviews({ prs: [] });
      expect(result.isError).toBe(true);
      expect(mockedGraphQL).not.toHaveBeenCalled();
    });
  });

  describe('single-PR mode (preserved)', () => {
    it('uses REST and returns the existing shape', async () => {
      mockedRest
        .mockResolvedValueOnce([
          {
            id: 1,
            user: { login: 'alice' },
            state: 'APPROVED',
            submitted_at: '2026-01-01T00:00:00Z',
            body: 'lgtm',
          },
        ] as unknown as never)
        .mockResolvedValueOnce([] as unknown as never);

      const parsed = parse(await listReviews({ number: 42 })) as {
        prNumber: number;
        total: number;
        reviews: { reviewer: string; commentCount: number }[];
      };

      expect(mockedGraphQL).not.toHaveBeenCalled();
      expect(parsed.prNumber).toBe(42);
      expect(parsed.total).toBe(1);
      expect(parsed.reviews[0]).toEqual({
        reviewer: 'alice',
        state: 'APPROVED',
        submittedAt: '2026-01-01T00:00:00Z',
        bodyLength: 4,
        commentCount: 0,
      });
    });

    it('errors when neither `number` nor `prs` is provided', async () => {
      const result = await listReviews({});
      expect(result.isError).toBe(true);
    });
  });
});
