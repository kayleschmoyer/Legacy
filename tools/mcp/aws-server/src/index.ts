import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { LAMBDA_FUNCTIONS, logsTail } from './tools/logs-tail.js';
import { ssoStatus } from './tools/sso-status.js';

const server = new McpServer({
  name: 'legacy-sports-aws',
  version: '1.0.0',
});

// --- aws_logs_tail ---
server.tool(
  'aws_logs_tail',
  'Fetch recent CloudWatch logs for a Legacy Sports Lambda function. Returns log events for the given time range. Automatically handles AWS_PAGER and Unicode encoding issues. If you get an SSO error, run `aws sso login` and retry.',
  {
    function: z
      .enum(LAMBDA_FUNCTIONS)
      .describe(
        'Lambda function short name. One of: graphql, db, oauth-proxy, notifications, stats, stats-lambda, game-selection, draft-processor, websocket, apple-iap, stripe-webhook.',
      ),
    since: z
      .string()
      .default('1h')
      .describe(
        'How far back to look. Examples: 5m, 30m, 1h, 2h, 1d. Defaults to 1h.',
      ),
    filter: z
      .string()
      .optional()
      .describe(
        'Filter pattern to search within log messages. Examples: "ERROR", "authentication failed". Omit to return all logs.',
      ),
    environment: z
      .enum(['dev', 'prod'])
      .default('dev')
      .describe('AWS environment. Defaults to dev.'),
  },
  async (params) => logsTail(params),
);

// --- aws_sso_status ---
server.tool(
  'aws_sso_status',
  'Check whether the current AWS SSO session is authenticated. Runs `aws sts get-caller-identity` and returns the caller identity (UserId, Account, ARN) on success, or a clear error with remedy instructions on failure. Run this before any AWS operation to detect expired credentials early.',
  {},
  async () => ssoStatus(),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
