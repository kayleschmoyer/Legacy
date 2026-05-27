import { createPR } from './create-pr';

jest.mock('../github-api', () => ({
  githubRest: jest.fn(),
}));

jest.mock('../auth', () => ({
  getRepoRoot: jest.fn(() => '/tmp/repo-root-that-does-not-exist'),
  getRepoOwnerName: jest.fn(),
  isLambda: jest.fn(),
}));

const { githubRest: mockGithubRest } = jest.requireMock('../github-api') as {
  githubRest: jest.Mock;
};
const { getRepoOwnerName: mockGetRepoOwnerName, isLambda: mockIsLambda } =
  jest.requireMock('../auth') as {
    getRepoOwnerName: jest.Mock;
    isLambda: jest.Mock;
  };

describe('createPR Lambda behavior (LS-4881)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRepoOwnerName.mockResolvedValue({
      owner: 'bkrupa',
      name: 'legacy-sports',
    });
    mockGithubRest.mockResolvedValue({
      number: 42,
      html_url: 'https://example/pr/42',
    });
  });

  describe('when running in Lambda', () => {
    beforeEach(() => {
      mockIsLambda.mockReturnValue(true);
    });

    it('does not error when worktreePath does not exist on the server filesystem', async () => {
      const result = await createPR({
        title: 'LS-4881 fix(mcp): test',
        body: 'body',
        // Forward-slash absolute path so isAbsolute() returns true on both Windows and Linux CI.
        worktreePath: '/tmp/does-not-exist-LS4881-worktree',
        head: 'claude/some-branch',
      });

      expect(result.isError).toBeFalsy();
      expect(mockGithubRest).toHaveBeenCalled();
    });

    it('still rejects non-absolute worktreePath', async () => {
      const result = await createPR({
        title: 'LS-4881 fix(mcp): test',
        body: 'body',
        worktreePath: 'relative/path',
        head: 'claude/some-branch',
      });

      expect(result.isError).toBe(true);
      const text = result.content?.[0];
      expect(text && 'text' in text ? text.text : '').toMatch(/absolute path/);
    });

    it('returns an actionable error when `head` is not provided', async () => {
      const result = await createPR({
        title: 'LS-4881 fix(mcp): test',
        body: 'body',
        // Forward-slash absolute path so isAbsolute() returns true on both Windows and Linux CI.
        worktreePath: '/tmp/does-not-exist-LS4881-worktree',
      });

      expect(result.isError).toBe(true);
      const text = result.content?.[0];
      const message = text && 'text' in text ? text.text : '';
      expect(message).toMatch(/`head` must be passed explicitly/);
      expect(message).toMatch(/Lambda/);
      expect(mockGithubRest).not.toHaveBeenCalled();
    });

    it('does not spawn git for branch resolution when `head` is provided', async () => {
      const result = await createPR({
        title: 'LS-4881 fix(mcp): test',
        body: 'body',
        head: 'claude/some-branch',
      });

      expect(result.isError).toBeFalsy();
      expect(mockGithubRest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/repos/bkrupa/legacy-sports/pulls',
          body: expect.objectContaining({
            head: 'bkrupa:claude/some-branch',
            base: 'main',
          }),
        }),
      );
    });
  });

  describe('when not running in Lambda', () => {
    beforeEach(() => {
      mockIsLambda.mockReturnValue(false);
    });

    it('still validates worktreePath existence', async () => {
      const result = await createPR({
        title: 'LS-4881 fix(mcp): test',
        body: 'body',
        worktreePath: '/path/that/does/not/exist/anywhere/realistic',
        head: 'claude/some-branch',
      });

      expect(result.isError).toBe(true);
      const text = result.content?.[0];
      expect(text && 'text' in text ? text.text : '').toMatch(/does not exist/);
    });
  });
});
