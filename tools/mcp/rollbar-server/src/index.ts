import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ROLLBAR_READ_TOKEN_ENV, tryGetRollbarToken } from './auth.js';
import { listItems } from './tools/list-items.js';
import { getItem } from './tools/get-item.js';
import { listOccurrences } from './tools/list-occurrences.js';
import { topActiveItems } from './tools/top-active-items.js';

// Check the token at startup — warn if missing but don't exit. The
// rollbar_auth_status tool lets agents decide whether to use this server.
if (!tryGetRollbarToken()) {
  process.stderr.write(
    `[legacy-sports-rollbar] No ${ROLLBAR_READ_TOKEN_ENV} found. Read tools will fail until it is set. ` +
      'Generate a "read" scope project access token in Rollbar and set it in .env.local.\n',
  );
}

const server = new McpServer({
  name: 'legacy-sports-rollbar',
  version: '1.0.0',
});

// --- rollbar_auth_status ---
server.tool(
  'rollbar_auth_status',
  'Check if the Rollbar read access token is configured. Call first in any Rollbar workflow; if not configured, the other rollbar_* tools will fail.',
  {},
  async () => {
    const token = tryGetRollbarToken();
    const result = {
      configured: token !== null,
      tokenEnvVar: ROLLBAR_READ_TOKEN_ENV,
      fallback: token
        ? null
        : `Set ${ROLLBAR_READ_TOKEN_ENV} in .env.local from a Rollbar "read" scope project access token.`,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  },
);

// --- rollbar_list_items ---
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
    query: z.string().optional().describe('Free-text search over item titles'),
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

// --- rollbar_get_item ---
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

// --- rollbar_list_occurrences ---
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

// --- rollbar_top_active_items ---
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

const transport = new StdioServerTransport();
await server.connect(transport);
