import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { apigatewayInspect } from './tools/apigateway-inspect.js';
import { apigatewayV2Inspect } from './tools/apigatewayv2-inspect.js';
import { cloudTrailLookup } from './tools/cloudtrail.js';
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
import { logsFilter, MAX_EVENTS, MAX_CHARS } from './tools/logs-filter.js';
import {
  describeSecret,
  getSecretValue,
  listSecrets,
} from './tools/secretsmanager.js';
import { syncSecretToGithub } from './tools/sync-to-github.js';
import { ssmGet } from './tools/ssm-get.js';
import { ssmRunCommand } from './tools/ssm-run-command.js';
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
  'Prefer this over `aws logs tail` via shell. Fetch recent CloudWatch logs for a Lambda function. ' +
    'Returns markdown by default (an `### Errors` section plus a `### Recent` tail); pass format: "json" ' +
    'for the structured payload. `functions` runs 1-10 in batch, isolating per-function failures. ' +
    'For incident forensics pin an exact window with startTime/endTime instead of the rolling `since`. ' +
    'Investigation workflow: .agents/skills/cloudwatch-archaeology/SKILL.md.',
  {
    function: z
      .enum(LAMBDA_FUNCTIONS)
      .optional()
      .describe(
        'Lambda function short name (singular). Provide this OR `functions`, not both.',
      ),
    functions: z
      .array(z.enum(LAMBDA_FUNCTIONS))
      .min(1)
      .max(10)
      .optional()
      .describe(
        'Batch mode: 1-10 function short names, fetched concurrently as `{ logs: { [name]: <block> } }`.',
      ),
    since: z
      .string()
      .default('1h')
      .describe(
        'Rolling lookback period, e.g. 5m, 1h, 1d (default: 1h). Ignored when `startTime` is provided.',
      ),
    startTime: z
      .string()
      .datetime()
      .optional()
      .describe(
        'Absolute window start (ISO-8601). Overrides `since`. Pair with `endTime` for a closed window.',
      ),
    endTime: z
      .string()
      .datetime()
      .optional()
      .describe(
        'Absolute window end (ISO-8601). Requires `startTime`; omit to tail through to now.',
      ),
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
    maxBytes: z.coerce
      .number()
      .int()
      .positive()
      .default(150_000)
      .describe(
        'Byte-cap on logs, in addition to maxLines (default: 150000). Truncates cleanly instead of erroring.',
      ),
    format: z
      .enum(['markdown', 'json'])
      .default('markdown')
      .describe(
        'Output shape. `markdown` (default) groups extracted ERROR/WARN/Exception lines into a top `### Errors` section followed by a `### Recent` code-block with the last 50 log lines — far cheaper for the agent to read. `json` returns the original structured payload with the full `logs` string.',
      ),
  },
  async (params) => logsTail(params),
);

// --- aws_logs_filter ---
server.tool(
  'aws_logs_filter',
  `Search CloudWatch log events by log group and optional filter pattern. Accepts any log group name (including leading-slash names like /aws/lambda/... and /aws/apigateway/...) and returns structured { timestamp, message } events. Hard-capped at ${MAX_EVENTS} events or ${MAX_CHARS} chars (whichever is smaller); returns truncated: true when the cap is hit. Use startTime/endTime (epoch ms) to scope a specific window. Prefer this over shell aws logs filter-log-events to avoid Windows path mangling and encoding issues.`,
  {
    logGroup: z
      .string()
      .describe(
        'CloudWatch log group name. Leading slash required for AWS-managed groups (e.g. /aws/lambda/legacy-sports-dev-graphql, /aws/apigateway/legacy-sports-dev-api/access-logs).',
      ),
    filterPattern: z
      .string()
      .optional()
      .describe(
        'CloudWatch filter pattern (e.g. "ERROR", "{ $.statusCode = 500 }", "deleteAllLeagues"). Omit to return all events.',
      ),
    startTime: z
      .number()
      .int()
      .optional()
      .describe('Start of the time range as epoch milliseconds (inclusive).'),
    endTime: z
      .number()
      .int()
      .optional()
      .describe('End of the time range as epoch milliseconds (exclusive).'),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_EVENTS)
      .default(MAX_EVENTS)
      .describe(
        `Maximum number of events to return (default: ${MAX_EVENTS}, hard cap: ${MAX_EVENTS}). Output is also capped at ${MAX_CHARS} chars.`,
      ),
    format: z
      .enum(['markdown', 'json'])
      .default('markdown')
      .describe(
        'Output shape. `markdown` (default) renders a header block plus a timestamped code block — cheaper for the agent to read. `json` returns the full structured payload.',
      ),
  },
  async (params) => logsFilter(params),
);

