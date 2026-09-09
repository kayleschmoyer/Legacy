import { openPR } from './open-pr';

jest.mock('../github-api', () => ({
  githubRest: jest.fn(),
  githubGraphQL: jest.fn(),
}));

jest.mock('../auth', () => ({
  getRepoRoot: jest.fn(() => '/tmp/test-repo-root'),
  getRepoOwnerName: jest.fn(),
  getAuthorToken: jest.fn(),
  isLambda: jest.fn(),
}));

jest.mock('node:child_process', () => ({
  execFile: jest.fn(),
}));

jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

const { githubRest: mockGithubRest, githubGraphQL: mockGithubGraphQL } =
  jest.requireMock<{
    githubRest: jest.Mock;
    githubGraphQL: jest.Mock;
  }>('../github-api');
const {
  getRepoOwnerName: mockGetRepoOwnerName,
  getAuthorToken: mockGetAuthorToken,
  isLambda: mockIsLambda,
  getRepoRoot: mockGetRepoRoot,
} = jest.requireMock<{
  getRepoOwnerName: jest.Mock;
  getAuthorToken: jest.Mock;
  isLambda: jest.Mock;
  getRepoRoot: jest.Mock;
}>('../auth');
const { execFile: mockExecFile } = jest.requireMock<{
  execFile: jest.Mock;
}>('node:child_process');
const { existsSync: mockExistsSync, readFileSync: mockReadFileSync } =
  jest.requireMock<{
    existsSync: jest.Mock;
    readFileSync: jest.Mock;
  }>('node:fs');

type ExecFileCallback = (
  error: Error | null,
  stdout: string,
  stderr: string,
) => void;

function makeExecFileSuccess(stdout: string) {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: object, cb: ExecFileCallback) => {
      cb(null, stdout, '');
    },
  );
}

