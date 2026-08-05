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
}));

const { githubRest: mockGithubRest, githubGraphQL: mockGithubGraphQL } =
  jest.requireMock('../github-api') as {
    githubRest: jest.Mock;
    githubGraphQL: jest.Mock;
  };
const {
  getRepoOwnerName: mockGetRepoOwnerName,
  getAuthorToken: mockGetAuthorToken,
  isLambda: mockIsLambda,
  getRepoRoot: mockGetRepoRoot,
} = jest.requireMock('../auth') as {
  getRepoOwnerName: jest.Mock;
  getAuthorToken: jest.Mock;
  isLambda: jest.Mock;
  getRepoRoot: jest.Mock;
};
const { execFile: mockExecFile } = jest.requireMock('node:child_process') as {
  execFile: jest.Mock;
};
const { existsSync: mockExistsSync } = jest.requireMock('node:fs') as {
  existsSync: jest.Mock;
};

function makeExecFileSuccess(stdout: string) {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: object, cb: Function) => {
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
      const payload = JSON.parse(result.content[0].text);
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
      expect(mockGithubRest).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            title: 'LS-8537 fix(web): validate JWT payload',
          }),
        }),
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
      expect(mockGithubRest).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            title: 'LS-8537 fix(web): validate JWT payload',
          }),
        }),
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
      expect(mockGithubRest).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            title: 'chore(deps): bump lodash',
          }),
        }),
      );
    });
  });

  // `primary` falls back to 'none' when no jiraKey is passed and the title
  // carries no key. Jira Link Check requires the `no-jira` label in that case,
  // so without this openPR could mint a guaranteed-failing PR on its own.
  describe('no-jira label for keyless PRs (LS-9043)', () => {
    const NO_JIRA_LABEL_CALL = expect.objectContaining({
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
});