// --- aws_lambda_status ---
server.tool(
  'aws_lambda_status',
  'Check Lambda function existence, state, runtime, and config. Returns exists:false if not found. Pass `functions: string[]` (1-25) for batch mode: per-function describes run concurrently (cap 5) and return `{ statuses: { [name]: <entry> }, missing: [{ function, error }] }`. One failing function does not fail the others.',
  {
    function: z
      .string()
      .optional()
      .describe(
        'Lambda short name (e.g. "graphql", "rollbar-discord"). Expanded to legacy-sports-{env}-{name}. Provide this OR `functions`, not both.',
      ),
    functions: z
      .array(z.string())
      .min(1)
      .max(25)
      .optional()
      .describe(
        'Batch mode: 1-25 Lambda short names. Describes run concurrently (cap 5) and return `{ statuses: { [name]: <entry> }, missing: [{ function, error }] }`.',
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
  'Run ad-hoc shell commands on an EC2 instance via AWS SSM (no SSH needed). Requires the instance to have the SSM agent running and the IAM role to have AmazonSSMManagedInstanceCore. Polls up to 55s per call and returns stdout/stderr when done; a still-running command returns an in-progress snapshot with a re-arm hint — call again with the returned commandId to continue waiting. Use for debugging runner state (e.g. inspecting /opt/playwright-browsers).',
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
      .optional()
      .describe(
        "Simple commands with arguments only. Required unless commandId is provided. Each command is validated and must not contain: pipes (|), redirects (>, <), semicolons (;), ampersands (&), dollar signs ($), quotes (\" or '), backticks (`), parentheses, braces, backslashes, or newlines. Example: ['ls -la', 'cat /etc/hostname']",
      ),
    commandId: z
      .string()
      .optional()
      .describe(
        'Re-attach to a command a previous aws_ssm_run_command call returned an in-progress snapshot for. When provided, commands is ignored and this call only polls for completion.',
      ),
    timeout: z.coerce
      .number()
      .int()
      .min(10)
      .max(3600)
      .default(60)
      .describe(
        'Server-side SSM command timeout in seconds (min: 10, default: 60, max: 3600). Not the per-call poll budget — see maxWaitSeconds.',
      ),
    maxWaitSeconds: z.coerce
      .number()
      .int()
      .min(5)
      .max(55)
      .default(55)
      .describe(
        'Max seconds this call polls before returning an in-progress snapshot with a re-arm hint (default and cap: 55).',
      ),
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

// --- secret_sync_to_github ---
server.tool(
  'secret_sync_to_github',
  'Atomically propagate a value from AWS Secrets Manager to a GitHub secret without the value ever crossing the agent transcript. Fetches the AWS secret server-side, pipes it via stdin to `gh secret set` (which handles libsodium encryption), and returns only metadata. Supports repo (default), environment (--env), and dependabot scopes. The canonical "never embed secrets in tool calls" pattern — use this instead of pairing aws_secretsmanager_get_secret_value with github_secret_set.',
  {
    secretId: z
      .string()
      .describe(
        'AWS secret ID or name (e.g. "mlb-data-api-key" or "dev/mlb-data-api-key"). Short IDs are prefixed with the environment.',
      ),
    repoSecret: z
      .string()
      .describe(
        'GitHub secret name (e.g. "AGENT_AUTHOR_APP_PRIVATE_KEY"). Must match /^[A-Za-z_][A-Za-z0-9_]*$/ and must not start with "GITHUB_".',
      ),
    environment: z
      .enum(['dev', 'prod'])
      .default('dev')
      .describe('AWS environment prefix for short secretIds (default: dev).'),
    env: z
      .string()
      .optional()
      .describe(
        'GitHub environment name. Required when scope="environment", ignored otherwise.',
      ),
    scope: z
      .enum(['repo', 'environment', 'dependabot'])
      .default('repo')
      .describe(
        'GitHub secret scope: "repo" = Actions repository secret (default); "environment" = environment secret (requires env); "dependabot" = Dependabot secret.',
      ),
    repo: z
      .string()
      .optional()
      .describe(
        'GitHub repository in "owner/name" form. Defaults to the current repo as resolved by the gh CLI.',
      ),
  },
  async (params) => syncSecretToGithub(params),
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
  'Query Terraform state outputs. Runs `terraform output -json` and returns unwrapped values. Defaults to terraform/main; pass `chdir: "terraform/runners"` for runner-specific outputs (github_runners_webhook_url). Falls back to the main checkout if uninitialized. Use instead of `cd terraform/main && terraform output -json | python -c ...`.',
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

// --- aws_cloudtrail_lookup ---
server.tool(
  'aws_cloudtrail_lookup',
  'Look up CloudTrail events to diagnose EC2 instance lifecycle transitions: spot eviction (BidEvictedEvent), scale-down termination, or manual terminate. Pass mode="death-verdict" with an instanceId to get a { verdict, events[] } summary (verdict: "spot" | "scale-down" | "manual" | "unknown"). Pass mode="events" (default) to get raw compact events. Capped at 50 events. Replaces shell fallback to `aws cloudtrail lookup-events`.',
  {
    instanceId: z
      .string()
      .optional()
      .describe(
        'EC2 instance ID (e.g. "i-0abc1234def56789a"). Required for mode="death-verdict". Used to filter events by ResourceName (TerminateInstances) and by CloudTrailEvent payload (BidEvictedEvent, which has an empty ResourceName).',
      ),
    eventName: z
      .string()
      .optional()
      .describe(
        'CloudTrail event name to look up (e.g. "BidEvictedEvent", "TerminateInstances", "RunInstances"). Must be alphanumeric only. If both eventName and instanceId are provided in events mode, the query is by eventName and filtered client-side by instanceId.',
      ),
    startTime: z
      .string()
      .optional()
      .describe(
        'Start of the lookup window as an ISO 8601 timestamp (e.g. "2024-01-15T12:00:00Z"). CloudTrail retains events for 90 days.',
      ),
    endTime: z
      .string()
      .optional()
      .describe(
        'End of the lookup window as an ISO 8601 timestamp (e.g. "2024-01-15T13:00:00Z").',
      ),
    mode: z
      .enum(['events', 'death-verdict'])
      .default('events')
      .describe(
        '"events" (default): returns compact events with { eventTime, eventName, username, instanceIds[], terminationReason }. "death-verdict": requires instanceId; runs two parallel lookups (ResourceName and BidEvictedEvent) and returns { verdict, events[] } where verdict is "spot" | "scale-down" | "manual" | "unknown".',
      ),
  },
  async (params) => cloudTrailLookup(params),
);

// --- aws_ec2_instances ---
server.tool(
  'aws_ec2_instances',
  'List EC2 instances filtered by environment tag. Returns instanceId, type, state, stateReason, instanceLifecycle, name tag, IPs, launchTime, imageId, and keyName.',
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
  '`action: "build"` (default) runs `packer build` in the background; by default this call waits up to 45s and returns either the finished result (amiId, name, durationSec, snapshotId, tags, logPath) or a running snapshot with a buildId + re-arm hint — poll with packer_build_status/packer_build_wait, or pass runInBackground=true to return immediately. `action: "fmt"`/`"validate"` are low-cost sync checks — prefer over shelling out; return `{ ok, diff }` / `{ ok, errors[] }`, capped at 5000 chars.',
  {
    action: z
      .enum(['build', 'fmt', 'validate'])
      .default('build')
      .describe(
        '"build": async AMI build (runInBackground/maxWaitSeconds). "fmt": packer fmt (check/diff). "validate": packer validate (syntaxOnly).',
      ),
    hclPath: z
      .string()
      .describe(
        'Path to the Packer HCL template file (.pkr.hcl), relative to the repo root (or worktreePath if provided). Path characters only — no spaces, quotes, or shell metacharacters. Example: "terraform/runners/packer/runner-ami.pkr.hcl".',
      ),
    vars: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'build only. Packer `-var key=value` overrides. Names: [A-Za-z0-9_-]+; values must not contain quotes, backticks, backslashes, newlines, or shell operators. Example: { vpc_id: "vpc-0abc123", subnet_id: "subnet-0abc123" }.',
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
        'build only. When true, return immediately with a buildId instead of waiting up to maxWaitSeconds. Default: false.',
      ),
    maxWaitSeconds: z.coerce
      .number()
      .int()
      .min(0)
      .max(55)
      .default(45)
      .describe(
        'build only. Max seconds to wait before returning a running snapshot (default: 45, cap: 55).',
      ),
    check: z
      .boolean()
      .default(true)
      .describe('fmt only. Pass `-check` to packer fmt. Default: true.'),
    diff: z
      .boolean()
      .default(true)
      .describe('fmt only. Pass `-diff` to packer fmt. Default: true.'),
    syntaxOnly: z
      .boolean()
      .default(true)
      .describe(
        'validate only. Pass `-syntax-only` to packer validate. Default: true.',
      ),
  },
  async (params) => packerBuild(params),
);

// --- packer_build_status ---
server.tool(
  'packer_build_status',
  'Check the status of a background Packer build. Returns status ("running" | "done" | "failed"), elapsed time, and a tail of the build log. When done, returns the same structured output as a completed packer_build call.',
  {
    buildId: z
      .string()
      .describe('The buildId returned by a previous packer_build call.'),
  },
  async (params) => packerBuildStatus(params),
);

// --- packer_build_wait ---
server.tool(
  'packer_build_wait',
  'Bounded wait for a background Packer build: each call waits up to 55s and returns the finished structured result, or a status snapshot with a re-arm hint if the build is still running — never an error while in progress. Re-invoke to continue waiting. Do NOT re-run packer_build.',
  {
    buildId: z
      .string()
      .describe('The buildId returned by a previous packer_build call.'),
    pollIntervalSec: z.coerce
      .number()
      .int()
      .min(1)
      .max(55)
      .default(5)
      .describe(
        'How often to poll for completion in seconds (min: 1, default: 5, max: 55).',
      ),
    timeoutSec: z.coerce
      .number()
      .int()
      .min(5)
      .max(55)
      .default(55)
      .describe(
        'Max seconds this call waits before returning an in-progress snapshot with a re-arm hint (default and cap: 55).',
      ),
  },
  async (params) => packerBuildWait(params),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