describe('openPR', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRepoOwnerName.mockResolvedValue({
      owner: 'bkrupa',
      name: 'legacy-sports',
    });
    mockGetAuthorToken.mockResolvedValue('ghs_bot_author_token');
    mockGithubRest.mockResolvedValue({
      number: 99,
      html_url: 'https://example/pr/99',
    });
    mockGithubGraphQL.mockResolvedValue({
      data: { repository: { pullRequest: { id: 'PR_id', isDraft: true } } },
    });
    mockIsLambda.mockReturnValue(false);
    mockGetRepoRoot.mockReturnValue('/tmp/test-repo-root');
    existsSyncDefault();
  });

  function existsSyncDefault() {
    mockExistsSync.mockReturnValue(true);
  }

  describe('worktreePath validation', () => {
    it('errors on relative worktreePath', async () => {
      mockIsLambda.mockReturnValue(false);
      const result = await openPR({
        title: 'LS-8149 test',
        body: 'body',
        worktreePath: 'relative/path',
        head: 'some-branch',
        push: false,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/absolute path/);
    });

    it('errors when worktreePath does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const result = await openPR({
        title: 'LS-8149 test',
        body: 'body',
        worktreePath: '/tmp/test-repo-root/some-wt',
        head: 'some-branch',
        push: false,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/does not exist/);
    });

    it('errors when worktreePath is outside repo root', async () => {
      const result = await openPR({
        title: 'LS-8149 test',
        body: 'body',
        worktreePath: '/tmp/some-other-dir',
        head: 'some-branch',
        push: false,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/outside the repository root/);
    });

    it('accepts worktreePath inside repo root', async () => {
      mockGithubGraphQL
        .mockResolvedValueOnce({
          data: { repository: { pullRequest: { id: 'PR_id', isDraft: true } } },
        })
        .mockResolvedValueOnce({
          data: {
            markPullRequestReadyForReview: {
              pullRequest: {
                number: 99,
                isDraft: false,
                url: 'https://example/pr/99',
              },
            },
          },
        });
      mockGithubRest.mockResolvedValue({
        number: 99,
        html_url: 'https://example/pr/99',
      });

      const result = await openPR({
        title: 'LS-8149 test',
        body: 'body',
        worktreePath: '/tmp/test-repo-root/sub-wt',
        head: 'feature-branch',
        push: false,
      });
      expect(result.isError).toBeFalsy();
    });

    it('skips path checks in Lambda mode', async () => {
      mockIsLambda.mockReturnValue(true);
      mockGithubGraphQL
        .mockResolvedValueOnce({
          data: { repository: { pullRequest: { id: 'PR_id', isDraft: true } } },
        })
        .mockResolvedValueOnce({
          data: {
            markPullRequestReadyForReview: {
              pullRequest: {
                number: 99,
                isDraft: false,
                url: 'https://example/pr/99',
              },
            },
          },
        });
      const result = await openPR({
        title: 'LS-8149 test',
        body: 'body',
        worktreePath: '/nonexistent/path',
        head: 'feature-branch',
        push: false,
      });
      expect(result.isError).toBeFalsy();
    });
  });

  describe('Lambda mode requires explicit head', () => {
    it('errors when head is missing in Lambda mode', async () => {
      mockIsLambda.mockReturnValue(true);
      const result = await openPR({
        title: 'LS-8149 test',
        body: 'body',
        push: false,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Lambda mode/);
    });

    // The bare message previously gave no indication the tool had received
    // worktreePath at all, reading as if it were silently ignored (LS-8837).
    it('acknowledges worktreePath in the error instead of ignoring it', async () => {
      mockIsLambda.mockReturnValue(true);
      const result = await openPR({
        title: 'LS-8149 test',
        body: 'body',
        worktreePath: '/nonexistent/path',
        push: false,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('/nonexistent/path');
      expect(result.content[0].text).toMatch(
        /`head` must be passed explicitly/,
      );
    });

    // LS-4879: a Windows drive-letter worktreePath (e.g. from a local Windows
    // Claude Code session) must never be resolve()'d against the Lambda's own
    // cwd — that previously produced an invalid concatenated path like
    // "/var/task/D:\...". In Lambda mode the path is never touched by
    // resolve()/existsSync() at all; the caller must pass `head` explicitly.
    it('never mangles a Windows drive-letter worktreePath into a /var/task/ path', async () => {
      mockIsLambda.mockReturnValue(true);
      const windowsPath =
        'D:\\code\\legacy-sports\\.claude\\worktrees\\some-wt';
      const result = await openPR({
        title: 'LS-4879 test',
        body: 'body',
        worktreePath: windowsPath,
        push: false,
      });
      expect(result.isError).toBe(true);
      expect(mockExistsSync).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain(windowsPath);
      expect(result.content[0].text).not.toContain('/var/task/');
      expect(result.content[0].text).toMatch(
        /`head` must be passed explicitly/,
      );
    });
  });

  describe('Windows worktreePath resolution depends on the host platform (LS-8837)', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
      });
    });

    it('attempts to resolve a Windows drive-letter worktreePath when running on a Windows host', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      mockIsLambda.mockReturnValue(false);
      mockExistsSync.mockReturnValue(true);
      makeExecFileSuccess('feature-branch');

      await openPR({
        title: 'LS-8837 test',
        body: 'body',
        worktreePath: 'D:\\code\\legacy-sports\\.claude\\worktrees\\some-wt',
        push: false,
      });

      // On a Windows host the tool must actually attempt the fs check instead
      // of silently skipping resolution just because the path looks Windows-y.
      expect(mockExistsSync).toHaveBeenCalled();
    });

    it('still skips resolution for a Windows drive-letter worktreePath on a POSIX host', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockIsLambda.mockReturnValue(false);
      makeExecFileSuccess('feature-branch');

      const result = await openPR({
        title: 'LS-8837 test',
        body: 'body',
        worktreePath: 'D:\\code\\legacy-sports\\.claude\\worktrees\\some-wt',
        push: false,
      });

      // No existsSync/containment check performed for a Windows path on a
      // POSIX host — falls through to git auto-detection against repoRoot.
      expect(mockExistsSync).not.toHaveBeenCalled();
      expect(result.isError).toBeFalsy();
    });
  });

  describe('draft mode', () => {
    it('returns draft:true and skips mark-ready when draft:true passed', async () => {
      makeExecFileSuccess('feature-branch');
      const result = await openPR({
        title: 'LS-8149 test',
        body: 'body',
        head: 'feature-branch',
        draft: true,
        push: false,
      });
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(result.content[0].text) as { draft: boolean };
      expect(payload.draft).toBe(true);
      // graphQL should not be called for mark-ready
      expect(mockGithubGraphQL).not.toHaveBeenCalled();
    });
  });

  describe('invalid jiraKey', () => {
    it('errors on malformed jiraKey', async () => {
      const result = await openPR({
        title: 'LS-8149 test',
        body: 'body',
        head: 'feature-branch',
        jiraKey: 'INVALID',
        push: false,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Invalid jiraKey/);
    });
  });

  describe('jiraKey title prefixing (LS-8679)', () => {
    it('prefixes the PR title with jiraKey when the title lacks it', async () => {
      makeExecFileSuccess('feature-branch');
      await openPR({
        title: 'fix(web): validate JWT payload',
        body: 'body',
        head: 'feature-branch',
        jiraKey: 'LS-8537',
        draft: true,
        push: false,
      });
      const bodyMatcher: unknown = expect.objectContaining({
        title: 'LS-8537 fix(web): validate JWT payload',
      });
      expect(mockGithubRest).toHaveBeenCalledWith(
        expect.objectContaining({ body: bodyMatcher }),
      );
    });

    it('does not double-prefix when the title already starts with jiraKey', async () => {
      makeExecFileSuccess('feature-branch');
      await openPR({
        title: 'LS-8537 fix(web): validate JWT payload',
        body: 'body',
        head: 'feature-branch',
        jiraKey: 'LS-8537',
        draft: true,
        push: false,
      });
      const bodyMatcher: unknown = expect.objectContaining({
        title: 'LS-8537 fix(web): validate JWT payload',
      });
      expect(mockGithubRest).toHaveBeenCalledWith(
        expect.objectContaining({ body: bodyMatcher }),
      );
    });

    it('leaves the title untouched when jiraKey is not provided', async () => {
      makeExecFileSuccess('feature-branch');
      await openPR({
        title: 'chore(deps): bump lodash',
        body: 'body',
        head: 'feature-branch',
        draft: true,
        push: false,
      });
      const bodyMatcher: unknown = expect.objectContaining({
        title: 'chore(deps): bump lodash',
      });
      expect(mockGithubRest).toHaveBeenCalledWith(
        expect.objectContaining({ body: bodyMatcher }),
      );
    });
  });

  // `primary` falls back to 'none' when no jiraKey is passed and the title
  // carries no key. Jira Link Check requires the `no-jira` label in that case,
  // so without this openPR could mint a guaranteed-failing PR on its own.
  describe('no-jira label for keyless PRs (LS-9043)', () => {
    const NO_JIRA_LABEL_CALL: unknown = expect.objectContaining({
      method: 'POST',
      path: '/repos/bkrupa/legacy-sports/issues/99/labels',
      body: { labels: ['no-jira'] },
    });

    it('applies the no-jira label when primary resolves to none', async () => {
      makeExecFileSuccess('feature-branch');
      const result = await openPR({
        title: 'chore(deps): bump lodash',
        body: 'body',
        head: 'feature-branch',
        draft: true,
        push: false,
      });
      expect(mockGithubRest).toHaveBeenCalledWith(NO_JIRA_LABEL_CALL);
      expect(result.content[0].text).toContain('"noJiraLabelApplied":true');
    });

    it('does not apply the no-jira label when a real key is present', async () => {
      makeExecFileSuccess('feature-branch');
      const result = await openPR({
        title: 'LS-8537 fix(web): validate JWT payload',
        body: 'body',
        head: 'feature-branch',
        draft: true,
        push: false,
      });
      expect(mockGithubRest).not.toHaveBeenCalledWith(NO_JIRA_LABEL_CALL);
      expect(result.content[0].text).not.toContain('noJiraLabelApplied');
    });

    it('treats a label failure as non-fatal and still returns the PR', async () => {
      makeExecFileSuccess('feature-branch');
      mockGithubRest.mockImplementation((req: { path: string }) =>
        req.path.endsWith('/labels')
          ? Promise.reject(new Error('403 label forbidden'))
          : Promise.resolve({
              number: 99,
              html_url: 'https://example/pr/99',
            }),
      );
      const result = await openPR({
        title: 'chore(deps): bump lodash',
        body: 'body',
        head: 'feature-branch',
        draft: true,
        push: false,
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('"noJiraLabelApplied":false');
      expect(result.content[0].text).toContain('403 label forbidden');
    });
  });

  describe('Lambda mode push:true no-op on an unpushed branch (LS-9290)', () => {
    it('errors with actionable guidance when the branch does not exist on the remote', async () => {
      mockIsLambda.mockReturnValue(true);
      mockGithubRest.mockRejectedValueOnce(
        new Error(
          'GitHub API GET /repos/bkrupa/legacy-sports/git/ref/heads/feature-branch failed (404): Not Found',
        ),
      );
      const result = await openPR({
        title: 'LS-9290 test',
        body: 'body',
        head: 'feature-branch',
        // push omitted — default true
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/does not exist on the remote/);
      expect(result.content[0].text).toContain(
        'git push -u origin feature-branch',
      );
      expect(result.content[0].text).toContain('push: false');
      // Never reaches the PR-create call.
      expect(mockGithubRest).toHaveBeenCalledTimes(1);
    });

    it('proceeds when the branch already exists on the remote', async () => {
      mockIsLambda.mockReturnValue(true);
      mockGithubRest.mockImplementation((req: { path: string }) =>
        req.path === '/repos/bkrupa/legacy-sports/git/ref/heads/feature-branch'
          ? Promise.resolve({})
          : Promise.resolve({ number: 99, html_url: 'https://example/pr/99' }),
      );
      const result = await openPR({
        title: 'LS-9290 test',
        body: 'body',
        head: 'feature-branch',
        draft: true,
        // push omitted — default true, but the branch already exists remotely
      });
      expect(result.isError).toBeFalsy();
    });

    it('surfaces a clear error when the existence check itself fails for a non-404 reason', async () => {
      mockIsLambda.mockReturnValue(true);
      mockGithubRest.mockRejectedValueOnce(
        new Error(
          'GitHub API GET /repos/bkrupa/legacy-sports/git/ref/heads/feature-branch failed (500): server error',
        ),
      );
      const result = await openPR({
        title: 'LS-9290 test',
        body: 'body',
        head: 'feature-branch',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Failed to check whether branch/);
    });

    it('does not perform the remote-existence check when push:false is passed', async () => {
      mockIsLambda.mockReturnValue(true);
      const result = await openPR({
        title: 'LS-9290 test',
        body: 'body',
        head: 'feature-branch',
        draft: true,
        push: false,
      });
      expect(result.isError).toBeFalsy();
      const paths = (
        mockGithubRest.mock.calls as unknown as Array<[{ path: string }]>
      ).map(([req]) => req.path);
      expect(paths).not.toContain(
        '/repos/bkrupa/legacy-sports/git/ref/heads/feature-branch',
      );
    });
  });

  describe('bodyFile (LS-9581)', () => {
    it('errors when both body and bodyFile are provided', async () => {
      const result = await openPR({
        title: 'LS-9581 test',
        body: 'inline body',
        bodyFile: 'scratch/pr-body.md',
        head: 'feature-branch',
        push: false,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/not both/);
    });

    it('errors when neither body nor bodyFile is provided', async () => {
      const result = await openPR({
        title: 'LS-9581 test',
        head: 'feature-branch',
        push: false,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/either `body` or `bodyFile`/);
    });

    it('reads bodyFile content verbatim and uses it as the PR body', async () => {
      makeExecFileSuccess('feature-branch');
      mockReadFileSync.mockReturnValue('# Evidence\n\nBefore/after numbers.');
      const result = await openPR({
        title: 'LS-9581 test',
        bodyFile: 'scratch/pr-body.md',
        head: 'feature-branch',
        draft: true,
        push: false,
      });
      expect(result.isError).toBeFalsy();
      expect(mockReadFileSync).toHaveBeenCalledWith(
        '/tmp/test-repo-root/scratch/pr-body.md',
        'utf-8',
      );
      const calls = mockGithubRest.mock.calls as unknown as Array<
        [{ body: { body: string } }]
      >;
      expect(calls[0][0].body.body).toContain('Before/after numbers.');
    });

    it('resolves a relative bodyFile against worktreePath when provided', async () => {
      makeExecFileSuccess('feature-branch');
      mockReadFileSync.mockReturnValue('worktree evidence');
      const result = await openPR({
        title: 'LS-9581 test',
        bodyFile: 'pr-body.md',
        worktreePath: '/tmp/test-repo-root/sub-wt',
        head: 'feature-branch',
        draft: true,
        push: false,
      });
      expect(result.isError).toBeFalsy();
      expect(mockReadFileSync).toHaveBeenCalledWith(
        '/tmp/test-repo-root/sub-wt/pr-body.md',
        'utf-8',
      );
    });

    it('errors with a clear message when bodyFile cannot be read', async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });
      const result = await openPR({
        title: 'LS-9581 test',
        bodyFile: 'missing.md',
        head: 'feature-branch',
        push: false,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Cannot read bodyFile');
      expect(result.content[0].text).toContain('ENOENT');
    });

    it('refuses bodyFile in Lambda mode with a clear error', async () => {
      mockIsLambda.mockReturnValue(true);
      const result = await openPR({
        title: 'LS-9581 test',
        bodyFile: 'scratch/pr-body.md',
        head: 'feature-branch',
        push: false,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Lambda mode/);
      expect(result.content[0].text).toContain('scratch/pr-body.md');
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    it('refuses an absolute bodyFile outside the repository root', async () => {
      const result = await openPR({
        title: 'LS-9581 test',
        bodyFile: '/home/user/.ssh/id_rsa',
        head: 'feature-branch',
        push: false,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/outside the repository root/);
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    it('refuses a relative bodyFile that escapes the repository root via ../', async () => {
      const result = await openPR({
        title: 'LS-9581 test',
        bodyFile: '../../etc/passwd',
        head: 'feature-branch',
        push: false,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/outside the repository root/);
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });
  });
});
