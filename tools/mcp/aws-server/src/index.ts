import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { apigatewayInspect } from './tools/apigateway-inspect.js';
import { apigatewayV2Inspect } from './tools/apigatewayv2-inspect.js';
import {
  ec2ConsoleOutput,
  ec2DescribeImage,
  ec2Instances,
  ec2LaunchTemplateInspect,
  ec2NetworkInspect,
} from './tools/ec2.js';
import { iamGetPolicy } from './tools/iam-get-policy.js';
import { describeSecurityGroups } from './tools/security-groups.js';
import { lambdaStatus } from './tools/lambda-status.js';
import { LAMBDA_FUNCTIONS, logsTail } from './tools/logs-tail.js';
import {
  describeSecret,
  getSecretValue,
  listSecrets,
} from './tools/secretsmanager.js';
import { ssmGet } from './tools/ssm-get.js';
import { ssmRunCommand } from './tools/ssm-run-command.js';
import { mcpAuthRefresh } from './tools/mcp-auth-refresh.js';
import { ssoLogin } from './tools/sso-login.js';
import { ssoStatus } from './tools/sso-status.js';
import { terraformOutput } from './tools/terraform-output.js';
import {
  packerBuild,
  packerBuildStatus,
  packerBuildWait,
} from './tools/packer-build.js';

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

// --- aws_apigatewayv2_inspect ---
server.tool(
  'aws_apigatewayv2_inspect',
  'Inspect API Gateway v2 (HTTP and WebSocket) APIs. Lists v2 APIs and optionally expands their routes, authorizers, and integrations. Read-only — mutating ops (update-route, delete-authorizer, etc.) go through terraform. Replaces shell fallback to `aws apigatewayv2 get-apis / get-routes / get-authorizers / get-integrations`.',
  {
    apiNameFilter: z
      .string()
      .optional()
      .describe(
        'Case-insensitive substring filter applied to API names (e.g. "mcp" matches the 3 MCP HTTP APIs). Omit to list all v2 APIs.',
      ),
    includeRoutes: z
      .boolean()
      .default(true)
      .describe(
        "Include each API's routes (RouteId, RouteKey, AuthorizationType, AuthorizerId, Target). Default: true.",
      ),
    includeAuthorizers: z
      .boolean()
      .default(true)
      .describe(
        "Include each API's authorizers (AuthorizerType, JwtConfiguration, IdentitySource, AuthorizerUri). Default: true.",
      ),
    includeIntegrations: z
      .boolean()
      .default(true)
      .describe(
        "Include each API's integrations (IntegrationType, IntegrationUri, IntegrationMethod, PayloadFormatVersion). Default: true.",
      ),
  },
  async (params) => apigatewayV2Inspect(params),
);

