import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * The hosted Lambda serves its own tool reference at GET /docs, gated behind the
 * same bearer its tools require, and must never expose a way to pick a channel.
 * These cover the auth gate, the docs routing, and the tool surface itself
 * (read-only, no channel parameter anywhere).
 */

const mockAuthenticate =
  jest.fn<() => Promise<{ statusCode: number; body: string } | null>>();

jest.mock('@legacy-sports/mcp-bearer-auth', () => ({
  MCP_SCOPE: { discord: 'mcp/discord' },
  authenticateMcpRequest: () => mockAuthenticate(),
  handleOAuthMetadataRequest: () => null,
  extractCaller: () => null,
  runMcpTransport: async (
    run: () => Promise<Response>,
    close: () => Promise<void>,
  ) => {
    try {
      const response = await run();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return {
        statusCode: response.status,
        headers,
        body: await response.text(),
      };
    } finally {
      await close().catch(() => undefined);
    }
  },
}));

const docsEvent = (method = 'GET', rawPath = '/docs') =>
  ({
    rawPath,
    rawQueryString: '',
    headers: {},
    requestContext: { http: { method }, domainName: 'example.test' },
  }) as never;

const rpcEvent = (payload: unknown) =>
  ({
    rawPath: '/',
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(payload),
    isBase64Encoded: false,
    requestContext: { http: { method: 'POST' }, domainName: 'example.test' },
  }) as never;

describe('discord lambda GET /docs', () => {
  beforeEach(() => {
    mockAuthenticate.mockReset();
    jest.resetModules();
  });

  it('serves the tool reference to an authenticated caller', async () => {
    mockAuthenticate.mockResolvedValue(null);

    const { handler } = await import('./lambda.js');
    const response = (await handler(docsEvent())) as {
      statusCode: number;
      headers: Record<string, string>;
      body: string;
    };

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.body).toContain('<title>Discord MCP Tools</title>');
    expect(response.body).toContain('discord_read_messages');
  });

  it('returns the auth error instead of the page when the bearer is rejected', async () => {
    const authError = { statusCode: 200, body: '{"error":"unauthorized"}' };
    mockAuthenticate.mockResolvedValue(authError);

    const { handler } = await import('./lambda.js');
    const response = await handler(docsEvent());

    expect(response).toBe(authError);
  });

  it('leaves non-docs paths to the MCP transport', async () => {
    mockAuthenticate.mockResolvedValue(null);

    const { handler } = await import('./lambda.js');
    const response = (await handler(docsEvent('POST', '/'))) as {
      headers?: Record<string, string>;
    };

    expect(response.headers?.['content-type']).not.toBe(
      'text/html; charset=utf-8',
    );
  });
});

describe('discord lambda tool surface', () => {
  beforeEach(() => {
    mockAuthenticate.mockReset();
    mockAuthenticate.mockResolvedValue(null);
    jest.resetModules();
  });

  async function listTools(): Promise<
    Array<{
      name: string;
      inputSchema: { properties?: Record<string, unknown> };
    }>
  > {
    const { handler } = await import('./lambda.js');
    const response = (await handler(
      rpcEvent({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    )) as { body: string };
    const parsed = JSON.parse(response.body) as {
      result: {
        tools: Array<{
          name: string;
          inputSchema: { properties?: Record<string, unknown> };
        }>;
      };
    };
    return parsed.result.tools;
  }

  it('exposes only the three read-only tools', async () => {
    const tools = await listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'discord_auth_status',
      'discord_get_message',
      'discord_read_messages',
    ]);
  });

  it('lets no tool choose a channel', async () => {
    const tools = await listTools();

    for (const tool of tools) {
      const params = Object.keys(tool.inputSchema.properties ?? {});
      expect(params.filter((name) => /channel|guild/i.test(name))).toEqual([]);
    }
  });

  describe('discord_auth_status', () => {
    const saved = {
      token: process.env.DISCORD_BOT_TOKEN,
      channel: process.env.DISCORD_BUG_CHANNEL_ID,
    };

    afterEach(() => {
      if (saved.token === undefined) delete process.env.DISCORD_BOT_TOKEN;
      else process.env.DISCORD_BOT_TOKEN = saved.token;
      if (saved.channel === undefined)
        delete process.env.DISCORD_BUG_CHANNEL_ID;
      else process.env.DISCORD_BUG_CHANNEL_ID = saved.channel;
    });

    async function authStatus(): Promise<{
      configured: boolean;
      tokenConfigured: boolean;
      channelConfigured: boolean;
    }> {
      const { handler } = await import('./lambda.js');
      const response = (await handler(
        rpcEvent({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'discord_auth_status', arguments: {} },
        }),
      )) as { body: string };
      const parsed = JSON.parse(response.body) as {
        result: { content: Array<{ text: string }> };
      };
      return JSON.parse(parsed.result.content[0].text) as {
        configured: boolean;
        tokenConfigured: boolean;
        channelConfigured: boolean;
      };
    }

    it('reports configured when both the token and the channel are set', async () => {
      process.env.DISCORD_BOT_TOKEN = 'test-bot-token';
      process.env.DISCORD_BUG_CHANNEL_ID = '111111111111111111';

      expect(await authStatus()).toEqual({
        configured: true,
        tokenConfigured: true,
        channelConfigured: true,
        fallback: null,
      });
    });

    it('reports unconfigured when the channel is missing', async () => {
      process.env.DISCORD_BOT_TOKEN = 'test-bot-token';
      delete process.env.DISCORD_BUG_CHANNEL_ID;

      const status = await authStatus();

      expect(status.configured).toBe(false);
      expect(status.tokenConfigured).toBe(true);
      expect(status.channelConfigured).toBe(false);
    });
  });

  it('declares only the documented parameters on the read tools', async () => {
    const tools = await listTools();
    const paramsOf = (name: string) =>
      Object.keys(
        tools.find((tool) => tool.name === name)?.inputSchema.properties ?? {},
      ).sort();

    expect(paramsOf('discord_read_messages')).toEqual([
      'after',
      'before',
      'limit',
    ]);
    expect(paramsOf('discord_get_message')).toEqual(['id']);
  });
});
