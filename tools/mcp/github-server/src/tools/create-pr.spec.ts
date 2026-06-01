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

    it('ignores non-absolute worktreePath when head is provided (LS-5217)', async () => {
      // When head is explicitly provided, worktreePath is skipped entirely —
      // no path validation, no filesystem check. This is the fix for Windows
      // D:\... paths that fail Unix isAbsolute() even though head is already known.
      const result = await createPR({
        title: 'LS-5217 fix(mcp): test',
        body: 'body',
        worktreePath: 'relative/path',
        head: 'claude/some-branch',
      });

      expect(result.isError).toBeFalsy();
      expect(mockGithubRest).toHaveBeenCalled();
    });

    it('still rejects non-absolute worktreePath when head is not provided', async () => {
      const result = await createPR({
        title: 'LS-4881 fix(mcp): test',
        body: 'body',
        worktreePath: 'relative/path',
      });

      // In Lambda without head, the worktreePath validation runs (non-absolute → error).
      // This checks that we didn't accidentally remove the validation entirely.
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

    it('ignores worktreePath existence when head is provided (LS-5217)', async () => {
      // head takes precedence — worktreePath is skipped entirely regardless of whether
      // the path exists, so this should succeed rather than return a path error.
      const result = await createPR({
        title: 'LS-5217 fix(mcp): test',
        body: 'body',
        worktreePath: '/path/that/does/not/exist/anywhere/realistic',
        head: 'claude/some-branch',
      });

      expect(result.isError).toBeFalsy();
      expect(mockGithubRest).toHaveBeenCalled();
    });

    it('still validates worktreePath existence when head is not provided', async () => {
      const result = await createPR({
        title: 'LS-4881 fix(mcp): test',
        body: 'body',
        worktreePath: '/path/that/does/not/exist/anywhere/realistic',
      });

      expect(result.isError).toBe(true);
      const text = result.content?.[0];
      expect(text && 'text' in text ? text.text : '').toMatch(/does not exist/);
    });
  });
});
