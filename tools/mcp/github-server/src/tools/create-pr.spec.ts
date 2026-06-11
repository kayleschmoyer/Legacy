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

    it('accepts a Windows drive-letter worktreePath without the "absolute path" error (LS-7694)', async () => {
      // path.isAbsolute() uses POSIX rules on a Linux server and rejects D:\... paths.
      // The tool must recognize drive-letter paths as absolute and fall through to the
      // actionable "head must be passed explicitly" Lambda guard instead.
      const result = await createPR({
        title: 'LS-7694 fix(mcp): test',
        body: 'body',
        worktreePath:
          'D:\\code\\legacy-sports\\.claude\\worktrees\\reverent-hoover',
      });

      expect(result.isError).toBe(true);
      const text = result.content?.[0];
      const message = text && 'text' in text ? text.text : '';
      expect(message).not.toMatch(/must be an absolute path/);
      expect(message).toMatch(/`head` must be passed explicitly/);
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

describe('createPR jira-link marker emission (LS-7895)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsLambda.mockReturnValue(true);
    mockGetRepoOwnerName.mockResolvedValue({
      owner: 'bkrupa',
      name: 'legacy-sports',
    });
    mockGithubRest.mockResolvedValue({
      number: 42,
      html_url: 'https://example/pr/42',
    });
  });

  function sentBody(): string {
    return mockGithubRest.mock.calls[0][0].body.body as string;
  }

  it('derives primary from the title and prepends the marker', async () => {
    const result = await createPR({
      title: 'LS-7895 feat(mcp): emit jira-link marker',
      body: '## Summary\n\n- stuff',
      head: 'claude/some-branch',
    });

    expect(result.isError).toBeFalsy();
    expect(sentBody()).toContain('<!-- jira-link\nprimary: LS-7895\n-->');
    expect(sentBody()).toContain(
      '**Jira:** [LS-7895](https://bkrupa.atlassian.net/browse/LS-7895)',
    );
  });

  it('explicit jiraPrimary overrides the title-derived key', async () => {
    await createPR({
      title: 'LS-1111 feat: something',
      body: 'body',
      head: 'claude/some-branch',
      jiraPrimary: 'LS-2222',
    });

    expect(sentBody()).toContain('primary: LS-2222');
    expect(sentBody()).not.toContain('primary: LS-1111');
  });

  it('falls back to primary: none when neither param nor title carries a key', async () => {
    await createPR({
      title: 'chore(deps): bump lodash',
      body: 'body',
      head: 'dependabot/npm_and_yarn/lodash-4.17.21',
    });

    expect(sentBody()).toContain('primary: none');
    expect(sentBody()).not.toContain('**Jira:**');
  });

  it('includes related keys without transition semantics', async () => {
    await createPR({
      title: 'LS-1 feat: something',
      body: 'body',
      head: 'claude/some-branch',
      jiraRelated: 'LS-2, LS-3',
    });

    expect(sentBody()).toContain('related: LS-2, LS-3');
  });

  it('leaves a body that already carries a marker untouched', async () => {
    const body = '<!-- jira-link\nprimary: LS-5\n-->\n\nexisting body';
    await createPR({
      title: 'LS-6 feat: something',
      body,
      head: 'claude/some-branch',
    });

    expect(sentBody()).toBe(body);
  });

  it('rejects an invalid jiraPrimary before calling GitHub', async () => {
    const result = await createPR({
      title: 'LS-1 feat: something',
      body: 'body',
      head: 'claude/some-branch',
      jiraPrimary: 'not-a-key',
    });

    expect(result.isError).toBe(true);
    const text = result.content?.[0];
    expect(text && 'text' in text ? text.text : '').toMatch(
      /Invalid jiraPrimary/,
    );
    expect(mockGithubRest).not.toHaveBeenCalled();
  });

  it('rejects invalid related keys before calling GitHub', async () => {
    const result = await createPR({
      title: 'LS-1 feat: something',
      body: 'body',
      head: 'claude/some-branch',
      jiraRelated: 'LS-2, garbage',
    });

    expect(result.isError).toBe(true);
    expect(mockGithubRest).not.toHaveBeenCalled();
  });
});
