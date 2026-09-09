jest.mock('../github-api', () => ({
  githubRest: jest.fn(),
}));

jest.mock('../auth', () => ({
  getRepoOwnerName: jest.fn(),
}));

import { getRepoInfo } from './get-repo-info';

const { githubRest: mockGithubRest } = jest.requireMock<{
  githubRest: jest.Mock;
}>('../github-api');
const { getRepoOwnerName: mockGetRepoOwnerName } = jest.requireMock<{
  getRepoOwnerName: jest.Mock;
}>('../auth');

function repoResponse(overrides: Record<string, unknown> = {}) {
  return {
    owner: { login: 'bkrupa' },
    name: 'legacy-sports',
    default_branch: 'main',
    html_url: 'https://github.com/bkrupa/legacy-sports',
    ...overrides,
  };
}

function parse(text: string) {
  return JSON.parse(text) as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRepoOwnerName.mockResolvedValue({
    owner: 'bkrupa',
    name: 'legacy-sports',
  });
});

describe('getRepoInfo default behavior', () => {
  it('returns exactly the same fields as before when include is omitted', async () => {
    mockGithubRest.mockResolvedValueOnce(repoResponse());

    const result = await getRepoInfo();

    expect(result.isError).toBeFalsy();
    expect(mockGithubRest).toHaveBeenCalledTimes(1);
    expect(mockGithubRest).toHaveBeenCalledWith({
      method: 'GET',
      path: '/repos/bkrupa/legacy-sports',
    });
    expect(parse(result.content[0].text)).toEqual({
      owner: 'bkrupa',
      name: 'legacy-sports',
      defaultBranch: 'main',
      url: 'https://github.com/bkrupa/legacy-sports',
    });
  });

  it('returns exactly the same fields when include is an empty array', async () => {
    mockGithubRest.mockResolvedValueOnce(repoResponse());

    const result = await getRepoInfo({ include: [] });

    expect(mockGithubRest).toHaveBeenCalledTimes(1);
    expect(parse(result.content[0].text)).toEqual({
      owner: 'bkrupa',
      name: 'legacy-sports',
      defaultBranch: 'main',
      url: 'https://github.com/bkrupa/legacy-sports',
    });
  });

  it('returns an error result when the repo REST call throws', async () => {
    mockGithubRest.mockRejectedValueOnce(new Error('boom'));
    const result = await getRepoInfo();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('boom');
  });
});

describe('getRepoInfo include: rulesets', () => {
  it('fetches rulesets and includes a summarized array', async () => {
    mockGithubRest.mockResolvedValueOnce(repoResponse()).mockResolvedValueOnce([
      {
        id: 1,
        name: 'main-protection',
        target: 'branch',
        source_type: 'Repository',
        enforcement: 'active',
      },
    ]);

    const result = await getRepoInfo({ include: ['rulesets'] });

    expect(result.isError).toBeFalsy();
    expect(mockGithubRest).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      path: '/repos/bkrupa/legacy-sports/rulesets',
      query: { per_page: '100' },
    });
    const body = parse(result.content[0].text);
    expect(body.rulesets).toEqual([
      {
        id: 1,
        name: 'main-protection',
        target: 'branch',
        sourceType: 'Repository',
        enforcement: 'active',
      },
    ]);
    expect(body).not.toHaveProperty('actionsPermissions');
  });

  it('forwards includesParents alongside per_page in the query', async () => {
    mockGithubRest
      .mockResolvedValueOnce(repoResponse())
      .mockResolvedValueOnce([]);

    await getRepoInfo({ include: ['rulesets'], includesParents: true });

    expect(mockGithubRest).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      path: '/repos/bkrupa/legacy-sports/rulesets',
      query: { per_page: '100', includes_parents: 'true' },
    });
  });

  it('omits includes_parents when includesParents is not provided', async () => {
    mockGithubRest
      .mockResolvedValueOnce(repoResponse())
      .mockResolvedValueOnce([]);

    await getRepoInfo({ include: ['rulesets'] });

    expect(mockGithubRest).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      path: '/repos/bkrupa/legacy-sports/rulesets',
      query: { per_page: '100' },
    });
  });
});

describe('getRepoInfo include: actions_permissions', () => {
  it('fetches workflow permissions and includes them', async () => {
    mockGithubRest.mockResolvedValueOnce(repoResponse()).mockResolvedValueOnce({
      default_workflow_permissions: 'read',
      can_approve_pull_request_reviews: false,
    });

    const result = await getRepoInfo({ include: ['actions_permissions'] });

    expect(result.isError).toBeFalsy();
    expect(mockGithubRest).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      path: '/repos/bkrupa/legacy-sports/actions/permissions/workflow',
    });
    const body = parse(result.content[0].text);
    expect(body.actionsPermissions).toEqual({
      defaultWorkflowPermissions: 'read',
      canApprovePullRequestReviews: false,
    });
    expect(body).not.toHaveProperty('rulesets');
  });
});

describe('getRepoInfo include: both', () => {
  it('fetches and includes both rulesets and actions permissions', async () => {
    mockGithubRest
      .mockResolvedValueOnce(repoResponse())
      .mockResolvedValueOnce([
        {
          id: 2,
          name: 'protect-main',
          target: 'branch',
          source_type: 'Repository',
          enforcement: 'active',
        },
      ])
      .mockResolvedValueOnce({
        default_workflow_permissions: 'write',
        can_approve_pull_request_reviews: true,
      });

    const result = await getRepoInfo({
      include: ['rulesets', 'actions_permissions'],
    });

    expect(result.isError).toBeFalsy();
    expect(mockGithubRest).toHaveBeenCalledTimes(3);
    const body = parse(result.content[0].text);
    expect(body.rulesets).toHaveLength(1);
    expect(body.actionsPermissions).toEqual({
      defaultWorkflowPermissions: 'write',
      canApprovePullRequestReviews: true,
    });
  });

  it('returns an error result when the rulesets call throws', async () => {
    mockGithubRest
      .mockResolvedValueOnce(repoResponse())
      .mockRejectedValueOnce(new Error('rulesets boom'));

    const result = await getRepoInfo({ include: ['rulesets'] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('rulesets boom');
  });
});
