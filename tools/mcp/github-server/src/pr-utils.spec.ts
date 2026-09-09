import {
  resolveHeadShaFromPrNumber,
  resolvePullRequestNodeId,
} from './pr-utils';

jest.mock('./auth', () => ({
  getRepoOwnerName: jest.fn(),
}));

jest.mock('./github-api', () => ({
  githubGraphQL: jest.fn(),
}));

const { getRepoOwnerName: mockGetRepoOwnerName } = jest.requireMock<{
  getRepoOwnerName: jest.Mock;
}>('./auth');
const { githubGraphQL: mockGithubGraphQL } = jest.requireMock<{
  githubGraphQL: jest.Mock;
}>('./github-api');

beforeEach(() => {
  jest.resetAllMocks();
  mockGetRepoOwnerName.mockResolvedValue({
    owner: 'bkrupa',
    name: 'legacy-sports',
  });
});

describe('resolvePullRequestNodeId', () => {
  it('returns the PR node id when the query resolves', async () => {
    mockGithubGraphQL.mockResolvedValueOnce({
      data: { repository: { pullRequest: { id: 'PR_123' } } },
    });

    await expect(resolvePullRequestNodeId(4612)).resolves.toBe('PR_123');
  });

  it('returns null when the repository resolves but the PR does not', async () => {
    mockGithubGraphQL.mockResolvedValueOnce({
      data: { repository: { pullRequest: null } },
    });

    await expect(resolvePullRequestNodeId(4612)).resolves.toBeNull();
  });

  it('surfaces the underlying GraphQL error instead of a raw TypeError when repository resolves to null', async () => {
    // Mirrors the LS-5236 repro: `data.repository` itself resolves to null
    // (e.g. a permission-gated per-field error attached as `warnings`), and
    // the old code dereferenced `.pullRequest` off it directly, throwing
    // "Cannot read properties of null (reading 'pullRequest')".
    mockGithubGraphQL.mockResolvedValueOnce({
      data: { repository: null },
      warnings: [
        {
          message: 'Resource not accessible by integration',
          type: 'FORBIDDEN',
          path: ['repository'],
        },
      ],
    });

    await expect(resolvePullRequestNodeId(4612)).rejects.toThrow(
      /Resource not accessible by integration/,
    );
  });

  it('surfaces a clear message even with no warnings attached', async () => {
    mockGithubGraphQL.mockResolvedValueOnce({ data: { repository: null } });

    await expect(resolvePullRequestNodeId(4612)).rejects.toThrow(
      /could not resolve the repository for PR #4612/,
    );
  });
});

describe('resolveHeadShaFromPrNumber', () => {
  it('returns the head commit SHA when the query resolves', async () => {
    mockGithubGraphQL.mockResolvedValueOnce({
      data: {
        repository: {
          pullRequest: { commits: { nodes: [{ commit: { oid: 'abc123' } }] } },
        },
      },
    });

    await expect(resolveHeadShaFromPrNumber(4612)).resolves.toBe('abc123');
  });

  it('returns null when the PR has no commits', async () => {
    mockGithubGraphQL.mockResolvedValueOnce({
      data: {
        repository: { pullRequest: { commits: { nodes: [] } } },
      },
    });

    await expect(resolveHeadShaFromPrNumber(4612)).resolves.toBeNull();
  });

  it('returns null when the repository resolves but the PR does not', async () => {
    mockGithubGraphQL.mockResolvedValueOnce({
      data: { repository: { pullRequest: null } },
    });

    await expect(resolveHeadShaFromPrNumber(4612)).resolves.toBeNull();
  });

  it('surfaces the underlying GraphQL error instead of a raw TypeError when repository resolves to null', async () => {
    // Mirrors the LS-5236/LS-9929 repro: `data.repository` itself resolves to
    // null (e.g. a permission-gated per-field error attached as `warnings`),
    // and the old code dereferenced `.pullRequest` off it directly, throwing
    // "Cannot read properties of null (reading 'pullRequest')".
    mockGithubGraphQL.mockResolvedValueOnce({
      data: { repository: null },
      warnings: [
        {
          message: 'Resource not accessible by integration',
          type: 'FORBIDDEN',
          path: ['repository'],
        },
      ],
    });

    await expect(resolveHeadShaFromPrNumber(4612)).rejects.toThrow(
      /Resource not accessible by integration/,
    );
  });

  it('surfaces a clear message even with no warnings attached', async () => {
    mockGithubGraphQL.mockResolvedValueOnce({ data: { repository: null } });

    await expect(resolveHeadShaFromPrNumber(4612)).rejects.toThrow(
      /could not resolve the repository for PR #4612/,
    );
  });
});
