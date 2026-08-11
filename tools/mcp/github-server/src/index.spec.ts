import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { markPRReady } from './tools/mark-pr-ready';
import { prWhyBlocked } from './tools/pr-why-blocked';
import { closePR } from './tools/close-pr';
import { listReviews } from './tools/list-reviews';
import { commentPR } from './tools/comment-pr';
import { listPRInlineComments } from './tools/list-pr-inline-comments';
import { listReviewComments } from './tools/list-review-comments';
import { editPR } from './tools/edit-pr';
import { prCommits } from './tools/pr-commits';
import { setCommitStatus } from './tools/set-commit-status';
import { finishFixRound } from './tools/finish-fix-round';
import { resolveThreads } from './tools/resolve-threads';
import { prDiff } from './tools/pr-diff';
import { diagnose } from './tools/diagnose';
import type { ToolResult } from './types';

jest.mock('./tools/mark-pr-ready');
jest.mock('./tools/pr-why-blocked');
jest.mock('./tools/close-pr');
jest.mock('./tools/list-reviews');
jest.mock('./tools/comment-pr');
jest.mock('./tools/list-pr-inline-comments');
jest.mock('./tools/list-review-comments');
jest.mock('./tools/edit-pr');
jest.mock('./tools/pr-commits');
jest.mock('./tools/set-commit-status');
jest.mock('./tools/finish-fix-round');
jest.mock('./tools/resolve-threads');
jest.mock('./tools/pr-diff');
jest.mock('./tools/diagnose');

// getRepoRoot lives in ./repo-root and uses import.meta.url, which cannot be
// compiled under the CommonJS tsconfig the Jest preset uses — mock it with a
// factory so @swc/jest never transforms the real module (LS-5982 pattern).
jest.mock('./repo-root', () => ({
  getRepoRoot: jest.fn(() => '/tmp/repo-root-that-does-not-exist'),
}));

// Importing ./index with this unset auto-connects a stdio transport (the
// non-Lambda entry path). Set it before the dynamic import in beforeAll.
process.env['AWS_LAMBDA_FUNCTION_NAME'] = 'index-spec';

const okResult: ToolResult = { content: [{ type: 'text', text: 'ok' }] };

const MISSING_PARAM_ERROR =
  'Missing required parameter: provide "number" (or alias "prNumber") with a positive integer PR number.';

const MISSING_PARAM_ERROR_PRNUMBER_PRIMARY =
  'Missing required parameter: provide "prNumber" (or alias "number") with a positive integer PR number.';

/**
 * Alias-resolution coverage for tools whose prNumber/number aliasing lives in
 * the inline server.tool() handlers (LS-8214, following the LS-7468 pattern):
 * callers may pass the PR number as "number" (preferred) or "prNumber", and
 * passing neither must produce the named missing-parameter error rather than
 * Zod's generic "received NaN" message.
 */
