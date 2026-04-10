import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { checkHealth } from './tools/check-health.js';
import { codegen } from './tools/codegen.js';
import { getUser } from './tools/get-user.js';
import { migrate } from './tools/migrate.js';
import { migrationStatus } from './tools/migration-status.js';
import { printSchema } from './tools/print-schema.js';
import { query } from './tools/query.js';
import { restoreDevSeed } from './tools/restore-dev-seed.js';

const server = new McpServer({
  name: 'legacy-sports-db',
  version: '1.0.0',
});

// --- db_check_health ---
server.tool(
  'db_check_health',
  'Pre-flight check: Docker running, Postgres reachable, migrations current.',
  {},
  async () => checkHealth(),
);

// --- db_codegen ---
server.tool(
  'db_codegen',
  'Prefer this over `pnpm exec nx affected -t codegen` via shell. Run GraphQL codegen via Nx affected. Optionally runs print-schema first.',
  {
    worktreePath: z
      .string()
      .optional()
      .describe('Worktree path (default: repo root)'),
    printSchemaFirst: z
      .boolean()
      .default(false)
      .describe('Run print-schema before codegen'),
    base: z
      .string()
      .optional()
      .describe('Nx affected base ref (default: origin/main)'),
    skipNxCache: z.boolean().default(false).describe('Skip Nx cache'),
  },
  async (params) => codegen(params),
);

// --- db_migrate ---
server.tool(
  'db_migrate',
  'Prefer this over `pnpm --prefix lib/db-client run db:up` via shell. Apply pending database migrations.',
  {
    worktreePath: z
      .string()
      .optional()
      .describe('Worktree path (default: repo root)'),
  },
  async (params) => migrate(params),
);

// --- db_migration_status ---
server.tool(
  'db_migration_status',
  'Prefer this over `pnpm --prefix lib/db-client run db:status` via shell. Check pending migration status. Returns applied/pending counts.',
  {
    worktreePath: z
      .string()
      .optional()
      .describe('Worktree path (default: repo root)'),
  },
  async (params) => migrationStatus(params),
);

// --- db_print_schema ---
server.tool(
  'db_print_schema',
  'Prefer this over `pnpm exec nx run db:print-schema` via shell. Regenerate schema.graphql from Pothos. Reports whether it changed.',
  {
    worktreePath: z
      .string()
      .optional()
      .describe('Worktree path (default: repo root)'),
  },
  async (params) => printSchema(params),
);

// --- db_get_user ---
server.tool(
  'db_get_user',
  'Look up a user profile by id, email, or username. Returns id, email, username, avatarUrl, accessLevel, subscriptionTier, and Discord fields. Read-only.',
  {
    identifier: z
      .string()
      .describe('The value to look up (user id, email address, or username)'),
    by: z
      .enum(['id', 'email', 'username'])
      .default('username')
      .describe('Which field to match against (default: username)'),
  },
  async (params) => getUser(params),
);

// --- db_query ---
server.tool(
  'db_query',
  'Prefer this over raw `psql` commands via shell. Execute ad-hoc SQL. READ-ONLY by default — refuses writes unless allowWrite is set.',
  {
    query: z.string().describe('SQL query to execute'),
    format: z
      .enum(['table', 'json'])
      .default('json')
      .describe('Output format (default: json)'),
    allowWrite: z
      .boolean()
      .default(false)
      .describe('Allow write operations (default: false)'),
  },
  async (params) => query(params),
);

// --- db_restore_dev_seed ---
server.tool(
  'db_restore_dev_seed',
  'Restore dev-seed.dump into local Docker postgres. DESTRUCTIVE: drops and recreates DB. Requires confirmDestructive=true.',
  {
    worktreePath: z
      .string()
      .optional()
      .describe('Worktree path (default: repo root)'),
    confirmDestructive: z
      .boolean()
      .default(false)
      .describe('Must be true to run (safety guard)'),
    runMigrationsAfter: z
      .boolean()
      .default(true)
      .describe('Run migrations after restore (default: true)'),
  },
  async (params) => restoreDevSeed(params),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
