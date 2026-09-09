# AWS MCP Tool Catalog

> GENERATED FILE — DO NOT EDIT.
>
> Source: `tools/mcp/aws-server/src/{index,lambda}.ts`. Regenerate with 
> `make mcp-api-reference`; CI fails on drift (LS-9701 Tier 2, review pattern #48).
>
> For the interactive, filterable version of this same data across every
> server: [`docs/mcp/api-reference.html`](../../../../../docs/mcp/api-reference.html).

CloudWatch logs, Lambda/EC2/API Gateway inspection, Secrets Manager, SSM, and SSO auth health.

Local stdio process only — not exposed as a hosted connector. 25 tools.

---

### `aws_apigateway_inspect`

Inspect API Gateway routes. Finds routes by path pattern, shows integrations, and flags routes with missing Lambda integrations.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `path` | string |  | — | Regex pattern to filter routes by path (e.g. "rollbar-discord"). Omit to list all routes. |
| `environment` | enum |  | — | AWS environment (default: dev) |

### `aws_apigatewayv2_inspect`

Inspect API Gateway v2 (HTTP and WebSocket) APIs. Lists v2 APIs and optionally expands their routes, authorizers, and integrations. Read-only — mutating ops (update-route, delete-authorizer, etc.) go through terraform. Replaces shell fallback to `aws apigatewayv2 get-apis / get-routes / get-authorizers / get-integrations`.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `apiNameFilter` | string |  | — | Case-insensitive substring filter applied to API names (e.g. "mcp" matches the 3 MCP HTTP APIs). Omit to list all v2 APIs. |
| `includeRoutes` | boolean |  | — | Include each API's routes (RouteId, RouteKey, AuthorizationType, AuthorizerId, Target). Default: true. |
| `includeAuthorizers` | boolean |  | — | Include each API's authorizers (AuthorizerType, JwtConfiguration, IdentitySource, AuthorizerUri). Default: true. |
| `includeIntegrations` | boolean |  | — | Include each API's integrations (IntegrationType, IntegrationUri, IntegrationMethod, PayloadFormatVersion). Default: true. |

### `aws_cloudtrail_lookup`

Look up CloudTrail events to diagnose EC2 instance lifecycle transitions: spot eviction (BidEvictedEvent), scale-down termination, or manual terminate. Pass mode="death-verdict" with an instanceId to get a { verdict, events[] } summary (verdict: "spot" | "scale-down" | "manual" | "unknown"). Pass mode="events" (default) to get raw compact events. Capped at 50 events. Replaces shell fallback to `aws cloudtrail lookup-events`.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `instanceId` | string |  | — | EC2 instance ID (e.g. "i-0abc1234def56789a"). Required for mode="death-verdict". Used to filter events by ResourceName (TerminateInstances) and by CloudTrailEvent payload (BidEvictedEvent, which has an empty ResourceName). |
| `eventName` | string |  | — | CloudTrail event name to look up (e.g. "BidEvictedEvent", "TerminateInstances", "RunInstances"). Must be alphanumeric only. If both eventName and instanceId are provided in events mode, the query is by eventName and filtered client-side by instanceId. |
| `startTime` | string |  | — | Start of the lookup window as an ISO 8601 timestamp (e.g. "2024-01-15T12:00:00Z"). CloudTrail retains events for 90 days. |
| `endTime` | string |  | — | End of the lookup window as an ISO 8601 timestamp (e.g. "2024-01-15T13:00:00Z"). |
| `mode` | enum |  | — | "events" (default): returns compact events with { eventTime, eventName, username, instanceIds[], terminationReason }. "death-verdict": requires instanceId; runs two parallel lookups (ResourceName and BidEvictedEvent) and returns { verdict, events[] } where verdict is "spot" \| "scale-down" \| "manual" \| "unknown". |

### `aws_ec2_console_output`

Retrieve the system console output for an EC2 instance. Useful for diagnosing boot failures, kernel panics, and cloud-init errors on instances that cannot be SSH-ed into.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `instanceId` | string | **required** | — | EC2 instance ID (e.g. "i-0abc123def456789"). |
| `latest` | boolean |  | — | Retrieve the most recent 64 KB of console output (default: true). Set false to get the oldest available output. |

### `aws_ec2_describe_image`

Look up AMI metadata (name, creation date, state, tags) by image ID. Pass `tag` to return only the value of a single tag (e.g. PlaywrightVersion). Used to answer "what is baked into this AMI?" without falling back to raw `aws ec2 describe-images`.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `imageId` | string | **required** | — | The AMI ID (e.g. "ami-03f0d40f5298d8217"). |
| `tag` | string |  | — | If provided, return only the value of this specific tag (e.g. "PlaywrightVersion", "PnpmVersion"). Otherwise return the full image metadata with all tags. |

### `aws_ec2_describe_security_groups`

List EC2 security groups with their inbound/outbound rules. Filter by group IDs, environment tag, name pattern, or VPC ID. NOTE: groupIds is mutually exclusive with nameFilter and vpcId — pass one or the other, not both.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `groupIds` | string[] |  | min 1 | Specific security group IDs (e.g. ["sg-0abc1234"]). Must contain at least one ID when provided. Mutually exclusive with nameFilter and vpcId. Each ID must match sg-[0-9a-f]{8,17}. |
| `environment` | enum |  | — | Filter by Environment tag (default: dev). Ignored when groupIds is provided. |
| `nameFilter` | string |  | — | Wildcard substring to match against group name (e.g. "rds" matches "*rds*"). Cannot be combined with groupIds. |
| `vpcId` | string |  | — | Filter by VPC ID (must match vpc-[0-9a-f]{8,17}). Cannot be combined with groupIds. |

### `aws_ec2_instances`

List EC2 instances filtered by environment tag. Returns instanceId, type, state, stateReason, instanceLifecycle, name tag, IPs, launchTime, imageId, and keyName.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `environment` | enum |  | — | Filter by Environment tag (default: dev) |
| `state` | enum |  | — | Filter by instance state. Omit to return instances in all states. |
| `nameFilter` | string |  | — | Wildcard substring to match against the Name tag (e.g. "runner" matches "*runner*"). |

### `aws_ec2_launch_template_inspect`

Inspect EC2 launch templates filtered by Environment tag (and optional name substring). Returns the latest version data: AMI (resolved through any `resolve:ssm:` indirection by calling SSM), instance type, key name, IAM instance profile, and tags. Used for "what is this fleet currently configured to launch?" debugging without chaining describe-launch-templates + describe-launch-template-versions + ssm get-parameter via Bash.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `environment` | enum |  | — | Filter by Environment tag (default: dev) |
| `name` | string |  | — | Wildcard substring to match against the Name tag (e.g. "runner" matches "*runner*"). Optional. |

### `aws_ec2_network_inspect`

Discover the project VPC + subnets in one call. Optional flags add route tables, NACLs, internet gateways, and VPC DNS attributes for reachability debugging.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `environment` | enum |  | — | Filter by Environment tag (default: dev) |
| `subnetType` | enum |  | — | Subnet category to return (default: all). |
| `includeRouteTables` | boolean |  | — | Route tables. |
| `includeNacls` | boolean |  | — | Network ACLs. |
| `includeGateways` | boolean |  | — | Internet gateways. |
| `includeDnsAttributes` | boolean |  | — | VPC DNS attributes. |

### `aws_iam_get_policy`

Fetch an IAM policy document by ARN. Returns the default policy version document (URL-decoded JSON). Optionally lists all available versions.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `policyArn` | string | **required** | — | Full IAM policy ARN (e.g. "arn:aws:iam::123456789012:policy/MyPolicy" or a managed policy ARN like "arn:aws:iam::aws:policy/ReadOnlyAccess"). |
| `listVersions` | boolean |  | — | Also return a summary of all policy versions (versionId, isDefault, createDate). Default: false. |

### `aws_lambda_status`

Check Lambda function existence, state, runtime, and config. Returns exists:false if not found. Pass `functions: string[]` (1-25) for batch mode: per-function describes run concurrently (cap 5) and return `{ statuses: { [name]: <entry> }, missing: [{ function, error }] }`. One failing function does not fail the others.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `function` | string |  | — | Lambda short name (e.g. "graphql", "rollbar-discord"). Expanded to legacy-sports-{env}-{name}. Provide this OR `functions`, not both. |
| `functions` | string[] |  | min 1, max 25 | Batch mode: 1-25 Lambda short names. Describes run concurrently (cap 5) and return `{ statuses: { [name]: <entry> }, missing: [{ function, error }] }`. |
| `environment` | enum |  | — | AWS environment (default: dev) |

### `aws_logs_filter`

Search CloudWatch log events by log group and optional filter pattern. Accepts any log group name (including leading-slash names like /aws/lambda/... and /aws/apigateway/...) and returns structured { timestamp, message } events. Hard-capped at ${MAX_EVENTS} events or ${MAX_CHARS} chars (whichever is smaller); returns truncated: true when the cap is hit. Use startTime/endTime (epoch ms) to scope a specific window. Prefer this over shell aws logs filter-log-events to avoid Windows path mangling and encoding issues.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `logGroup` | string | **required** | — | CloudWatch log group name. Leading slash required for AWS-managed groups (e.g. /aws/lambda/legacy-sports-dev-graphql, /aws/apigateway/legacy-sports-dev-api/access-logs). |
| `filterPattern` | string |  | — | CloudWatch filter pattern (e.g. "ERROR", "{ $.statusCode = 500 }", "deleteAllLeagues"). Omit to return all events. |
| `startTime` | number |  | integer | Start of the time range as epoch milliseconds (inclusive). |
| `endTime` | number |  | integer | End of the time range as epoch milliseconds (exclusive). |
| `limit` | number |  | coerced, integer, > 0, max MAX_EVENTS | Maximum number of events to return (default: ${MAX_EVENTS}, hard cap: ${MAX_EVENTS}). Output is also capped at ${MAX_CHARS} chars. |
| `format` | enum |  | — | Output shape. `markdown` (default) renders a header block plus a timestamped code block — cheaper for the agent to read. `json` returns the full structured payload. |

### `aws_logs_tail`

Prefer this over `aws logs tail` via shell. Fetch recent CloudWatch logs for a Lambda function. Returns markdown by default (an `### Errors` section plus a `### Recent` tail); pass format: "json" for the structured payload. `functions` runs 1-10 in batch, isolating per-function failures. For incident forensics pin an exact window with startTime/endTime instead of the rolling `since`. Investigation workflow: .agents/skills/cloudwatch-archaeology/SKILL.md.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `function` | enum |  | — | Lambda function short name (singular). Provide this OR `functions`, not both. |
| `functions` | enum[] |  | min 1, max 10 | Batch mode: 1-10 function short names, fetched concurrently as `{ logs: { [name]: <block> } }`. |
| `since` | string |  | — | Rolling lookback period, e.g. 5m, 1h, 1d (default: 1h). Ignored when `startTime` is provided. |
| `startTime` | string |  | datetime | Absolute window start (ISO-8601). Overrides `since`. Pair with `endTime` for a closed window. |
| `endTime` | string |  | datetime | Absolute window end (ISO-8601). Requires `startTime`; omit to tail through to now. |
| `filter` | string |  | — | Filter pattern for log messages |
| `environment` | enum |  | — | AWS environment (default: dev) |
| `maxLines` | number |  | coerced, integer, > 0, max 1000 | Cap output to the last N lines (default: 500, maximum: 1000). Use a smaller value for high-volume log groups to avoid token overflow. |
| `maxBytes` | number |  | coerced, integer, > 0 | Byte-cap on logs, in addition to maxLines (default: 150000). Truncates cleanly instead of erroring. |
| `format` | enum |  | — | Output shape. `markdown` (default) groups extracted ERROR/WARN/Exception lines into a top `### Errors` section followed by a `### Recent` code-block with the last 50 log lines — far cheaper for the agent to read. `json` returns the original structured payload with the full `logs` string. |

### `aws_secretsmanager_describe_secret`

Get metadata for a Secrets Manager secret (ARN, KMS key, rotation, last changed). Does NOT return the secret value. Use aws_secretsmanager_get_secret_value to write the value to a file.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `secretId` | string | **required** | — | Secret ID or name (e.g. "mlb-data-api-key" or "dev/mlb-data-api-key") |
| `environment` | enum |  | — | Environment prefix for short secret IDs (default: dev) |

### `aws_secretsmanager_get_secret_value`

Write a Secrets Manager secret value to a local file. The value is NEVER returned in the tool response — only written to disk. Use the outputFile path with downstream tools (e.g. terraform apply). Follows secrets-handling best practices.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `secretId` | string | **required** | — | Secret ID or name (e.g. "mlb-data-api-key" or "dev/mlb-data-api-key") |
| `environment` | enum |  | — | Environment prefix for short secret IDs (default: dev) |
| `outputFile` | string | **required** | — | Relative path within the repo (absolute paths are rejected for safety). Example: "scratch/secret.tmp" |

### `aws_secretsmanager_list_secrets`

List Secrets Manager secret names and ARNs. No values are returned. Defaults to listing secrets with the environment prefix (e.g. "dev/").

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `environment` | enum |  | — | Environment prefix filter (default: dev) |
| `filter` | string |  | — | Override the name filter. Default is "{environment}/" prefix. |

### `aws_ssm_get`

Get SSM parameter(s). Tries exact match first, then path prefix. Useful for checking deploy versions.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string | **required** | — | Parameter name or path. Absolute paths (starting with /) used as-is; relative paths expanded to /legacy-sports/{env}/{name}. |
| `environment` | enum |  | — | AWS environment (default: dev) |
| `decrypt` | boolean |  | — | Decrypt SecureString values (default: false). When false, SecureString values are redacted. |

### `aws_ssm_run_command`

Run ad-hoc shell commands on an EC2 instance via AWS SSM (no SSH needed). Requires the instance to have the SSM agent running and the IAM role to have AmazonSSMManagedInstanceCore. Polls up to 55s per call and returns stdout/stderr when done; a still-running command returns an in-progress snapshot with a re-arm hint — call again with the returned commandId to continue waiting. Use for debugging runner state (e.g. inspecting /opt/playwright-browsers).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `instanceId` | string | **required** | — | EC2 instance ID (e.g. "i-0abc1234def56789a"). Get from aws_ec2_instances. |
| `commands` | string[] |  | min 1, max 20 | Simple commands with arguments only. Required unless commandId is provided. Each command is validated and must not contain: pipes (\|), redirects (>, <), semicolons (;), ampersands (&), dollar signs ($), quotes (" or '), backticks (`), parentheses, braces, backslashes, or newlines. Example: ['ls -la', 'cat /etc/hostname'] |
| `commandId` | string |  | — | Re-attach to a command a previous aws_ssm_run_command call returned an in-progress snapshot for. When provided, commands is ignored and this call only polls for completion. |
| `timeout` | number |  | coerced, integer, min 10, max 3600 | Server-side SSM command timeout in seconds (min: 10, default: 60, max: 3600). Not the per-call poll budget — see maxWaitSeconds. |
| `maxWaitSeconds` | number |  | coerced, integer, min 5, max 55 | Max seconds this call polls before returning an in-progress snapshot with a re-arm hint (default and cap: 55). |

### `aws_sso_login`

Initiate AWS SSO login using --no-browser mode, which prints a device authorization URL instead of opening a browser. Returns the URL so the user can authenticate. Call aws_sso_status after authentication to verify. Use when aws_sso_status returns authenticated: false.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `profile` | string |  | — | AWS profile name (default: "default" or $AWS_PROFILE env var) |

### `aws_sso_status`

Prefer this over `aws sts get-caller-identity` via shell. Check AWS SSO session authentication. Returns caller identity or error with remedy.

_No parameters._

### `aws_terraform_output`

Query Terraform state outputs. Runs `terraform output -json` and returns unwrapped values. Defaults to terraform/main; pass `chdir: "terraform/runners"` for runner-specific outputs (github_runners_webhook_url). Falls back to the main checkout if uninitialized. Use instead of `cd terraform/main && terraform output -json | python -c ...`.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `keys` | string[] |  | — | Specific output keys to return (e.g. ["vpc_id", "private_subnet_ids"]). Omit to return all outputs. |
| `chdir` | string |  | — | Terraform directory relative to repo root (default: "terraform/main"). Use "terraform/runners" for runner state outputs. |

### `packer_build`

`action: "build"` (default) runs `packer build` in the background; by default this call waits up to 45s and returns either the finished result (amiId, name, durationSec, snapshotId, tags, logPath) or a running snapshot with a buildId + re-arm hint — poll with packer_build_status/packer_build_wait, or pass runInBackground=true to return immediately. `action: "fmt"`/`"validate"` are low-cost sync checks — prefer over shelling out; return `{ ok, diff }` / `{ ok, errors[] }`, capped at 5000 chars.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `action` | enum |  | — | "build": async AMI build (runInBackground/maxWaitSeconds). "fmt": packer fmt (check/diff). "validate": packer validate (syntaxOnly). |
| `hclPath` | string | **required** | — | Path to the Packer HCL template file (.pkr.hcl), relative to the repo root (or worktreePath if provided). Path characters only — no spaces, quotes, or shell metacharacters. Example: "terraform/runners/packer/runner-ami.pkr.hcl". |
| `vars` | object (key-value) |  | — | build only. Packer `-var key=value` overrides. Names: [A-Za-z0-9_-]+; values must not contain quotes, backticks, backslashes, newlines, or shell operators. Example: { vpc_id: "vpc-0abc123", subnet_id: "subnet-0abc123" }. |
| `worktreePath` | string |  | — | Absolute path to a worktree to use as the working directory. Defaults to the repo root. |
| `runInBackground` | boolean |  | — | build only. When true, return immediately with a buildId instead of waiting up to maxWaitSeconds. Default: false. |
| `maxWaitSeconds` | number |  | coerced, integer, min 0, max 55 | build only. Max seconds to wait before returning a running snapshot (default: 45, cap: 55). |
| `check` | boolean |  | — | fmt only. Pass `-check` to packer fmt. Default: true. |
| `diff` | boolean |  | — | fmt only. Pass `-diff` to packer fmt. Default: true. |
| `syntaxOnly` | boolean |  | — | validate only. Pass `-syntax-only` to packer validate. Default: true. |

### `packer_build_status`

Check the status of a background Packer build. Returns status ("running" | "done" | "failed"), elapsed time, and a tail of the build log. When done, returns the same structured output as a completed packer_build call.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `buildId` | string | **required** | — | The buildId returned by a previous packer_build call. |

### `packer_build_wait`

Bounded wait for a background Packer build: each call waits up to 55s and returns the finished structured result, or a status snapshot with a re-arm hint if the build is still running — never an error while in progress. Re-invoke to continue waiting. Do NOT re-run packer_build.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `buildId` | string | **required** | — | The buildId returned by a previous packer_build call. |
| `pollIntervalSec` | number |  | coerced, integer, min 1, max 55 | How often to poll for completion in seconds (min: 1, default: 5, max: 55). |
| `timeoutSec` | number |  | coerced, integer, min 5, max 55 | Max seconds this call waits before returning an in-progress snapshot with a re-arm hint (default and cap: 55). |

### `secret_sync_to_github`

Atomically propagate a value from AWS Secrets Manager to a GitHub secret without the value ever crossing the agent transcript. Fetches the AWS secret server-side, pipes it via stdin to `gh secret set` (which handles libsodium encryption), and returns only metadata. Supports repo (default), environment (--env), and dependabot scopes. The canonical "never embed secrets in tool calls" pattern — use this instead of pairing aws_secretsmanager_get_secret_value with github_secret_set.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `secretId` | string | **required** | — | AWS secret ID or name (e.g. "mlb-data-api-key" or "dev/mlb-data-api-key"). Short IDs are prefixed with the environment. |
| `repoSecret` | string | **required** | — | GitHub secret name (e.g. "AGENT_AUTHOR_APP_PRIVATE_KEY"). Must match /^[A-Za-z_][A-Za-z0-9_]*$/ and must not start with "GITHUB_". |
| `environment` | enum |  | — | AWS environment prefix for short secretIds (default: dev). |
| `env` | string |  | — | GitHub environment name. Required when scope="environment", ignored otherwise. |
| `scope` | enum |  | — | GitHub secret scope: "repo" = Actions repository secret (default); "environment" = environment secret (requires env); "dependabot" = Dependabot secret. |
| `repo` | string |  | — | GitHub repository in "owner/name" form. Defaults to the current repo as resolved by the gh CLI. |

