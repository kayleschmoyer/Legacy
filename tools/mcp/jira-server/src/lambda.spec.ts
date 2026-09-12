import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpCallerIdentity } from '@legacy-sports/mcp-bearer-auth';
import { callerFrom, createMcpServer, toAuthInfo } from './lambda';

describe('lambda caller identity plumbing (LS-10069)', () => {
  const identity: McpCallerIdentity = {
    kind: 'user',
    token: 'raw-bearer-token',
    sub: 'sub-123',
    username: 'google_12345',
    email: 'person@example.com',
    clientId: 'connector-client',
    tokenUse: 'access',
    scopes: ['openid', 'mcp/access'],
    expiresAt: 1_900_000_000,
  };

  it('round-trips kind/token/sub/email through AuthInfo', () => {
    const authInfo = toAuthInfo(identity);

    expect(authInfo.token).toBe('raw-bearer-token');
    expect(authInfo.clientId).toBe('connector-client');
    expect(authInfo.scopes).toEqual(['openid', 'mcp/access']);
    expect(authInfo.expiresAt).toBe(1_900_000_000);
    expect(callerFrom({ authInfo })).toEqual({
      kind: 'user',
      token: 'raw-bearer-token',
      sub: 'sub-123',
      email: 'person@example.com',
    });
  });

  it('carries a machine identity through as a machine caller', () => {
    const authInfo = toAuthInfo({
      ...identity,
      kind: 'machine',
      sub: 'connector-client',
      username: undefined,
      email: undefined,
    });

    expect(callerFrom({ authInfo })).toEqual(
      expect.objectContaining({ kind: 'machine', sub: 'connector-client' }),
    );
  });

  it('returns undefined when the request carried no authInfo (e.g. stdio)', () => {
    expect(callerFrom({})).toBeUndefined();
  });

  it('returns undefined when authInfo has no caller attached', () => {
    expect(
      callerFrom({ authInfo: { token: 't', clientId: 'c', scopes: [] } }),
    ).toBeUndefined();
  });
});

/**
 * Registration coverage for the hosted Lambda entry point. The stdio entry
 * point (index.ts) and lambda.ts register their tool sets independently, so a
 * tool added only to index.ts is silently absent from the hosted server
 * (LS-8611: jira_add_comment). These tests pin the Lambda registrations that
 * have drifted before.
 */
describe('lambda createMcpServer registrations', () => {
  async function listTools() {
    const server = createMcpServer();
    const client = new Client({ name: 'spec-client', version: '0.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const { tools } = await client.listTools();
    await client.close();
    await server.close();
    return tools;
  }

  it('registers jira_add_comment with key and body params', async () => {
    const tools = await listTools();
    const addComment = tools.find((t) => t.name === 'jira_add_comment');

    expect(addComment).toBeDefined();
    const props = addComment?.inputSchema['properties'] as Record<
      string,
      unknown
    >;
    expect(Object.keys(props)).toEqual(expect.arrayContaining(['key', 'body']));
  });

  it('registers jira_view with the attachment param and include option (LS-10016)', async () => {
    const tools = await listTools();
    const viewTool = tools.find((t) => t.name === 'jira_view');

    expect(viewTool).toBeDefined();
    const props = viewTool?.inputSchema['properties'] as Record<
      string,
      { type?: string; items?: { enum?: string[] } }
    >;
    expect(props['attachment']?.type).toBe('string');
    expect(props['include']?.items?.enum).toEqual(
      expect.arrayContaining(['attachments']),
    );
  });

  it('does not restrict jira_transition status to a closed enum', async () => {
    const tools = await listTools();
    const transition = tools.find((t) => t.name === 'jira_transition');

    expect(transition).toBeDefined();
    const props = transition?.inputSchema['properties'] as Record<
      string,
      { type?: string; enum?: string[] }
    >;
    expect(props['status']?.type).toBe('string');
    // "Won't Do" (and any other workflow-exposed status) must be reachable —
    // the closed enum was the LS-8611 gap.
    expect(props['status']?.enum).toBeUndefined();
  });
});
