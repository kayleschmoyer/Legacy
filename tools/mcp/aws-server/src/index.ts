import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { apigatewayInspect } from './tools/apigateway-inspect.js';
import { lambdaStatus } from './tools/lambda-status.js';
import { LAMBDA_FUNCTIONS, logsTail } from './tools/logs-tail.js';
import { ssmGet } from './tools/ssm-get.js';
import { ssoStatus } from './tools/sso-status.js';
import { terraformOutput } from './tools/terraform-output.js';

const server = new McpServer({
  name: 'legacy-sports-aws',
  version: '1.0.0',
});

// --- aws_apigateway_inspect ---
server.tool(
  'aws_apigateway_inspect',
  'Inspect API Gateway routes. Finds routes by path pattern, shows integrations, and flags routes with missing Lambda integrations.',
  {
    path: z
      .string()
      .optional()
      .describe(
        'Regex pattern to filter routes by path (e.g. "rollbar-discord"). Omit to list all routes.',
      ),
    environment: z
      .enum(['dev', 'prod'])
      .default('dev')
      .describe('AWS environment (default: dev)'),
  },
  async (params) => apigatewayInspect(params),
);

// --- aws_logs_tail ---
server.tool(
  'aws_logs_tail',
  'Fetch recent CloudWatch logs for a Lambda function (app or runner infrastructure).',
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

// --- aws_lambda_status ---
server.tool(
  'aws_lambda_status',
  'Check Lambda function existence, state, runtime, and config. Returns exists:false if not found.',
  {
    function: z
      .string()
      .describe(
        'Lambda short name (e.g. "graphql", "rollbar-discord"). Expanded to legacy-sports-{env}-{name}.',
      ),
    environment: z
      .enum(['dev', 'prod'])
      .default('dev')
      .describe('AWS environment (default: dev)'),
  },
  async (params) => lambdaStatus(params),
);

// --- aws_ssm_get ---
server.tool(
  'aws_ssm_get',
  'Get SSM parameter(s). Tries exact match first, then path prefix. Useful for checking deploy versions.',
  {
    name: z
      .string()
      .describe(
        'Parameter name or path. Absolute paths (starting with /) used as-is; relative paths expanded to /legacy-sports/{env}/{name}.',
      ),
    environment: z
      .enum(['dev', 'prod'])
      .default('dev')
      .describe('AWS environment (default: dev)'),
    decrypt: z
      .boolean()
      .default(false)
      .describe(
        'Decrypt SecureString values (default: false). When false, SecureString values are redacted.',
      ),
  },
  async (params) => ssmGet(params),
);

// --- aws_sso_status ---
server.tool(
  'aws_sso_status',
  'Check AWS SSO session authentication. Returns caller identity or error with remedy.',
  {},
  async () => ssoStatus(),
);

// --- aws_terraform_output ---
server.tool(
  'aws_terraform_output',
  'Query Terraform state outputs. Runs `terraform output -json` and returns unwrapped values. Use instead of `cd terraform && terraform output -json | python -c ...`.',
  {
    keys: z
      .array(z.string())
      .optional()
      .describe(
        'Specific output keys to return (e.g. ["vpc_id", "private_subnet_ids"]). Omit to return all outputs.',
      ),
    chdir: z
      .string()
      .optional()
      .describe(
        'Terraform directory relative to repo root (default: "terraform").',
      ),
  },
  async (params) => terraformOutput(params),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
