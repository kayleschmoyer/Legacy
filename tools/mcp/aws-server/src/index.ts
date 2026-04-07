import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { apigatewayInspect } from './tools/apigateway-inspect.js';
import {
  ec2ConsoleOutput,
  ec2Instances,
  ec2NetworkInspect,
} from './tools/ec2.js';
import { iamGetPolicy } from './tools/iam-get-policy.js';
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
  'Query Terraform state outputs. Runs `terraform output -json` and returns unwrapped values. Defaults to terraform/main; pass `chdir: "terraform/runners"` for runner-specific outputs (github_runners_webhook_url). Use instead of `cd terraform/main && terraform output -json | python -c ...`.',
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
        'Terraform directory relative to repo root (default: "terraform/main"). Use "terraform/runners" for runner state outputs.',
      ),
  },
  async (params) => terraformOutput(params),
);

// --- aws_ec2_instances ---
server.tool(
  'aws_ec2_instances',
  'List EC2 instances filtered by environment tag. Returns instanceId, type, state, name tag, IPs, launchTime, imageId, and keyName.',
  {
    environment: z
      .enum(['dev', 'prod'])
      .default('dev')
      .describe('Filter by Environment tag (default: dev)'),
    state: z
      .enum(['running', 'stopped', 'pending', 'terminated'])
      .optional()
      .describe(
        'Filter by instance state. Omit to return instances in all states.',
      ),
    nameFilter: z
      .string()
      .optional()
      .describe(
        'Wildcard substring to match against the Name tag (e.g. "runner" matches "*runner*").',
      ),
  },
  async (params) => ec2Instances(params),
);

// --- aws_ec2_console_output ---
server.tool(
  'aws_ec2_console_output',
  'Retrieve the system console output for an EC2 instance. Useful for diagnosing boot failures, kernel panics, and cloud-init errors on instances that cannot be SSH-ed into.',
  {
    instanceId: z
      .string()
      .describe('EC2 instance ID (e.g. "i-0abc123def456789").'),
    latest: z
      .boolean()
      .default(true)
      .describe(
        'Retrieve the most recent 64 KB of console output (default: true). Set false to get the oldest available output.',
      ),
  },
  async (params) => ec2ConsoleOutput(params),
);

// --- aws_ec2_network_inspect ---
server.tool(
  'aws_ec2_network_inspect',
  'Discover the project VPC and its subnets in one call. Returns the VPC (id, CIDR, name, tags) plus subnets grouped into public/private/database categories using the Name tag (and falling back to MapPublicIpOnLaunch). Used to find a public subnet for Packer / temporary build instances without chaining describe-vpcs + describe-subnets via Bash.',
  {
    environment: z
      .enum(['dev', 'prod'])
      .default('dev')
      .describe('Filter by Environment tag (default: dev)'),
    subnetType: z
      .enum(['public', 'private', 'all'])
      .default('all')
      .describe(
        'Subnet category to return (default: all). "public" or "private" filter the response; "all" returns every category including database subnets.',
      ),
  },
  async (params) => ec2NetworkInspect(params),
);

// --- aws_iam_get_policy ---
server.tool(
  'aws_iam_get_policy',
  'Fetch an IAM policy document by ARN. Returns the default policy version document (URL-decoded JSON). Optionally lists all available versions.',
  {
    policyArn: z
      .string()
      .describe(
        'Full IAM policy ARN (e.g. "arn:aws:iam::123456789012:policy/MyPolicy" or a managed policy ARN like "arn:aws:iam::aws:policy/ReadOnlyAccess").',
      ),
    listVersions: z
      .boolean()
      .default(false)
      .describe(
        'Also return a summary of all policy versions (versionId, isDefault, createDate). Default: false.',
      ),
  },
  async (params) => iamGetPolicy(params),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
