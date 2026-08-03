import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { markPRReady } from './tools/mark-pr-ready';
import { prWhyBlocked } from './tools/pr-why-blocked';
import type { ToolResult } from './types';

jest.mock('./tools/mark-pr-ready');
jest.mock('./tools/pr-why-blocked');

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
});
