import { bulkEdit } from './bulk-edit';

jest.mock('../github-api', () => ({
  githubRest: jest.fn(),
  githubGraphQL: jest.fn(),
}));

jest.mock('../auth', () => ({
  getRepoOwnerName: jest.fn(),
}));

const { githubRest: mockGithubRest } = jest.requireMock('../github-api') as {
  githubRest: jest.Mock;
};
const { getRepoOwnerName: mockGetRepoOwnerName } = jest.requireMock(
  '../auth',
) as { getRepoOwnerName: jest.Mock };

beforeEach(() => {
  jest.resetAllMocks();
  mockGetRepoOwnerName.mockResolvedValue({ owner: 'o', name: 'r' });
});

describe('bulkEdit', () => {
  it('fails the item when neither title nor body is provided', async () => {
    const result = await bulkEdit({ items: [{ number: 1 }] });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.success).toBe(false);
    expect(body.failed[0].error).toMatch(/title or body/);
  });

  it('PATCHes only the provided fields and returns the updated PR shape', async () => {
    mockGithubRest.mockResolvedValueOnce({
      number: 1,
      title: 'new',
      body: null,
      html_url: 'u1',
    });

    const result = await bulkEdit({
      items: [{ number: 1, title: 'new' }],
    });

    expect(result.isError).toBeUndefined();
    expect(mockGithubRest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PATCH',
        path: '/repos/o/r/pulls/1',
        body: { title: 'new' },
      }),
    );
    const body = JSON.parse(result.content[0].text);
    expect(body.succeeded[0]).toMatchObject({
      index: 0,
      number: 1,
      title: 'new',
      url: 'u1',
    });
  });
});
