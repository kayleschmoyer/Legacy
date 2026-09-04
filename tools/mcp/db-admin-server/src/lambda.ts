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
import { handleMcpDocsRequest } from '@legacy-sports/mcp-docs';
import { PAGE as DOCS_PAGE } from '@legacy-sports/mcp-docs/pages/db-admin';
import { query } from './tools/query.js';
import { migrationStatus } from './tools/migration-status.js';
import { migrate } from './tools/migrate.js';
import { execute } from './tools/execute.js';
import { extractCaller, type McpCaller } from './audit.js';
import {
  type DbMigrateWorkerEvent,
  isDbMigrateWorkerEvent,
} from './invoke-worker.js';
import { runDbMigrateWorker } from './worker.js';

function createMcpServer(caller: McpCaller): McpServer {
  const server = new McpServer({
    name: 'legacy-sports-db-admin',
    version: '1.0.0',
  });

  server.tool(
    'db_query',
    'Execute a read-only SQL query against the dev database over HTTPS. ' +
      'Connects as a SELECT-only Postgres role (writes/DDL rejected engine-side); ' +
      'a server-side statement_timeout (default 30s) bounds runaway queries. ' +
      'SQL runs verbatim for trusted mcp/db-scoped agents, not user input. ' +
      'Returns { rows, rowCount, columns }; failures return ' +
      '{ error: statement_timeout|sql_error|upstream_unavailable, elapsedMs, message, hint }.',
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
      'the pending set; applied migrations are keyed by filename in drizzle.__drizzle_migrations. ' +
      'Alternatively pass jobId (from db_migrate) to poll an async migration job: returns ' +
      '{ jobId, status: running|done|failed|orphaned, terminal, ... } and, once terminal, the full ' +
      'db_migrate result (applied, appliedNames, skipped, success, failed?, error?).',
    {
      localMigrationNames: z
        .array(z.string())
        .default([])
        .describe(
          'Local migration filenames to diff against applied migrations.',
        ),
      jobId: z
        .string()
        .optional()
        .describe(
          'Async db_migrate job id to poll instead of the applied/pending diff.',
        ),
    },
    async (params) => migrationStatus(params),
  );

  server.tool(
    'db_migrate',
    'Apply UNMERGED local-branch migrations to the dev database over HTTPS (no SSM tunnel). ' +
      'Send { migrations: [{ name, hash, tsSource }] } ordered by timestamp — tsSource is raw ' +
      '.ts source, transpiled server-side (no client esbuild step); jsSource (pre-transpiled ' +
      'CJS) also still works — exactly one per migration. ASYNC: validates, persists a job row, ' +
      'fires a worker, returns { jobId, status: "running" } — poll db_migration_status({ jobId }) ' +
      'every ~5s until terminal (done/failed/orphaned) for the result ({ applied, appliedNames, ' +
      'skipped, success, failed?, error? }). Already-applied migrations are skipped and the run ' +
      'stops on the first failure, so re-submitting after a failure is resume-safe. A running ' +
      'job is joined, not duplicated. Dev-only.',
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
              .optional()
              .describe(
                'Pre-transpiled CJS source (one of jsSource/tsSource).',
              ),
            tsSource: z
              .string()
              .optional()
              .describe(
                'Raw TS source; transpiled server-side (one of jsSource/tsSource).',
              ),
          }),
        )
        .describe('Pending migrations to apply, ordered by timestamp.'),
    },
    async (params) => migrate(params, caller),
  );

  server.tool(
    'db_execute',
    'Run a single ad-hoc DML statement (INSERT/UPDATE/DELETE) against the dev database over HTTPS ' +
      '(no SSM tunnel), for data an agent needs to write directly and cannot reach through a versioned ' +
      'migration (db_migrate) or the read-only public schema (db_query) — e.g. app_internal.* rows. ' +
      'Connects as the DML-only mcp_write Postgres role (INSERT/UPDATE/DELETE/SELECT on public + ' +
      'app_internal, no CREATE/ALTER/DROP grants at all), so DDL is rejected by the database engine. ' +
      'Exactly one statement per call (no ";"-stacked queries). Structure is trusted verbatim (console ' +
      'for mcp/db-scoped agents, not user input) — bind values via params ($1/$2/...), never ' +
      'interpolate into sql. Returns any RETURNING rows plus row count. Dev-only, like db_migrate.',
    {
      sql: z
        .string()
        .describe(
          'Single DML statement (INSERT / UPDATE / DELETE), optionally with a RETURNING clause.',
        ),
      params: z
        .array(z.unknown())
        .default([])
        .describe('Bind values for $1/$2/... placeholders in the statement.'),
      format: z
        .enum(['table', 'json'])
        .default('json')
        .describe('Output format (default: json).'),
    },
    async (params) => execute(params, caller),
  );

  return server;
}

export const handler = async (
  event: APIGatewayProxyEventV2 | DbMigrateWorkerEvent,
): Promise<APIGatewayProxyResultV2 | { ok: boolean }> => {
  // Async self-invoke from db_migrate (LS-8563): run the migration worker and
  // exit — no HTTP transport involved. This branch runs with the function's
  // full timeout; API Gateway's ~29s ceiling only applies to the HTTP path.
  // Unauthenticated by design and safe: this branch is reachable only by
  // principals holding lambda:InvokeFunction on this function (the function's
  // own role, for the self-invoke). HTTP traffic always arrives as an API
  // Gateway proxy event — a request body claiming to be a worker event stays
  // nested inside event.body (a string) and never matches this shape — and the
  // job row it points at was created by a bearer-authenticated db_migrate call.
  if (isDbMigrateWorkerEvent(event)) {
    await runDbMigrateWorker(event.dbMigrateJobId);
    return { ok: true };
  }

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

  // Human-readable tool reference for this server, served to a browser at
  // GET /docs. Placed after the auth check on purpose: tool descriptions
  // name internal buckets, workflows, and ticket keys, so the page needs the
  // same bearer the tools do. Fetch it with `make mcp-docs SERVER=db-admin`.
  const docsResponse = handleMcpDocsRequest(event, DOCS_PAGE);
  if (docsResponse) return docsResponse;

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
