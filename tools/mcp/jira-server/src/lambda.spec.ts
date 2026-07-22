import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from './lambda';

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
