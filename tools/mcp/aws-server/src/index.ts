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
  'Fetch recent CloudWatch logs for a Lambda function.',
  {
    function: z.enum(LAMBDA_FUNCTIONS).describe('Lambda function short name'),
    since: z
      .string()
      .default('1h')
      .describe('Lookback period, e.g. 5m, 1h, 1d (default: 1h)'),
    filter: z.string().optional().describe('Filter pattern for log messages'),
    environment: z
      .enum(['dev', 'prod'])
      .default('dev')
      .describe('AWS environment (default: dev)'),
  },
  async (params) => logsTail(params),
);

// --- aws_sso_status ---
server.tool(
  'aws_sso_status',
  'Check AWS SSO session authentication. Returns caller identity or error with remedy.',
  {},
  async () => ssoStatus(),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