// --- aws_logs_tail ---
server.tool(
  'aws_logs_tail',
  'Prefer this over `aws logs tail` via shell. Fetch recent CloudWatch logs for a Lambda function (app or runner infrastructure).',
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
    maxLines: z.coerce
      .number()
      .int()
      .positive()
      .max(1000)
      .default(500)
      .describe(
        'Cap output to the last N lines (default: 500, maximum: 1000). Use a smaller value for high-volume log groups to avoid token overflow.',
      ),
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

// --- aws_ssm_run_command ---
server.tool(
  'aws_ssm_run_command',
  'Run ad-hoc shell commands on an EC2 instance via AWS SSM (no SSH needed). Requires the instance to have the SSM agent running and the IAM role to have AmazonSSMManagedInstanceCore. Polls until completion and returns stdout/stderr. Use for debugging runner state (e.g. inspecting /opt/playwright-browsers).',
  {
    instanceId: z
      .string()
      .describe(
        'EC2 instance ID (e.g. "i-0abc1234def56789a"). Get from aws_ec2_instances.',
      ),
    commands: z
      .array(z.string())
      .min(1)
      .max(20)
      .describe(
        "Simple commands with arguments only. Each command is validated and must not contain: pipes (|), redirects (>, <), semicolons (;), ampersands (&), dollar signs ($), quotes (\" or '), backticks (`), parentheses, braces, backslashes, or newlines. Example: ['ls -la', 'cat /etc/hostname']",
      ),
    timeout: z.coerce
      .number()
      .int()
      .min(10)
      .max(3600)
      .default(60)
      .describe('Command timeout in seconds (min: 10, default: 60, max: 3600)'),
  },
  async (params) => ssmRunCommand(params),
);

// --- aws_secretsmanager_describe_secret ---
server.tool(
  'aws_secretsmanager_describe_secret',
  'Get metadata for a Secrets Manager secret (ARN, KMS key, rotation, last changed). Does NOT return the secret value. Use aws_secretsmanager_get_secret_value to write the value to a file.',
  {
    secretId: z
      .string()
      .describe(
        'Secret ID or name (e.g. "mlb-data-api-key" or "dev/mlb-data-api-key")',
      ),
    environment: z
      .enum(['dev', 'prod'])
      .default('dev')
      .describe('Environment prefix for short secret IDs (default: dev)'),
  },
  async (params) => describeSecret(params),
);

// --- aws_secretsmanager_get_secret_value ---
server.tool(
  'aws_secretsmanager_get_secret_value',
  'Write a Secrets Manager secret value to a local file. The value is NEVER returned in the tool response — only written to disk. Use the outputFile path with downstream tools (e.g. terraform apply). Follows secrets-handling best practices.',
  {
    secretId: z
      .string()
      .describe(
        'Secret ID or name (e.g. "mlb-data-api-key" or "dev/mlb-data-api-key")',
      ),
    environment: z
      .enum(['dev', 'prod'])
      .default('dev')
      .describe('Environment prefix for short secret IDs (default: dev)'),
    outputFile: z
      .string()
      .describe(
        'Relative path within the repo (absolute paths are rejected for safety). Example: "scratch/secret.tmp"',
      ),
  },
  async (params) => getSecretValue(params),
);

// --- aws_secretsmanager_list_secrets ---
server.tool(
  'aws_secretsmanager_list_secrets',
  'List Secrets Manager secret names and ARNs. No values are returned. Defaults to listing secrets with the environment prefix (e.g. "dev/").',
  {
    environment: z
      .enum(['dev', 'prod'])
      .default('dev')
      .describe('Environment prefix filter (default: dev)'),
    filter: z
      .string()
      .optional()
      .describe(
        'Override the name filter. Default is "{environment}/" prefix.',
      ),
  },
  async (params) => listSecrets(params),
);

// --- aws_mcp_auth_refresh ---
server.tool(
  'aws_mcp_auth_refresh',
  'Refresh the IAM Identity Center OIDC token used by the MCP API Gateway (jira/github/ci servers). Succeeds only when AWS SSO is currently authenticated — call aws_sso_status first if unsure. Uses the stored refresh token in .env.local; returns an error if the refresh token itself has expired (remedy: run node scripts/mcp-auth.mjs). On success, writes the new token to .env.local and reports minutes until expiry. A Claude Code session restart is required for the new token to be picked up by the URL-based MCP servers.',
  {},
  async () => mcpAuthRefresh(),
);

// --- aws_sso_status ---
server.tool(
  'aws_sso_status',
  'Prefer this over `aws sts get-caller-identity` via shell. Check AWS SSO session authentication. Returns caller identity or error with remedy.',
  {},
  async () => ssoStatus(),
);

// --- aws_sso_login ---
server.tool(
  'aws_sso_login',
  'Initiate AWS SSO login using --no-browser mode, which prints a device authorization URL instead of opening a browser. Returns the URL so the user can authenticate. Call aws_sso_status after authentication to verify. Use when aws_sso_status returns authenticated: false.',
  {
    profile: z
      .string()
      .regex(
        /^[A-Za-z0-9._-]+$/,
        'Profile name may only contain letters, digits, dots, underscores, and hyphens',
      )
      .optional()
      .describe(
        'AWS profile name (default: "default" or $AWS_PROFILE env var)',
      ),
  },
  async (params) => ssoLogin(params),
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

// --- aws_ec2_describe_security_groups ---
server.tool(
  'aws_ec2_describe_security_groups',
  'List EC2 security groups with their inbound/outbound rules. Filter by group IDs, environment tag, name pattern, or VPC ID. NOTE: groupIds is mutually exclusive with nameFilter and vpcId — pass one or the other, not both.',
  {
    groupIds: z
      .array(
        z
          .string()
          .regex(
            /^sg-[0-9a-f]{8,17}$/,
            'Each group ID must match sg-[0-9a-f]{8,17}',
          ),
      )
      .min(1, 'groupIds must contain at least one security group ID')
      .optional()
      .describe(
        'Specific security group IDs (e.g. ["sg-0abc1234"]). Must contain at least one ID when provided. Mutually exclusive with nameFilter and vpcId. Each ID must match sg-[0-9a-f]{8,17}.',
      ),
    environment: z
      .enum(['dev', 'prod'])
      .default('dev')
      .describe(
        'Filter by Environment tag (default: dev). Ignored when groupIds is provided.',
      ),
    nameFilter: z
      .string()
      .regex(
        /^[A-Za-z0-9._*-]+$/,
        'nameFilter may only contain alphanumerics, dots, underscores, hyphens, and wildcards (*)',
      )
      .optional()
      .describe(
        'Wildcard substring to match against group name (e.g. "rds" matches "*rds*"). Cannot be combined with groupIds.',
      ),
    vpcId: z
      .string()
      .regex(/^vpc-[0-9a-f]{8,17}$/, 'vpcId must match vpc-[0-9a-f]{8,17}')
      .optional()
      .describe(
        'Filter by VPC ID (must match vpc-[0-9a-f]{8,17}). Cannot be combined with groupIds.',
      ),
  },
  async (params) => describeSecurityGroups(params),
);

// --- aws_ec2_launch_template_inspect ---
server.tool(
  'aws_ec2_launch_template_inspect',
  'Inspect EC2 launch templates filtered by Environment tag (and optional name substring). Returns the latest version data: AMI (resolved through any `resolve:ssm:` indirection by calling SSM), instance type, key name, IAM instance profile, and tags. Used for "what is this fleet currently configured to launch?" debugging without chaining describe-launch-templates + describe-launch-template-versions + ssm get-parameter via Bash.',
  {
    environment: z
      .enum(['dev', 'prod'])
      .default('dev')
      .describe('Filter by Environment tag (default: dev)'),
    name: z
      .string()
      .optional()
      .describe(
        'Wildcard substring to match against the Name tag (e.g. "runner" matches "*runner*"). Optional.',
      ),
  },
  async (params) => ec2LaunchTemplateInspect(params),
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

// --- aws_ec2_describe_image ---
server.tool(
  'aws_ec2_describe_image',
  'Look up AMI metadata (name, creation date, state, tags) by image ID. Pass `tag` to return only the value of a single tag (e.g. PlaywrightVersion). Used to answer "what is baked into this AMI?" without falling back to raw `aws ec2 describe-images`.',
  {
    imageId: z.string().describe('The AMI ID (e.g. "ami-03f0d40f5298d8217").'),
    tag: z
      .string()
      .optional()
      .describe(
        'If provided, return only the value of this specific tag (e.g. "PlaywrightVersion", "PnpmVersion"). Otherwise return the full image metadata with all tags.',
      ),
  },
  async (params) => ec2DescribeImage(params),
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

// --- packer_build ---
server.tool(
  'packer_build',
  'Run `packer build` against an HCL template and return structured output: amiId, name, durationSec, snapshotId, tags, fullLogPath. Runs `packer init` first to install required plugins. Pass runInBackground=true to start the build asynchronously and get back a buildId — use packer_build_status to poll or packer_build_wait to block until done.',
  {
    hclPath: z
      .string()
      .describe(
        'Path to the Packer HCL template file, relative to the repo root (or worktreePath if provided). Example: "terraform/runners/packer/runner-ami.pkr.hcl".',
      ),
    vars: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Packer variable overrides passed as `-var key=value`. Example: { vpc_id: "vpc-0abc123", subnet_id: "subnet-0abc123", playwright_version: "1.50.0" }.',
      ),
    worktreePath: z
      .string()
      .optional()
      .describe(
        'Absolute path to a worktree to use as the working directory. Defaults to the repo root.',
      ),
    runInBackground: z
      .boolean()
      .default(false)
      .describe(
        'When true, spawn the build in the background and return immediately with a buildId. Use packer_build_status or packer_build_wait to track completion. Default: false (block until done).',
      ),
  },
  async (params) => packerBuild(params),
);

// --- packer_build_status ---
server.tool(
  'packer_build_status',
  'Check the status of a background Packer build started with packer_build(runInBackground=true). Returns status ("running" | "done" | "failed"), elapsed time, and a tail of the build log. When done, returns the same structured output as a synchronous packer_build call.',
  {
    buildId: z
      .string()
      .describe(
        'The buildId returned by packer_build when runInBackground=true.',
      ),
  },
  async (params) => packerBuildStatus(params),
);

// --- packer_build_wait ---
server.tool(
  'packer_build_wait',
  'Block until a background Packer build completes, then return the same structured output as a synchronous packer_build call. Use after packer_build(runInBackground=true) when you want to wait for the result in a later turn.',
  {
    buildId: z
      .string()
      .describe(
        'The buildId returned by packer_build when runInBackground=true.',
      ),
    pollIntervalSec: z.coerce
      .number()
      .int()
      .min(5)
      .max(300)
      .default(30)
      .describe(
        'How often to poll for completion in seconds (min: 5, default: 30, max: 300).',
      ),
    timeoutSec: z.coerce
      .number()
      .int()
      .min(60)
      .max(3600)
      .default(1800)
      .describe(
        'Maximum time to wait before returning a timeout error, in seconds (default: 1800 = 30 min).',
      ),
  },
  async (params) => packerBuildWait(params),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