describe('index tool registration — prNumber alias resolution', () => {
  let server: McpServer;
  let client: Client;

  beforeAll(async () => {
    const { createServer } = await import('./index');
    server = createServer();
    client = new Client({ name: 'spec-client', version: '0.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(markPRReady).mockResolvedValue(okResult);
    jest.mocked(prWhyBlocked).mockResolvedValue(okResult);
    jest.mocked(closePR).mockResolvedValue(okResult);
    jest.mocked(listReviews).mockResolvedValue(okResult);
    jest.mocked(commentPR).mockResolvedValue(okResult);
    jest.mocked(listPRInlineComments).mockResolvedValue(okResult);
    jest.mocked(listReviewComments).mockResolvedValue(okResult);
    jest.mocked(editPR).mockResolvedValue(okResult);
    jest.mocked(prCommits).mockResolvedValue(okResult);
    jest.mocked(setCommitStatus).mockResolvedValue(okResult);
    jest.mocked(finishFixRound).mockResolvedValue(okResult);
    jest.mocked(resolveThreads).mockResolvedValue(okResult);
    jest.mocked(prDiff).mockResolvedValue(okResult);
    jest.mocked(diagnose).mockResolvedValue(okResult);
  });

  describe('github_mark_pr_ready', () => {
    it('accepts "number" and forwards it to the handler', async () => {
      const result = await client.callTool({
        name: 'github_mark_pr_ready',
        arguments: { number: 123 },
      });

      expect(result.isError).toBeFalsy();
      expect(markPRReady).toHaveBeenCalledWith({
        number: 123,
        applyReadyLabel: true,
      });
    });

    it('accepts the "prNumber" alias and forwards it as "number"', async () => {
      const result = await client.callTool({
        name: 'github_mark_pr_ready',
        arguments: { prNumber: 456, applyReadyLabel: false },
      });

      expect(result.isError).toBeFalsy();
      expect(markPRReady).toHaveBeenCalledWith({
        number: 456,
        applyReadyLabel: false,
      });
    });

    it('prefers "number" when both are provided', async () => {
      await client.callTool({
        name: 'github_mark_pr_ready',
        arguments: { number: 1, prNumber: 2 },
      });

      expect(markPRReady).toHaveBeenCalledWith({
        number: 1,
        applyReadyLabel: true,
      });
    });

    it('returns the named missing-parameter error when neither is provided', async () => {
      const result = await client.callTool({
        name: 'github_mark_pr_ready',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        { type: 'text', text: MISSING_PARAM_ERROR },
      ]);
      expect(markPRReady).not.toHaveBeenCalled();
    });
  });

  describe('github_pr_why_blocked', () => {
    it('accepts "number" and forwards it to the handler', async () => {
      const result = await client.callTool({
        name: 'github_pr_why_blocked',
        arguments: { number: 123 },
      });

      expect(result.isError).toBeFalsy();
      expect(prWhyBlocked).toHaveBeenCalledWith({ number: 123 });
    });

    it('accepts the "prNumber" alias and forwards it as "number"', async () => {
      const result = await client.callTool({
        name: 'github_pr_why_blocked',
        arguments: { prNumber: 456 },
      });

      expect(result.isError).toBeFalsy();
      expect(prWhyBlocked).toHaveBeenCalledWith({ number: 456 });
    });

    it('prefers "number" when both are provided', async () => {
      await client.callTool({
        name: 'github_pr_why_blocked',
        arguments: { number: 1, prNumber: 2 },
      });

      expect(prWhyBlocked).toHaveBeenCalledWith({ number: 1 });
    });

    it('returns the named missing-parameter error when neither is provided', async () => {
      const result = await client.callTool({
        name: 'github_pr_why_blocked',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        { type: 'text', text: MISSING_PARAM_ERROR },
      ]);
      expect(prWhyBlocked).not.toHaveBeenCalled();
    });
  });

  describe('github_close_pr', () => {
    it('accepts "number" and forwards it to the handler', async () => {
      const result = await client.callTool({
        name: 'github_close_pr',
        arguments: { number: 123 },
      });

      expect(result.isError).toBeFalsy();
      expect(closePR).toHaveBeenCalledWith({ number: 123, comment: undefined });
    });

    it('accepts the "prNumber" alias and forwards it as "number"', async () => {
      const result = await client.callTool({
        name: 'github_close_pr',
        arguments: { prNumber: 456, comment: 'closing' },
      });

      expect(result.isError).toBeFalsy();
      expect(closePR).toHaveBeenCalledWith({
        number: 456,
        comment: 'closing',
      });
    });

    it('prefers "number" when both are provided', async () => {
      await client.callTool({
        name: 'github_close_pr',
        arguments: { number: 1, prNumber: 2 },
      });

      expect(closePR).toHaveBeenCalledWith({ number: 1, comment: undefined });
    });

    it('returns the named missing-parameter error when neither is provided', async () => {
      const result = await client.callTool({
        name: 'github_close_pr',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        { type: 'text', text: MISSING_PARAM_ERROR },
      ]);
      expect(closePR).not.toHaveBeenCalled();
    });
  });

  describe('github_list_reviews', () => {
    it('accepts "number" and forwards it to the handler', async () => {
      const result = await client.callTool({
        name: 'github_list_reviews',
        arguments: { number: 123 },
      });

      expect(result.isError).toBeFalsy();
      expect(listReviews).toHaveBeenCalledWith(
        expect.objectContaining({ number: 123 }),
      );
    });

    it('accepts the "prNumber" alias and forwards it as "number"', async () => {
      const result = await client.callTool({
        name: 'github_list_reviews',
        arguments: { prNumber: 456 },
      });

      expect(result.isError).toBeFalsy();
      expect(listReviews).toHaveBeenCalledWith(
        expect.objectContaining({ number: 456 }),
      );
    });

    it('prefers "number" when both are provided', async () => {
      await client.callTool({
        name: 'github_list_reviews',
        arguments: { number: 1, prNumber: 2 },
      });

      expect(listReviews).toHaveBeenCalledWith(
        expect.objectContaining({ number: 1 }),
      );
    });

    it('supports batch mode via "prs" with neither "number" nor "prNumber"', async () => {
      const result = await client.callTool({
        name: 'github_list_reviews',
        arguments: { prs: [1, 2, 3] },
      });

      expect(result.isError).toBeFalsy();
      expect(listReviews).toHaveBeenCalledWith(
        expect.objectContaining({ number: undefined, prs: [1, 2, 3] }),
      );
    });
  });

  describe('github_comment_pr', () => {
    it('accepts "number" and forwards it to the handler', async () => {
      const result = await client.callTool({
        name: 'github_comment_pr',
        arguments: { number: 123, body: 'hi' },
      });

      expect(result.isError).toBeFalsy();
      expect(commentPR).toHaveBeenCalledWith({ number: 123, body: 'hi' });
    });

    it('accepts the "prNumber" alias and forwards it as "number"', async () => {
      const result = await client.callTool({
        name: 'github_comment_pr',
        arguments: { prNumber: 456, body: 'hi' },
      });

      expect(result.isError).toBeFalsy();
      expect(commentPR).toHaveBeenCalledWith({ number: 456, body: 'hi' });
    });

    it('prefers "number" when both are provided', async () => {
      await client.callTool({
        name: 'github_comment_pr',
        arguments: { number: 1, prNumber: 2, body: 'hi' },
      });

      expect(commentPR).toHaveBeenCalledWith({ number: 1, body: 'hi' });
    });

    it('returns the named missing-parameter error when neither is provided', async () => {
      const result = await client.callTool({
        name: 'github_comment_pr',
        arguments: { body: 'hi' },
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        { type: 'text', text: MISSING_PARAM_ERROR },
      ]);
      expect(commentPR).not.toHaveBeenCalled();
    });
  });

  describe('github_list_pr_inline_comments', () => {
    it('accepts "number" and forwards it to the handler', async () => {
      const result = await client.callTool({
        name: 'github_list_pr_inline_comments',
        arguments: { number: 123 },
      });

      expect(result.isError).toBeFalsy();
      expect(listPRInlineComments).toHaveBeenCalledWith({
        number: 123,
        path: undefined,
        since: undefined,
      });
    });

    it('accepts the "prNumber" alias and forwards it as "number"', async () => {
      const result = await client.callTool({
        name: 'github_list_pr_inline_comments',
        arguments: { prNumber: 456 },
      });

      expect(result.isError).toBeFalsy();
      expect(listPRInlineComments).toHaveBeenCalledWith({
        number: 456,
        path: undefined,
        since: undefined,
      });
    });

    it('returns the named missing-parameter error when neither is provided', async () => {
      const result = await client.callTool({
        name: 'github_list_pr_inline_comments',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        { type: 'text', text: MISSING_PARAM_ERROR },
      ]);
      expect(listPRInlineComments).not.toHaveBeenCalled();
    });
  });

  describe('github_list_review_comments', () => {
    it('accepts "number" and forwards it to the handler', async () => {
      const result = await client.callTool({
        name: 'github_list_review_comments',
        arguments: { number: 123 },
      });

      expect(result.isError).toBeFalsy();
      expect(listReviewComments).toHaveBeenCalledWith({
        number: 123,
        since: undefined,
        reviewId: undefined,
      });
    });

    it('accepts the "prNumber" alias and forwards it as "number"', async () => {
      const result = await client.callTool({
        name: 'github_list_review_comments',
        arguments: { prNumber: 456 },
      });

      expect(result.isError).toBeFalsy();
      expect(listReviewComments).toHaveBeenCalledWith({
        number: 456,
        since: undefined,
        reviewId: undefined,
      });
    });

    it('returns the named missing-parameter error when neither is provided', async () => {
      const result = await client.callTool({
        name: 'github_list_review_comments',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        { type: 'text', text: MISSING_PARAM_ERROR },
      ]);
      expect(listReviewComments).not.toHaveBeenCalled();
    });
  });

  describe('github_edit_pr', () => {
    it('accepts "number" and forwards it to the handler', async () => {
      const result = await client.callTool({
        name: 'github_edit_pr',
        arguments: { number: 123, title: 'New title' },
      });

      expect(result.isError).toBeFalsy();
      expect(editPR).toHaveBeenCalledWith({
        number: 123,
        title: 'New title',
        body: undefined,
      });
    });

    it('accepts the "prNumber" alias and forwards it as "number"', async () => {
      const result = await client.callTool({
        name: 'github_edit_pr',
        arguments: { prNumber: 456, title: 'New title' },
      });

      expect(result.isError).toBeFalsy();
      expect(editPR).toHaveBeenCalledWith({
        number: 456,
        title: 'New title',
        body: undefined,
      });
    });

    it('returns the named missing-parameter error when neither is provided', async () => {
      const result = await client.callTool({
        name: 'github_edit_pr',
        arguments: { title: 'New title' },
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        { type: 'text', text: MISSING_PARAM_ERROR },
      ]);
      expect(editPR).not.toHaveBeenCalled();
    });
  });

  describe('github_pr_commits', () => {
    it('accepts "number" and forwards it to the handler', async () => {
      const result = await client.callTool({
        name: 'github_pr_commits',
        arguments: { number: 123 },
      });

      expect(result.isError).toBeFalsy();
      expect(prCommits).toHaveBeenCalledWith({ number: 123, limit: 30 });
    });

    it('accepts the "prNumber" alias and forwards it as "number"', async () => {
      const result = await client.callTool({
        name: 'github_pr_commits',
        arguments: { prNumber: 456 },
      });

      expect(result.isError).toBeFalsy();
      expect(prCommits).toHaveBeenCalledWith({ number: 456, limit: 30 });
    });

    it('returns the named missing-parameter error when neither is provided', async () => {
      const result = await client.callTool({
        name: 'github_pr_commits',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        { type: 'text', text: MISSING_PARAM_ERROR },
      ]);
      expect(prCommits).not.toHaveBeenCalled();
    });
  });

  describe('github_set_commit_status', () => {
    it('accepts "number" and forwards it to the handler', async () => {
      const result = await client.callTool({
        name: 'github_set_commit_status',
        arguments: { number: 123, context: 'bot-review', state: 'success' },
      });

      expect(result.isError).toBeFalsy();
      expect(setCommitStatus).toHaveBeenCalledWith({
        number: 123,
        context: 'bot-review',
        state: 'success',
        description: undefined,
      });
    });

    it('accepts the "prNumber" alias and forwards it as "number"', async () => {
      const result = await client.callTool({
        name: 'github_set_commit_status',
        arguments: { prNumber: 456, context: 'bot-review', state: 'success' },
      });

      expect(result.isError).toBeFalsy();
      expect(setCommitStatus).toHaveBeenCalledWith({
        number: 456,
        context: 'bot-review',
        state: 'success',
        description: undefined,
      });
    });

    it('returns the named missing-parameter error when neither is provided', async () => {
      const result = await client.callTool({
        name: 'github_set_commit_status',
        arguments: { context: 'bot-review', state: 'success' },
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        { type: 'text', text: MISSING_PARAM_ERROR },
      ]);
      expect(setCommitStatus).not.toHaveBeenCalled();
    });
  });

  describe('github_finish_fix_round', () => {
    const replies = [
      { threadId: 'PRRT_1', kind: 'FIX' as const, sha: 'abc1234' },
    ];

    it('accepts "prNumber" and forwards it to the handler', async () => {
      const result = await client.callTool({
        name: 'github_finish_fix_round',
        arguments: { prNumber: 123, replies },
      });

      expect(result.isError).toBeFalsy();
      expect(finishFixRound).toHaveBeenCalledWith({
        prNumber: 123,
        replies,
        readyLabel: 'bot:ready-for-review',
      });
    });

    it('accepts the "number" alias and forwards it as "prNumber"', async () => {
      const result = await client.callTool({
        name: 'github_finish_fix_round',
        arguments: { number: 456, replies },
      });

      expect(result.isError).toBeFalsy();
      expect(finishFixRound).toHaveBeenCalledWith({
        prNumber: 456,
        replies,
        readyLabel: 'bot:ready-for-review',
      });
    });

    it('prefers "prNumber" when both are provided', async () => {
      await client.callTool({
        name: 'github_finish_fix_round',
        arguments: { prNumber: 1, number: 2, replies },
      });

      expect(finishFixRound).toHaveBeenCalledWith({
        prNumber: 1,
        replies,
        readyLabel: 'bot:ready-for-review',
      });
    });

    it('returns the named missing-parameter error when neither is provided', async () => {
      const result = await client.callTool({
        name: 'github_finish_fix_round',
        arguments: { replies },
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        { type: 'text', text: MISSING_PARAM_ERROR_PRNUMBER_PRIMARY },
      ]);
      expect(finishFixRound).not.toHaveBeenCalled();
    });
  });

  describe('github_resolve_threads', () => {
    it('accepts "prNumber" and forwards it to the handler', async () => {
      const result = await client.callTool({
        name: 'github_resolve_threads',
        arguments: { threadIds: ['PRRT_1'], prNumber: 123 },
      });

      expect(result.isError).toBeFalsy();
      expect(resolveThreads).toHaveBeenCalledWith({
        threadIds: ['PRRT_1'],
        commentDatabaseIds: undefined,
        prNumber: 123,
      });
    });

    it('accepts the "number" alias and forwards it as "prNumber"', async () => {
      const result = await client.callTool({
        name: 'github_resolve_threads',
        arguments: { threadIds: ['PRRT_1'], number: 456 },
      });

      expect(result.isError).toBeFalsy();
      expect(resolveThreads).toHaveBeenCalledWith({
        threadIds: ['PRRT_1'],
        commentDatabaseIds: undefined,
        prNumber: 456,
      });
    });

    it('works with neither "prNumber" nor "number" (optional pairing with threadIds)', async () => {
      const result = await client.callTool({
        name: 'github_resolve_threads',
        arguments: { threadIds: ['PRRT_1'] },
      });

      expect(result.isError).toBeFalsy();
      expect(resolveThreads).toHaveBeenCalledWith({
        threadIds: ['PRRT_1'],
        commentDatabaseIds: undefined,
        prNumber: undefined,
      });
    });
  });

  describe('github_pr_diff', () => {
    it('accepts "prNumber" and forwards it to the handler', async () => {
      const result = await client.callTool({
        name: 'github_pr_diff',
        arguments: { prNumber: 123 },
      });

      expect(result.isError).toBeFalsy();
      expect(prDiff).toHaveBeenCalledWith({
        prNumber: 123,
        maxBytes: undefined,
      });
    });

    it('accepts the "number" alias and forwards it as "prNumber"', async () => {
      const result = await client.callTool({
        name: 'github_pr_diff',
        arguments: { number: 456 },
      });

      expect(result.isError).toBeFalsy();
      expect(prDiff).toHaveBeenCalledWith({
        prNumber: 456,
        maxBytes: undefined,
      });
    });

    it('prefers "prNumber" when both are provided', async () => {
      await client.callTool({
        name: 'github_pr_diff',
        arguments: { prNumber: 1, number: 2 },
      });

      expect(prDiff).toHaveBeenCalledWith({ prNumber: 1, maxBytes: undefined });
    });

    it('returns the named missing-parameter error when neither is provided', async () => {
      const result = await client.callTool({
        name: 'github_pr_diff',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        { type: 'text', text: MISSING_PARAM_ERROR_PRNUMBER_PRIMARY },
      ]);
      expect(prDiff).not.toHaveBeenCalled();
    });
  });

  describe('github_pr_diagnose', () => {
    it('accepts "number" and forwards it to the handler', async () => {
      const result = await client.callTool({
        name: 'github_pr_diagnose',
        arguments: { number: 123 },
      });

      expect(result.isError).toBeFalsy();
      expect(diagnose).toHaveBeenCalledWith({ prNumber: 123 });
    });

    it('accepts the "prNumber" alias and forwards it as "number"', async () => {
      const result = await client.callTool({
        name: 'github_pr_diagnose',
        arguments: { prNumber: 456 },
      });

      expect(result.isError).toBeFalsy();
      expect(diagnose).toHaveBeenCalledWith({ prNumber: 456 });
    });

    it('prefers "number" when both are provided', async () => {
      await client.callTool({
        name: 'github_pr_diagnose',
        arguments: { number: 1, prNumber: 2 },
      });

      expect(diagnose).toHaveBeenCalledWith({ prNumber: 1 });
    });

    it('returns the named missing-parameter error when neither is provided', async () => {
      const result = await client.callTool({
        name: 'github_pr_diagnose',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        { type: 'text', text: MISSING_PARAM_ERROR },
      ]);
      expect(diagnose).not.toHaveBeenCalled();
    });
  });
});
