jest.mock('../github-api', () => ({ githubRest: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { issueCommentWrite } from './issue-comment-write';
import { githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';

const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

beforeEach(() => {
  mockedRepo.mockResolvedValue({ owner: 'org', name: 'repo' });
});

afterEach(() => jest.resetAllMocks());

interface ResultBody {
  success?: boolean;
  commentId?: number;
  url?: string;
  deleted?: boolean;
}

describe('issueCommentWrite — create', () => {
  it('posts a new comment via POST /issues/{number}/comments', async () => {
    mockedRest.mockResolvedValue({
      id: 1,
      html_url: 'https://github.com/org/repo/issues/5#issuecomment-1',
      body: 'hello',
    });

    const result = await issueCommentWrite({
      method: 'create',
      number: 5,
      body: 'hello',
    });

    expect(result.isError).toBeFalsy();
    expect(mockedRest).toHaveBeenCalledWith({
      method: 'POST',
      path: '/repos/org/repo/issues/5/comments',
      body: { body: 'hello' },
    });
    const parsed = JSON.parse(result.content[0].text) as ResultBody;
    expect(parsed.success).toBe(true);
    expect(parsed.commentId).toBe(1);
  });

  it('errors when number is missing', async () => {
    const result = await issueCommentWrite({ method: 'create', body: 'hi' });
    expect(result.isError).toBe(true);
    expect(mockedRest).not.toHaveBeenCalled();
  });

  it('errors when body is missing', async () => {
    const result = await issueCommentWrite({ method: 'create', number: 5 });
    expect(result.isError).toBe(true);
    expect(mockedRest).not.toHaveBeenCalled();
  });
});

describe('issueCommentWrite — update', () => {
  it('edits an existing comment via PATCH /issues/comments/{commentId}', async () => {
    mockedRest.mockResolvedValue({
      id: 42,
      html_url: 'https://github.com/org/repo/issues/5#issuecomment-42',
      body: 'corrected',
    });

    const result = await issueCommentWrite({
      method: 'update',
      commentId: 42,
      body: 'corrected',
    });

    expect(result.isError).toBeFalsy();
    expect(mockedRest).toHaveBeenCalledWith({
      method: 'PATCH',
      path: '/repos/org/repo/issues/comments/42',
      body: { body: 'corrected' },
    });
    const parsed = JSON.parse(result.content[0].text) as ResultBody;
    expect(parsed.success).toBe(true);
    expect(parsed.commentId).toBe(42);
  });

  it('works the same for a PR comment (same issues-comments endpoint)', async () => {
    mockedRest.mockResolvedValue({
      id: 99,
      html_url: 'https://github.com/org/repo/pull/7#issuecomment-99',
      body: '<!-- e2e-hold -->\nupdated state',
    });

    const result = await issueCommentWrite({
      method: 'update',
      commentId: 99,
      body: '<!-- e2e-hold -->\nupdated state',
    });

    expect(result.isError).toBeFalsy();
    expect(mockedRest).toHaveBeenCalledWith({
      method: 'PATCH',
      path: '/repos/org/repo/issues/comments/99',
      body: { body: '<!-- e2e-hold -->\nupdated state' },
    });
  });

  it('errors when commentId is missing', async () => {
    const result = await issueCommentWrite({ method: 'update', body: 'x' });
    expect(result.isError).toBe(true);
    expect(mockedRest).not.toHaveBeenCalled();
  });

  it('errors when body is missing', async () => {
    const result = await issueCommentWrite({
      method: 'update',
      commentId: 1,
    });
    expect(result.isError).toBe(true);
    expect(mockedRest).not.toHaveBeenCalled();
  });
});

describe('issueCommentWrite — delete', () => {
  it('deletes a comment via DELETE /issues/comments/{commentId}', async () => {
    mockedRest.mockResolvedValue(undefined);

    const result = await issueCommentWrite({
      method: 'delete',
      commentId: 7,
    });

    expect(result.isError).toBeFalsy();
    expect(mockedRest).toHaveBeenCalledWith({
      method: 'DELETE',
      path: '/repos/org/repo/issues/comments/7',
    });
    const parsed = JSON.parse(result.content[0].text) as ResultBody;
    expect(parsed.success).toBe(true);
    expect(parsed.deleted).toBe(true);
  });

  it('errors when commentId is missing', async () => {
    const result = await issueCommentWrite({ method: 'delete' });
    expect(result.isError).toBe(true);
    expect(mockedRest).not.toHaveBeenCalled();
  });
});

describe('issueCommentWrite — error propagation', () => {
  it('surfaces the underlying API error message', async () => {
    mockedRest.mockRejectedValue(new Error('Not Found'));

    const result = await issueCommentWrite({
      method: 'update',
      commentId: 404,
      body: 'x',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Not Found');
  });
});
