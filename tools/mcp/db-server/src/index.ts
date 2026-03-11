import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { migrationStatus } from './tools/migration-status.js';
import { migrate } from './tools/migrate.js';
import { query } from './tools/query.js';
import { printSchema } from './tools/print-schema.js';
import { checkHealth } from './tools/check-health.js';

const server = new McpServer({
  name: 'legacy-sports-db',
  version: '1.0.0',
});

// --- db_migration_status ---
server.tool(
  'db_migration_status',
  'Check pending database migration status. Returns applied/pending counts and pending migration names.',
  {
    worktreePath: z
      .string()
      .optional()
      .describe(
        'Absolute path to a worktree. If omitted, uses the repo root where this server lives.',
      ),
  },
  async (params) => migrationStatus(params),
);

// --- db_migrate ---
server.tool(
  'db_migrate',
  'Apply pending database migrations. Checks for pending migrations first and warns if none to apply.',
  {
    worktreePath: z
      .string()
      .optional()
      .describe(
        'Absolute path to a worktree. If omitted, uses the repo root where this server lives.',
      ),
  },
  async (params) => migrate(params),
);

// --- db_query ---
server.tool(
  'db_query',
  'Execute an ad-hoc SQL query against the database. READ-ONLY by default — refuses INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER unless allowWrite is set.',
  {
    query: z.string().describe('SQL query to execute'),
    format: z
      .enum(['table', 'json'])
      .default('json')
      .describe('Output format (default: json)'),
    allowWrite: z
      .boolean()
      .default(false)
      .describe(
        'Set to true to allow write operations. Defaults to false (read-only).',
      ),
  },
  async (params) => query(params),
);

// --- db_print_schema ---
server.tool(
  'db_print_schema',
  'Regenerate schema.graphql from the Pothos schema implementation. Reports whether schema.graphql changed.',
  {
    worktreePath: z
      .string()
      .optional()
      .describe(
        'Absolute path to a worktree. If omitted, uses the repo root where this server lives.',
      ),
  },
  async (params) => printSchema(params),
);

// --- db_check_health ---
server.tool(
  'db_check_health',
  'Pre-flight health check: is Docker running, is Postgres reachable, are migrations current? Run this before starting work.',
  {},
  async () => checkHealth(),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
