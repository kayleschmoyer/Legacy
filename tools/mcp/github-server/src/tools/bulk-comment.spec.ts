import { bulkComment } from './bulk-comment';

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

describe('bulkComment', () => {
  it('rejects empty input', async () => {
    const result = await bulkComment({ items: [] });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/empty/i);
  });

  it('rejects over-limit batches', async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      number: i + 1,
      body: 'hi',
    }));
    const result = await bulkComment({ items });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toContain('51');
  });

  it('returns per-item success entries on the happy path', async () => {
    mockGithubRest
      .mockResolvedValueOnce({ id: 100, html_url: 'u100', body: 'a' })
      .mockResolvedValueOnce({ id: 101, html_url: 'u101', body: 'b' });

    const result = await bulkComment({
      items: [
        { number: 1, body: 'a' },
        { number: 2, body: 'b' },
      ],
    });

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body).toMatchObject({
      success: true,
      total: 2,
      failed: [],
    });
    expect(body.succeeded).toHaveLength(2);
    expect(
      body.succeeded.map((s: { number: number }) => s.number).sort(),
    ).toEqual([1, 2]);
  });

  it('captures per-item failures without aborting the batch', async () => {
    mockGithubRest
      .mockResolvedValueOnce({ id: 100, html_url: 'u100', body: 'ok' })
      .mockRejectedValueOnce(new Error('GitHub 404'));

    const result = await bulkComment({
      items: [
        { number: 1, body: 'a' },
        { number: 999, body: 'b' },
      ],
    });

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.success).toBe(false);
    expect(body.total).toBe(2);
    expect(body.succeeded).toHaveLength(1);
    expect(body.failed).toEqual([{ index: 1, key: 999, error: 'GitHub 404' }]);
  });
});
