import { listPRComments } from './list-pr-comments';

jest.mock('../github-api', () => ({
  githubRest: jest.fn(),
}));

jest.mock('../auth', () => ({
  getRepoOwnerName: jest.fn(),
}));

jest.mock('@legacy-sports/logging/server', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const { githubRest: mockGithubRest } = jest.requireMock<{
  githubRest: jest.Mock;
}>('../github-api');
const { getRepoOwnerName: mockGetRepoOwnerName } = jest.requireMock<{
  getRepoOwnerName: jest.Mock;
}>('../auth');
const ISSUE_COMMENTS_PATH = '/repos/owner/repo/issues/42/comments';
const PULL_COMMENTS_PATH = '/repos/owner/repo/pulls/42/comments';

const topLevelFixture = [
  {
    id: 1,
    html_url: 'https://example/c/1',
    body: 'looks good',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    user: { login: 'alice' },
  },
];

const inlineFixture = [
  {
    id: 100,
    in_reply_to_id: undefined,
    html_url: 'https://example/c/100',
    body: 'consider extracting',
    path: 'src/foo.ts',
    line: 12,
    original_line: 12,
    diff_hunk: '@@',
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    user: { login: 'bob' },
    pull_request_review_id: 555,
  },
  {
    id: 101,
    in_reply_to_id: 100,
    html_url: 'https://example/c/101',
    body: 'agree',
    path: 'src/bar.ts',
    line: 20,
    original_line: 20,
    diff_hunk: '@@',
    created_at: '2026-01-03T00:00:00Z',
    updated_at: '2026-01-03T00:00:00Z',
    user: { login: 'carol' },
    pull_request_review_id: 666,
  },
];

function setupRest(
  opts: {
    topLevel?: unknown[];
    inline?: unknown[];
  } = {},
) {
  mockGithubRest.mockImplementation(({ path }: { path: string }) => {
    if (path === ISSUE_COMMENTS_PATH) return opts.topLevel ?? [];
    if (path === PULL_COMMENTS_PATH) return opts.inline ?? [];
    throw new Error(`unexpected path ${path}`);
  });
}

function parseOutput(result: { content: { text: string }[] }): {
  type?: string;
  total?: number;
  comments?: unknown[];
  topLevel?: { total: number; comments: unknown[] };
  inline?: { total: number; comments: unknown[] };
  filteredByPath?: string | null;
  filteredByReviewId?: number | null;
  number?: number;
} {
  return JSON.parse(result.content[0].text) as {
    type?: string;
    total?: number;
    comments?: unknown[];
    topLevel?: { total: number; comments: unknown[] };
    inline?: { total: number; comments: unknown[] };
    filteredByPath?: string | null;
    filteredByReviewId?: number | null;
    number?: number;
  };
}

describe('listPRComments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRepoOwnerName.mockResolvedValue({ owner: 'owner', name: 'repo' });
  });

  it('defaults type to "all" and returns merged top-level + inline', async () => {
    setupRest({ topLevel: topLevelFixture, inline: inlineFixture });

    const result = await listPRComments({ number: 42 });
    const out = parseOutput(result);

    expect(out.type).toBe('all');
    expect(out.total).toBe(3);
    expect(out.topLevel?.total).toBe(1);
    expect(out.inline?.total).toBe(2);
    expect(mockGithubRest).toHaveBeenCalledTimes(2);
  });

  it('type: "top-level" hits only the issues endpoint', async () => {
    setupRest({ topLevel: topLevelFixture });

    const result = await listPRComments({ number: 42, type: 'top-level' });
    const out = parseOutput(result);

    expect(out.type).toBe('top-level');
    expect(out.total).toBe(1);
    expect(mockGithubRest).toHaveBeenCalledTimes(1);
    expect(mockGithubRest).toHaveBeenCalledWith(
      expect.objectContaining({ path: ISSUE_COMMENTS_PATH }),
    );
  });

  it('type: "inline" with path filter scopes to that file only', async () => {
    setupRest({ inline: inlineFixture });

    const result = await listPRComments({
      number: 42,
      type: 'inline',
      path: 'src/foo.ts',
    });
    const out = parseOutput(result);

    expect(out.type).toBe('inline');
    expect(out.total).toBe(1);
    expect(out.filteredByPath).toBe('src/foo.ts');
    expect((out.comments as Array<{ path: string }>)[0].path).toBe(
      'src/foo.ts',
    );
  });

  it('type: "review" with reviewId filter returns only matching review', async () => {
    setupRest({ inline: inlineFixture });

    const result = await listPRComments({
      number: 42,
      type: 'review',
      reviewId: 555,
    });
    const out = parseOutput(result);

    expect(out.type).toBe('review');
    expect(out.total).toBe(1);
    expect(out.filteredByReviewId).toBe(555);
    expect((out.comments as Array<{ id: number }>)[0].id).toBe(100);
  });

  it('type: "all" applies path filter to inline section only', async () => {
    setupRest({ topLevel: topLevelFixture, inline: inlineFixture });

    const result = await listPRComments({
      number: 42,
      type: 'all',
      path: 'src/foo.ts',
    });
    const out = parseOutput(result);

    expect(out.topLevel?.total).toBe(1);
    expect(out.inline?.total).toBe(1);
    expect(out.filteredByPath).toBe('src/foo.ts');
  });

  it('returns an error result when github_rest throws', async () => {
    mockGithubRest.mockRejectedValue(new Error('boom'));

    const result = await listPRComments({ number: 42, type: 'top-level' });
    expect(result.isError).toBe(true);
  });
});
