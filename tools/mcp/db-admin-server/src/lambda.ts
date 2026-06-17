import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import {
  MCP_SCOPE,
  authenticateMcpRequest,
  handleOAuthMetadataRequest,
} from '@legacy-sports/mcp-bearer-auth';
import { query } from './tools/query.js';
import { migrationStatus } from './tools/migration-status.js';
import { migrate } from './tools/migrate.js';
import { extractCaller, type McpCaller } from './audit.js';

function createMcpServer(caller: McpCaller): McpServer {
  const server = new McpServer({
    name: 'legacy-sports-db-admin',
    version: '1.0.0',
  });

  server.tool(
    'db_query',
    'Execute a read-only SQL query against the dev database over HTTPS (no SSM tunnel). ' +
      'Connects as a SELECT-only Postgres role, so writes/DDL are rejected by the database engine, ' +
      'and a server-side statement_timeout (default 30s) bounds runaway queries. ' +
      'The SQL is executed verbatim (this is a console for trusted mcp/db-scoped agents — not user input); ' +
      'parameterization does not apply since the whole statement is the input. ' +
      'Returns { rows, rowCount, columns }.',
    {
      query: z
        .string()
        .describe('Read-only SQL query (SELECT / EXPLAIN / SHOW / WITH).'),
      format: z
        .enum(['table', 'json'])
        .default('json')
        .describe('Output format (default: json).'),
    },
    async (params) => query(params),
  );

  server.tool(
    'db_migration_status',
    'Report which migrations are applied vs pending on the dev database, over HTTPS (no SSM tunnel). ' +
      'Pass the local migration filenames (e.g. "20260616_120000_add_x.ts") so the server can compute ' +
      'the pending set; applied migrations are keyed by filename in drizzle.__drizzle_migrations.',
    {
      localMigrationNames: z
        .array(z.string())
        .default([])
        .describe(
          'Local migration filenames to diff against applied migrations.',
        ),
    },
    async (params) => migrationStatus(params),
  );

  server.tool(
    'db_migrate',
    'Apply UNMERGED local-branch migrations to the dev database over HTTPS (no SSM tunnel). ' +
      'The client transpiles each pending migration .ts to CJS JavaScript and sends ' +
      '{ migrations: [{ name, hash, jsSource }] } ordered by timestamp; the server evaluates ' +
      'each in a constrained sandbox and applies it transactionally as the migration_user role. ' +
      'Already-applied migrations are skipped; the run stops on the first failure. ' +
      'Returns { applied, appliedNames, skipped, success }. Dev-only.',
    {
      migrations: z
        .array(
          z.object({
            name: z
              .string()
              .describe('Migration filename, e.g. "20260616_120000_add_x.ts".'),
            hash: z.string().describe('Tracking key (the migration filename).'),
            jsSource: z
              .string()
              .describe(
                'Client-transpiled CJS source of the migration module.',
              ),
          }),
        )
        .describe('Pending migrations to apply, ordered by timestamp.'),
    },
    async (params) => migrate(params, caller),
  );

  return server;
}

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  // Public OAuth discovery endpoint — served before auth so a tokenless client
  // can fetch it (MCP Authorization spec / RFC 9728).
  const metadataResponse = handleOAuthMetadataRequest(event, {
    requiredScope: MCP_SCOPE.db,
  });
  if (metadataResponse) return metadataResponse;

  const authError = await authenticateMcpRequest(event, {
    requiredScope: MCP_SCOPE.db,
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

  // The bearer was already verified above; decode its claims for the
  // db_migrate audit log (LS-8119, AC4).
  const caller = extractCaller(event.headers);
  const server = createMcpServer(caller);
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
