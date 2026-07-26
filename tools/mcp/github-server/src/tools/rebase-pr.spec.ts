jest.mock('../github-api', () => ({
  githubGraphQL: jest.fn(),
  githubRest: jest.fn(),
}));

jest.mock('../auth', () => ({
  getRepoRoot: jest.fn(() => '/repo'),
  getRepoOwnerName: jest.fn(),
  isLambda: jest.fn(),
}));

jest.mock('../jobs', () => ({
  runWithSyncBudget: jest.fn(),
  withCheckoutLock: jest.fn((fn: () => unknown) => fn()),
}));

import { githubGraphQL, githubRest } from '../github-api';
import { getRepoOwnerName, isLambda } from '../auth';
import { runWithSyncBudget } from '../jobs';
import { rebasePR, rebasePRViaApi } from './rebase-pr';

const mockedGraphQL = githubGraphQL as jest.MockedFunction<
  typeof githubGraphQL
>;
const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockedIsLambda = isLambda as jest.MockedFunction<typeof isLambda>;
const mockedGetRepoOwnerName = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;
const mockedRunWithSyncBudget = runWithSyncBudget as jest.MockedFunction<
  typeof runWithSyncBudget
>;

function prResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      repository: {
        pullRequest: {
          headRefName: 'claude/fix-thing',
          baseRefName: 'main',
          headRepository: { owner: { login: 'bkrupa' }, name: 'legacy-sports' },
          baseRepository: { owner: { login: 'bkrupa' }, name: 'legacy-sports' },
          ...overrides,
        },
      },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetRepoOwnerName.mockResolvedValue({
    owner: 'bkrupa',
    name: 'legacy-sports',
  });
});

describe('rebasePRViaApi — Lambda rebase path (LS-7753)', () => {
  it('never touches git — updates the branch via the GitHub REST update-branch endpoint', async () => {
    mockedGraphQL.mockResolvedValue(prResponse());
    mockedRest.mockResolvedValue(undefined);

    const result = await rebasePRViaApi({ number: 4812 });

    expect(result.isError).toBeUndefined();
    expect(mockedRest).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/repos/bkrupa/legacy-sports/pulls/4812/update-branch',
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.success).toBe(true);
    expect(body.number).toBe(4812);
    expect(body.branch).toBe('claude/fix-thing');
    expect(body.base).toBe('main');
  });

  it('rejects cross-repo (fork) PRs before calling the update-branch endpoint', async () => {
    mockedGraphQL.mockResolvedValue(
      prResponse({
        headRepository: {
          owner: { login: 'someforker' },
          name: 'legacy-sports',
        },
      }),
    );

    const result = await rebasePRViaApi({ number: 99 });

    expect(result.isError).toBe(true);
    expect(mockedRest).not.toHaveBeenCalled();
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toMatch(/Cross-repo \(fork\) PRs are not supported/);
  });

  it('surfaces a conflict-shaped error when the API reports a 422', async () => {
    mockedGraphQL.mockResolvedValue(prResponse());
    mockedRest.mockRejectedValue(
      new Error(
        'GitHub API PUT /repos/bkrupa/legacy-sports/pulls/4812/update-branch failed (422): {"message":"Merge conflict"}',
      ),
    );

    const result = await rebasePRViaApi({ number: 4812 });

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Rebase conflicts detected/);
  });

  it('surfaces a generic failure message for non-conflict errors', async () => {
    mockedGraphQL.mockResolvedValue(prResponse());
    mockedRest.mockRejectedValue(new Error('GitHub API rate limit exceeded.'));

    const result = await rebasePRViaApi({ number: 4812 });

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toMatch(/^Failed to rebase PR #4812:/);
  });

  it('does not misclassify a non-conflict failure as a conflict just because the PR number is 422', async () => {
    mockedGraphQL.mockResolvedValue(prResponse());
    mockedRest.mockRejectedValue(
      new Error(
        'GitHub API PUT /repos/bkrupa/legacy-sports/pulls/422/update-branch failed (500): {"message":"Internal Server Error"}',
      ),
    );

    const result = await rebasePRViaApi({ number: 422 });

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toMatch(/^Failed to rebase PR #422:/);
    expect(body.error).not.toMatch(/Rebase conflicts detected/);
  });
});

describe('rebasePR — routing', () => {
  it('routes to rebasePRViaApi (never runWithSyncBudget/git) when isLambda() is true', async () => {
    mockedIsLambda.mockReturnValue(true);
    mockedGraphQL.mockResolvedValue(prResponse());
    mockedRest.mockResolvedValue(undefined);

    const result = await rebasePR({ number: 4812 });

    expect(result.isError).toBeUndefined();
    expect(mockedRunWithSyncBudget).not.toHaveBeenCalled();
    expect(mockedRest).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/repos/bkrupa/legacy-sports/pulls/4812/update-branch',
    });
  });

  it('routes to the sync-budget git worker when isLambda() is false', async () => {
    mockedIsLambda.mockReturnValue(false);
    mockedRunWithSyncBudget.mockResolvedValue({
      content: [{ type: 'text', text: '{}' }],
    });

    await rebasePR({ number: 4812 });

    expect(mockedRunWithSyncBudget).toHaveBeenCalledWith(
      'rebase-pr #4812',
      expect.any(Function),
    );
    expect(mockedRest).not.toHaveBeenCalled();
  });
});
