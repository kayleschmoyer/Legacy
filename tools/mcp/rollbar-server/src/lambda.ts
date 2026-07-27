import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import {
  authenticateMcpRequest,
  handleOAuthMetadataRequest,
  MCP_SCOPE,
} from '@legacy-sports/mcp-bearer-auth';
import { ROLLBAR_READ_TOKEN_ENV, tryGetRollbarToken } from './auth.js';
import { listItems } from './tools/list-items.js';
import { getItem } from './tools/get-item.js';
import { getOccurrence } from './tools/get-occurrence.js';
import { graphqlIntrospectType } from './tools/graphql-introspect-type.js';
import { listOccurrences } from './tools/list-occurrences.js';
import { setStatus } from './tools/set-status.js';
import { topActiveItems } from './tools/top-active-items.js';

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'legacy-sports-rollbar',
    version: '1.0.0',
  });

  server.tool(
    'rollbar_auth_status',
    'Check if the Rollbar read access token is configured. Call first in any Rollbar workflow; if not configured, the other rollbar_* tools will fail.',
    {},
    async () => {
      const token = await tryGetRollbarToken();
      const result = {
        configured: token !== null,
        tokenEnvVar: ROLLBAR_READ_TOKEN_ENV,
        fallback: token
          ? null
          : `Set ${ROLLBAR_READ_TOKEN_ENV} on the Lambda or populate the ROLLBAR_READ_TOKEN_SECRET_NAME secret in AWS Secrets Manager.`,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'rollbar_list_items',
    'List Rollbar items (deduplicated errors), optionally filtered by status, level, environment, or a search query. READ-ONLY.',
    {
      status: z
        .enum(['active', 'resolved', 'muted', 'archived'])
        .optional()
        .describe('Filter by item status (default: all)'),
      level: z
        .enum(['critical', 'error', 'warning', 'info', 'debug'])
        .optional()
        .describe('Filter by severity level'),
      environment: z
        .string()
        .optional()
        .describe('Filter by environment, e.g. "production"'),
      query: z
        .string()
        .optional()
        .describe('Free-text search over item titles'),
      page: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('1-based page number'),
      perPage: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Results per page (Rollbar default 20, max 100)'),
    },
    async (params) => listItems(params),
  );

  server.tool(
    'rollbar_get_item',
    'Fetch a single Rollbar item by internal id or by its per-project counter (the number in the item URL). READ-ONLY.',
    {
      id: z.number().int().positive().optional().describe('Internal item id'),
      counter: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Per-project item counter (shown in the Rollbar item URL)'),
    },
    async (params) => getItem(params),
  );

  server.tool(
    'rollbar_list_occurrences',
    'List recent occurrences (instances) of a Rollbar item by its internal item id, each with a truncated message summary. READ-ONLY.',
    {
      itemId: z
        .number()
        .int()
        .positive()
        .describe('Internal item id (the `id` field, not the counter)'),
      page: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('1-based page number'),
      perPage: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Results per page (Rollbar default 20, max 100)'),
    },
    async (params) => listOccurrences(params),
  );

  server.tool(
    'rollbar_get_occurrence',
    'Fetch the full payload of a Rollbar occurrence (instance) — returns the complete `data.body` (trace_chain, message, custom, logArgs) without truncation. Use `occurrenceId` for a specific occurrence or `itemId` to fetch the most recent occurrence of an item. READ-ONLY.',
    {
      occurrenceId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Specific occurrence (instance) id returned by rollbar_list_occurrences',
        ),
      itemId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Internal item id — fetches the most recent occurrence of this item',
        ),
    },
    async (params) => getOccurrence(params),
  );

  server.tool(
    'rollbar_set_status',
    'Set the status of a Rollbar item by internal id or per-project counter. WRITE — requires a token with the "write" scope (see rollbar_auth_status). Returns the updated item JSON.',
    {
      id: z.number().int().positive().optional().describe('Internal item id'),
      counter: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Per-project item counter (shown in the Rollbar item URL)'),
      status: z
        .enum(['active', 'resolved', 'muted', 'archived'])
        .describe('Target status for the item'),
    },
    async (params) => setStatus(params),
  );

  server.tool(
    'rollbar_top_active_items',
    'Report the most active items in the project (the dashboard "top active items" view), each with its summed recent occurrence count. READ-ONLY.',
    {
      environment: z
        .string()
        .optional()
        .describe('Filter by environment, e.g. "production"'),
    },
    async (params) => topActiveItems(params),
  );

  server.tool(
    'rollbar_graphql_introspect_type',
    "Introspect a single type's fields on a deployed GraphQL endpoint's schema — the MCP-native replacement for hand-rolling " +
      '`curl -X POST <endpoint> -d \'{"query":"{__type(name:\\"X\\"){fields{name}}}"}\'` during schema-mismatch RCA. ' +
      'Use this for the "Cannot query field X on type Y" class of Rollbar errors caused by client/server deploy lag. ' +
      'Pass `compareEnv` to also introspect a second environment and get the field-name differences between them in one call. ' +
      'Returns `type: null` (not an error) when the type does not exist on that schema, and surfaces GraphQL application errors ' +
      '(e.g. introspection disabled) in an `errors` field rather than failing the call. READ-ONLY.',
    {
      env: z
        .enum(['dev', 'prod'])
        .describe('Deployed environment to introspect'),
      typeName: z
        .string()
        .min(1)
        .describe('GraphQL type name to introspect, e.g. "TradeOfferPlayer"'),
      compareEnv: z
        .enum(['dev', 'prod'])
        .optional()
        .describe(
          'Optional second environment to introspect and diff field names against (e.g. env: "prod", compareEnv: "dev" to check for deploy lag)',
        ),
    },
    async (params) => graphqlIntrospectType(params),
  );

  return server;
}

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  // Public OAuth discovery endpoint — served before auth so a tokenless client
  // can fetch it (MCP Authorization spec / RFC 9728).
  const metadataResponse = handleOAuthMetadataRequest(event, {
    requiredScope: MCP_SCOPE.rollbar,
  });
  if (metadataResponse) return metadataResponse;

  const authError = await authenticateMcpRequest(event, {
    requiredScope: MCP_SCOPE.rollbar,
  });
  if (authError) return authError;

  const domainName = event.requestContext.domainName ?? 'localhost';
  const qs = event.rawQueryString ? `?${event.rawQueryString}` : '';
  const url = `https://${domainName}${event.rawPath}${qs}`;
  const bodyText = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf-8')
    : (event.body ?? undefined);

  const request = new Request(url, {
    method: event.requestContext.http.method,
    headers: new Headers(event.headers as Record<string, string>),
    body: ['GET', 'HEAD'].includes(event.requestContext.http.method)
      ? undefined
      : bodyText,
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const server = createMcpServer();
  await server.connect(transport);

  const response = await transport.handleRequest(request);
  await server.close();

  const responseBody = await response.text();
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return { statusCode: response.status, headers, body: responseBody };
};
